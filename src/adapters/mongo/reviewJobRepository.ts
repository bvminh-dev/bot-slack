// T12 — DB-backed queue (tech ADR-004/007).
// enqueue idempotent (unique partial index); claim atomic (findOneAndUpdate);
// lease/visibility timeout + reclaim job mồ côi khi worker chết.

import { Collection, ObjectId } from 'mongodb';
import { getDb } from './client';
import { ConfigSnapshot, Finding, JobStatus, ReviewJob, SkillRunResult } from '../../domain/reviewJob';

interface JobDoc extends Omit<ReviewJob, 'id'> {
  _id: ObjectId;
}

function coll(): Collection<JobDoc> {
  return getDb().collection<JobDoc>('review_jobs');
}

function toDomain(d: JobDoc): ReviewJob {
  const { _id, ...rest } = d;
  return { id: _id.toHexString(), ...rest };
}

export type EnqueueResult =
  | { status: 'queued'; job: ReviewJob }
  | { status: 'duplicate' }; // đã có job (project,pr,commit) đang chạy/chờ

export const reviewJobRepository = {
  /** Enqueue idempotent. Trùng `(project,pr,commit)` đang active → duplicate (chống double-submit). */
  async enqueue(job: Omit<ReviewJob, 'id'>): Promise<EnqueueResult> {
    try {
      const _id = new ObjectId();
      await coll().insertOne({ _id, ...job } as JobDoc);
      return { status: 'queued', job: { id: _id.toHexString(), ...job } };
    } catch (e: unknown) {
      // Lỗi duplicate key trên uniq_active_idempotency → đang có job active.
      if (typeof e === 'object' && e && (e as { code?: number }).code === 11000) {
        return { status: 'duplicate' };
      }
      throw e;
    }
  },

  /**
   * Claim 1 job sẵn sàng: status=queued & availableAt<=now, HOẶC running nhưng quá lease (reclaim).
   * Atomic findOneAndUpdate đảm bảo chỉ 1 worker thắng (sec/test concurrency).
   * BUG-01: chỉ reclaim/claim khi attempts < maxAttempts (chống poison job chạy lại vô hạn).
   */
  async claimNext(leaseMs: number, maxAttempts: number): Promise<ReviewJob | null> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseMs);
    const d = await coll().findOneAndUpdate(
      {
        attempts: { $lt: maxAttempts },
        $or: [
          { status: 'queued', availableAt: { $lte: now } },
          { status: 'running', leaseUntil: { $lt: now } }, // worker chết → reclaim
        ],
      },
      {
        $set: { status: 'running', leaseUntil, updatedAt: now },
        $inc: { attempts: 1 },
      },
      { sort: { availableAt: 1 }, returnDocument: 'after' },
    );
    return d ? toDomain(d) : null;
  },

  /** BUG-01: chuyển job hết lượt thử (running quá lease, attempts>=max) sang failed (dead-letter). */
  async deadLetterExhausted(maxAttempts: number): Promise<number> {
    const now = new Date();
    const res = await coll().updateMany(
      { status: 'running', leaseUntil: { $lt: now }, attempts: { $gte: maxAttempts } },
      { $set: { status: 'failed' as JobStatus, error: 'Hết lượt thử (dead-letter).', leaseUntil: undefined, updatedAt: now } },
    );
    return res.modifiedCount;
  },

  /** BUG-02: requeue job lỗi tạm thời với backoff thay vì fail cứng. */
  async requeueWithBackoff(id: string, backoffMs: number, reason: string): Promise<void> {
    await coll().updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'queued' as JobStatus,
          availableAt: new Date(Date.now() + backoffMs),
          leaseUntil: undefined,
          error: reason,
          updatedAt: new Date(),
        },
      },
    );
  },

  /** BUG-03: kiểm tra job đã hoàn tất side-effect chưa (history theo jobId tồn tại). */
  async hasHistory(jobId: string): Promise<boolean> {
    return (await getDb().collection('review_history').countDocuments({ jobId }, { limit: 1 })) > 0;
  },

  /** BUG-05: tra job gần nhất của (project,pr) để liên kết supersedes. */
  async findLatestByPr(projectId: string, prId: string, excludeId: string): Promise<ReviewJob | null> {
    const d = await coll()
      .find({ projectId, prId, _id: { $ne: new ObjectId(excludeId) } })
      .sort({ createdAt: -1 })
      .limit(1)
      .next();
    return d ? toDomain(d) : null;
  },

  async countRunning(): Promise<number> {
    return coll().countDocuments({ status: 'running' });
  },

  async setSnapshot(id: string, snapshot: ConfigSnapshot, supersedesJobId?: string): Promise<void> {
    await coll().updateOne(
      { _id: new ObjectId(id) },
      { $set: { configSnapshot: snapshot, supersedesJobId, updatedAt: new Date() } },
    );
  },

  async complete(
    id: string,
    data: { findings: Finding[]; skillRuns: SkillRunResult[]; costTokens: number; truncated?: ReviewJob['truncated'] },
  ): Promise<void> {
    await coll().updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'completed' as JobStatus, ...data, leaseUntil: undefined, updatedAt: new Date() } },
    );
  },

  async fail(id: string, error: string): Promise<void> {
    await coll().updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'failed' as JobStatus, error, leaseUntil: undefined, updatedAt: new Date() } },
    );
  },

  /** Huỷ job đang chờ của project (khi xoá/disable project) — không để worker chạy job mồ côi. */
  async cancelQueuedByProject(projectId: string): Promise<number> {
    const res = await coll().updateMany(
      { projectId, status: 'queued' },
      { $set: { status: 'cancelled' as JobStatus, updatedAt: new Date() } },
    );
    return res.modifiedCount;
  },
};

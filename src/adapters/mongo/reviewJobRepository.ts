// T12 — DB-backed queue (tech ADR-004/007).
// enqueue idempotent (unique partial index); claim atomic (findOneAndUpdate);
// lease/visibility timeout + reclaim job mồ côi khi worker chết.

import { Collection, ObjectId } from 'mongodb';
import { getDb } from './client';
import {
  ConfigSnapshot,
  DeliveryMode,
  DeliveryTarget,
  Finding,
  JobStatus,
  ReviewJob,
  SkillRunResult,
  isCacheEligible,
} from '../../domain/reviewJob';

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

// i-002 (ADR-013): kết quả của enqueue-or-subscribe atomic.
export type EnqueueOrSubscribeResult =
  | { status: 'queued'; job: ReviewJob } // thắng race insert → tạo job mới
  | { status: 'subscribed'; job: ReviewJob } // có job active → thêm delivery target
  | { status: 'already_subscribed'; job: ReviewJob } // (channel,thread) đã đăng ký
  | { status: 'cap_reached'; job: ReviewJob } // vượt cap target → ack thread gốc
  | { status: 'race_none' }; // job vừa rời active (completed/failed) giữa chừng → caller re-route

function isDupKey(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: number }).code === 11000;
}

export const reviewJobRepository = {
  /** Enqueue idempotent. Trùng `(project,pr,commit)` đang active → duplicate (chống double-submit). */
  async enqueue(job: Omit<ReviewJob, 'id'>): Promise<EnqueueResult> {
    try {
      const _id = new ObjectId();
      await coll().insertOne({ _id, ...job } as JobDoc);
      return { status: 'queued', job: { id: _id.toHexString(), ...job } };
    } catch (e: unknown) {
      // Lỗi duplicate key trên uniq_active_idempotency → đang có job active.
      if (isDupKey(e)) return { status: 'duplicate' };
      throw e;
    }
  },

  /**
   * i-002 (ADR-013) — Enqueue-or-subscribe ATOMIC: nếu chưa có job active cho khóa → insert
   * (thắng race = queued); nếu đã có (hoặc thua race insert) → đăng ký delivery target
   * (dedup theo (channel,thread) + cap). `job.deliveryTargets[0]` là người gõ lệnh.
   */
  async enqueueOrSubscribe(job: Omit<ReviewJob, 'id'>, cap: number): Promise<EnqueueOrSubscribeResult> {
    const target = job.deliveryTargets[0];
    try {
      const _id = new ObjectId();
      await coll().insertOne({ _id, ...job } as JobDoc);
      return { status: 'queued', job: { id: _id.toHexString(), ...job } };
    } catch (e: unknown) {
      if (!isDupKey(e)) throw e;
      // Đã có job active cho khóa → subscribe target (thua race insert cũng vào đây).
      return this.subscribeTarget(job.idempotencyKey, target, cap);
    }
  },

  /** Thêm 1 delivery target vào job active của khóa (atomic: dedup (channel,thread) + cap). */
  async subscribeTarget(
    idempotencyKey: string,
    target: DeliveryTarget,
    cap: number,
  ): Promise<EnqueueOrSubscribeResult> {
    const d = await coll().findOneAndUpdate(
      {
        idempotencyKey,
        status: { $in: ['queued', 'running'] as JobStatus[] },
        deliveryTargets: { $not: { $elemMatch: { channel: target.channel, threadTs: target.threadTs } } },
        $expr: { $lt: [{ $size: '$deliveryTargets' }, cap] },
      },
      { $push: { deliveryTargets: target }, $set: { updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (d) return { status: 'subscribed', job: toDomain(d) };
    // Không match → phân biệt lý do.
    const active = await coll().findOne({
      idempotencyKey,
      status: { $in: ['queued', 'running'] as JobStatus[] },
    });
    if (!active) return { status: 'race_none' }; // job vừa hết active
    const dup = (active.deliveryTargets ?? []).some(
      (t) => t.channel === target.channel && t.threadTs === target.threadTs,
    );
    return dup
      ? { status: 'already_subscribed', job: toDomain(active) }
      : { status: 'cap_reached', job: toDomain(active) };
  },

  /** i-002 (ADR-014) — bản completed HỢP LỆ mới nhất (chưa superseded) theo khóa để cache-serve. */
  async findCacheEligibleByKey(idempotencyKey: string): Promise<ReviewJob | null> {
    const docs = await coll()
      .find({ idempotencyKey, status: 'completed' as JobStatus })
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(5)
      .toArray();
    for (const d of docs) {
      const job = toDomain(d);
      if (isCacheEligible(job)) return job;
    }
    return null;
  },

  /** i-002 (BUG-12): bản completed gần nhất theo khóa (KHÔNG lọc cache-eligible) — cho supersede lineage. */
  async findLatestCompletedByKey(idempotencyKey: string, excludeId: string): Promise<ReviewJob | null> {
    const d = await coll()
      .find({ idempotencyKey, status: 'completed' as JobStatus, _id: { $ne: new ObjectId(excludeId) } })
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(1)
      .next();
    return d ? toDomain(d) : null;
  },

  async getById(id: string): Promise<ReviewJob | null> {
    if (!ObjectId.isValid(id)) return null;
    const d = await coll().findOne({ _id: new ObjectId(id) });
    return d ? toDomain(d) : null;
  },

  /** i-002 — đánh dấu lineage supersede khi `fresh`/rerun tạo job mới. */
  async markSuperseded(oldJobId: string, newJobId: string): Promise<void> {
    const now = new Date();
    await coll().updateOne({ _id: new ObjectId(oldJobId) }, { $set: { supersededByJobId: newJobId, updatedAt: now } });
    await coll().updateOne({ _id: new ObjectId(newJobId) }, { $set: { supersedesJobId: oldJobId, updatedAt: now } });
  },

  /**
   * i-002 (ADR-013) — đánh dấu 1 target đã giao, ATOMIC theo arrayFilter status=pending.
   * Idempotent: target đã `delivered`/`failed` → không match → trả false (chống double khi reclaim).
   */
  async markTargetDelivered(jobId: string, channel: string, threadTs: string, mode: DeliveryMode): Promise<boolean> {
    // Điều kiện "còn pending" nằm trong FILTER (không chỉ arrayFilter) → nếu đã giao, document
    // không match → matchedCount 0 (idempotent). KHÔNG dựa modifiedCount vì `updatedAt` luôn set.
    const res = await coll().updateOne(
      { _id: new ObjectId(jobId), deliveryTargets: { $elemMatch: { channel, threadTs, status: 'pending' } } },
      {
        $set: {
          'deliveryTargets.$[t].status': 'delivered',
          'deliveryTargets.$[t].mode': mode,
          'deliveryTargets.$[t].deliveredAt': new Date(),
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 't.channel': channel, 't.threadTs': threadTs, 't.status': 'pending' }] },
    );
    return res.matchedCount > 0;
  },

  async markTargetFailed(jobId: string, channel: string, threadTs: string, error: string): Promise<boolean> {
    const res = await coll().updateOne(
      { _id: new ObjectId(jobId), deliveryTargets: { $elemMatch: { channel, threadTs, status: 'pending' } } },
      {
        $set: {
          'deliveryTargets.$[t].status': 'failed',
          'deliveryTargets.$[t].error': error,
          updatedAt: new Date(),
        },
      },
      { arrayFilters: [{ 't.channel': channel, 't.threadTs': threadTs, 't.status': 'pending' }] },
    );
    return res.matchedCount > 0;
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
    const now = new Date();
    await coll().updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: 'completed' as JobStatus, ...data, leaseUntil: undefined, completedAt: now, updatedAt: now } },
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

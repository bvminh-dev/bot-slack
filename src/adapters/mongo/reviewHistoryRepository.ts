// T16 — Review history bất biến. Mỗi lần review = 1 bản ghi mới (supersedes), giữ bản cũ.
import { Collection, ObjectId } from 'mongodb';
import { getDb } from './client';
import { ConfigSnapshot, Finding, Severity, SkillRunResult, severityCounts } from '../../domain/reviewJob';
import { NotFoundError } from '../../domain/errors';

export interface ReviewHistoryEntry {
  id: string;
  jobId: string;
  ownerId: string;
  projectId: string;
  prId: string;
  prUrl: string;
  commitHash: string;
  status: 'completed' | 'failed';
  severityCounts: Record<Severity, number>;
  findings: Finding[];
  skillRuns: SkillRunResult[];
  configSnapshot?: ConfigSnapshot;
  costTokens: number;
  createdAt: string;
  // i-002 (T13): hiển thị trạng thái giao + lineage supersede ở Admin UI. KHÔNG chứa nội dung/secret.
  deliveries?: Array<{ channel: string; threadTs: string; status: string; mode?: string }>;
  supersededByJobId?: string;
}

interface HistoryDoc extends Omit<ReviewHistoryEntry, 'id'> {
  _id: ObjectId;
}

function coll(): Collection<HistoryDoc> {
  return getDb().collection<HistoryDoc>('review_history');
}

export const reviewHistoryRepository = {
  /** Lưu history TRƯỚC khi post Slack (tech ADR-010) — không mất kết quả nếu post fail. */
  async save(e: Omit<ReviewHistoryEntry, 'id' | 'severityCounts' | 'createdAt'>): Promise<ReviewHistoryEntry> {
    const _id = new ObjectId();
    const doc: HistoryDoc = {
      _id,
      ...e,
      severityCounts: severityCounts(e.findings),
      createdAt: new Date().toISOString(),
    };
    await coll().insertOne(doc);
    const { _id: id, ...rest } = doc;
    return { id: id.toHexString(), ...rest };
  },

  /** i-002 (BUG-09): đọc history theo jobId để re-fanout khi reclaim (không chạy lại skill). */
  async findByJobId(jobId: string): Promise<ReviewHistoryEntry | null> {
    const d = await coll().find({ jobId }).sort({ _id: -1 }).limit(1).next();
    if (!d) return null;
    const { _id, ...rest } = d;
    return { id: _id.toHexString(), ...rest };
  },

  /**
   * i-002 (T13): ghi trạng thái giao kết quả theo target (cho Admin UI). Khớp theo jobId.
   * BUG-13: HỢP NHẤT theo (channel,threadTs,mode) thay vì $set mù — tránh xoá bản ghi
   * cache-serve (appendDelivery) hoặc bản giao của lần fanout trước khi reclaim re-fanout.
   */
  async recordDeliveries(
    jobId: string,
    deliveries: Array<{ channel: string; threadTs: string; status: string; mode?: string }>,
  ): Promise<void> {
    const doc = await coll().findOne({ jobId }, { projection: { deliveries: 1 } });
    const existing = (doc?.deliveries ?? []) as Array<{ channel: string; threadTs: string; status: string; mode?: string }>;
    const merged = [...existing];
    for (const d of deliveries) {
      const i = merged.findIndex((m) => m.channel === d.channel && m.threadTs === d.threadTs && m.mode === d.mode);
      if (i >= 0) merged[i] = d;
      else merged.push(d);
    }
    await coll().updateOne({ jobId }, { $set: { deliveries: merged } });
  },

  /** i-002: đánh dấu bản history bị `fresh` thay (Admin UI badge superseded). */
  async markSuperseded(jobId: string, supersededByJobId: string): Promise<void> {
    await coll().updateOne({ jobId }, { $set: { supersededByJobId } });
  },

  /** i-002: thêm 1 bản ghi giao (vd cache-serve) vào history của job đã có (Admin UI). */
  async appendDelivery(
    jobId: string,
    delivery: { channel: string; threadTs: string; status: string; mode?: string },
  ): Promise<void> {
    await coll().updateOne({ jobId }, { $push: { deliveries: delivery } });
  },

  /** Lịch sử của 1 project — RÀNG BUỘC ownerId (sec: không trả project người khác). */
  async listByProjectOwned(
    projectId: string,
    ownerId: string,
    opts: { limit: number; beforeId?: string },
  ): Promise<{ items: ReviewHistoryEntry[]; nextCursor: string | null }> {
    const filter: Record<string, unknown> = { projectId, ownerId };
    if (opts.beforeId) {
      if (!ObjectId.isValid(opts.beforeId)) throw new NotFoundError();
      filter._id = { $lt: new ObjectId(opts.beforeId) };
    }
    const docs = await coll()
      .find(filter)
      .sort({ _id: -1 })
      .limit(opts.limit + 1)
      .toArray();
    const hasMore = docs.length > opts.limit;
    const page = docs.slice(0, opts.limit);
    return {
      items: page.map((d) => {
        const { _id, ...rest } = d;
        return { id: _id.toHexString(), ...rest };
      }),
      nextCursor: hasMore ? page[page.length - 1]._id.toHexString() : null,
    };
  },
};

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

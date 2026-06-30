// T16 — Audit log bất biến (append-only). KHÔNG log giá trị secret (sec #19).
import { Collection, ObjectId } from 'mongodb';
import { getDb } from './client';

export type AuditAction =
  | 'login'
  | 'project.create'
  | 'project.update'
  | 'project.delete'
  | 'secret.rotate'
  | 'review.command'
  | 'review.completed'
  | 'review.failed'
  | 'review.cache_hit' // i-002: trả kết quả từ History (0 token)
  | 'review.rerun' // i-002: `fresh` ép chạy lại (supersedes)
  | 'review.delivered' // i-002: đã giao kết quả tới 1 delivery target (file/chat/cache)
  | 'review.delivery_failed' // i-002: giao thất bại (cả file lẫn chat)
  | 'access.denied';

export interface AuditEntry {
  ts: Date;
  ownerId?: string;
  actor: string; // azure userId / slack user id
  action: AuditAction;
  projectId?: string;
  prId?: string;
  commitHash?: string;
  skills?: string[];
  costTokens?: number;
  meta?: Record<string, unknown>; // KHÔNG chứa secret
}

interface AuditDoc extends AuditEntry {
  _id: ObjectId;
}

function coll(): Collection<AuditDoc> {
  return getDb().collection<AuditDoc>('audit_log');
}

export const auditRepository = {
  async append(entry: AuditEntry): Promise<void> {
    await coll().insertOne({ _id: new ObjectId(), ...entry });
  },
};

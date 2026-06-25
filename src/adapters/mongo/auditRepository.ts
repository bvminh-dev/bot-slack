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

// T2 — Kết nối MongoDB + tạo index bắt buộc (cô lập tenant + queue + idempotency).
import { Db, MongoClient } from 'mongodb';
import { loadConfig } from '../../config/env';
import { logger } from '../../observability/logger';

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectMongo(): Promise<Db> {
  if (db) return db;
  const cfg = loadConfig();
  client = new MongoClient(cfg.mongoUri, { retryWrites: true });
  await client.connect();
  db = client.db(cfg.mongoDb);
  await ensureIndexes(db);
  logger.info('mongo_connected', { db: cfg.mongoDb });
  return db;
}

export function getDb(): Db {
  if (!db) throw new Error('MongoDB chưa kết nối — gọi connectMongo() trước.');
  return db;
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

async function ensureIndexes(database: Db): Promise<void> {
  // projects: cô lập theo owner + chặn duplicate (sec #10, frd Business Rule).
  // Tên project duy nhất TOÀN HỆ THỐNG (khuyến nghị bảo mật #9 — vì Slack mọi-người resolve <project>).
  await database.collection('projects').createIndexes([
    { key: { ownerId: 1 } },
    // BUG-04: unique theo nameLower (case-insensitive) khớp với resolve Slack case-insensitive.
    { key: { nameLower: 1 }, unique: true, name: 'uniq_project_name_lower' },
    { key: { 'repo.repoUrl': 1 }, unique: true, name: 'uniq_repo_url' },
  ]);

  // review_jobs: poll queue + idempotency + reclaim.
  await database.collection('review_jobs').createIndexes([
    { key: { status: 1, availableAt: 1 }, name: 'queue_poll' },
    {
      key: { idempotencyKey: 1 },
      unique: true,
      partialFilterExpression: { status: { $in: ['queued', 'running'] } },
      name: 'uniq_active_idempotency',
    },
    { key: { ownerId: 1 } },
    { key: { projectId: 1, createdAt: -1 } },
  ]);

  // audit + history: truy vết theo owner/project.
  await database.collection('audit_log').createIndexes([{ key: { ownerId: 1, ts: -1 } }]);
  await database.collection('review_history').createIndexes([
    { key: { ownerId: 1, projectId: 1, createdAt: -1 } },
  ]);
}

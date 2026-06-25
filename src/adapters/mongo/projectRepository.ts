// T2/T5 — ProjectRepository. ÉP ownerId BẮT BUỘC ở mọi truy vấn (sec CRITICAL tenant isolation).
// Không có hàm "find all" — mọi đọc/ghi đều theo owner; lookup theo tên cho Slack resolve là tách riêng,
// có cảnh báo rõ là cross-owner (chính sách #8 mọi-người-review đã chấp nhận).

import { Collection, ObjectId } from 'mongodb';
import { getDb } from './client';
import { Project } from '../../domain/project';
import { NotFoundError } from '../../domain/errors';

interface ProjectDoc extends Omit<Project, 'id'> {
  _id: ObjectId;
  nameLower: string; // BUG-04: khoá unique case-insensitive (không lộ ra domain)
}

function coll(): Collection<ProjectDoc> {
  return getDb().collection<ProjectDoc>('projects');
}

function toDomain(d: ProjectDoc): Project {
  const { _id, nameLower: _nl, ...rest } = d;
  void _nl;
  return { id: _id.toHexString(), ...rest };
}

export const projectRepository = {
  /** Liệt kê project CHỈ của owner (sec: không bao giờ trả project người khác). */
  async listByOwner(ownerId: string): Promise<Project[]> {
    const docs = await coll().find({ ownerId }).sort({ updatedAt: -1 }).toArray();
    return docs.map(toDomain);
  },

  /** Lấy theo id NHƯNG ràng buộc ownerId — không khớp → NotFound (404 đồng nhất, sec BOLA). */
  async getOwned(id: string, ownerId: string): Promise<Project> {
    if (!ObjectId.isValid(id)) throw new NotFoundError();
    const d = await coll().findOne({ _id: new ObjectId(id), ownerId });
    if (!d) throw new NotFoundError();
    return toDomain(d);
  },

  async create(p: Omit<Project, 'id'>): Promise<Project> {
    const _id = new ObjectId();
    await coll().insertOne({ _id, nameLower: p.name.toLowerCase(), ...p } as ProjectDoc);
    return { id: _id.toHexString(), ...p };
  },

  async updateOwned(id: string, ownerId: string, patch: Partial<Omit<Project, 'id' | 'ownerId'>>): Promise<Project> {
    if (!ObjectId.isValid(id)) throw new NotFoundError();
    const set: Record<string, unknown> = { ...patch, updatedAt: new Date() };
    if (patch.name !== undefined) set.nameLower = patch.name.toLowerCase(); // giữ đồng bộ khoá unique
    const d = await coll().findOneAndUpdate(
      { _id: new ObjectId(id), ownerId },
      { $set: set },
      { returnDocument: 'after' },
    );
    if (!d) throw new NotFoundError();
    return toDomain(d);
  },

  async deleteOwned(id: string, ownerId: string): Promise<void> {
    if (!ObjectId.isValid(id)) throw new NotFoundError();
    const res = await coll().deleteOne({ _id: new ObjectId(id), ownerId });
    if (res.deletedCount === 0) throw new NotFoundError();
  },

  async existsByName(name: string): Promise<boolean> {
    return (await coll().countDocuments({ nameLower: name.toLowerCase() }, { limit: 1 })) > 0;
  },

  async existsByRepo(repoUrl: string): Promise<boolean> {
    return (await coll().countDocuments({ 'repo.repoUrl': repoUrl }, { limit: 1 })) > 0;
  },

  /**
   * Resolve cho Slack: tìm project active theo tên (case-insensitive).
   * Trả NULL nếu không có. KHÔNG lọc owner vì chính sách #8 cho mọi người review mọi project
   * (residual risk đã chấp nhận). Tên project là duy nhất toàn hệ thống nên không nhập nhằng.
   */
  async resolveByNameForSlack(name: string): Promise<Project | null> {
    // BUG-04: so khớp chính xác trên nameLower (không regex) — duy nhất + case-insensitive nhất quán.
    const d = await coll().findOne({ nameLower: name.trim().toLowerCase() });
    return d ? toDomain(d) : null;
  },
};

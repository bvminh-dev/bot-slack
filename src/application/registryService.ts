// T5 — Project Registry service. CRUD owner-scoped + validate + chống duplicate + secret write-only.
// Bảo mật: allowlist field (không nhận ownerId/status từ client); secret mã hoá qua T3; không trả secret.

import { IAzureClient } from '../ports/interfaces';
import { projectRepository } from '../adapters/mongo/projectRepository';
import { reviewJobRepository } from '../adapters/mongo/reviewJobRepository';
import { auditRepository } from '../adapters/mongo/auditRepository';
import { encryptSecret } from '../adapters/crypto/secretCrypto';
import { normalizeModelConfig } from '../config/catalog';
import { Project, ProjectPublicView, toPublicView } from '../domain/project';
import { ConflictError, ValidationError } from '../domain/errors';

/** Input tạo project — CHỈ các field cho phép (chống mass assignment). */
export interface CreateProjectInput {
  name: string;
  repoUrl: string;
  azureProject?: string;
  model?: string;
  effort?: string;
  docSources?: string[];
  claudeApiKey: string;
  azurePat: string;
}

/** Input cập nhật — secret optional (write-only: chỉ ghi khi có giá trị mới). */
export interface UpdateProjectInput {
  name?: string;
  repoUrl?: string;
  azureProject?: string;
  model?: string;
  effort?: string;
  docSources?: string[];
  status?: 'active' | 'disabled';
  claudeApiKey?: string; // có → ghi đè; không → giữ nguyên
  azurePat?: string;
}

function validateName(name: string): string {
  const n = (name ?? '').trim();
  if (n.length < 2 || n.length > 64) throw new ValidationError('Tên project phải dài 2–64 ký tự.');
  if (!/^[\w .-]+$/u.test(n)) throw new ValidationError('Tên project chứa ký tự không hợp lệ.');
  return n;
}

export class RegistryService {
  constructor(private readonly azure: IAzureClient) {}

  async list(ownerId: string): Promise<ProjectPublicView[]> {
    const items = await projectRepository.listByOwner(ownerId);
    return items.map(toPublicView);
  }

  async get(id: string, ownerId: string): Promise<ProjectPublicView> {
    return toPublicView(await projectRepository.getOwned(id, ownerId));
  }

  async create(ownerId: string, input: CreateProjectInput): Promise<ProjectPublicView> {
    const name = validateName(input.name);
    this.azure.validateRepoUrl(input.repoUrl); // chống SSRF + HTTPS
    const modelConfig = normalizeModelConfig(input.model, input.effort); // rỗng→default; lạ→ném
    if (!input.claudeApiKey?.trim() || !input.azurePat?.trim()) {
      throw new ValidationError('Bắt buộc nhập Claude API key và Azure PAT.');
    }
    // Chống duplicate (tên duy nhất toàn hệ thống — sec #9; repo duy nhất).
    if (await projectRepository.existsByName(name)) throw new ConflictError('Tên project đã tồn tại.');
    if (await projectRepository.existsByRepo(input.repoUrl)) throw new ConflictError('Repo đã được cấu hình.');

    const now = new Date();
    const created = await projectRepository.create({
      ownerId, // GÁN SERVER-SIDE từ session — không nhận từ client
      name,
      repo: { repoUrl: input.repoUrl, azureProject: input.azureProject ?? '' },
      modelConfig,
      docSources: (input.docSources ?? []).map((s) => s.trim()).filter(Boolean),
      status: 'active',
      encryptedClaudeKey: encryptSecret(input.claudeApiKey.trim()),
      encryptedPat: encryptSecret(input.azurePat.trim()),
      createdAt: now,
      updatedAt: now,
    });
    await auditRepository.append({
      ts: now,
      ownerId,
      actor: ownerId,
      action: 'project.create',
      projectId: created.id,
      meta: { name },
    });
    return toPublicView(created);
  }

  async update(id: string, ownerId: string, input: UpdateProjectInput): Promise<ProjectPublicView> {
    await projectRepository.getOwned(id, ownerId); // 404 nếu không thuộc owner
    const patch: Partial<Omit<Project, 'id' | 'ownerId'>> = {};
    let secretRotated = false;

    if (input.name !== undefined) {
      const name = validateName(input.name);
      if (await projectRepository.existsByName(name)) {
        const owned = await projectRepository.getOwned(id, ownerId);
        if (owned.name.toLowerCase() !== name.toLowerCase()) throw new ConflictError('Tên project đã tồn tại.');
      }
      patch.name = name;
    }
    if (input.repoUrl !== undefined) {
      this.azure.validateRepoUrl(input.repoUrl);
      if (await projectRepository.existsByRepo(input.repoUrl)) {
        const owned = await projectRepository.getOwned(id, ownerId);
        if (owned.repo.repoUrl !== input.repoUrl) throw new ConflictError('Repo đã được cấu hình.');
      }
      patch.repo = { repoUrl: input.repoUrl, azureProject: input.azureProject ?? '' };
    }
    if (input.model !== undefined || input.effort !== undefined) {
      patch.modelConfig = normalizeModelConfig(input.model, input.effort);
    }
    if (input.docSources !== undefined) {
      patch.docSources = input.docSources.map((s) => s.trim()).filter(Boolean);
    }
    if (input.status !== undefined) {
      if (input.status !== 'active' && input.status !== 'disabled') {
        throw new ValidationError('Trạng thái không hợp lệ.');
      }
      patch.status = input.status;
      if (input.status === 'disabled') await reviewJobRepository.cancelQueuedByProject(id);
    }
    // Secret write-only: chỉ ghi đè khi gửi giá trị mới.
    if (input.claudeApiKey && input.claudeApiKey.trim() !== '') {
      patch.encryptedClaudeKey = encryptSecret(input.claudeApiKey.trim());
      secretRotated = true;
    }
    if (input.azurePat && input.azurePat.trim() !== '') {
      patch.encryptedPat = encryptSecret(input.azurePat.trim());
      secretRotated = true;
    }

    const updated = await projectRepository.updateOwned(id, ownerId, patch);
    await auditRepository.append({
      ts: new Date(),
      ownerId,
      actor: ownerId,
      action: secretRotated ? 'secret.rotate' : 'project.update',
      projectId: id,
    });
    return toPublicView(updated);
  }

  async remove(id: string, ownerId: string): Promise<void> {
    await projectRepository.deleteOwned(id, ownerId); // 404 nếu không thuộc owner
    await reviewJobRepository.cancelQueuedByProject(id); // huỷ job mồ côi
    await auditRepository.append({
      ts: new Date(),
      ownerId,
      actor: ownerId,
      action: 'project.delete',
      projectId: id,
    });
  }

  /** test-connection: kiểm PAT + repo + Claude key; trả pass/fail từng phần, KHÔNG lộ giá trị. */
  async testConnection(input: {
    repoUrl: string;
    azurePat: string;
    claudeApiKey: string;
  }): Promise<{ repo: boolean; pat: boolean; claudeKey: boolean }> {
    const result = { repo: false, pat: false, claudeKey: false };
    try {
      this.azure.validateRepoUrl(input.repoUrl);
      result.repo = true;
    } catch {
      result.repo = false;
    }
    try {
      await this.azure.verifyPatIdentity(input.azurePat);
      result.pat = true;
    } catch {
      result.pat = false;
    }
    // Claude key: kiểm tối thiểu định dạng (test-call thật sẽ tốn token).
    result.claudeKey = /^sk-ant-/.test(input.claudeApiKey.trim());
    return result;
  }
}

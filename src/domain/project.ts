// Domain: Project aggregate (tech Aggregate Design).
// Secret là VO write-only; KHÔNG bao giờ serialize ra ngoài (sec Data Leakage).

import { ClaudeModel, ReasoningEffort } from '../config/catalog';

export type ProjectStatus = 'active' | 'disabled';

/** Secret đã mã hoá at-rest (T3). Lưu kèm keyVersion để rotation. */
export interface EncryptedSecret {
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
  keyVersion: number;
}

export interface RepoBinding {
  repoUrl: string; // Azure Git repo URL hợp lệ
  azureProject: string; // tên Azure DevOps project
}

export interface ModelConfig {
  model: ClaudeModel;
  effort: ReasoningEffort;
}

export interface Project {
  id: string; // _id dạng string
  ownerId: string; // Azure userId — KHÓA cô lập tenant (sec #10)
  name: string;
  repo: RepoBinding;
  modelConfig: ModelConfig;
  docSources: string[]; // glob/đường dẫn nguồn tài liệu bổ sung (ADR-009)
  status: ProjectStatus;
  // Secret được lưu mã hoá; không trả ra qua API.
  encryptedClaudeKey: EncryptedSecret;
  encryptedPat: EncryptedSecret;
  createdAt: Date;
  updatedAt: Date;
}

/** View an toàn để trả API/UI — KHÔNG chứa secret (sec API3 Excessive Data). */
export interface ProjectPublicView {
  id: string;
  name: string;
  repo: RepoBinding;
  modelConfig: ModelConfig;
  docSources: string[];
  status: ProjectStatus;
  secretConfigured: { claudeKey: boolean; pat: boolean };
  createdAt: string;
  updatedAt: string;
}

export function toPublicView(p: Project): ProjectPublicView {
  return {
    id: p.id,
    name: p.name,
    repo: p.repo,
    modelConfig: p.modelConfig,
    docSources: p.docSources,
    status: p.status,
    secretConfigured: {
      claudeKey: !!p.encryptedClaudeKey?.ciphertext,
      pat: !!p.encryptedPat?.ciphertext,
    },
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

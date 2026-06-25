// ACL ports (tech ADR-011) — bọc hệ ngoài để Core không phụ thuộc SDK/CLI.

import { Finding } from '../domain/reviewJob';

/** Thông tin PR lấy từ Azure DevOps. */
export interface PrInfo {
  prId: string;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  lastCommitHash: string;
  repoUrl: string;
  azureProject: string;
  changedFiles: ChangedFile[];
  isEmpty: boolean;
}

export interface ChangedFile {
  path: string;
  changeType: string; // add/edit/delete
  diffLines: number;
  isBinary: boolean;
}

export interface IAzureClient {
  /** Verify + lấy metadata/diff PR. Ném IntegrationError khi lỗi tạm thời. */
  fetchPullRequest(opts: { pat: string; prUrl: string }): Promise<PrInfo>;
  /** Clone nhánh nguồn vào thư mục đích; fallback diff-only nếu fail. */
  cloneSourceBranch(opts: {
    pat: string;
    repoUrl: string;
    branch: string;
    destDir: string;
  }): Promise<{ cloned: boolean }>;
  /** Validate repo URL hợp lệ + thuộc host cho phép (chống SSRF). */
  validateRepoUrl(repoUrl: string): void;
  /** Xác thực PAT còn hiệu lực + suy ra danh tính (dùng cho login). */
  verifyPatIdentity(pat: string): Promise<{ userId: string; email: string; displayName: string }>;
}

/** Yêu cầu chạy 1 skill review qua Claude Code CLI headless. */
export interface SkillRunRequest {
  skill: string;
  model: string;
  effort: string;
  claudeApiKey: string; // truyền qua ENV tiến trình con, KHÔNG qua arg
  cwd: string; // thư mục repo clone
  promptContext: string; // mô tả file/diff cần review (untrusted → đóng khung)
  correlationId: string;
}

export interface SkillRunOutput {
  status: 'completed' | 'failed';
  findings: Finding[];
  costTokens?: number;
  error?: string;
}

export interface ISkillRunner {
  run(req: SkillRunRequest): Promise<SkillRunOutput>;
}

/** Cổng Slack: ack nhanh + post kết quả/tiến độ vào thread. */
export interface ISlackPort {
  ackInThread(opts: { channel: string; threadTs: string; text: string }): Promise<void>;
  postResult(opts: {
    channel: string;
    threadTs: string;
    summaryText: string;
    detailBlocks?: unknown[];
    attachmentText?: string; // khi quá dài → đính kèm
  }): Promise<void>;
  react(opts: { channel: string; timestamp: string; emoji: string }): Promise<void>;
}

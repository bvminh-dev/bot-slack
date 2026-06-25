// Domain: ReviewJob aggregate + Finding (tech Aggregate/Domain Events).
// Idempotency key = (projectId, prId, commitHash). Snapshot config/skillVersion để tái lập.

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Finding {
  skill: string;
  file?: string;
  severity: Severity;
  title: string;
  detail?: string;
}

export interface SkillRunResult {
  skill: string;
  status: 'completed' | 'failed';
  error?: string;
  findingCount: number;
  costTokens?: number;
}

/** Snapshot cấu hình tại thời điểm start (tech Source of Truth/Temporal). */
export interface ConfigSnapshot {
  model: string;
  effort: string;
  skillVersion: string; // git hash/version của .claude/skills (pin)
  repoUrl: string;
  azureProject: string;
}

export interface ReviewJob {
  id: string;
  // idempotency
  projectId: string;
  ownerId: string; // owner của project (cô lập tenant)
  prId: string;
  commitHash: string;
  idempotencyKey: string; // `${projectId}:${prId}:${commitHash}`
  // Slack context
  slackChannel: string;
  slackThreadTs: string;
  slackUserId: string; // người ra lệnh (audit)
  prUrl: string;
  // lifecycle
  status: JobStatus;
  availableAt: Date; // thời điểm job sẵn sàng được claim (queue poll)
  leaseUntil?: Date; // visibility timeout khi running (reclaim nếu quá hạn)
  attempts: number;
  configSnapshot?: ConfigSnapshot;
  findings: Finding[];
  skillRuns: SkillRunResult[];
  costTokens: number;
  truncated?: { files?: number; diffLines?: number }; // báo cắt do giới hạn
  error?: string;
  supersedesJobId?: string; // review lại cùng commit
  createdAt: Date;
  updatedAt: Date;
}

export function makeIdempotencyKey(projectId: string, prId: string, commitHash: string): string {
  return `${projectId}:${prId}:${commitHash}`;
}

export function severityCounts(findings: Finding[]): Record<Severity, number> {
  const base: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) base[f.severity]++;
  return base;
}

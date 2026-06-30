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
  detail?: string; // fallback: mô tả tự do khi skill không trả 4 trường có cấu trúc
  why?: string; // tại sao là bug/rủi ro
  evidence?: string; // trích dòng/đoạn cụ thể trong file
  impact?: string; // hậu quả nếu không sửa
  fix?: string; // đề xuất sửa cụ thể
}

export interface SkillRunResult {
  skill: string;
  status: 'completed' | 'failed';
  error?: string;
  findingCount: number;
  costTokens?: number;
}

// i-002 (ADR-013): fan-out — mỗi nơi cần trả kết quả = 1 DeliveryTarget trên job.
export type DeliveryStatus = 'pending' | 'delivered' | 'failed';
export type DeliveryMode = 'file' | 'chat' | 'cache';

export interface DeliveryTarget {
  channel: string;
  threadTs: string;
  userId: string; // người gõ lệnh (audit; không serialize thừa ra ngoài)
  requestedAt: Date;
  status: DeliveryStatus;
  mode?: DeliveryMode; // cách đã giao thành công
  deliveredAt?: Date;
  error?: string;
}

export function makeDeliveryTarget(channel: string, threadTs: string, userId: string, at: Date): DeliveryTarget {
  return { channel, threadTs, userId, requestedAt: at, status: 'pending' };
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
  supersedesJobId?: string; // review lại cùng commit — bản này thay bản nào (i-001)
  supersededByJobId?: string; // i-002: bản này đã bị bản nào thay (loại khỏi cache-serve)
  completedAt?: Date; // i-002: thời điểm hoàn tất (chọn bản cache mới nhất + stale note)
  deliveryTargets: DeliveryTarget[]; // i-002 (ADR-013): fan-out tới mọi nơi đã hỏi
  createdAt: Date;
  updatedAt: Date;
}

export function makeIdempotencyKey(projectId: string, prId: string, commitHash: string): string {
  return `${projectId}:${prId}:${commitHash}`;
}

/**
 * i-002 (ADR-014): job có "đủ điều kiện cache-serve" không.
 * Hợp lệ = đã `completed`, CHƯA bị superseded, và KHÔNG phải lỗi-toàn-phần
 * (có ≥1 skill chạy xong). Job `failed`/mọi-skill-fail/superseded → KHÔNG serve lại.
 */
export function isCacheEligible(job: Pick<ReviewJob, 'status' | 'supersededByJobId' | 'skillRuns'>): boolean {
  if (job.status !== 'completed') return false;
  if (job.supersededByJobId) return false;
  if (job.skillRuns.length === 0) return false; // vd PR rỗng — chạy lại (rẻ)
  return job.skillRuns.some((s) => s.status === 'completed');
}

export function severityCounts(findings: Finding[]): Record<Severity, number> {
  const base: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) base[f.severity]++;
  return base;
}

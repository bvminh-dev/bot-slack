// T11/T15 — Nhận lệnh review từ Slack: rate-limit → parse → resolve project → validate repo
// → authorizeReviewCommand → fetch commit hiện tại → enqueue idempotent. Ack do gateway xử lý.

import { IAzureClient } from '../ports/interfaces';
import { parseCommand } from './commandParser';
import { RateLimiter } from './rateLimiter';
import { projectRepository } from '../adapters/mongo/projectRepository';
import { reviewJobRepository } from '../adapters/mongo/reviewJobRepository';
import { auditRepository } from '../adapters/mongo/auditRepository';
import { decryptSecret } from '../adapters/crypto/secretCrypto';
import { makeIdempotencyKey } from '../domain/reviewJob';
import { RateLimitError, ValidationError } from '../domain/errors';
import { logger } from '../observability/logger';

export interface SlackCommandContext {
  channel: string;
  threadTs: string; // dùng message ts làm thread
  userId: string;
  text: string;
}

export type CommandResult =
  | { kind: 'queued'; prId: string; project: string }
  | { kind: 'duplicate'; prId: string }
  | { kind: 'rejected'; reason: string };

/**
 * Điểm chốt phân quyền review (sec/tech). Hiện CHO PHÉP mọi user trong workspace
 * review mọi project (#8 đã chốt — residual risk chấp nhận). Giữ tập trung để siết sau
 * (vd theo allowlist kênh hoặc owner) mà không sửa luồng.
 */
export function authorizeReviewCommand(_actorUserId: string, _projectId: string): boolean {
  return true;
}

export class ReviewCommandService {
  constructor(
    private readonly azure: IAzureClient,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async handle(ctx: SlackCommandContext): Promise<CommandResult> {
    // Rate-limit per-user (sec DoS/cost).
    if (!this.rateLimiter.allow(ctx.userId)) {
      throw new RateLimitError('Bạn đã gửi quá nhiều lệnh review. Vui lòng thử lại sau.');
    }

    const parsed = parseCommand(ctx.text); // ném ValidationError nếu cú pháp/URL sai

    const project = await projectRepository.resolveByNameForSlack(parsed.project);
    if (!project) return { kind: 'rejected', reason: `Project "${parsed.project}" chưa được cấu hình.` };
    if (project.status === 'disabled') {
      return { kind: 'rejected', reason: `Project "${project.name}" đang tạm ngừng nhận lệnh.` };
    }
    if (!authorizeReviewCommand(ctx.userId, project.id)) {
      await auditRepository.append({
        ts: new Date(),
        ownerId: project.ownerId,
        actor: ctx.userId,
        action: 'access.denied',
        projectId: project.id,
      });
      return { kind: 'rejected', reason: 'Bạn không có quyền review project này.' };
    }

    // Lấy commit hiện tại của PR để chốt idempotency + validate repo khớp project.
    const pat = decryptSecret(project.encryptedPat);
    const pr = await this.azure.fetchPullRequest({ pat, prUrl: parsed.prUrl });
    if (pr.repoUrl.replace(/\/+$/, '') !== project.repo.repoUrl.replace(/\/+$/, '')) {
      return { kind: 'rejected', reason: 'Link PR không thuộc repo của project (mismatch).' };
    }
    const commitHash = pr.lastCommitHash || 'unknown';

    const now = new Date();
    const enq = await reviewJobRepository.enqueue({
      projectId: project.id,
      ownerId: project.ownerId,
      prId: parsed.prId,
      commitHash,
      idempotencyKey: makeIdempotencyKey(project.id, parsed.prId, commitHash),
      slackChannel: ctx.channel,
      slackThreadTs: ctx.threadTs,
      slackUserId: ctx.userId,
      prUrl: parsed.prUrl,
      status: 'queued',
      availableAt: now,
      attempts: 0,
      findings: [],
      skillRuns: [],
      costTokens: 0,
      createdAt: now,
      updatedAt: now,
    });

    await auditRepository.append({
      ts: now,
      ownerId: project.ownerId,
      actor: ctx.userId,
      action: 'review.command',
      projectId: project.id,
      prId: parsed.prId,
      commitHash,
    });

    if (enq.status === 'duplicate') {
      logger.info('review_duplicate', { projectId: project.id, prId: parsed.prId });
      return { kind: 'duplicate', prId: parsed.prId };
    }
    return { kind: 'queued', prId: parsed.prId, project: project.name };
  }
}

export { ValidationError };

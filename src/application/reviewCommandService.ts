// T11/T15 — Nhận lệnh review từ Slack: rate-limit → parse → resolve project → validate repo
// → authorizeReviewCommand → fetch commit hiện tại → enqueue idempotent. Ack do gateway xử lý.

import { IAzureClient } from '../ports/interfaces';
import { parseCommand } from './commandParser';
import { RateLimiter } from './rateLimiter';
import { projectRepository } from '../adapters/mongo/projectRepository';
import { reviewJobRepository } from '../adapters/mongo/reviewJobRepository';
import { reviewHistoryRepository } from '../adapters/mongo/reviewHistoryRepository';
import { auditRepository } from '../adapters/mongo/auditRepository';
import { decryptSecret } from '../adapters/crypto/secretCrypto';
import { makeDeliveryTarget, makeIdempotencyKey, ReviewJob } from '../domain/reviewJob';
import { RateLimitError, ValidationError } from '../domain/errors';
import { loadConfig } from '../config/env';
import { logger } from '../observability/logger';

export interface SlackCommandContext {
  channel: string;
  threadTs: string; // dùng message ts làm thread
  userId: string;
  text: string;
}

// i-002 (ADR-013/014): lệnh trùng KHÔNG còn bị reject — đăng ký fan-out hoặc cache-serve.
export type CommandResult =
  | { kind: 'queued'; prId: string; project: string }
  | { kind: 'subscribed'; prId: string; project: string } // đăng ký vào job đang chạy (ack chờ)
  | { kind: 'cache'; prId: string; project: string; cachedJob: ReviewJob } // trả từ History (0 token)
  | { kind: 'cap_reached'; prId: string } // PR "hot" vượt cap target
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
    const key = makeIdempotencyKey(project.id, parsed.prId, commitHash);
    const now = new Date();
    const cap = loadConfig().deliveryTargetCap;

    await auditRepository.append({
      ts: now,
      ownerId: project.ownerId,
      actor: ctx.userId,
      action: 'review.command',
      projectId: project.id,
      prId: parsed.prId,
      commitHash,
      meta: { fresh: parsed.fresh },
    });

    // i-002 (ADR-014): cache-serve — khóa đã có bản completed HỢP LỆ & KHÔNG `fresh` → trả từ DB (0 token).
    if (!parsed.fresh) {
      const cached = await reviewJobRepository.findCacheEligibleByKey(key);
      if (cached) {
        await auditRepository.append({
          ts: new Date(), ownerId: project.ownerId, actor: ctx.userId,
          action: 'review.cache_hit', projectId: project.id, prId: parsed.prId, commitHash,
        });
        logger.info('review_cache_hit', { projectId: project.id, prId: parsed.prId });
        return { kind: 'cache', prId: parsed.prId, project: project.name, cachedJob: cached };
      }
    }

    const target = makeDeliveryTarget(ctx.channel, ctx.threadTs, ctx.userId, now);
    const jobData = {
      projectId: project.id,
      ownerId: project.ownerId,
      prId: parsed.prId,
      commitHash,
      idempotencyKey: key,
      slackChannel: ctx.channel,
      slackThreadTs: ctx.threadTs,
      slackUserId: ctx.userId,
      prUrl: parsed.prUrl,
      status: 'queued' as const,
      availableAt: now,
      attempts: 0,
      findings: [],
      skillRuns: [],
      costTokens: 0,
      deliveryTargets: [target],
      createdAt: now,
      updatedAt: now,
    };

    // i-002 (ADR-013): enqueue-or-subscribe ATOMIC. Trùng lúc đang chạy → đăng ký target + fan-out.
    // BUG-10: xử lý `race_none` TƯỜNG MINH (retry tối đa 2 lần), KHÔNG để lọt vào nhánh 'subscribed'.
    let enq = await reviewJobRepository.enqueueOrSubscribe(jobData, cap);
    for (let attempt = 0; enq.status === 'race_none' && attempt < 2; attempt++) {
      // Job vừa rời active (completed/failed) giữa chừng: thử cache, không có thì enqueue lại.
      if (!parsed.fresh) {
        const cached = await reviewJobRepository.findCacheEligibleByKey(key);
        if (cached) return { kind: 'cache', prId: parsed.prId, project: project.name, cachedJob: cached };
      }
      enq = await reviewJobRepository.enqueueOrSubscribe(jobData, cap);
    }
    if (enq.status === 'race_none') {
      // Vẫn đua sau khi thử lại → KHÔNG ack "đang xử lý" giả; báo bận để người dùng gõ lại.
      logger.warn('review_enqueue_race_unsettled', { projectId: project.id, prId: parsed.prId });
      return { kind: 'rejected', reason: 'Hệ thống đang bận xử lý PR này, vui lòng thử lại sau giây lát.' };
    }

    if (enq.status === 'queued') {
      // `fresh` trên khóa đã completed → đánh dấu lineage supersede (loại bản cũ khỏi cache).
      // BUG-12: tìm bản completed gần nhất theo khóa (KHÔNG lọc cache-eligible) để không mất
      // lineage khi bản trước lỗi-toàn-phần (đúng case hay rerun nhất).
      if (parsed.fresh) {
        const prev = await reviewJobRepository.findLatestCompletedByKey(key, enq.job.id);
        if (prev) {
          await reviewJobRepository.markSuperseded(prev.id, enq.job.id);
          await reviewHistoryRepository.markSuperseded(prev.id, enq.job.id);
          await auditRepository.append({
            ts: new Date(), ownerId: project.ownerId, actor: ctx.userId,
            action: 'review.rerun', projectId: project.id, prId: parsed.prId, commitHash,
            meta: { supersedes: prev.id },
          });
        }
      }
      return { kind: 'queued', prId: parsed.prId, project: project.name };
    }
    if (enq.status === 'cap_reached') {
      logger.warn('delivery_target_cap_reached', { projectId: project.id, prId: parsed.prId });
      return { kind: 'cap_reached', prId: parsed.prId };
    }
    // CHỈ còn 'subscribed' | 'already_subscribed' → ack chờ, sẽ nhận fan-out khi xong.
    logger.info('review_subscribed', { projectId: project.id, prId: parsed.prId, status: enq.status });
    return { kind: 'subscribed', prId: parsed.prId, project: project.name };
  }
}

export { ValidationError };

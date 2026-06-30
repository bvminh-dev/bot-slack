// T14 — Review Worker pipeline cho 1 job:
// load project → snapshot config+skillVersion → fetch PR → validate repo → build context/clone
// → dispatch skills (token cô lập theo job) → aggregate findings → lưu history TRƯỚC post Slack
// → post Slack → cleanup clone trong finally. Circuit breaker theo project token.

import { IAzureClient, ISkillRunner, ISlackPort } from '../ports/interfaces';
import { ContextBuilder } from './contextBuilder';
import { getSkillVersion } from './skillVersion';
import { buildReport, ResultDeliverer } from './resultPresenter';
import { projectRepository } from '../adapters/mongo/projectRepository';
import { reviewJobRepository } from '../adapters/mongo/reviewJobRepository';
import { reviewHistoryRepository } from '../adapters/mongo/reviewHistoryRepository';
import { auditRepository } from '../adapters/mongo/auditRepository';
import { decryptSecret } from '../adapters/crypto/secretCrypto';
import { ConfigSnapshot, DeliveryTarget, Finding, ReviewJob, SkillRunResult } from '../domain/reviewJob';
import { CircuitBreaker } from '../observability/circuitBreaker';
import { logger } from '../observability/logger';
import { IntegrationError } from '../domain/errors';
import { loadConfig } from '../config/env';

export class ReviewOrchestrator {
  private readonly ctxBuilder: ContextBuilder;
  private readonly deliverer: ResultDeliverer;
  constructor(
    private readonly azure: IAzureClient,
    private readonly skillRunner: ISkillRunner,
    private readonly slack: ISlackPort,
    private readonly breaker = new CircuitBreaker(),
  ) {
    this.ctxBuilder = new ContextBuilder(azure);
    this.deliverer = new ResultDeliverer(slack);
  }

  async process(job: ReviewJob, correlationId: string): Promise<void> {
    let cloneDir: string | null = null;
    const breakerKey = `project:${job.projectId}`;
    try {
      if (this.breaker.isOpen(breakerKey)) {
        throw new Error('Tạm ngừng review project này do lỗi liên tục (circuit breaker mở).');
      }

      // BUG-03 + BUG-09: nếu job đã tạo history (lần chạy trước lưu kết quả rồi crash/lease hết
      // TRƯỚC khi giao xong) → KHÔNG chạy lại skill (tốn token), nhưng PHẢI GIAO LẠI từ history
      // (fan-out idempotent per-target: target đã 'delivered' bị bỏ qua, target 'pending' được giao).
      if (await reviewJobRepository.hasHistory(job.id)) {
        const hist = await reviewHistoryRepository.findByJobId(job.id);
        if (hist) {
          const proj = await projectRepository.getOwned(job.projectId, job.ownerId).catch(() => null);
          await this.fanout(job, proj?.name ?? job.projectId, {
            findings: hist.findings,
            skillRuns: hist.skillRuns,
            notes: [],
            costTokens: hist.costTokens,
            snapshot: hist.configSnapshot,
          });
          await reviewJobRepository.complete(job.id, {
            findings: hist.findings,
            skillRuns: hist.skillRuns,
            costTokens: hist.costTokens,
          });
        } else {
          await reviewJobRepository.complete(job.id, {
            findings: job.findings,
            skillRuns: job.skillRuns,
            costTokens: job.costTokens,
          });
        }
        logger.warn('review_job_already_done_redeliver', { jobId: job.id, correlationId });
        this.breaker.recordSuccess(breakerKey);
        return;
      }

      // Load project theo (id, ownerId) — giữ ràng buộc cô lập tenant.
      const project = await projectRepository.getOwned(job.projectId, job.ownerId);
      // Giải mã secret vào BIẾN CỤC BỘ (không global → chống lẫn token giữa 5 job song song).
      const pat = decryptSecret(project.encryptedPat);
      const claudeKey = decryptSecret(project.encryptedClaudeKey);

      // Fetch PR + validate repo khớp project (chống review nhầm repo).
      const pr = await this.azure.fetchPullRequest({ pat, prUrl: job.prUrl });
      if (pr.repoUrl.replace(/\/+$/, '') !== project.repo.repoUrl.replace(/\/+$/, '')) {
        throw new Error('PR không thuộc repo đã cấu hình cho project (mismatch).');
      }

      // Snapshot config + skillVersion + commit đã review (Source of Truth/Temporal).
      const snapshot: ConfigSnapshot = {
        model: project.modelConfig.model,
        effort: project.modelConfig.effort,
        skillVersion: getSkillVersion(),
        repoUrl: project.repo.repoUrl,
        azureProject: project.repo.azureProject,
      };
      // BUG-05: liên kết supersedes về bản review trước của cùng (project, PR).
      const prev = await reviewJobRepository.findLatestByPr(job.projectId, job.prId, job.id);
      await reviewJobRepository.setSnapshot(job.id, snapshot, prev?.id);

      if (pr.isEmpty) {
        await this.finishEmpty(job, correlationId);
        this.breaker.recordSuccess(breakerKey);
        return;
      }

      // Build skill map + clone (best-effort; fallback diff-only).
      const ctx = this.ctxBuilder.buildSkillMap(pr);
      const cloneRes = await this.ctxBuilder.clone({ pat, pr, jobId: job.id });
      cloneDir = cloneRes.dir;
      if (!cloneRes.cloned) ctx.notes.push('Clone thất bại — review fallback trên diff/metadata.');

      // Dispatch từng skill (token cô lập theo job qua biến cục bộ claudeKey).
      const findings: Finding[] = [];
      const skillRuns: SkillRunResult[] = [];
      let costTokens = 0;
      for (const [skill, files] of ctx.skillToFiles.entries()) {
        const promptContext = [
          `PR #${pr.prId}: ${pr.title}`,
          `Branch: ${pr.sourceBranch} → ${pr.targetBranch} @ ${pr.lastCommitHash}`,
          `File áp dụng skill ${skill}:`,
          ...files.map((f) => `- ${f}`),
        ].join('\n');
        const out = await this.skillRunner.run({
          skill,
          model: snapshot.model,
          effort: snapshot.effort,
          claudeApiKey: claudeKey,
          cwd: cloneDir ?? process.cwd(),
          promptContext,
          correlationId,
        });
        findings.push(...out.findings);
        costTokens += out.costTokens ?? 0;
        skillRuns.push({
          skill,
          status: out.status,
          error: out.error,
          findingCount: out.findings.length,
          costTokens: out.costTokens,
        });
        if (out.status === 'failed') logger.warn('skill_failed', { skill, correlationId, error: out.error });
      }

      // Lưu HISTORY TRƯỚC khi post Slack (ADR-010) — post fail không mất kết quả.
      await reviewHistoryRepository.save({
        jobId: job.id,
        ownerId: job.ownerId,
        projectId: job.projectId,
        prId: job.prId,
        prUrl: job.prUrl,
        commitHash: job.commitHash,
        status: 'completed',
        findings,
        skillRuns,
        configSnapshot: snapshot,
        costTokens,
      });
      await auditRepository.append({
        ts: new Date(),
        ownerId: job.ownerId,
        actor: job.slackUserId,
        action: 'review.completed',
        projectId: job.projectId,
        prId: job.prId,
        commitHash: job.commitHash,
        skills: skillRuns.map((s) => s.skill),
        costTokens,
      });
      // BUG-09: GIAO KẾT QUẢ (fan-out) TRƯỚC khi complete() — vì complete() đặt status='completed'
      // làm job KHÔNG còn reclaim được; nếu giao sau, crash giữa 2 bước sẽ mất giao vĩnh viễn.
      // Crash trước complete() → job vẫn 'running' → reclaim → guard hasHistory → re-fanout (idempotent).
      await this.fanout(job, project.name, { findings, skillRuns, notes: ctx.notes, costTokens, snapshot });
      await reviewJobRepository.complete(job.id, { findings, skillRuns, costTokens, truncated: ctx.truncated });
      this.breaker.recordSuccess(breakerKey);
    } catch (err) {
      this.breaker.recordFailure(breakerKey);
      const safeMsg = err instanceof Error ? err.message : 'Lỗi không xác định';

      // BUG-02: lỗi tích hợp tạm thời + còn lượt thử → requeue với backoff thay vì fail cứng.
      const cfg = loadConfig();
      if (err instanceof IntegrationError && err.retryable && job.attempts < cfg.maxAttempts) {
        await reviewJobRepository.requeueWithBackoff(job.id, cfg.retryBackoffMs * job.attempts, safeMsg);
        logger.warn('review_job_requeued', { jobId: job.id, correlationId, attempts: job.attempts, reason: safeMsg });
        return; // KHÔNG post lỗi/không audit failed — sẽ thử lại
      }

      await reviewJobRepository.fail(job.id, safeMsg);
      await auditRepository.append({
        ts: new Date(),
        ownerId: job.ownerId,
        actor: job.slackUserId,
        action: 'review.failed',
        projectId: job.projectId,
        prId: job.prId,
        meta: { reason: safeMsg },
      });
      // Thông báo lỗi AN TOÀN tới MỌI target (không stacktrace/secret).
      await this.broadcastText(job, `⚠️ Review PR #${job.prId} thất bại: ${safeMsg}`);
      logger.error('review_job_failed', { jobId: job.id, correlationId, reason: safeMsg });
    } finally {
      await this.ctxBuilder.cleanup(cloneDir); // xoá clone KỂ CẢ khi lỗi
    }
  }

  private async finishEmpty(job: ReviewJob, correlationId: string): Promise<void> {
    await reviewJobRepository.complete(job.id, { findings: [], skillRuns: [], costTokens: 0 });
    await this.broadcastText(job, `ℹ️ PR #${job.prId} không có file thay đổi để review.`);
    logger.info('review_empty', { jobId: job.id, correlationId });
  }

  /** Gửi 1 message text tới MỌI delivery target (dùng cho lỗi/empty). */
  private async broadcastText(job: ReviewJob, text: string): Promise<void> {
    const targets = await this.currentTargets(job);
    for (const t of targets) {
      await this.slack.postText({ channel: t.channel, threadTs: t.threadTs, text }).catch(() => false);
    }
  }

  /** Lấy delivery target mới nhất từ DB (bắt cả subscriber đăng ký muộn trước khi complete). */
  private async currentTargets(job: ReviewJob): Promise<DeliveryTarget[]> {
    const fresh = await reviewJobRepository.getById(job.id);
    const targets = fresh?.deliveryTargets?.length ? fresh.deliveryTargets : job.deliveryTargets;
    // Job i-001 cũ (không có deliveryTargets) → fallback về Slack context gốc.
    if (!targets || targets.length === 0) {
      return [{ channel: job.slackChannel, threadTs: job.slackThreadTs, userId: job.slackUserId, requestedAt: new Date(), status: 'pending' }];
    }
    return targets;
  }

  /**
   * i-002 (ADR-012/013) — Fan-out kết quả: build file .md (1 lần) rồi giao tới MỌI target
   * `pending`. Per-target idempotent (markTargetDelivered atomic) → reclaim KHÔNG giao trùng.
   */
  private async fanout(
    job: ReviewJob,
    projectName: string,
    data: { findings: Finding[]; skillRuns: SkillRunResult[]; notes: string[]; costTokens: number; snapshot?: ConfigSnapshot },
  ): Promise<void> {
    const report = buildReport(projectName, {
      prId: job.prId,
      prUrl: job.prUrl,
      commitHash: job.commitHash,
      findings: data.findings,
      skillRuns: data.skillRuns,
      notes: data.notes,
      costTokens: data.costTokens,
      configSnapshot: data.snapshot,
    });

    const targets = (await this.currentTargets(job)).filter((t) => t.status === 'pending');
    const deliveries: Array<{ channel: string; threadTs: string; status: string; mode?: string }> = [];
    for (const t of targets) {
      const outcome = await this.deliverer.deliver(report, t.channel, t.threadTs);
      if (outcome.ok) {
        // Mark ATOMIC theo status=pending → reclaim sau sẽ thấy 'delivered', không giao lại.
        const claimed = await reviewJobRepository.markTargetDelivered(job.id, t.channel, t.threadTs, outcome.mode ?? 'file');
        if (claimed) {
          await auditRepository.append({
            ts: new Date(), ownerId: job.ownerId, actor: job.slackUserId, action: 'review.delivered',
            projectId: job.projectId, prId: job.prId, meta: { channel: t.channel, mode: outcome.mode },
          });
          deliveries.push({ channel: t.channel, threadTs: t.threadTs, status: 'delivered', mode: outcome.mode });
        }
        await this.slack
          .react({ channel: t.channel, timestamp: t.threadTs, emoji: report.allFailed ? 'warning' : 'white_check_mark' })
          .catch(() => undefined);
      } else {
        await reviewJobRepository.markTargetFailed(job.id, t.channel, t.threadTs, outcome.error ?? 'unknown');
        await auditRepository.append({
          ts: new Date(), ownerId: job.ownerId, actor: job.slackUserId, action: 'review.delivery_failed',
          projectId: job.projectId, prId: job.prId, meta: { channel: t.channel, reason: outcome.error },
        });
        deliveries.push({ channel: t.channel, threadTs: t.threadTs, status: 'failed' });
        logger.error('delivery_failed', { jobId: job.id, channel: t.channel, reason: outcome.error });
      }
    }
    // i-002 (T13): ghi deliveries vào history để Admin UI hiển thị (không chứa nội dung/secret).
    await reviewHistoryRepository.recordDeliveries(job.id, deliveries).catch(() => undefined);
  }
}

// T14 — Review Worker pipeline cho 1 job:
// load project → snapshot config+skillVersion → fetch PR → validate repo → build context/clone
// → dispatch skills (token cô lập theo job) → aggregate findings → lưu history TRƯỚC post Slack
// → post Slack → cleanup clone trong finally. Circuit breaker theo project token.

import { IAzureClient, ISkillRunner, ISlackPort } from '../ports/interfaces';
import { ContextBuilder } from './contextBuilder';
import { getSkillVersion } from './skillVersion';
import { projectRepository } from '../adapters/mongo/projectRepository';
import { reviewJobRepository } from '../adapters/mongo/reviewJobRepository';
import { reviewHistoryRepository } from '../adapters/mongo/reviewHistoryRepository';
import { auditRepository } from '../adapters/mongo/auditRepository';
import { decryptSecret } from '../adapters/crypto/secretCrypto';
import { ConfigSnapshot, Finding, ReviewJob, SkillRunResult, Severity, severityCounts } from '../domain/reviewJob';
import { CircuitBreaker } from '../observability/circuitBreaker';
import { logger } from '../observability/logger';
import { IntegrationError } from '../domain/errors';
import { loadConfig } from '../config/env';

const SEV_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEV_EMOJI: Record<Severity, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪' };

/** Chuẩn hoá text về Slack mrkdwn: gộp xuống dòng, đổi **đậm**→*đậm*, bỏ heading markdown (#). */
function toSlackText(s: string): string {
  return s
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .trim();
}

export class ReviewOrchestrator {
  private readonly ctxBuilder: ContextBuilder;
  constructor(
    private readonly azure: IAzureClient,
    private readonly skillRunner: ISkillRunner,
    private readonly slack: ISlackPort,
    private readonly breaker = new CircuitBreaker(),
  ) {
    this.ctxBuilder = new ContextBuilder(azure);
  }

  async process(job: ReviewJob, correlationId: string): Promise<void> {
    let cloneDir: string | null = null;
    const breakerKey = `project:${job.projectId}`;
    try {
      if (this.breaker.isOpen(breakerKey)) {
        throw new Error('Tạm ngừng review project này do lỗi liên tục (circuit breaker mở).');
      }

      // BUG-03: idempotency guard — nếu job này đã tạo history (đã post Slack ở lần chạy trước,
      // crash trước khi complete), KHÔNG chạy lại side-effect; chỉ chốt completed.
      if (await reviewJobRepository.hasHistory(job.id)) {
        await reviewJobRepository.complete(job.id, {
          findings: job.findings,
          skillRuns: job.skillRuns,
          costTokens: job.costTokens,
        });
        logger.warn('review_job_already_done_skip_rerun', { jobId: job.id, correlationId });
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
      await reviewJobRepository.complete(job.id, { findings, skillRuns, costTokens, truncated: ctx.truncated });

      await this.postResult(job, findings, skillRuns, ctx.notes, costTokens);
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
      // Thông báo lỗi AN TOÀN vào thread (không stacktrace/secret).
      await this.slack
        .postResult({
          channel: job.slackChannel,
          threadTs: job.slackThreadTs,
          summaryText: `⚠️ Review PR #${job.prId} thất bại: ${safeMsg}`,
        })
        .catch(() => undefined);
      logger.error('review_job_failed', { jobId: job.id, correlationId, reason: safeMsg });
    } finally {
      await this.ctxBuilder.cleanup(cloneDir); // xoá clone KỂ CẢ khi lỗi
    }
  }

  private async finishEmpty(job: ReviewJob, correlationId: string): Promise<void> {
    await reviewJobRepository.complete(job.id, { findings: [], skillRuns: [], costTokens: 0 });
    await this.slack.postResult({
      channel: job.slackChannel,
      threadTs: job.slackThreadTs,
      summaryText: `ℹ️ PR #${job.prId} không có file thay đổi để review.`,
    });
    logger.info('review_empty', { jobId: job.id, correlationId });
  }

  private async postResult(
    job: ReviewJob,
    findings: Finding[],
    skillRuns: SkillRunResult[],
    notes: string[],
    costTokens: number,
  ): Promise<void> {
    const counts = severityCounts(findings);
    // Nếu MỌI skill đều lỗi → không có review thực sự: báo cảnh báo, KHÔNG báo "✅ hoàn tất"
    // (tránh user hiểu nhầm PR sạch khi thực chất key sai/lỗi hạ tầng). Hiển thị lý do để khắc phục.
    const failedRuns = skillRuns.filter((s) => s.status === 'failed');
    const allFailed = skillRuns.length > 0 && failedRuns.length === skillRuns.length;
    const errReasons = [...new Set(failedRuns.map((s) => s.error).filter((e): e is string => !!e))];
    const summary = [
      allFailed
        ? `⚠️ Review PR #${job.prId} KHÔNG hoàn tất — tất cả skill đều lỗi (commit \`${job.commitHash.slice(0, 8)}\`)`
        : `✅ Review PR #${job.prId} hoàn tất (commit \`${job.commitHash.slice(0, 8)}\`)`,
      `Mức độ: 🔴 ${counts.CRITICAL} CRITICAL · 🟠 ${counts.HIGH} HIGH · 🟡 ${counts.MEDIUM} MEDIUM · ⚪ ${counts.LOW} LOW`,
      `Skill chạy: ${skillRuns.map((s) => `${s.skill}${s.status === 'failed' ? '(lỗi)' : ''}`).join(', ') || 'không có'}`,
      ...(errReasons.length ? [`Lý do lỗi: ${errReasons.join(' | ')}`] : []),
      ...(notes.length ? [`Ghi chú: ${notes.join(' ')}`] : []),
      `Token ước tính: ${costTokens}`,
      `PR: ${job.prUrl}`,
    ].join('\n');

    // Render Slack mrkdwn: heading *đậm* + emoji (Slack KHÔNG hỗ trợ ###), mỗi finding có
    // tiêu đề đậm + 4 dòng blockquote (Tại sao/Bằng chứng/Tác động/Đề xuất). Fallback `detail` nếu thiếu.
    const detail = SEV_ORDER.flatMap((sev) => {
      const items = findings.filter((f) => f.severity === sev);
      if (!items.length) return [];
      const lines = [`\n${SEV_EMOJI[sev]} *${sev} (${items.length})*`];
      items.forEach((f, i) => {
        const meta = `_[${f.skill}${f.file ? ` · \`${f.file}\`` : ''}]_`;
        lines.push(`\n*${i + 1}. ${toSlackText(f.title)}*  ${meta}`);
        const rows: Array<[string, string | undefined]> = [
          ['Tại sao', f.why],
          ['Bằng chứng', f.evidence],
          ['Tác động', f.impact],
          ['Đề xuất', f.fix],
        ];
        const present = rows.filter(([, v]) => v && v.trim());
        if (present.length) {
          for (const [label, v] of present) lines.push(`> *${label}:* ${toSlackText(v as string)}`);
        } else if (f.detail) {
          lines.push(`> ${toSlackText(f.detail)}`);
        }
      });
      return lines;
    }).join('\n');

    await this.slack.postResult({
      channel: job.slackChannel,
      threadTs: job.slackThreadTs,
      summaryText: summary,
      attachmentText: detail || undefined,
    });
    await this.slack
      .react({
        channel: job.slackChannel,
        timestamp: job.slackThreadTs,
        emoji: allFailed ? 'warning' : 'white_check_mark',
      })
      .catch(() => undefined);
  }
}

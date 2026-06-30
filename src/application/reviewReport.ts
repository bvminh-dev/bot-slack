// i-002 (T3, ADR-012/015) — Builders thuần cho việc giao kết quả review.
// Dựng file .md (Markdown CHUẨN — file đính kèm) + dòng tóm tắt inline (Slack mrkdwn).
// File KHÔNG persist (ADR-015): dựng on-demand từ findings (job/history) mỗi lần giao.
// KHÔNG I/O ở đây — dễ unit test (UT-201..207, 217, 218).

import { Finding, Severity, SkillRunResult, severityCounts } from '../domain/reviewJob';
import { redactReport } from '../observability/redact';

const SEV_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEV_EMOJI: Record<Severity, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '⚪' };

/** Bỏ ký tự không an toàn cho tên file (chống path traversal `../`, dấu `/`, khoảng trắng). */
export function sanitizeFilename(part: string): string {
  return (part || 'unknown')
    .replace(/[^A-Za-z0-9._-]+/g, '-') // gộp ký tự lạ → '-'
    .replace(/\.\.+/g, '-') // chặn '..'
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

/** Tên file báo cáo: `review-<project>-PR<id>-<commit8>.md` (commit8 = 8 ký tự đầu hash). */
export function buildReportFilename(project: string, prId: string, commitHash: string): string {
  const commit8 = (commitHash || 'nocommit').slice(0, 8);
  return `review-${sanitizeFilename(project)}-PR${sanitizeFilename(prId)}-${sanitizeFilename(commit8)}.md`;
}

/**
 * Vô hiệu hoá mention/broadcast Slack từ nội dung không tin cậy (snippet PR) trước khi
 * post dạng CHAT (fallback). `<!channel>`/`<!here>`/`<!everyone>`/`<@U..>` → text thường;
 * link `<url|label>` → label (không auto-render). File .md KHÔNG bị Slack parse mention → an toàn hơn.
 */
export function neutralizeMentions(text: string): string {
  return text
    .replace(/<!(channel|here|everyone)>/gi, '@$1\u200b') // chèn zero-width (escape) để không kích hoạt
    .replace(/<!subteam\^[A-Z0-9]+(\|[^>]*)?>/gi, '@team')
    .replace(/<@([A-Z0-9]+)(\|[^>]*)?>/gi, '@user')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/gi, '$2')
    .replace(/<(https?:\/\/[^>]+)>/gi, '$1');
}

/** Dòng tóm tắt inline (Slack mrkdwn): đếm severity + skill + link PR + commit. */
export function buildSummaryLine(opts: {
  prId: string;
  prUrl: string;
  commitHash: string;
  findings: Finding[];
  skillRuns: SkillRunResult[];
  allFailed: boolean;
}): string {
  const c = severityCounts(opts.findings);
  const head = opts.allFailed
    ? `⚠️ Review PR #${opts.prId} KHÔNG hoàn tất — tất cả skill đều lỗi (commit \`${opts.commitHash.slice(0, 8)}\`)`
    : `✅ Review PR #${opts.prId} hoàn tất (commit \`${opts.commitHash.slice(0, 8)}\`)`;
  return [
    head,
    `Mức độ: 🔴 *${c.CRITICAL}* CRITICAL · 🟠 *${c.HIGH}* HIGH · 🟡 *${c.MEDIUM}* MEDIUM · ⚪ *${c.LOW}* LOW`,
    `📎 Chi tiết trong file đính kèm · PR: ${opts.prUrl}`,
  ].join('\n');
}

/** Chú thích cache-serve: kết quả lấy từ DB (không chạy lại) + gợi ý `fresh`. */
export function buildStaleNote(completedAt: Date | undefined, commitHash: string): string {
  const when = completedAt ? new Date(completedAt).toISOString() : 'trước đó';
  return `📄 Kết quả đã có sẵn (review lúc ${when}, commit \`${commitHash.slice(0, 8)}\`). Gõ kèm \`fresh\` để chạy lại bản mới.`;
}

/** Kiểm tra kích thước file .md có vượt giới hạn Slack không (→ fallback chat). */
export function isFileWithinSlackLimit(byteLength: number, limit: number): boolean {
  return byteLength > 0 && byteLength <= limit;
}

/** Dựng nội dung file `.md` ĐẦY ĐỦ (Markdown chuẩn). Đã redact secret trước khi trả. */
export function buildMarkdownReport(opts: {
  prId: string;
  prUrl: string;
  commitHash: string;
  findings: Finding[];
  skillRuns: SkillRunResult[];
  notes?: string[];
  costTokens: number;
  model?: string;
  skillVersion?: string;
}): string {
  const c = severityCounts(opts.findings);
  const failed = opts.skillRuns.filter((s) => s.status === 'failed');
  const allFailed = opts.skillRuns.length > 0 && failed.length === opts.skillRuns.length;
  const lines: string[] = [];
  lines.push(`# Review PR #${opts.prId}`);
  lines.push('');
  lines.push(`- **PR:** ${opts.prUrl}`);
  lines.push(`- **Commit:** \`${opts.commitHash}\``);
  lines.push(`- **Trạng thái:** ${allFailed ? '⚠️ KHÔNG hoàn tất (mọi skill lỗi)' : '✅ Hoàn tất'}`);
  lines.push(
    `- **Tổng kết:** ${c.CRITICAL} CRITICAL · ${c.HIGH} HIGH · ${c.MEDIUM} MEDIUM · ${c.LOW} LOW`,
  );
  lines.push(`- **Skill chạy:** ${opts.skillRuns.map((s) => `${s.skill}${s.status === 'failed' ? ' (lỗi)' : ''}`).join(', ') || 'không có'}`);
  if (opts.model) lines.push(`- **Model:** ${opts.model}${opts.skillVersion ? ` · skillVersion \`${opts.skillVersion}\`` : ''}`);
  lines.push(`- **Token ước tính:** ${opts.costTokens}`);
  if (opts.notes?.length) lines.push(`- **Ghi chú:** ${opts.notes.join(' ')}`);
  const errReasons = [...new Set(failed.map((s) => s.error).filter((e): e is string => !!e))];
  if (errReasons.length) lines.push(`- **Lý do lỗi skill:** ${errReasons.join(' | ')}`);

  for (const sev of SEV_ORDER) {
    const items = opts.findings.filter((f) => f.severity === sev);
    if (!items.length) continue;
    lines.push('');
    lines.push(`## ${SEV_EMOJI[sev]} ${sev} (${items.length})`);
    items.forEach((f, i) => {
      const loc = f.file ? ` \`${f.file}\`` : '';
      lines.push('');
      lines.push(`### ${i + 1}. ${f.title}  _[${f.skill}${loc}]_`);
      const rows: Array<[string, string | undefined]> = [
        ['Tại sao', f.why],
        ['Bằng chứng', f.evidence],
        ['Tác động', f.impact],
        ['Đề xuất', f.fix],
      ];
      const present = rows.filter(([, v]) => v && v.trim());
      if (present.length) {
        for (const [label, v] of present) lines.push(`- **${label}:** ${v}`);
      } else if (f.detail) {
        lines.push(`- ${f.detail}`);
      }
    });
  }
  if (!opts.findings.length && !allFailed) {
    lines.push('');
    lines.push('_Không phát hiện finding nào._');
  }
  // Redact secret-pattern TRƯỚC khi nội dung rời hệ thống (sec Data Protection).
  return redactReport(lines.join('\n') + '\n');
}

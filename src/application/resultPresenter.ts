// i-002 (T3/T9, ADR-012) — Dựng báo cáo + giao kết quả (file .md → fallback chunk chat).
// Dùng chung bởi: worker fan-out (giao tới mọi delivery target) và cache-serve (giao 1 target từ History).

import { ISlackPort } from '../ports/interfaces';
import { ConfigSnapshot, Finding, SkillRunResult } from '../domain/reviewJob';
import { chunkByLines } from '../adapters/slack/slackPort';
import {
  buildMarkdownReport,
  buildReportFilename,
  buildSummaryLine,
  neutralizeMentions,
} from './reviewReport';
import { logger } from '../observability/logger';

const SLACK_MAX_TEXT = 2800;

export interface BuiltReport {
  filename: string;
  markdown: string;
  summaryText: string;
  allFailed: boolean;
}

export interface ReportSource {
  prId: string;
  prUrl: string;
  commitHash: string;
  findings: Finding[];
  skillRuns: SkillRunResult[];
  notes?: string[];
  costTokens: number;
  configSnapshot?: ConfigSnapshot;
}

/** Dựng file .md + tóm tắt inline từ findings (job hoặc history). Không I/O. */
export function buildReport(project: string, src: ReportSource): BuiltReport {
  const allFailed = src.skillRuns.length > 0 && src.skillRuns.every((s) => s.status === 'failed');
  return {
    filename: buildReportFilename(project, src.prId, src.commitHash),
    markdown: buildMarkdownReport({
      prId: src.prId,
      prUrl: src.prUrl,
      commitHash: src.commitHash,
      findings: src.findings,
      skillRuns: src.skillRuns,
      notes: src.notes,
      costTokens: src.costTokens,
      model: src.configSnapshot?.model,
      skillVersion: src.configSnapshot?.skillVersion,
    }),
    summaryText: buildSummaryLine({
      prId: src.prId,
      prUrl: src.prUrl,
      commitHash: src.commitHash,
      findings: src.findings,
      skillRuns: src.skillRuns,
      allFailed,
    }),
    allFailed,
  };
}

export type DeliveryOutcome = { ok: boolean; mode?: 'file' | 'chat'; error?: string };

export class ResultDeliverer {
  constructor(private readonly slack: ISlackPort) {}

  /**
   * Giao 1 báo cáo tới 1 (channel, thread): thử file .md trước, lỗi → fallback chunk chat.
   * `summaryPrefix` chèn trước tóm tắt (vd chú thích cache-serve / fallback).
   */
  async deliver(
    report: BuiltReport,
    channel: string,
    threadTs: string,
    summaryPrefix?: string,
  ): Promise<DeliveryOutcome> {
    const summary = summaryPrefix ? `${summaryPrefix}\n${report.summaryText}` : report.summaryText;
    // 1) Thử upload file .md (external 2 bước). Mark thành công CHỈ khi completeUploadExternal OK.
    try {
      const ok = await this.slack.uploadMarkdown({
        channel,
        threadTs,
        filename: report.filename,
        content: report.markdown,
        initialComment: summary,
      });
      if (ok) return { ok: true, mode: 'file' };
    } catch (e) {
      logger.warn('upload_markdown_threw', { error: e instanceof Error ? e.message : String(e) });
    }
    // 2) Fallback: chunk chat (vô hiệu mention từ snippet PR — chống ping toàn kênh).
    logger.warn('delivery_fallback_chat', { channel });
    let allOk = await this.slack.postText({ channel, threadTs, text: `⚠️ Không gửi được file, gửi dạng chat.\n${summary}` });
    for (const chunk of chunkByLines(neutralizeMentions(report.markdown), SLACK_MAX_TEXT)) {
      const ok = await this.slack.postText({ channel, threadTs, text: chunk });
      allOk = allOk && ok;
    }
    return allOk ? { ok: true, mode: 'chat' } : { ok: false, error: 'Cả upload file lẫn chat fallback đều thất bại.' };
  }
}

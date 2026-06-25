// T13 — ContextBuilder. Clone vào thư mục riêng theo jobId; thu thập tài liệu;
// lọc file + áp giới hạn an toàn (≤50 file, ≤5.000 dòng diff, bỏ binary/lock); map file→skill.

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { IAzureClient, PrInfo } from '../ports/interfaces';
import { loadConfig } from '../config/env';
import { mapFileToSkills } from './fileSkillMap';
import { logger } from '../observability/logger';

export interface BuiltContext {
  cloneDir: string | null; // null nếu fallback diff-only
  cloned: boolean;
  /** skill → danh sách file áp dụng (đã lọc + giới hạn). */
  skillToFiles: Map<string, string[]>;
  truncated: { files?: number; diffLines?: number };
  notes: string[];
}

export class ContextBuilder {
  constructor(private readonly azure: IAzureClient) {}

  /** Tạo thư mục clone riêng theo jobId (cô lập tenant trên đĩa — sec). */
  async makeCloneDir(jobId: string): Promise<string> {
    return mkdtemp(join(tmpdir(), `tieu-nhi-${jobId}-`));
  }

  async cleanup(dir: string | null): Promise<void> {
    if (!dir) return;
    try {
      await rm(dir, { recursive: true, force: true });
    } catch {
      logger.warn('clone_cleanup_failed', { dir });
    }
  }

  /** Lọc file theo giới hạn + map skill. Báo cắt khi vượt. */
  buildSkillMap(pr: PrInfo): Pick<BuiltContext, 'skillToFiles' | 'truncated' | 'notes'> {
    const cfg = loadConfig();
    const notes: string[] = [];
    const truncated: { files?: number; diffLines?: number } = {};

    const reviewable = pr.changedFiles.filter((f) => !f.isBinary);
    const skippedBinary = pr.changedFiles.length - reviewable.length;
    if (skippedBinary > 0) notes.push(`Bỏ qua ${skippedBinary} file binary/lock/generated.`);

    let limited = reviewable;
    if (reviewable.length > cfg.maxFilesPerPr) {
      truncated.files = reviewable.length - cfg.maxFilesPerPr;
      limited = reviewable.slice(0, cfg.maxFilesPerPr);
      notes.push(`Cắt còn ${cfg.maxFilesPerPr} file (vượt giới hạn, bỏ ${truncated.files} file).`);
    }

    const totalDiff = limited.reduce((s, f) => s + (f.diffLines || 0), 0);
    if (totalDiff > cfg.maxDiffLines) {
      truncated.diffLines = totalDiff - cfg.maxDiffLines;
      notes.push(`Diff vượt ${cfg.maxDiffLines} dòng — review phần ưu tiên.`);
    }

    const skillToFiles = new Map<string, string[]>();
    for (const f of limited) {
      const decision = mapFileToSkills(f.path);
      if (decision.skip) continue;
      for (const skill of decision.skills) {
        const arr = skillToFiles.get(skill) ?? [];
        arr.push(f.path);
        skillToFiles.set(skill, arr);
      }
    }
    if (skillToFiles.size === 0) notes.push('Không có file phù hợp để review.');
    return { skillToFiles, truncated, notes };
  }

  /** Clone (best-effort). Trả cloned=false → worker review fallback trên diff. */
  async clone(opts: { pat: string; pr: PrInfo; jobId: string }): Promise<{ dir: string; cloned: boolean }> {
    const dir = await this.makeCloneDir(opts.jobId);
    const { cloned } = await this.azure.cloneSourceBranch({
      pat: opts.pat,
      repoUrl: opts.pr.repoUrl,
      branch: opts.pr.sourceBranch,
      destDir: dir,
    });
    return { dir, cloned };
  }
}

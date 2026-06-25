// T14 — Pin/đọc version của .claude/skills để snapshot vào job (tech: skill là shared dependency có version).
import { execFileSync } from 'child_process';
import { loadConfig } from '../config/env';

let cached: string | null = null;

/** Lấy git hash của thư mục skills nếu có; fallback 'unpinned'. */
export function getSkillVersion(): string {
  if (cached) return cached;
  const cfg = loadConfig();
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%H', '--', cfg.skillsDir], {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    cached = out || 'unpinned';
  } catch {
    cached = 'unpinned';
  }
  return cached;
}

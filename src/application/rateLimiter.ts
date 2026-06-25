// T15 — Rate limit per-user/period (sec DoS/cost; frd #6). Cửa sổ trượt đơn giản in-memory.
import { loadConfig } from '../config/env';

export class RateLimiter {
  private hits = new Map<string, number[]>();

  /** true nếu được phép; false nếu vượt ngưỡng. Chuẩn hoá key để không lách bằng biến thể. */
  allow(userId: string): boolean {
    const cfg = loadConfig();
    const key = userId.trim().toLowerCase();
    const now = Date.now();
    const windowStart = now - cfg.rateLimitWindowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (arr.length >= cfg.rateLimitMax) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

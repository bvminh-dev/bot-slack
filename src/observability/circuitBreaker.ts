// T17 — Circuit breaker theo khoá (vd project token Claude) — tech Resiliency.
// Mở breaker khi 1 project liên tục lỗi để không đốt thêm token & không chặn project khác.

import { logger } from './logger';

interface BreakerState {
  failures: number;
  openUntil: number; // epoch ms; 0 = đóng
}

export class CircuitBreaker {
  private states = new Map<string, BreakerState>();

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 60_000,
  ) {}

  isOpen(key: string): boolean {
    const s = this.states.get(key);
    if (!s) return false;
    if (s.openUntil && Date.now() < s.openUntil) return true;
    if (s.openUntil && Date.now() >= s.openUntil) {
      // half-open: cho thử lại
      this.states.set(key, { failures: 0, openUntil: 0 });
    }
    return false;
  }

  recordSuccess(key: string): void {
    this.states.set(key, { failures: 0, openUntil: 0 });
  }

  recordFailure(key: string): void {
    const s = this.states.get(key) ?? { failures: 0, openUntil: 0 };
    s.failures++;
    if (s.failures >= this.threshold) {
      s.openUntil = Date.now() + this.cooldownMs;
      logger.warn('circuit_breaker_open', { key, failures: s.failures, cooldownMs: this.cooldownMs });
    }
    this.states.set(key, s);
  }
}

// T14 — Worker poller. Poll DB-queue, claim atomic, chạy tối đa WORKER_CONCURRENCY job song song.
import { ReviewOrchestrator } from '../application/reviewOrchestrator';
import { reviewJobRepository } from '../adapters/mongo/reviewJobRepository';
import { loadConfig } from '../config/env';
import { logger, newCorrelationId } from '../observability/logger';

export class ReviewWorker {
  private running = 0;
  private active = new Set<Promise<void>>();
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly orchestrator: ReviewOrchestrator) {}

  start(): void {
    const cfg = loadConfig();
    this.stopped = false;
    const tick = async () => {
      if (this.stopped) return;
      try {
        await this.fill();
      } catch (e) {
        logger.error('worker_tick_error', { error: e instanceof Error ? e.message : String(e) });
      }
      if (!this.stopped) this.timer = setTimeout(tick, cfg.queuePollIntervalMs);
    };
    void tick();
    logger.info('worker_started', { concurrency: cfg.workerConcurrency });
  }

  /** Lấp đầy slot tới mức concurrency, mỗi slot claim 1 job. */
  private async fill(): Promise<void> {
    const cfg = loadConfig();
    // BUG-01: dọn job hết lượt thử sang dead-letter trước khi claim.
    await reviewJobRepository.deadLetterExhausted(cfg.maxAttempts);
    while (this.running < cfg.workerConcurrency) {
      const job = await reviewJobRepository.claimNext(cfg.jobLeaseMs, cfg.maxAttempts);
      if (!job) break; // hết job sẵn sàng
      this.running++;
      const correlationId = newCorrelationId('job');
      logger.info('job_claimed', { jobId: job.id, correlationId, attempts: job.attempts });
      const p = this.orchestrator
        .process(job, correlationId)
        .catch((e) => logger.error('job_unhandled', { jobId: job.id, error: String(e) }))
        .finally(() => {
          this.running--;
          this.active.delete(p);
        });
      this.active.add(p);
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await Promise.allSettled([...this.active]);
  }
}

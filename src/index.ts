// Entry point — khởi động API + worker. Đọc ENV, kết nối Mongo, compose ACL adapters.
import { createApp } from './api/server';
import { ReviewWorker } from './worker/worker';
import { ReviewOrchestrator } from './application/reviewOrchestrator';
import { azureClient } from './adapters/azure/azureClient';
import { skillRunner } from './adapters/skillrunner/skillRunner';
import { slackPort } from './adapters/slack/slackPort';
import { connectMongo, closeMongo } from './adapters/mongo/client';
import { loadConfig } from './config/env';
import { logger } from './observability/logger';

async function main() {
  const cfg = loadConfig(); // fail-fast nếu thiếu ENV bắt buộc
  await connectMongo();

  const app = createApp();
  const server = app.listen(cfg.port, () => logger.info('http_listening', { port: cfg.port }));

  const orchestrator = new ReviewOrchestrator(azureClient, skillRunner, slackPort);
  const worker = new ReviewWorker(orchestrator);
  worker.start();

  const shutdown = async () => {
    logger.info('shutting_down', {});
    await worker.stop();
    server.close();
    await closeMongo();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  logger.error('fatal_startup', { error: e instanceof Error ? e.message : String(e) });
  process.exit(1);
});

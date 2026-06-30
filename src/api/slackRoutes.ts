// T15 — Slack Gateway endpoint. Verify signing secret + timestamp; URL challenge; ack < 3s; enqueue nền.
import { Request, Response, Router } from 'express';
import { verifySlackSignature } from '../adapters/slack/slackSignature';
import { ISlackPort } from '../ports/interfaces';
import { ReviewCommandService } from '../application/reviewCommandService';
import { buildReport, ResultDeliverer } from '../application/resultPresenter';
import { buildStaleNote } from '../application/reviewReport';
import { reviewHistoryRepository } from '../adapters/mongo/reviewHistoryRepository';
import { DomainError } from '../domain/errors';
import { logger, newCorrelationId } from '../observability/logger';

interface SlackEventBody {
  type?: string;
  challenge?: string;
  event?: {
    type?: string;
    text?: string;
    user?: string;
    channel?: string;
    ts?: string;
    thread_ts?: string;
    bot_id?: string;
  };
}

export function slackRoutes(commandService: ReviewCommandService, slack: ISlackPort): Router {
  const r = Router();
  const deliverer = new ResultDeliverer(slack);

  // Dùng raw body (express.raw) để verify HMAC chính xác trên endpoint này.
  r.post('/events', async (req: Request, res: Response) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : '';
    const ok = verifySlackSignature({
      rawBody,
      timestamp: req.header('x-slack-request-timestamp'),
      signature: req.header('x-slack-signature'),
    });
    if (!ok) {
      res.status(401).json({ error: 'invalid signature' });
      return;
    }

    let body: SlackEventBody;
    try {
      body = JSON.parse(rawBody) as SlackEventBody;
    } catch {
      res.status(400).end();
      return;
    }

    // URL verification challenge.
    if (body.type === 'url_verification' && body.challenge) {
      res.json({ challenge: body.challenge });
      return;
    }

    // ACK NGAY (< 3s) — Slack yêu cầu. Xử lý review nền sau.
    res.status(200).end();

    const ev = body.event;
    if (!ev || ev.type !== 'app_mention' || ev.bot_id) return; // bỏ event của bot
    const correlationId = newCorrelationId('slack');
    const channel = ev.channel ?? '';
    const threadTs = ev.thread_ts ?? ev.ts ?? '';
    const userId = ev.user ?? '';
    const text = ev.text ?? '';

    // Xử lý bất đồng bộ (không block response).
    void (async () => {
      try {
        const result = await commandService.handle({ channel, threadTs, userId, text });
        if (result.kind === 'queued') {
          await slack.ackInThread({
            channel,
            threadTs,
            text: `⏳ Đã nhận lệnh review PR #${result.prId} (project ${result.project}). Đang xử lý…`,
          });
        } else if (result.kind === 'subscribed') {
          // i-002 (ADR-013): lệnh trùng lúc đang chạy → ack chờ, sẽ nhận kết quả (fan-out) tại đây.
          await slack.ackInThread({
            channel,
            threadTs,
            text: `⏳ PR #${result.prId} đang được review. Kết quả sẽ được gửi vào đây khi xong.`,
          });
        } else if (result.kind === 'cache') {
          // i-002 (ADR-014): trả kết quả từ DB ngay (0 token) tới chính nơi vừa hỏi.
          const job = result.cachedJob;
          const report = buildReport(result.project, {
            prId: job.prId,
            prUrl: job.prUrl,
            commitHash: job.commitHash,
            findings: job.findings,
            skillRuns: job.skillRuns,
            costTokens: job.costTokens,
            configSnapshot: job.configSnapshot,
          });
          const out = await deliverer.deliver(report, channel, threadTs, buildStaleNote(job.completedAt, job.commitHash));
          // Ghi delivery 'cache' vào history của bản được phục vụ (Admin UI: chỉ báo cache-hit).
          await reviewHistoryRepository
            .appendDelivery(job.id, { channel, threadTs, status: out.ok ? 'delivered' : 'failed', mode: 'cache' })
            .catch(() => undefined);
        } else if (result.kind === 'cap_reached') {
          await slack.ackInThread({
            channel,
            threadTs,
            text: `ℹ️ PR #${result.prId} đang được nhiều người theo dõi — kết quả sẽ được gửi ở thread gốc.`,
          });
        } else {
          await slack.ackInThread({ channel, threadTs, text: `⚠️ ${result.reason}` });
        }
      } catch (e) {
        // Lỗi an toàn (cú pháp/validation/rate-limit) → trả thông báo, không stacktrace.
        const msg = e instanceof DomainError ? e.message : 'Lỗi xử lý lệnh.';
        await slack.ackInThread({ channel, threadTs, text: `⚠️ ${msg}` }).catch(() => undefined);
        logger.warn('slack_command_rejected', { correlationId, reason: msg });
      }
    })();
  });

  return r;
}

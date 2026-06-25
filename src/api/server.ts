// T6/T15 — Compose Express app: Admin API + Slack events. ACL adapters tiêm vào services.
import express from 'express';
import { IdentityService } from '../application/identityService';
import { RegistryService } from '../application/registryService';
import { ReviewCommandService } from '../application/reviewCommandService';
import { RateLimiter } from '../application/rateLimiter';
import { azureClient } from '../adapters/azure/azureClient';
import { slackPort } from '../adapters/slack/slackPort';
import { authRoutes } from './authRoutes';
import { projectRoutes } from './projectRoutes';
import { slackRoutes } from './slackRoutes';
import { corsMiddleware, errorHandler, requireAuth, securityHeaders } from './middleware';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);

  const identity = new IdentityService(azureClient);
  const registry = new RegistryService(azureClient);
  const rateLimiter = new RateLimiter();
  const commandService = new ReviewCommandService(azureClient, rateLimiter);

  // Slack endpoint cần RAW body để verify HMAC → đăng ký TRƯỚC express.json().
  app.use('/slack', express.raw({ type: '*/*', limit: '1mb' }), slackRoutes(commandService, slackPort));

  // Admin API: JSON + CORS chặt theo origin UI.
  app.use(express.json({ limit: '256kb' }));
  app.use(corsMiddleware);

  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use('/api/v1/auth', authRoutes(identity));
  app.use('/api/v1', requireAuth(identity), projectRoutes(registry)); // mọi route project yêu cầu session

  app.use(errorHandler);
  return app;
}

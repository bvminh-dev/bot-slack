// T6 — Middleware: auth (JWT session), error handler an toàn, CORS chặt, security headers.
import { NextFunction, Request, Response } from 'express';
import { IdentityService, SessionClaims } from '../application/identityService';
import { loadConfig } from '../config/env';
import { AuthError, ConflictError, DomainError, NotFoundError, RateLimitError, ValidationError } from '../domain/errors';
import { logger } from '../observability/logger';

export interface AuthedRequest extends Request {
  owner?: SessionClaims;
}

/** Đọc token từ cookie httpOnly hoặc Authorization: Bearer. */
function extractToken(req: Request): string | undefined {
  const auth = req.header('authorization');
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  const cookie = req.header('cookie');
  if (cookie) {
    const m = cookie.match(/(?:^|;\s*)session=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return undefined;
}

export function requireAuth(identity: IdentityService) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    try {
      req.owner = identity.verifySession(extractToken(req));
      next();
    } catch {
      res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên hết hạn.' });
    }
  };
}

/** CORS: chỉ origin của Admin UI; cho phép cookie credential. */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const cfg = loadConfig();
  const origin = req.header('origin');
  if (origin && origin === cfg.adminUiOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
}

/** Error handler: map DomainError → status; KHÔNG lộ stacktrace/secret (sec Data Leakage). */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  if (err instanceof ConflictError) return res.status(409).json({ error: err.message });
  if (err instanceof AuthError) return res.status(401).json({ error: err.message });
  if (err instanceof RateLimitError) return res.status(429).json({ error: err.message });
  if (err instanceof DomainError) return res.status(400).json({ error: err.message });
  logger.error('api_unhandled_error', { error: err instanceof Error ? err.message : String(err) });
  return res.status(500).json({ error: 'Lỗi hệ thống.' }); // thông báo chung, không chi tiết
}

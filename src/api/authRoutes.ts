// T6 — Auth routes: login bằng Azure PAT → session JWT (cookie httpOnly+Secure+SameSite).
import { Request, Response, Router } from 'express';
import { IdentityService } from '../application/identityService';
import { loadConfig } from '../config/env';

export function authRoutes(identity: IdentityService): Router {
  const r = Router();

  r.post('/login', async (req: Request, res: Response, next) => {
    try {
      const pat = typeof req.body?.pat === 'string' ? req.body.pat : '';
      const { token, owner } = await identity.login(pat);
      // Cookie phiên: httpOnly chống XSS đọc; Secure (HTTPS); SameSite chống CSRF.
      res.setHeader(
        'Set-Cookie',
        `session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=7200`,
      );
      void loadConfig();
      res.json({ owner: { email: owner.email, displayName: owner.displayName } });
    } catch (e) {
      next(e);
    }
  });

  r.post('/logout', (_req, res) => {
    res.setHeader('Set-Cookie', 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  return r;
}

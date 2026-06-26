// T4 — Identity & Ownership. Login bằng Azure PAT → AzureIdentity → session JWT.
// Self-service: bất kỳ PAT Azure hợp lệ đều tạo & sở hữu project (sec #2 đã chốt, không allowlist).
// Định danh owner = Azure userId (ổn định khi PAT xoay vòng) — KHÔNG dùng chuỗi PAT.

import jwt from 'jsonwebtoken';
import { IAzureClient } from '../ports/interfaces';
import { loadConfig } from '../config/env';
import { AuthError } from '../domain/errors';
import { auditRepository } from '../adapters/mongo/auditRepository';

export interface SessionClaims {
  ownerId: string;
  email: string;
  displayName: string;
}

export class IdentityService {
  constructor(private readonly azure: IAzureClient) {}

  /** Đăng nhập: verify PAT với Azure, cấp JWT ngắn hạn. KHÔNG lưu PAT login. */
  async login(pat: string): Promise<{ token: string; owner: SessionClaims }> {
    if (!pat || pat.trim() === '') throw new AuthError('Thiếu PAT.');
    // F-1/BUG-07: credential sai/hết hạn phải là 401, không phải 400. verifyPatIdentity ném
    // ValidationError (→400) khi PAT sai → dịch sang AuthError (→401), message chung không lộ chi tiết.
    let identity: { userId: string; email: string; displayName: string };
    try {
      identity = await this.azure.verifyPatIdentity(pat.trim());
    } catch {
      throw new AuthError('PAT không hợp lệ hoặc đã hết hạn.');
    }
    const cfg = loadConfig();
    const claims: SessionClaims = {
      ownerId: identity.userId,
      email: identity.email,
      displayName: identity.displayName,
    };
    const token = jwt.sign(claims, cfg.jwtSecret, { expiresIn: cfg.jwtExpiresIn } as jwt.SignOptions);
    await auditRepository.append({
      ts: new Date(),
      ownerId: claims.ownerId,
      actor: claims.ownerId,
      action: 'login',
      meta: { email: claims.email },
    });
    return { token, owner: claims };
  }

  /** Verify JWT từ cookie/header → claims. Ném AuthError nếu sai/hết hạn. */
  verifySession(token: string | undefined): SessionClaims {
    if (!token) throw new AuthError('Thiếu phiên đăng nhập.');
    const cfg = loadConfig();
    try {
      const decoded = jwt.verify(token, cfg.jwtSecret) as SessionClaims & jwt.JwtPayload;
      return { ownerId: decoded.ownerId, email: decoded.email, displayName: decoded.displayName };
    } catch {
      throw new AuthError('Phiên không hợp lệ hoặc đã hết hạn.');
    }
  }
}

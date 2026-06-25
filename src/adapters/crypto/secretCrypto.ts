// T3 — Mã hoá secret at-rest AES-256-GCM (sec #17 Encryption, ADR khoá master ENV).
// Mỗi secret: IV ngẫu nhiên riêng + auth tag + keyVersion (cho rotation thủ công).

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { EncryptedSecret } from '../../domain/project';
import { loadConfig } from '../../config/env';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // GCM khuyến nghị 96-bit IV

function masterKey(): Buffer {
  const cfg = loadConfig();
  const key = Buffer.from(cfg.secretMasterKey, 'base64');
  if (key.length !== 32) {
    throw new Error('SECRET_MASTER_KEY phải là 32 byte (base64). Sinh: openssl rand -base64 32');
  }
  return key;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const cfg = loadConfig();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ct.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    keyVersion: cfg.secretKeyVersion,
  };
}

export function decryptSecret(enc: EncryptedSecret): string {
  // Lưu ý rotation: nếu sau này có nhiều keyVersion, chọn key theo enc.keyVersion ở đây.
  const decipher = createDecipheriv(ALGO, masterKey(), Buffer.from(enc.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(enc.tag, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}

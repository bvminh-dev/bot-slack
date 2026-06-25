// T17 — Structured logging JSON + correlation id. Mọi payload đi qua redact() (sec).
import { redact } from './redact';

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  correlationId?: string;
  [k: string]: unknown;
}

function emit(level: Level, msg: string, fields?: LogFields) {
  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(record);
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const logger = {
  debug: (msg: string, f?: LogFields) => emit('debug', msg, f),
  info: (msg: string, f?: LogFields) => emit('info', msg, f),
  warn: (msg: string, f?: LogFields) => emit('warn', msg, f),
  error: (msg: string, f?: LogFields) => emit('error', msg, f),
};

let counter = 0;
/** Sinh correlation id xuyên Slack→job→skill→post (tech Observability). */
export function newCorrelationId(prefix = 'cid'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

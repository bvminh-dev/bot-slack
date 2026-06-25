// T1 — Model + ReasoningEffort catalog (tech ADR-006).
// Cập nhật khi Anthropic ra model mới mà không sửa logic. Mặc định: claude-sonnet-4-6 / medium.

export const ALLOWED_MODELS = [
  'claude-opus-4-8',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const;

export const ALLOWED_EFFORTS = ['low', 'medium', 'high'] as const;

export type ClaudeModel = (typeof ALLOWED_MODELS)[number];
export type ReasoningEffort = (typeof ALLOWED_EFFORTS)[number];

export const DEFAULT_MODEL: ClaudeModel = 'claude-sonnet-4-6';
export const DEFAULT_EFFORT: ReasoningEffort = 'medium';

export function isValidModel(m: string): m is ClaudeModel {
  return (ALLOWED_MODELS as readonly string[]).includes(m);
}

export function isValidEffort(e: string): e is ReasoningEffort {
  return (ALLOWED_EFFORTS as readonly string[]).includes(e);
}

/** Chuẩn hoá model/effort: rỗng → default; không hợp lệ → ném lỗi (T5 validate). */
export function normalizeModelConfig(model?: string, effort?: string): {
  model: ClaudeModel;
  effort: ReasoningEffort;
} {
  const m = model && model.trim() !== '' ? model.trim() : DEFAULT_MODEL;
  const e = effort && effort.trim() !== '' ? effort.trim() : DEFAULT_EFFORT;
  if (!isValidModel(m)) {
    throw new Error(`Model không thuộc catalog: ${m}. Hợp lệ: ${ALLOWED_MODELS.join(', ')}`);
  }
  if (!isValidEffort(e)) {
    throw new Error(`Effort không hợp lệ: ${e}. Hợp lệ: ${ALLOWED_EFFORTS.join(', ')}`);
  }
  return { model: m, effort: e };
}

export function catalog() {
  return {
    models: [...ALLOWED_MODELS],
    efforts: [...ALLOWED_EFFORTS],
    defaultModel: DEFAULT_MODEL,
    defaultEffort: DEFAULT_EFFORT,
  };
}

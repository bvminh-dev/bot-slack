// T13 — Map loại file → skill (tech ADR-008, test Decision Table). 1 file có thể kích nhiều skill.

export const SKILLS = {
  reviewCode: 'review-code',
  security: 'bao-mat-he-thong',
  test: 'kiem-thu-phan-mem',
  business: 'phan-tich-nghiep-vu',
  architecture: 'thiet-ke-he-thong',
} as const;

const CODE_EXT = /\.(ts|tsx|js|jsx|py|java|go|cs|rb|php|cpp|cc|c|rs|kt|kts|scala|sql|sh)$/i;
const SENSITIVE = /(auth|security|crypto|secret|password|login|iam|permission|token|payment|\.env)/i;
const TEST_FILE = /(\.test\.|\.spec\.|(^|\/)__tests__\/|(^|\/)tests?\/)/i;
const BUSINESS_DOC = /(frd\.md$|requirements|\.feature$)/i;
const ARCH_DOC = /(tech\.md$|sad\.md$|(^|\/)adr|\.puml$)/i;
const BINARY_LOCK = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)$|\.map$|\.(png|jpe?g|gif|ico|pdf|zip|gz|tar|exe|dll|woff2?|ttf|mp4|mov)$)/i;

export interface FileSkillDecision {
  skip: boolean;
  skills: string[];
  note?: string;
}

export function mapFileToSkills(path: string): FileSkillDecision {
  if (BINARY_LOCK.test(path)) return { skip: true, skills: [], note: 'binary/lock/generated — bỏ qua' };

  const skills = new Set<string>();
  const isCode = CODE_EXT.test(path);
  if (isCode) skills.add(SKILLS.reviewCode);
  if (SENSITIVE.test(path)) skills.add(SKILLS.security); // cộng thêm
  if (TEST_FILE.test(path)) skills.add(SKILLS.test);
  if (BUSINESS_DOC.test(path)) skills.add(SKILLS.business);
  if (ARCH_DOC.test(path)) skills.add(SKILLS.architecture);

  if (skills.size === 0) {
    // Không khớp loại nào & không binary → mặc định review-code (ghi chú).
    return { skip: false, skills: [SKILLS.reviewCode], note: 'loại file chung — mặc định review-code' };
  }
  return { skip: false, skills: [...skills] };
}

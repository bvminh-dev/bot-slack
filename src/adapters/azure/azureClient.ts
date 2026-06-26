// T8 — IAzureClient (ACL). Bọc azure-devops-node-api + git clone.
// Bảo mật: validate repo URL chống SSRF (chỉ host cho phép); spawn git dạng argv (không shell).

import { spawn } from 'child_process';
import { ChangedFile, IAzureClient, PrInfo } from '../../ports/interfaces';
import { IntegrationError, ValidationError } from '../../domain/errors';
import { loadConfig } from '../../config/env';
import { logger } from '../../observability/logger';

const BINARY_EXT = /\.(png|jpe?g|gif|ico|pdf|zip|gz|tar|exe|dll|woff2?|ttf|mp4|mov|class|jar)$/i;
const LOCK_GENERATED = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.min\.(js|css)$|\.map$)/i;

/** Parse PR url Azure: dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id} */
export function parseAzurePrUrl(prUrl: string): {
  host: string;
  org: string;
  azureProject: string;
  repo: string;
  prId: string;
  repoUrl: string;
} {
  let u: URL;
  try {
    u = new URL(prUrl);
  } catch {
    throw new ValidationError('Link PR không phải URL hợp lệ.');
  }
  const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i);
  if (!m) {
    throw new ValidationError('Link PR Azure không đúng định dạng (.../_git/<repo>/pullrequest/<id>).');
  }
  const [, org, azureProject, repo, prId] = m;
  return {
    host: u.host.toLowerCase(),
    org,
    azureProject: decodeURIComponent(azureProject),
    repo: decodeURIComponent(repo),
    prId,
    repoUrl: `${u.protocol}//${u.host}/${org}/${azureProject}/_git/${repo}`,
  };
}

function assertAllowedHost(host: string): void {
  const cfg = loadConfig();
  const h = host.toLowerCase().replace(/:\d+$/, '');
  const ok = cfg.azureAllowedHosts.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
  if (!ok) {
    throw new ValidationError(`Host không được phép (chống SSRF): ${host}`);
  }
}

function runGit(args: string[], opts: { timeoutMs: number }): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    // argv array — KHÔNG qua shell (sec: chống command injection).
    const child = spawn('git', args, { shell: false });
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs);
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stderr });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, stderr: 'git spawn error' });
    });
  });
}

/**
 * Lưu ý: bản hiện thực này dùng git CLI + REST cơ bản để giữ ACL độc lập SDK.
 * Trong thực tế thay phần fetch metadata bằng azure-devops-node-api; chữ ký giữ nguyên.
 */
export const azureClient: IAzureClient = {
  validateRepoUrl(repoUrl: string): void {
    let u: URL;
    try {
      u = new URL(repoUrl);
    } catch {
      throw new ValidationError('Repo URL không hợp lệ.');
    }
    if (u.protocol !== 'https:') throw new ValidationError('Repo URL phải dùng HTTPS.');
    assertAllowedHost(u.host);
  },

  async verifyPatIdentity(pat: string) {
    // Xác thực PAT qua connectionData của org (lấy authenticatedUser làm owner).
    // Ưu điểm: chạy với PAT scope tối thiểu (vd Code Read) — không cần scope User Profile.
    // CẢNH BÁO: connectionData KHÔNG trả 401 khi PAT sai → trả identity Anonymous
    // (id = GUID toàn 0). PHẢI chặn case này, nếu không PAT sai sẽ login thành Anonymous.
    const cfg = loadConfig();
    if (!cfg.azureIdentityOrg) {
      throw new IntegrationError('Thiếu cấu hình AZURE_DEFAULT_ORG để xác thực PAT.', false);
    }
    const auth = Buffer.from(`:${pat}`).toString('base64');
    const url = `https://dev.azure.com/${encodeURIComponent(
      cfg.azureIdentityOrg,
    )}/_apis/connectionData?api-version=7.1-preview.1`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
    } catch {
      throw new IntegrationError('Không kết nối được Azure để xác thực PAT.', true);
    }
    if (res.status === 401 || res.status === 403) {
      throw new ValidationError('PAT không hợp lệ hoặc không đủ quyền.');
    }
    if (res.status === 404) {
      throw new IntegrationError(`Org Azure "${cfg.azureIdentityOrg}" không tồn tại.`, false);
    }
    if (!res.ok) throw new IntegrationError('Azure trả lỗi khi xác thực PAT.', true);
    // Azure có thể trả 200 + trang sign-in HTML khi PAT không được chấp nhận. KHÔNG parse mù JSON.
    const ctype = res.headers.get('content-type') ?? '';
    const raw = await res.text();
    if (!ctype.includes('application/json') || /^\s*</.test(raw)) {
      throw new ValidationError('PAT không xác thực được. Kiểm tra PAT còn hạn và đúng org.');
    }
    let data: {
      authenticatedUser?: {
        id?: string;
        providerDisplayName?: string;
        properties?: { Account?: { $value?: string } };
      };
    };
    try {
      data = JSON.parse(raw);
    } catch {
      throw new ValidationError('Phản hồi xác thực Azure không hợp lệ. Kiểm tra lại PAT.');
    }
    const user = data.authenticatedUser;
    const ANON = '00000000-0000-0000-0000-000000000000';
    // PAT sai → Anonymous: id rỗng/toàn-0 hoặc displayName "Anonymous" → từ chối.
    if (!user?.id || user.id === ANON || (user.providerDisplayName ?? '').toLowerCase() === 'anonymous') {
      throw new ValidationError('PAT không hợp lệ hoặc không đủ quyền.');
    }
    // Định danh ổn định = userId (GUID identity, KHÔNG dùng chuỗi PAT — sec #2).
    const email = user.properties?.Account?.$value ?? '';
    return {
      userId: user.id,
      email,
      displayName: user.providerDisplayName ?? email ?? user.id,
    };
  },

  async fetchPullRequest({ pat, prUrl }) {
    const parsed = parseAzurePrUrl(prUrl);
    assertAllowedHost(parsed.host);
    const auth = Buffer.from(`:${pat}`).toString('base64');
    const base = `https://${parsed.host}/${parsed.org}/${encodeURIComponent(
      parsed.azureProject,
    )}/_apis/git/repositories/${encodeURIComponent(parsed.repo)}/pullRequests/${parsed.prId}`;
    let res: Response;
    try {
      res = await fetch(`${base}?api-version=7.1`, { headers: { Authorization: `Basic ${auth}` } });
    } catch {
      throw new IntegrationError('Không kết nối được Azure DevOps.', true);
    }
    if (res.status === 401 || res.status === 403) throw new ValidationError('PAT không đủ quyền xem PR.');
    if (res.status === 404) throw new ValidationError('PR không tồn tại hoặc không có quyền xem.');
    if (!res.ok) throw new IntegrationError(`Azure DevOps lỗi ${res.status}.`, true);
    const pr = (await res.json()) as {
      title?: string;
      description?: string;
      sourceRefName?: string;
      targetRefName?: string;
      lastMergeSourceCommit?: { commitId?: string };
    };

    // Lấy danh sách file thay đổi (iterations/changes).
    let changedFiles: ChangedFile[] = [];
    try {
      const itRes = await fetch(`${base}/iterations?api-version=7.1`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (itRes.ok) {
        const its = (await itRes.json()) as { value?: { id: number }[] };
        const lastIt = its.value?.[its.value.length - 1]?.id;
        if (lastIt) {
          const chRes = await fetch(`${base}/iterations/${lastIt}/changes?api-version=7.1`, {
            headers: { Authorization: `Basic ${auth}` },
          });
          if (chRes.ok) {
            const ch = (await chRes.json()) as {
              changeEntries?: { item?: { path?: string }; changeType?: string }[];
            };
            changedFiles = (ch.changeEntries ?? [])
              .map((c) => {
                const path = c.item?.path ?? '';
                return {
                  path,
                  changeType: c.changeType ?? 'edit',
                  diffLines: 0, // diffLines chi tiết tính ở ContextBuilder
                  isBinary: BINARY_EXT.test(path) || LOCK_GENERATED.test(path),
                };
              })
              .filter((f) => f.path);
          }
        }
      }
    } catch {
      logger.warn('azure_changes_fetch_failed', {});
    }

    const commit = pr.lastMergeSourceCommit?.commitId ?? '';
    return {
      prId: parsed.prId,
      title: pr.title ?? '',
      description: pr.description ?? '',
      sourceBranch: (pr.sourceRefName ?? '').replace('refs/heads/', ''),
      targetBranch: (pr.targetRefName ?? '').replace('refs/heads/', ''),
      lastCommitHash: commit,
      repoUrl: parsed.repoUrl,
      azureProject: parsed.azureProject,
      changedFiles,
      isEmpty: changedFiles.length === 0,
    } satisfies PrInfo;
  },

  async cloneSourceBranch({ pat, repoUrl, branch, destDir }) {
    this.validateRepoUrl(repoUrl);
    const cfg = loadConfig();
    // Nhúng PAT qua header git, KHÔNG nhúng vào URL (tránh lộ qua log/ps).
    const authHeader = `AUTHORIZATION: Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
    const args = [
      '-c',
      `http.extraHeader=${authHeader}`,
      'clone',
      '--depth',
      '1',
      '--branch',
      branch,
      '--single-branch',
      repoUrl,
      destDir,
    ];
    const { code, stderr } = await runGit(args, { timeoutMs: cfg.skillRunTimeoutMs });
    if (code !== 0) {
      // stderr đã đi qua redact() ở logger (che token/PAT); cắt đuôi để chẩn đoán (vd "branch not found").
      logger.warn('git_clone_failed', { repoUrl, branch, exitCode: code, stderr: stderr.slice(-2000) });
      return { cloned: false }; // worker fallback review trên diff
    }
    return { cloned: true };
  },
};

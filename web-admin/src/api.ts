// API client cho Admin UI. Cookie session gửi kèm (credentials: include).

export interface ProjectView {
  id: string;
  name: string;
  repo: { repoUrl: string; azureProject: string };
  modelConfig: { model: string; effort: string };
  docSources: string[];
  status: 'active' | 'disabled';
  secretConfigured: { claudeKey: boolean; pat: boolean };
  createdAt: string;
  updatedAt: string;
}

export interface ReviewHistoryItem {
  id: string;
  jobId: string;
  prId: string;
  prUrl: string;
  commitHash: string;
  status: string;
  severityCounts: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
  createdAt: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Lỗi ${res.status}`);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  login: (pat: string) =>
    fetch('/api/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pat }),
    }).then(async (r) => {
      if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Đăng nhập thất bại');
      return r.json() as Promise<{ owner: { email: string; displayName: string } }>;
    }),
  logout: () => fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }),
  models: () => req<{ models: string[]; efforts: string[]; defaultModel: string; defaultEffort: string }>('/meta/models'),
  listProjects: () => req<ProjectView[]>('/projects'),
  getProject: (id: string) => req<ProjectView>(`/projects/${id}`),
  createProject: (body: unknown) => req<ProjectView>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  updateProject: (id: string, body: unknown) =>
    req<ProjectView>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteProject: (id: string) => req<void>(`/projects/${id}`, { method: 'DELETE' }),
  testConnection: (body: unknown) =>
    req<{ repo: boolean; pat: boolean; claudeKey: boolean }>(`/projects/new/test-connection`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  reviews: (id: string, cursor?: string) =>
    req<{ items: ReviewHistoryItem[]; nextCursor: string | null }>(
      `/projects/${id}/reviews?limit=20${cursor ? `&cursor=${cursor}` : ''}`,
    ),
};

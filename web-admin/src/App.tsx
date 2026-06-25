// T7 — Admin UI. data-testid khớp bảng "E2E Locators" trong test.md.
// Bảo mật UI: React auto-escape (không dùng dangerouslySetInnerHTML); secret write-only (cờ "đã cấu hình").
import { useEffect, useState } from 'react';
import { api, ProjectView, ReviewHistoryItem } from './api';

type Route = { name: 'login' } | { name: 'dashboard' } | { name: 'form'; id?: string } | { name: 'detail'; id: string };

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'login' });
  const [owner, setOwner] = useState<{ email: string; displayName: string } | null>(null);

  if (!owner || route.name === 'login') {
    return <Login onLoggedIn={(o) => { setOwner(o); setRoute({ name: 'dashboard' }); }} />;
  }
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 920, margin: '0 auto', padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>tieu-nhi · Admin</strong>
        <span>
          {owner.displayName}{' '}
          <button onClick={async () => { await api.logout(); setOwner(null); setRoute({ name: 'login' }); }}>
            Đăng xuất
          </button>
        </span>
      </header>
      {route.name === 'dashboard' && (
        <Dashboard
          onCreate={() => setRoute({ name: 'form' })}
          onEdit={(id) => setRoute({ name: 'form', id })}
          onOpen={(id) => setRoute({ name: 'detail', id })}
        />
      )}
      {route.name === 'form' && <ProjectForm id={route.id} onDone={() => setRoute({ name: 'dashboard' })} />}
      {route.name === 'detail' && <ProjectDetail id={route.id} onBack={() => setRoute({ name: 'dashboard' })} />}
    </div>
  );
}

function Login({ onLoggedIn }: { onLoggedIn: (o: { email: string; displayName: string }) => void }) {
  const [pat, setPat] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      const { owner } = await api.login(pat);
      onLoggedIn(owner);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Đăng nhập thất bại');
    }
  };
  return (
    <div style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h2>Đăng nhập bằng Azure PAT</h2>
      <input
        data-testid="login-pat-input"
        type="password"
        autoComplete="off"
        placeholder="Azure Personal Access Token"
        value={pat}
        onChange={(e) => setPat(e.target.value)}
        style={{ width: '100%', padding: 8 }}
      />
      <button data-testid="login-submit-btn" disabled={!pat} onClick={submit} style={{ marginTop: 8 }}>
        Đăng nhập
      </button>
      {error && (
        <p data-testid="login-error-msg" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function Dashboard({
  onCreate,
  onEdit,
  onOpen,
}: {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [error, setError] = useState('');
  const load = () => api.listProjects().then(setProjects).catch((e) => setError(String(e.message)));
  useEffect(() => { load(); }, []);
  const remove = async (id: string) => {
    if (!confirm('Xoá project này?')) return;
    await api.deleteProject(id);
    load();
  };
  return (
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0' }}>
        <h2>Project của tôi</h2>
        <button data-testid="project-create-btn" onClick={onCreate}>+ Tạo project</button>
      </div>
      {error && <p data-testid="access-denied-msg" style={{ color: 'crimson' }}>{error}</p>}
      <ul data-testid="project-list" style={{ listStyle: 'none', padding: 0 }}>
        {projects.map((p) => (
          <li
            key={p.id}
            data-testid={`project-row-${p.id}`}
            style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, marginBottom: 8 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                <strong>{p.name}</strong> · {p.modelConfig.model}/{p.modelConfig.effort} ·{' '}
                <em>{p.status}</em>
              </span>
              <span>
                <button onClick={() => onOpen(p.id)}>Lịch sử</button>{' '}
                <button onClick={() => onEdit(p.id)}>Sửa</button>{' '}
                <button data-testid={`project-delete-btn-${p.id}`} onClick={() => remove(p.id)}>Xoá</button>
              </span>
            </div>
            <small>{p.repo.repoUrl}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectForm({ id, onDone }: { id?: string; onDone: () => void }) {
  const isEdit = !!id;
  const [name, setName] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [azureProject, setAzureProject] = useState('');
  const [model, setModel] = useState('');
  const [effort, setEffort] = useState('');
  const [docSources, setDocSources] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [azurePat, setAzurePat] = useState('');
  const [secretConfigured, setSecretConfigured] = useState({ claudeKey: false, pat: false });
  const [meta, setMeta] = useState<{ models: string[]; efforts: string[] }>({ models: [], efforts: [] });
  const [testResult, setTestResult] = useState<string>('');
  const [fieldError, setFieldError] = useState<{ field: string; msg: string } | null>(null);

  useEffect(() => {
    api.models().then((m) => setMeta({ models: m.models, efforts: m.efforts }));
    if (id) {
      api.getProject(id).then((p) => {
        setName(p.name);
        setRepoUrl(p.repo.repoUrl);
        setAzureProject(p.repo.azureProject);
        setModel(p.modelConfig.model);
        setEffort(p.modelConfig.effort);
        setDocSources(p.docSources.join('\n'));
        setSecretConfigured(p.secretConfigured);
      });
    }
  }, [id]);

  const save = async () => {
    setFieldError(null);
    const body = {
      name,
      repoUrl,
      azureProject,
      model: model || undefined,
      effort: effort || undefined,
      docSources: docSources.split('\n').map((s) => s.trim()).filter(Boolean),
      claudeApiKey: claudeApiKey || undefined,
      azurePat: azurePat || undefined,
    };
    try {
      if (isEdit) await api.updateProject(id!, body);
      else await api.createProject(body);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Lỗi lưu';
      const field = /repo/i.test(msg) ? 'repo' : /tên|name/i.test(msg) ? 'name' : /model|effort/i.test(msg) ? 'model' : 'form';
      setFieldError({ field, msg });
    }
  };

  const test = async () => {
    setTestResult('Đang kiểm tra…');
    try {
      const r = await api.testConnection({ repoUrl, azurePat, claudeApiKey });
      setTestResult(`Repo: ${r.repo ? 'OK' : 'FAIL'} · PAT: ${r.pat ? 'OK' : 'FAIL'} · Claude key: ${r.claudeKey ? 'OK' : 'FAIL'}`);
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : 'Lỗi kiểm tra');
    }
  };

  return (
    <section data-testid="project-form">
      <h2>{isEdit ? 'Sửa project' : 'Tạo project'}</h2>
      <Field label="Tên project">
        <input data-testid="project-name-input" value={name} onChange={(e) => setName(e.target.value)} />
        {fieldError?.field === 'name' && <Err field="name" msg={fieldError.msg} />}
      </Field>
      <Field label="Repo URL (Azure Git)">
        <input data-testid="project-repo-input" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} />
        {fieldError?.field === 'repo' && <Err field="repo" msg={fieldError.msg} />}
      </Field>
      <Field label="Azure project">
        <input value={azureProject} onChange={(e) => setAzureProject(e.target.value)} />
      </Field>
      <Field label="Model">
        <select data-testid="project-model-select" value={model} onChange={(e) => setModel(e.target.value)}>
          <option value="">(mặc định)</option>
          {meta.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {fieldError?.field === 'model' && <Err field="model" msg={fieldError.msg} />}
      </Field>
      <Field label="Effort">
        <select data-testid="project-effort-select" value={effort} onChange={(e) => setEffort(e.target.value)}>
          <option value="">(mặc định)</option>
          {meta.efforts.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </Field>
      <Field label="Nguồn tài liệu bổ sung (mỗi dòng 1 glob/đường dẫn)">
        <textarea data-testid="project-docsources-input" value={docSources} onChange={(e) => setDocSources(e.target.value)} />
      </Field>
      <Field label="Azure PAT (secret — write-only)">
        <input data-testid="project-pat-input" type="password" autoComplete="off" placeholder={secretConfigured.pat ? 'đã cấu hình — nhập để ghi đè' : ''} value={azurePat} onChange={(e) => setAzurePat(e.target.value)} />
      </Field>
      <Field label="Claude API key (secret — write-only)">
        <input data-testid="project-claudekey-input" type="password" autoComplete="off" placeholder={secretConfigured.claudeKey ? 'đã cấu hình — nhập để ghi đè' : ''} value={claudeApiKey} onChange={(e) => setClaudeApiKey(e.target.value)} />
      </Field>
      {isEdit && (
        <p data-testid="project-secret-configured-flag">
          Secret: PAT {secretConfigured.pat ? '✅ đã cấu hình' : '— chưa'} · Claude key{' '}
          {secretConfigured.claudeKey ? '✅ đã cấu hình' : '— chưa'}
        </p>
      )}
      <div style={{ marginTop: 12 }}>
        <button data-testid="project-testconn-btn" onClick={test}>Test connection</button>
        {testResult && <span data-testid="project-testconn-result" style={{ marginLeft: 8 }}>{testResult}</span>}
      </div>
      {fieldError?.field === 'form' && <Err field="form" msg={fieldError.msg} />}
      <div style={{ marginTop: 12 }}>
        <button data-testid="project-save-btn" onClick={save}>Lưu</button>{' '}
        <button onClick={onDone}>Huỷ</button>
      </div>
    </section>
  );
}

function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.reviews(id).then((p) => setItems(p.items)).catch((e) => setError(String(e.message)));
  }, [id]);
  return (
    <section>
      <button onClick={onBack}>← Quay lại</button>
      <h2>Lịch sử review</h2>
      {error && <p data-testid="access-denied-msg" style={{ color: 'crimson' }}>{error}</p>}
      <table data-testid="review-history-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr><th>PR</th><th>Commit</th><th>Trạng thái</th><th>Mức độ</th><th>Lúc</th></tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.jobId} data-testid={`review-history-row-${it.jobId}`}>
              <td>#{it.prId}</td>
              <td><code>{it.commitHash.slice(0, 8)}</code></td>
              <td><span data-testid={`review-status-badge-${it.jobId}`}>{it.status}</span></td>
              <td>
                🔴{it.severityCounts.CRITICAL} 🟠{it.severityCounts.HIGH} 🟡{it.severityCounts.MEDIUM} ⚪{it.severityCounts.LOW}
              </td>
              <td>{new Date(it.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', margin: '8px 0' }}>
      <div style={{ fontSize: 13, color: '#555' }}>{label}</div>
      {children}
    </label>
  );
}

function Err({ field, msg }: { field: string; msg: string }) {
  return (
    <span data-testid={`project-form-error-${field}`} style={{ color: 'crimson', fontSize: 12 }}>
      {msg}
    </span>
  );
}

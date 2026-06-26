// Gộp 3 tầng test (Unit + Functional + E2E) vào MỘT report HTML self-contained.
// KHÔNG dùng xunit-viewer (parser client-side của nó ẩn suite của node:test). Tự parse JUnit + render HTML
// → kiểm soát hiển thị 100%, grep verify được. Tách rõ 3 suite: Unit · Functional · E2E.
const { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

mkdirSync('reports', { recursive: true });
const UNIT_XML = 'reports/unit-junit.xml';
const FUNC_XML = 'reports/func-junit.xml';
const E2E_XML = 'web-admin/reports/e2e-junit.xml';
const E2E_JSON = 'web-admin/reports/e2e.json';
const VIDEOS_DIR = 'reports/videos';

const node = (args) => spawnSync(process.execPath, args, { stdio: 'inherit' });

// 1) Chạy từng nhóm riêng để có suite tách bạch.
const unit = node(['--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=junit', `--test-reporter-destination=${UNIT_XML}`,
  'dist/__tests__/pure.test.js', 'dist/__tests__/context.test.js', 'dist/__tests__/unit-extra.test.js']);
const func = node(['--test', '--test-reporter=spec', '--test-reporter-destination=stdout',
  '--test-reporter=junit', `--test-reporter-destination=${FUNC_XML}`,
  'dist/__tests__/functional.test.js']);
const e2e = spawnSync('npm', ['--prefix', 'web-admin', 'run', 'test:e2e'], { stdio: 'inherit', shell: true });

// --- Parse JUnit (đủ cho node:test + Playwright) ---
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function unesc(s) {
  // 2 lượt: node:test đôi khi double-escape (vd &amp;quot; → &quot; → ").
  let out = String(s);
  for (let i = 0; i < 2; i++) {
    out = out.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }
  return out;
}
function parseCases(xml) {
  if (!xml) return [];
  const cases = [];
  // (?:"[^"]*"|[^>"])*?  → cho phép ký tự '>' nằm TRONG chuỗi nháy kép (node:test không escape '>').
  const re = /<testcase\b((?:"[^"]*"|[^>"])*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const inner = m[3] || '';
    const name = unesc((attrs.match(/\bname="([^"]*)"/) || [])[1] || '(no name)');
    const time = parseFloat((attrs.match(/\btime="([\d.]+)"/) || [])[1] || '0');
    let status = 'pass';
    let detail = '';
    const fail = inner.match(/<(failure|error)\b[^>]*?(?:message="([^"]*)")?[^>]*>([\s\S]*?)<\/(?:failure|error)>/);
    if (/<(failure|error)\b/.test(inner)) {
      status = 'fail';
      const fm = inner.match(/<(?:failure|error)\b[^>]*\bmessage="([^"]*)"/);
      detail = unesc(fm ? fm[1] : (fail ? fail[3] : '')).trim().slice(0, 800);
    } else if (/<skipped\b/.test(inner)) {
      status = 'skip';
    }
    cases.push({ name, time, status, detail });
  }
  return cases;
}
function readXml(p) { return existsSync(p) ? readFileSync(p, 'utf8') : ''; }

// Parse Playwright JSON → case kèm VIDEO. Copy video vào reports/videos/ để đường dẫn ổn định.
function parsePwJson(p) {
  if (!existsSync(p)) return null;
  let data;
  try { data = JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
  const out = [];
  let vid = 0;
  const walk = (suite) => {
    for (const spec of suite.specs || []) {
      const test = (spec.tests || [])[0] || {};
      const res = (test.results || [])[0] || {};
      const status = res.status === 'passed' ? 'pass' : res.status === 'skipped' ? 'skip' : 'fail';
      let video = '';
      for (const r of test.results || []) {
        const a = (r.attachments || []).find((x) => x.name === 'video' && x.path && existsSync(x.path));
        if (a) {
          mkdirSync(VIDEOS_DIR, { recursive: true });
          const dst = `${VIDEOS_DIR}/e2e-${++vid}.webm`;
          copyFileSync(a.path, dst);
          video = `videos/e2e-${vid}.webm`; // tương đối với reports/all.html
          break;
        }
      }
      let detail = '';
      if (status === 'fail') detail = ((res.error && (res.error.message || res.error.value)) || '').toString().slice(0, 800);
      out.push({ name: spec.title, time: (res.duration || 0) / 1000, status, detail, video });
    }
    for (const s of suite.suites || []) walk(s);
  };
  for (const s of data.suites || []) walk(s);
  return out;
}

// E2E ưu tiên JSON (có video); fallback JUnit nếu thiếu JSON.
const e2eCases = parsePwJson(E2E_JSON) || parseCases(readXml(E2E_XML));

const suites = [
  { name: 'Unit (logic thuần — node:test)', cases: parseCases(readXml(UNIT_XML)) },
  { name: 'Functional (API/handler/DB — supertest + mongodb-memory-server)', cases: parseCases(readXml(FUNC_XML)) },
  { name: 'E2E (Admin UI — Playwright)', cases: e2eCases },
];

// --- Render HTML self-contained ---
const total = suites.reduce((a, s) => a + s.cases.length, 0);
const passed = suites.reduce((a, s) => a + s.cases.filter((c) => c.status === 'pass').length, 0);
const failed = suites.reduce((a, s) => a + s.cases.filter((c) => c.status === 'fail').length, 0);
const skipped = suites.reduce((a, s) => a + s.cases.filter((c) => c.status === 'skip').length, 0);
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
const badge = { pass: '#16a34a', fail: '#dc2626', skip: '#d97706' };
const icon = { pass: '✓', fail: '✗', skip: '⊘' };

const suiteHtml = suites.map((s) => {
  const sp = s.cases.filter((c) => c.status === 'pass').length;
  const sf = s.cases.filter((c) => c.status === 'fail').length;
  const ss = s.cases.filter((c) => c.status === 'skip').length;
  const rows = s.cases.map((c) => {
    const head =
      `<span class="ic" style="color:${badge[c.status]}">${icon[c.status]}</span>` +
      `<span class="nm">${esc(c.name)}</span>` +
      (c.video ? '<span class="play">▶ xem video</span>' : '') +
      `<span class="tm">${c.time.toFixed(3)}s</span>`;
    const detail = c.detail ? `<pre class="detail">${esc(c.detail)}</pre>` : '';
    if (c.video) {
      return `<li class="case ${c.status} hasvid">
        <details>
          <summary><div class="head">${head}</div></summary>
          <video class="vid" controls preload="metadata" src="${c.video}"></video>
          ${detail}
        </details>
      </li>`;
    }
    return `<li class="case ${c.status}"><div class="head">${head}</div>${detail}</li>`;
  }).join('');
  return `
    <details class="suite" ${sf ? 'open' : ''}>
      <summary>
        <b>${esc(s.name)}</b>
        <span class="counts">
          <em style="color:${badge.pass}">✓ ${sp}</em>
          ${sf ? `<em style="color:${badge.fail}">✗ ${sf}</em>` : ''}
          ${ss ? `<em style="color:${badge.skip}">⊘ ${ss}</em>` : ''}
          <em class="tot">/ ${s.cases.length}</em>
        </span>
      </summary>
      <ul>${rows || '<li class="empty">(không có testcase — có thể bị skip do thiếu hạ tầng)</li>'}</ul>
    </details>`;
}).join('');

const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tieu-nhi · All Tests (Unit + Functional + E2E)</title>
<style>
  :root{--bg:#0f172a;--card:#fff;--mut:#64748b}
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,Segoe UI,sans-serif;background:#f1f5f9;color:#0f172a}
  header{background:var(--bg);color:#fff;padding:20px 24px}
  header h1{margin:0 0 4px;font-size:18px} header .sub{color:#94a3b8;font-size:13px}
  .summary{display:flex;gap:12px;flex-wrap:wrap;padding:16px 24px}
  .stat{background:var(--card);border-radius:10px;padding:12px 18px;min-width:96px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  .stat .n{font-size:24px;font-weight:700} .stat .l{font-size:12px;color:var(--mut)}
  main{padding:0 24px 32px;max-width:1100px}
  .suite{background:var(--card);border-radius:10px;margin:12px 0;box-shadow:0 1px 3px rgba(0,0,0,.08);overflow:hidden}
  .suite>summary{cursor:pointer;padding:14px 18px;font-size:15px;display:flex;justify-content:space-between;align-items:center;list-style:none}
  .suite>summary::-webkit-details-marker{display:none}
  .counts em{font-style:normal;font-weight:600;margin-left:10px} .counts .tot{color:var(--mut);font-weight:400}
  ul{list-style:none;margin:0;padding:0 0 8px}
  .case{border-top:1px solid #f1f5f9} .case.fail{background:#fef2f2}
  .head{display:grid;grid-template-columns:24px 1fr auto auto;gap:10px;align-items:center;padding:7px 18px;font-size:14px}
  .head .ic{font-weight:700;text-align:center}
  .head .tm{color:var(--mut);font-size:12px;font-variant-numeric:tabular-nums;text-align:right}
  .head .play{color:#2563eb;font-size:12px;font-weight:600}
  .case.hasvid>details>summary{list-style:none;cursor:pointer}
  .case.hasvid>details>summary::-webkit-details-marker{display:none}
  .case.hasvid>details[open]>summary .play{color:#1e3a8a}
  .case.hasvid>details[open]>summary .play::after{content:" (đang mở)"}
  .vid{display:block;width:100%;max-width:760px;margin:6px 18px 14px;border-radius:8px;background:#000}
  .detail{background:#1e293b;color:#fca5a5;padding:8px;border-radius:6px;font-size:12px;white-space:pre-wrap;overflow:auto;margin:4px 18px 10px}
  .empty{padding:10px 18px;color:var(--mut);font-style:italic} .bar{height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin:4px 24px 0;max-width:1100px}
  .bar i{display:block;height:100%;background:${badge.pass};width:${total ? (passed / total) * 100 : 0}%}
</style></head><body>
<header>
  <h1>📊 tieu-nhi · Test Report — Unit · Functional · E2E</h1>
  <div class="sub">Sinh lúc ${stamp} · nguồn: node:test (Unit/Functional) + Playwright (E2E)</div>
</header>
<div class="summary">
  <div class="stat"><div class="n">${total}</div><div class="l">Tổng</div></div>
  <div class="stat"><div class="n" style="color:${badge.pass}">${passed}</div><div class="l">Pass</div></div>
  <div class="stat"><div class="n" style="color:${badge.fail}">${failed}</div><div class="l">Fail</div></div>
  <div class="stat"><div class="n" style="color:${badge.skip}">${skipped}</div><div class="l">Skip</div></div>
  <div class="stat"><div class="n">${suites.filter((s) => s.cases.length).length}</div><div class="l">Suite</div></div>
</div>
<div class="bar"><i></i></div>
<main>${suiteHtml}</main>
</body></html>`;

writeFileSync('reports/all.html', html);
console.log(`\n📊 Report hợp nhất: reports/all.html — ${passed}/${total} pass (${failed} fail, ${skipped} skip)`);
process.exit((unit.status ?? 0) || (func.status ?? 0) || (e2e.status ?? 0));

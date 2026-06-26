// Sinh report HTML đẹp cho test backend (node:test): chạy test → JUnit XML → xunit-viewer → HTML.
// Cross-platform (Windows/Unix). Report vẫn được tạo KỂ CẢ khi có test fail.
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');

mkdirSync('reports', { recursive: true });
const XML = 'reports/backend-junit.xml';

// 1) Chạy test, in spec ra stdout + xuất JUnit ra file. Bỏ qua exit code để vẫn render report.
const test = spawnSync(
  process.execPath,
  [
    '--test',
    '--test-reporter=spec', '--test-reporter-destination=stdout',
    '--test-reporter=junit', `--test-reporter-destination=${XML}`,
    'dist/__tests__',
  ],
  { stdio: 'inherit' },
);

// 1b) Chuẩn hoá: node:test đặt <testcase> trực tiếp dưới <testsuites>, thiếu lớp <testsuite>
//     bao ngoài → xunit-viewer crash. Bọc lại cho đúng schema JUnit.
try {
  let xml = readFileSync(XML, 'utf8');
  if (!/<testsuite[\s>]/.test(xml)) {
    const tests = (xml.match(/<testcase\b/g) || []).length;
    const failures = (xml.match(/<failure\b/g) || []).length;
    xml = xml
      .replace('<testsuites>', `<testsuites>\n<testsuite name="backend" tests="${tests}" failures="${failures}">`)
      .replace('</testsuites>', '</testsuite>\n</testsuites>');
    writeFileSync(XML, xml);
  }
} catch (e) {
  console.error('⚠️  Không đọc được JUnit XML:', e.message);
}

// 2) Render JUnit → HTML 1 trang (SPA) bằng xunit-viewer.
const view = spawnSync(
  'npx',
  ['xunit-viewer', '--results=reports/backend-junit.xml', '--output=reports/backend.html', '--title=tieu-nhi · Backend Tests'],
  { stdio: 'inherit', shell: true },
);

console.log('\n📊 HTML report: reports/backend.html');
if (view.status !== 0) console.error('⚠️  xunit-viewer lỗi — kiểm tra reports/backend-junit.xml');
// Thoát theo kết quả TEST (để CI fail đúng khi test đỏ), không theo bước render.
process.exit(test.status ?? 0);

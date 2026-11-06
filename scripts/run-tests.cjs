// node scripts/run-tests.cjs --browser : previously failing/cancelled browser files
// node scripts/run-tests.cjs           : every test file, including root navigation.test.cjs
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const browserFiles = ['profile-browser-cleanup.test.cjs', 'profile-browser-flow.cjs',
  'profile-indexed-concurrency.test.cjs', 'profile-menu.test.cjs', 'record-detail.test.cjs'];
const files = process.argv.includes('--browser') ? browserFiles.map(name => `tests/${name}`)
  : [...fs.readdirSync(path.join(root, 'tests')).filter(name => /\.(cjs|mjs)$/.test(name)).sort().map(name => `tests/${name}`), 'navigation.test.cjs'];
console.log(`Sequential test files (${files.length}):\n${files.join('\n')}`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (result.error) console.error('[TEST ENVIRONMENT]', result.error);
process.exitCode = result.status ?? 1;

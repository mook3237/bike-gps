const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { run } = require('./profile-browser-flow.cjs');

test('browser spawn failure closes server and removes temporary profile', { timeout: 15000 }, async () => {
  let resources;
  await assert.rejects(run({ browserPath: path.join(os.tmpdir(), 'ridemate-missing-browser.exe'), onResources: value => { resources = value; } }), /BROWSER ENVIRONMENT.*spawn failed/);
  assert.equal(resources.server.listening, false);
  assert.equal(resources.browser.pid, undefined);
  assert.equal(fs.existsSync(resources.userDataDir), false);
});

test('browser spawn failure exits with a nonzero code without hanging', { timeout: 15000 }, async () => {
  const child = spawn(process.execPath, ['-e', `require(${JSON.stringify(require.resolve('./profile-browser-flow.cjs'))}).run({browserPath:${JSON.stringify(path.join(os.tmpdir(), 'ridemate-missing-browser.exe'))}}).catch(e=>{console.error(e.message);process.exitCode=1})`]);
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    assert.equal(code, 1);
    assert.match(stderr, /BROWSER ENVIRONMENT.*spawn failed/);
  } finally { clearTimeout(timer); if (child.exitCode == null) child.kill('SIGKILL'); }
});

test('started browser and server are closed after a browser check fails', { timeout: 20000 }, async () => {
  let resources;
  await assert.rejects(run({ onResources: value => { resources = value; }, check: async () => { throw new Error('forced check failure'); } }), /forced check failure/);
  assert.equal(resources.server.listening, false);
  assert.ok(resources.browser.exitCode !== null || resources.browser.signalCode !== null);
  assert.equal(fs.existsSync(resources.userDataDir), false);
});

test('body and cleanup failures are both reported; cleanup-only failures also reject', { timeout: 30000 }, async () => {
  for (const failBody of [true, false]) {
    const bodyError = new Error('original browser assertion failure');
    const cleanupError = new Error('forced profile cleanup failure');
    let resources;
    await assert.rejects(run({
      onResources: value => { resources = value; },
      check: async () => { if (failBody) throw bodyError; },
      removeProfile: dir => { fs.rmSync(dir, { recursive: true, force: true }); throw cleanupError; },
    }), error => {
      assert.ok(error instanceof AggregateError);
      assert.equal(error.errors.length, failBody ? 2 : 1);
      if (failBody) assert.equal(error.errors[0], bodyError);
      assert.equal(error.errors.at(-1).cause, cleanupError);
      assert.match(error.errors.at(-1).message, /BROWSER CLEANUP.*temporary profile/);
      return true;
    });
    assert.equal(resources.server.listening, false);
    assert.ok(resources.browser.exitCode !== null || resources.browser.signalCode !== null);
    assert.equal(fs.existsSync(resources.userDataDir), false);
  }
});

test('failed graceful close still terminates the owned Chrome tree and reports the close error', { timeout: 20000 }, async () => {
  let resources;
  await assert.rejects(run({
    onResources: value => { resources = value; },
    check: async (evaluate, client) => { client.socket.send = () => { throw new Error('forced Browser.close failure'); }; },
  }), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.errors[0].message, /browser process tree.*forced Browser.close failure/);
    return true;
  });
  assert.equal(resources.server.listening, false);
  assert.ok(resources.browser.exitCode !== null || resources.browser.signalCode !== null);
  assert.equal(fs.existsSync(resources.userDataDir), false);
});

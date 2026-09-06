import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';

async function until(check) {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('Timed out waiting for server synchronization');
}

test('rewritten client reads and saves using the existing Python server contract', { timeout: 15000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chore-fridge-test-'));
  const server = spawn('python3', ['-u', '-c', [
    "import runpy",
    "legacy = runpy.run_path('tests/fixtures/legacy-server.py')",
    "Handler, ThreadingHTTPServer = legacy['Handler'], legacy['ThreadingHTTPServer']",
    'httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)',
    'print(httpd.server_port, flush=True)',
    'httpd.serve_forever()',
  ].join('\n')], { env: { ...process.env, DATA_FILE: join(directory, 'state.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  const nativeFetch = globalThis.fetch;
  try {
    const [output] = await Promise.race([
      once(server.stdout, 'data'),
      once(server, 'exit').then(() => { throw new Error('Test server exited before listening'); }),
    ]);
    const base = `http://127.0.0.1:${Number(output.toString().trim())}`;
    globalThis.fetch = (path, options) => nativeFetch(new URL(path, base), options);
    globalThis.window = { fetch: globalThis.fetch };
    globalThis.localStorage = { setItem() {}, getItem() { return null; } };
    const sync = await import('../apps/web/src/stores/sync.js');
    const family = await import('../apps/web/src/stores/family.js');
    const chores = await import('../apps/web/src/stores/chores.js');
    const balances = await import('../apps/web/src/stores/balances.js');
    const kid = { id:'kid', name:'Test Kid', emoji:'🐻', color:'#e85d4c' };
    const initial = { ...sync.defaultState(), setupDone:true, kids:[kid], familyName:'Existing household', updatedAt:1 };
    assert.equal((await fetch('/api/state', { method:'PUT', body:JSON.stringify(initial) })).status, 204);
    sync.pullServer();
    await until(() => family.$familyName.get() === initial.familyName);
    assert.equal(sync.$serverMode.get(), true);
    const chore = chores.saveChore({ title:'Test task', points:5, kidIds:[kid.id], repeat:'daily', minCount:1, maxCount:1 });
    await until(async () => (await (await fetch('/api/state')).json()).chores.length === 1);
    chores.toggleChore(chore.id, kid.id);
    await until(async () => {
      const saved = await (await fetch('/api/state')).json();
      return saved.completions[chores.ck(chore.id, kid.id)] > 0;
    });
    // Simulate an existing second device using the same full-state HTTP API.
    const secondDevice = await (await fetch('/api/state')).json();
    secondDevice.familyName = 'Updated from another device';
    secondDevice.updatedAt = Date.now() + 1000;
    assert.equal((await fetch('/api/state', { method:'PUT', body:JSON.stringify(secondDevice) })).status, 204);
    await until(async () => {
      sync.pullServer();
      return family.$familyName.get() === secondDevice.familyName;
    });
    assert.equal(balances.starsFor(kid.id), 5);
  } finally {
    globalThis.fetch = nativeFetch;
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
    await rm(directory, { recursive:true, force:true });
  }
});

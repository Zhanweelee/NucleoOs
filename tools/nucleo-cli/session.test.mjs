import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deviceSession } from './lib/session.mjs';

const HOST = 'http://nucleo-cli-test.invalid';
let configDir;

test('deviceSession pairs once then reuses cache', async (t) => {
  configDir = join(process.cwd(), '.test-config-' + process.pid);
  process.env.NUCLEO_CONFIG_DIR = configDir;
  mkdirSync(configDir, { recursive: true });
  const sessionFile = join(configDir, 'sessions.json');

  t.after(() => {
    delete process.env.NUCLEO_CONFIG_DIR;
    rmSync(configDir, { recursive: true, force: true });
  });

  let n = 0;
  const valid = new Set();
  const pairs = [];
  const f = async (url, opt = {}) => {
    const p = new URL(url).pathname;
    if (p === '/api/pair') {
      pairs.push(p);
      const tok = 'nucleo_session=t' + ++n;
      valid.add(tok);
      return new Response('{}', { status: 200, headers: { 'set-cookie': tok + '; Path=/; HttpOnly' } });
    }
    if (p === '/api/cpu') {
      return new Response('{}', { status: valid.has(opt.headers?.cookie) ? 200 : 401 });
    }
    return new Response('', { status: 404 });
  };

  const a = await deviceSession(HOST, '123456', { fetch: f });
  const b = await deviceSession(HOST, '123456', { fetch: f });
  assert.equal(a, b);
  assert.equal(pairs.length, 1);

  valid.clear();
  const c = await deviceSession(HOST, '123456', { fetch: f });
  assert.notEqual(c, a);
  assert.equal(pairs.length, 2);
  assert.ok(existsSync(sessionFile));
});

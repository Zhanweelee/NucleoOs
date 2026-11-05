import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { configDir } from './config.mjs';

const SESSION_FILE = () => join(configDir(), 'sessions.json');

const load = () => {
  try {
    return JSON.parse(readFileSync(SESSION_FILE(), 'utf8')) || {};
  } catch {
    return {};
  }
};

const save = (o) => {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  writeFileSync(SESSION_FILE(), JSON.stringify(o, null, 2) + '\n', { mode: 0o600 });
};

const withTimeout = async (f, url, opt, ms) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await f(url, { ...opt, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
};

/** Returns `nucleo_session=…` cookie. Reuses cached session; re-pairs when refused. */
export async function deviceSession(host, pin, { fetch: f = globalThis.fetch, timeoutMs = 15000, fresh = false } = {}) {
  host = String(host).replace(/\/+$/, '');
  const cache = load();
  const cached = !fresh && cache[host];
  if (cached) {
    try {
      const r = await withTimeout(f, host + '/api/cpu', { headers: { cookie: cached } }, timeoutMs);
      if (r.ok) return cached;
      if (r.status !== 401 && r.status !== 403) return cached;
    } catch {
      return cached;
    }
  }
  if (!pin) {
    const e = new Error('no cached session for ' + host + ' and no PIN given');
    e.status = 401;
    throw e;
  }
  const r = await withTimeout(
    f,
    host + '/api/pair',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pin }),
    },
    timeoutMs,
  );
  if (!r.ok) {
    const e = new Error('pairing rejected (HTTP ' + r.status + ')');
    e.status = r.status;
    throw e;
  }
  const m = /(?:^|,\s*)(nucleo_session=[^;]+)/.exec(r.headers.get('set-cookie') || '');
  if (!m) throw new Error('paired but no session cookie returned');
  cache[host] = m[1];
  save(cache);
  return m[1];
}

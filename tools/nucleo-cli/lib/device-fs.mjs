import { readFileSync } from 'node:fs';
import { encodePath, normDevicePath, deviceRel } from './paths.mjs';

export class DeviceFs {
  #base;
  #cookie;
  #fetch;

  constructor(base, cookie, { fetch: f = globalThis.fetch } = {}) {
    this.#base = String(base).replace(/\/+$/, '');
    this.#cookie = cookie;
    this.#fetch = f;
  }

  async #http(method, path, { body, headers, timeoutMs = 15000 } = {}) {
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), timeoutMs);
      try {
        const res = await this.#fetch(this.#base + path, {
          method,
          headers: {
            ...(this.#cookie ? { Cookie: this.#cookie } : {}),
            ...(headers || {}),
          },
          body,
          signal: c.signal,
        });
        clearTimeout(t);
        return res;
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
        await new Promise((r) => setTimeout(r, 200 * attempt));
      }
    }
    throw lastErr;
  }

  async status() {
    const r = await this.#http('GET', '/api/status');
    if (!r.ok) {
      const e = new Error('device unreachable (HTTP ' + r.status + ')');
      e.status = r.status;
      throw e;
    }
    return r.json();
  }

  async list(absPath) {
    const p = normDevicePath(absPath);
    const r = await this.#http('GET', '/api/fs/list?path=' + encodePath(p));
    if (r.status === 404) {
      const e = new Error('directory not found: ' + p);
      e.status = 404;
      throw e;
    }
    if (!r.ok) {
      const e = new Error('list failed (HTTP ' + r.status + ')');
      e.status = r.status;
      throw e;
    }
    const j = await r.json();
    return { path: p, entries: j.entries || [] };
  }

  #dirCache = new Map();

  async #listDirRel(relDir) {
    if (this.#dirCache.has(relDir)) return this.#dirCache.get(relDir);
    const abs = relDir ? '/' + relDir : '/';
    const r = await this.#http('GET', '/api/fs/list?path=' + encodePath(abs));
    if (r.status === 404) {
      this.#dirCache.set(relDir, null);
      return null;
    }
    if (!r.ok) throw new Error('list /' + relDir + ': HTTP ' + r.status);
    const j = await r.json();
    const map = new Map();
    for (const e of j.entries || []) map.set(e.name, e);
    this.#dirCache.set(relDir, map);
    return map;
  }

  #knownDirs = new Set();

  async ensureDir(absPath) {
    const rel = deviceRel(normDevicePath(absPath));
    if (!rel || this.#knownDirs.has(rel)) return;
    const existing = await this.#listDirRel(rel);
    if (existing) {
      this.#knownDirs.add(rel);
      return;
    }
    const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    await this.ensureDir('/' + parent);
    const r = await this.#http('POST', '/api/fs/mkdir?path=' + encodePath('/' + rel));
    if (!r.ok && r.status !== 500) {
      const e = new Error('mkdir /' + rel + ': HTTP ' + r.status);
      e.status = r.status;
      throw e;
    }
    this.#dirCache.set(rel, this.#dirCache.get(rel) || new Map());
    this.#knownDirs.add(rel);
  }

  async mkdir(absPath) {
    const p = normDevicePath(absPath);
    await this.ensureDir(p);
    return { ok: true, path: p };
  }

  async read(absPath) {
    const p = normDevicePath(absPath);
    const r = await this.#http('GET', '/api/fs/read?path=' + encodePath(p), {
      timeoutMs: 60000,
    });
    if (r.status === 404) {
      const e = new Error('file not found: ' + p);
      e.status = 404;
      throw e;
    }
    if (!r.ok) {
      const e = new Error('read failed (HTTP ' + r.status + ')');
      e.status = r.status;
      throw e;
    }
    return Buffer.from(await r.arrayBuffer());
  }

  async write(absPath, data) {
    const p = normDevicePath(absPath);
    const parent = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '/';
    await this.ensureDir(parent);
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const timeoutMs = Math.max(20000, Math.ceil(buf.length / 20));
    const r = await this.#http('POST', '/api/fs/write?path=' + encodePath(p), {
      body: buf,
      headers: { 'Content-Type': 'application/octet-stream' },
      timeoutMs,
    });
    if (!r.ok) {
      const e = new Error('write failed (HTTP ' + r.status + ')');
      e.status = r.status;
      throw e;
    }
    await new Promise((r) => setTimeout(r, 15));
    return { ok: true, path: p, bytes: buf.length };
  }

  async uploadLocal(localPath, devicePath) {
    const buf = readFileSync(localPath);
    return this.write(devicePath, buf);
  }

  async move(from, to, { overwrite = false } = {}) {
    const src = normDevicePath(from);
    const dst = normDevicePath(to);
    const q =
      'from=' +
      encodePath(src) +
      '&to=' +
      encodePath(dst) +
      '&overwrite=' +
      (overwrite ? '1' : '0');
    const r = await this.#http('POST', '/api/fs/move?' + q);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const e = new Error('move failed (HTTP ' + r.status + ')' + (text ? ': ' + text : ''));
      e.status = r.status;
      throw e;
    }
    return { ok: true, from: src, to: dst };
  }

  async delete(absPath) {
    const p = normDevicePath(absPath);
    const r = await this.#http('POST', '/api/fs/delete?path=' + encodePath(p));
    if (r.status === 404) {
      const e = new Error('not found: ' + p);
      e.status = 404;
      throw e;
    }
    if (!r.ok) {
      const e = new Error('delete failed (HTTP ' + r.status + ')');
      e.status = r.status;
      throw e;
    }
    return { ok: true, path: p };
  }
}

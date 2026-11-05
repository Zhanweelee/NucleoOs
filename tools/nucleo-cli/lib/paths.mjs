/** Normalize a device-side absolute path (SD root = `/`). Rejects `..` segments. */
export function normDevicePath(input, { cwd = '/' } = {}) {
  let s = String(input ?? '').trim().replace(/\\/g, '/');
  if (!s || s === '.') s = cwd;
  else if (!s.startsWith('/')) {
    const base = normDevicePath(cwd, { cwd: '/' });
    s = base === '/' ? '/' + s : base + '/' + s;
  }
  const parts = [];
  for (const seg of s.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length) parts.pop();
      else throw new Error('path escapes device root: ' + input);
    } else parts.push(seg);
  }
  return '/' + parts.join('/');
}

/** Device-relative path without leading slash (used by some internal helpers). */
export function deviceRel(abs) {
  const n = normDevicePath(abs);
  return n === '/' ? '' : n.slice(1);
}

export function encodePath(abs) {
  return encodeURIComponent(normDevicePath(abs));
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_FILE = () => join(configDir(), 'config.json');

export function configDir() {
  return (
    process.env.NUCLEO_CONFIG_DIR ||
    join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'nucleo')
  );
}

export function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE(), 'utf8').replace(/^\uFEFF/, '')) || {};
  } catch {
    return {};
  }
}

export function saveConfig(patch) {
  mkdirSync(configDir(), { recursive: true, mode: 0o700 });
  const next = { ...loadConfig(), ...patch };
  writeFileSync(CONFIG_FILE(), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  return next;
}

/** CLI flag > env > config file. */
export function resolveTarget({ host, pin } = {}) {
  const cfg = loadConfig();
  const pick = (...v) => {
    for (const x of v) {
      if (x !== undefined && x !== null && x !== true && String(x).trim() !== '') return String(x).trim();
    }
    return '';
  };
  return {
    host: pick(host, process.env.NUCLEO_HOST, cfg.host),
    pin: pick(pin, process.env.NUCLEO_PIN, cfg.pin),
  };
}

/** Accept bare IP/hostname or full http(s) URL. */
export function normalizeHost(host) {
  host = String(host || '').trim().replace(/\/+$/, '');
  if (!host) return '';
  if (!/^https?:\/\//i.test(host)) host = 'http://' + host;
  return host;
}

export const TARGET_HELP =
  'set --host/--pin, export NUCLEO_HOST/NUCLEO_PIN, or run `nucleo connect <host> --pin <code>`';

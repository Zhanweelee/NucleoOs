#!/usr/bin/env node
// nucleo — user-facing CLI for NucleoOS device file management (/api/fs over HTTP + PIN pairing).
//
// Install: see tools/nucleo-cli/README.md (npm link from this folder, or npm run nucleo from repo root).

import { createInterface } from 'node:readline/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { configDir, normalizeHost, resolveTarget, saveConfig, TARGET_HELP } from './lib/config.mjs';
import { DeviceFs } from './lib/device-fs.mjs';
import { EXIT, httpExit } from './lib/exit.mjs';
import { normDevicePath } from './lib/paths.mjs';
import { deviceSession } from './lib/session.mjs';

const HELP = `nucleo — manage files on a NucleoOS device over the web API

Usage:
  nucleo connect <host> [--pin PIN]     save default device + pair
  nucleo status [--json]                device / SD summary (paired)
  nucleo pair [--fresh]                 re-pair with PIN (refresh session)
  nucleo fs ls [path] [--json]          list directory (default /)
  nucleo fs upload <local> <device>     upload a file
  nucleo fs download <device> <local>   download a file
  nucleo fs mkdir <device-dir>          create directory (and parents)
  nucleo fs mv <from> <to> [--overwrite]
  nucleo fs rm <path> [--yes]           delete file or empty directory

Global options:
  --host <url>       device base URL (or bare IP/hostname)
  --pin <code>       pairing PIN shown on the Cardputer
  --json             print JSON on stdout (errors on stderr)
  -h, --help

Environment: NUCLEO_HOST, NUCLEO_PIN
Config: ${configDir()}/config.json (mode 0600; PIN optional but recommended)

Exit codes: 0 ok · 1 error · 2 usage · 3 auth · 4 not found

Firmware: requires a paired-session build (NucleoOS ≥0.5) with /api/fs/* gated by PIN pairing.
`;

function parseArgs(argv) {
  const flags = { json: false, help: false, fresh: false, overwrite: false, yes: false };
  const positional = [];
  let host;
  let pin;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') flags.json = true;
    else if (a === '-h' || a === '--help') flags.help = true;
    else if (a === '--fresh') flags.fresh = true;
    else if (a === '--overwrite') flags.overwrite = true;
    else if (a === '--yes' || a === '-y') flags.yes = true;
    else if (a === '--host') host = argv[++i];
    else if (a === '--pin') pin = argv[++i];
    else if (a.startsWith('-')) throw new UsageError('unknown option: ' + a);
    else positional.push(a);
  }
  return { flags, positional, host, pin };
}

class UsageError extends Error {
  constructor(msg) {
    super(msg);
    this.code = EXIT.USAGE;
  }
}

function fail(err, { json }) {
  const msg = err && err.message ? err.message : String(err);
  const code = err && err.code != null ? err.code : err && err.status != null ? httpExit(err.status) : EXIT.ERROR;
  if (json) {
    output.write(JSON.stringify({ ok: false, error: msg, exit: code }) + '\n');
  } else {
    console.error('✗ ' + msg);
  }
  process.exitCode = code;
}

function ok(data, { json }) {
  if (json) output.write(JSON.stringify({ ok: true, ...data }) + '\n');
}

async function openSession({ host, pin, fresh }) {
  host = normalizeHost(host);
  if (!host) throw new UsageError('missing device host — ' + TARGET_HELP);
  const cookie = await deviceSession(host, pin, { fresh });
  return { host, cookie, fs: new DeviceFs(host, cookie) };
}

async function confirmDelete(target, flags) {
  if (flags.yes || flags.json || !input.isTTY) return true;
  const rl = createInterface({ input, output });
  const ans = (await rl.question('Delete ' + target + '? [y/N] ')).trim().toLowerCase();
  rl.close();
  return ans === 'y' || ans === 'yes';
}

async function main() {
  let flags, positional, hostArg, pinArg;
  try {
    ({ flags, positional, host: hostArg, pin: pinArg } = parseArgs(process.argv.slice(2)));
  } catch (e) {
    fail(e, { json: false });
    return;
  }
  if (flags.help || !positional.length) {
    output.write(HELP);
    process.exitCode = positional.length ? EXIT.OK : flags.help ? EXIT.OK : EXIT.USAGE;
    return;
  }

  const cmd = positional[0];
  const rest = positional.slice(1);

  try {
    if (cmd === 'connect') {
      const host = normalizeHost(rest[0] || hostArg);
      if (!host) throw new UsageError('usage: nucleo connect <host> [--pin PIN]');
      const pin = pinArg || resolveTarget({}).pin;
      saveConfig({ host, ...(pin ? { pin } : {}) });
      const { fs } = await openSession({ host, pin, fresh: true });
      const status = await fs.status();
      if (flags.json) ok({ host, paired: true, storage: status.storage }, { json: true });
      else console.log('paired ✓  ' + host + '  (saved in ' + configDir() + '/config.json)');
      return;
    }

    const target = resolveTarget({ host: hostArg, pin: pinArg });
    const host = normalizeHost(target.host);
    const pin = target.pin;
    if (!host) throw new UsageError('missing device host — ' + TARGET_HELP);

    if (cmd === 'pair') {
      const { fs } = await openSession({ host, pin, fresh: flags.fresh || true });
      await fs.status();
      if (flags.json) ok({ host, paired: true }, { json: true });
      else console.log('paired ✓  ' + host);
      return;
    }

    const { fs } = await openSession({ host, pin, fresh: false });

    if (cmd === 'status') {
      const status = await fs.status();
      if (flags.json) ok({ host, status }, { json: true });
      else {
        const st = status.storage || {};
        console.log('host   : ' + host);
        console.log('SD     : ' + (st.mounted ? st.fs + ', free ' + ((st.free_bytes || 0) / 1e9).toFixed(2) + ' GB' : 'not mounted'));
        if (status.version) console.log('version: ' + status.version);
      }
      return;
    }

    if (cmd === 'fs') {
      const sub = rest[0];
      const args = rest.slice(1).filter((a) => !a.startsWith('--'));
      if (!sub) throw new UsageError('missing fs subcommand (ls, upload, download, mkdir, mv, rm)');

      if (sub === 'ls') {
        const path = normDevicePath(args[0] || '/');
        const listing = await fs.list(path);
        if (flags.json) ok(listing, { json: true });
        else {
          for (const e of listing.entries) {
            const tag = e.type === 'dir' ? 'd' : 'f';
            const size = e.type === 'file' ? String(e.size).padStart(10) : '          ';
            console.log(tag + ' ' + size + '  ' + e.name);
          }
        }
        return;
      }

      if (sub === 'upload') {
        if (args.length < 2) throw new UsageError('usage: nucleo fs upload <local-file> <device-path>');
        const result = await fs.uploadLocal(args[0], args[1]);
        if (flags.json) ok(result, { json: true });
        else console.log('✓ ' + result.path + '  (' + result.bytes + ' B)');
        return;
      }

      if (sub === 'download') {
        if (args.length < 2) throw new UsageError('usage: nucleo fs download <device-path> <local-file>');
        const buf = await fs.read(args[0]);
        mkdirSync(dirname(args[1]), { recursive: true });
        writeFileSync(args[1], buf);
        if (flags.json) ok({ path: normDevicePath(args[0]), local: args[1], bytes: buf.length }, { json: true });
        else console.log('✓ ' + args[1] + '  (' + buf.length + ' B)');
        return;
      }

      if (sub === 'mkdir') {
        if (!args[0]) throw new UsageError('usage: nucleo fs mkdir <device-dir>');
        const result = await fs.mkdir(args[0]);
        if (flags.json) ok(result, { json: true });
        else console.log('✓ ' + result.path);
        return;
      }

      if (sub === 'mv') {
        if (args.length < 2) throw new UsageError('usage: nucleo fs mv <from> <to> [--overwrite]');
        const result = await fs.move(args[0], args[1], { overwrite: flags.overwrite });
        if (flags.json) ok(result, { json: true });
        else console.log('✓ ' + result.from + ' → ' + result.to);
        return;
      }

      if (sub === 'rm') {
        if (!args[0]) throw new UsageError('usage: nucleo fs rm <device-path> [--yes]');
        const p = normDevicePath(args[0]);
        if (!(await confirmDelete(p, flags))) {
          if (flags.json) ok({ cancelled: true, path: p }, { json: true });
          else console.log('cancelled');
          return;
        }
        const result = await fs.delete(p);
        if (flags.json) ok(result, { json: true });
        else console.log('✓ removed ' + result.path);
        return;
      }

      throw new UsageError('unknown fs subcommand: ' + sub);
    }

    throw new UsageError('unknown command: ' + cmd);
  } catch (e) {
    if (e instanceof UsageError) fail(e, { json: flags.json });
    else fail(e, { json: flags.json });
  }
}

main();

#!/usr/bin/env node
// Download the official Vosk small Chinese model and repack it as .tar.gz for the browser + SD layout.
// Source: https://alphacephei.com/vosk/models (Apache-2.0, vosk-model-small-cn-0.22, ~42 MB).
//
//   node tools/anima/fetch-vosk-zh.mjs [destDir...]
//
// Default dest: apps/anima/www/vosk/models (and deploy/sd/apps/anima/www/vosk/models if present).
// Then optionally: node tools/anima/split-vosk-models.mjs <dir> <dest...>  for <8 MB SD parts.
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ZIP_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip';
const OUT_NAME = 'vosk-model-small-cn-0.22.tar.gz';

const defaultDests = [
  join(REPO, 'apps', 'anima', 'www', 'vosk', 'models'),
  join(REPO, 'deploy', 'sd', 'apps', 'anima', 'www', 'vosk', 'models'),
].filter((d) => existsSync(dirname(d)));

const dests = process.argv.slice(2).length ? process.argv.slice(2) : defaultDests;
if (!dests.length) {
  console.error('No destination directory; pass one or more paths.');
  process.exit(1);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const ws = createWriteStream(dest);
        res.pipe(ws);
        ws.on('finish', () => ws.close(resolve));
        ws.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

const tmp = join(REPO, 'build', 'vosk-zh-fetch');
mkdirSync(tmp, { recursive: true });
const zipPath = join(tmp, 'model.zip');
const unpack = join(tmp, 'unpacked');
const tgzPath = join(tmp, OUT_NAME);

console.log('Downloading', ZIP_URL);
await download(ZIP_URL, zipPath);
rmSync(unpack, { recursive: true, force: true });
mkdirSync(unpack, { recursive: true });
execFileSync('unzip', ['-q', zipPath, '-d', unpack], { stdio: 'inherit' });
const entries = readdirSync(unpack);
const modelRoot = entries.length === 1 ? join(unpack, entries[0]) : unpack;
execFileSync('tar', ['-czf', tgzPath, '-C', modelRoot, '.'], { stdio: 'inherit' });
const buf = readFileSync(tgzPath);
const sha1 = createHash('sha1').update(buf).digest('hex');
console.log(`${OUT_NAME}  ${buf.length} bytes  sha1=${sha1}`);

for (const dest of dests) {
  mkdirSync(dest, { recursive: true });
  const out = join(dest, OUT_NAME);
  writeFileSync(out, buf);
  console.log('Wrote', out);
}
console.log('Done. Optional: node tools/anima/split-vosk-models.mjs', dests[0], '...');

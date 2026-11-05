# nucleo-cli

Standalone terminal tool for **routine file work** on a NucleoOS Cardputer over the existing HTTP
`/api/fs` API and PIN pairing — without opening the web shell for every upload, and without
learning the repo-only scripts (`push-files.mjs`, `sd-net-sync.mjs`).

Browser-local storage (IndexedDB-only mode) is **out of scope**. This CLI talks to the device SD
through the same paired session the shell uses.

## Requirements

- **Node.js 18+** (uses global `fetch`)
- A NucleoOS device on your LAN with **PIN pairing** enabled (firmware that gates `/api/fs/*`)
- The **6-digit pairing code** shown on the Cardputer (Settings → pairing / first-run wizard)

## Install

You do **not** need the full monorepo for daily file ops. Pick one:

### From a shallow clone (recommended)

```sh
git clone --depth 1 https://github.com/indecenti/NucleoOs.git
cd NucleoOs/tools/nucleo-cli
npm link          # puts `nucleo` on your PATH
nucleo --help
```

### From the repo you already develop in

```sh
npm link --prefix tools/nucleo-cli
# or without linking:
npm run nucleo -- --help
```

### One-off (no install)

```sh
node /path/to/NucleoOs/tools/nucleo-cli/nucleo.mjs --help
```

Configuration and session cookies live under `~/.config/nucleo/` (override with
`NUCLEO_CONFIG_DIR`). The PIN may be stored in `config.json` (file mode `0600`); prefer
`NUCLEO_PIN` in scripts if you do not want it on disk.

## Quick start

```sh
# Save default device + pair once
nucleo connect 192.168.0.166 --pin 123456

# Or per-command / env (no saved config)
export NUCLEO_HOST=http://192.168.0.166
export NUCLEO_PIN=123456

nucleo status
nucleo fs ls /data
nucleo fs upload ./notes.txt /data/notes.txt
nucleo fs download /data/photo.jpg ./photo.jpg
nucleo fs mkdir /data/backups
nucleo fs mv /data/old.txt /data/new.txt
nucleo fs rm /data/tmp.txt --yes
```

### JSON for scripts

```sh
nucleo fs ls /data --json | jq .
nucleo status --json
```

On failure, the process exits non-zero and (with `--json`) prints `{"ok":false,"error":"…","exit":N}`.

| Exit code | Meaning        |
|-----------|----------------|
| 0         | Success        |
| 1         | General error  |
| 2         | Usage / args   |
| 3         | Auth / pairing |
| 4         | Not found      |

## Commands

| Command | Description |
|---------|-------------|
| `connect <host> [--pin PIN]` | Pair and save default host (and optional PIN) |
| `status [--json]` | `/api/status` — SD mount, free space, version |
| `pair [--fresh]` | Force a new pairing session |
| `fs ls [path]` | List directory (`/` default) |
| `fs upload <local> <device>` | Upload bytes (`POST /api/fs/write`, creates parent dirs) |
| `fs download <device> <local>` | Download file |
| `fs mkdir <dir>` | Create directory tree (single-level `mkdir` API, walked by the CLI) |
| `fs mv <from> <to> [--overwrite]` | Rename/move (`POST /api/fs/move`) |
| `fs rm <path> [--yes]` | Delete file or empty directory |

Global flags: `--host`, `--pin`, `--json`, `-h`.

## Relationship to other tools

| Tool | Role |
|------|------|
| **`nucleo` (this CLI)** | User-facing file CRUD + transfers; small install footprint |
| `tools/push-files.mjs` | Maintainer: push explicit `local:device` paths, no listing |
| `tools/sd-net-sync.mjs` | Maintainer: deploy `deploy/sd` payload with merge/protect rules |

Session caching follows the same LRU-safe pattern as `tools/lib/device-session.mjs` (one cached
cookie per host so dev scripts do not evict your browser session).

## Smoke test (no device)

From `tools/nucleo-cli`:

```sh
npm test
```

With a live device on the LAN:

```sh
nucleo connect "$NUCLEO_HOST" --pin "$NUCLEO_PIN"
nucleo fs ls / --json
echo smoke | nucleo fs upload /dev/stdin /data/nucleo-cli-smoke.txt
nucleo fs download /data/nucleo-cli-smoke.txt /tmp/nucleo-cli-smoke.txt
nucleo fs rm /data/nucleo-cli-smoke.txt --yes
```

(`/dev/stdin` upload works on Linux/macOS; on Windows use a real file path.)

## License

MIT — same as NucleoOS.

# nucleo-cli — device file management from your PC

The [`nucleo`](../tools/nucleo-cli/) command pairs with a Cardputer over HTTP and exposes
`/api/fs` operations (list, upload, download, mkdir, move, delete) for scripts and daily use.

Install, exit codes, and smoke commands: **[tools/nucleo-cli/README.md](../tools/nucleo-cli/README.md)**.

Maintainer-oriented bulk deploy remains **`tools/sd-net-sync.mjs`** and surgical uploads
**`tools/push-files.mjs`**.

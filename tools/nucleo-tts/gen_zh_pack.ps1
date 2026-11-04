# gen_zh_pack.ps1 — build the Mandarin (zh) voice pack on the PC (Edge-TTS + index.bin/clips.pcm).
# Full packs are ~100–400 MB depending on lexicon; they are NOT committed — copy to SD via sd-sync / oversized-assets.
# Requires: python, ffmpeg, edge-tts, network during generation only.
#
#   .\tools\nucleo-tts\gen_zh_pack.ps1              # mandatory + lexicon.zh (+ wf/harvest if present)
#   .\tools\nucleo-tts\gen_zh_pack.ps1 -WithDict    # also fold in dict-en-it.tsv (large — not for SD core)
param([int]$Conc = 8, [switch]$WithDict)
$ErrorActionPreference = 'Stop'
$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) { Write-Host 'python not found'; exit 1 }
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tt = Join-Path $root 'tools\nucleo-tts'
$staging = Join-Path $tt '_wav'
$final = Join-Path $root 'deploy\sd-safe\data\tts\zh'
$args = @('--langs', 'zh', '--skip-existing', '--conc', "$Conc", '--out', $staging)
if (-not $WithDict) { $args += '--no-dict' }
& $py (Join-Path $tt 'gen_edge.py') @args
& $py (Join-Path $tt 'build_index.py') --in (Join-Path $staging 'zh') --out $final
Write-Host "Pack ready under $final (index.bin + clips.pcm). Copy with tools/sd-sync or oversized-assets rejoin."

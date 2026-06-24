# gbins

A fast terminal UI for [GTFOBins](https://gtfobins.github.io) — the live-off-the-land
binary lookup used in pentesting and CTFs. Fuzzy-search 450+ Unix binaries and read
their shell / file-read / reverse-shell / privilege-escalation techniques without
leaving the terminal.

Built with [OpenTUI](https://github.com/anomalyco/opentui) (React renderer) on
[Bun](https://bun.sh). All data is fetched live from the upstream GTFOBins repository
and cached locally — nothing about the binaries or techniques is hardcoded.

```
┌ gtfobins — ~/recon ──────────────────────────────────────────────┐
│ GTFOBins  live-off-the-land lookup          all functions · tab…  │
│ ❯ python█                                                  1/458  │
│  ▌ python      7fn   │ python   7 function categories             │
│                      │  shell                                      │
│                      │  ╭────────────────────────────────────╮    │
│                      │  │ python -c 'import os; os.system(…)' │    │
│  ↑↓ navigate   type filter   tab function   ↵ copy   ^r refresh    │
└───────────────────────────────────────────────────────────────────┘
```

## Run

```bash
bun install
bun run dev
```

## Keys

| Key        | Action                                  |
| ---------- | --------------------------------------- |
| `↑` / `↓`  | move through the binary list            |
| `PgUp/PgDn`| page the binary list by one screen      |
| `Home/End` | jump to the first / last binary         |
| type       | fuzzy-filter binaries by name           |
| `Backspace`| delete a filter character               |
| `Tab`      | cycle the function-type filter          |
| `↵` / `^y` | copy the selected binary's snippets     |
| `^d` / `^u`| scroll the preview pane (half page)     |
| `^r`       | re-fetch the dataset from upstream      |
| `Esc`      | clear the filter, or quit when empty    |
| `^c`       | quit                                    |

## Build a standalone binary

```bash
bun run build          # -> dist/gbins (single executable, no runtime needed)
```

To cross-compile for other platforms, pass a Bun target, e.g.:

```bash
bun build --compile --minify src/index.tsx --target=bun-linux-x64   --outfile dist/gbins-linux
bun build --compile --minify src/index.tsx --target=bun-darwin-arm64 --outfile dist/gbins-macos
```

## Data

On first run gbins downloads the GTFOBins repo tarball once, parses every
`_gtfobins/*` entry's YAML front-matter, and caches the result at
`$XDG_CACHE_HOME/gbins/gtfobins.json` (falling back to `~/.cache`). The cache is
refreshed automatically after 24h, on demand with `^r`, or it falls back to the
stale cache when offline.

## Layout

| File              | Responsibility                                  |
| ----------------- | ----------------------------------------------- |
| `src/data.ts`     | fetch / untar / parse / cache the GTFOBins data |
| `src/theme.ts`    | TokyoNight palette and per-function colours     |
| `src/clipboard.ts`| best-effort clipboard copy (+ OSC 52 fallback)  |
| `src/App.tsx`     | the TUI                                         |
| `src/index.tsx`   | entry point                                     |

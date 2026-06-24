/** TokyoNight palette + per-function colours. */

export const COLORS = {
  bg: "#1a1b26",
  bgDark: "#16161e",
  panel: "#16161e",
  border: "#20222e",
  borderBright: "#2a2e44",
  active: "#24283b",
  hover: "#1f2233",
  fg: "#c0caf5",
  fgDim: "#7982a9",
  muted: "#565f89",
  faint: "#414868",
  blue: "#7aa2f7",
  cyan: "#7dcfff",
  purple: "#bb9af7",
  green: "#9ece6a",
  red: "#f7768e",
  orange: "#ff9e64",
  yellow: "#e0af68",
  teal: "#73daca",
  code: "#a9b1d6",
}

/** Cyclic gradient stops for the animated wordmark (first == last to loop). */
export const WORDMARK_GRADIENT = ["#bb9af7", "#7dcfff", "#7aa2f7", "#bb9af7"]

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(v).toString(16).padStart(2, "0")
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Sample a cyclic gradient at position t; t wraps so the loop is seamless. */
export function sampleGradient(stops: string[], t: number): string {
  const segs = stops.length - 1
  const x = (((t % 1) + 1) % 1) * segs
  const i = Math.floor(x)
  const f = x - i
  const [r1, g1, b1] = hexToRgb(stops[i])
  const [r2, g2, b2] = hexToRgb(stops[i + 1])
  return rgbToHex(r1 + (r2 - r1) * f, g1 + (g2 - g1) * f, b1 + (b2 - b1) * f)
}

/** Badge colour per GTFOBins function type; unknown types fall back to muted. */
export const FUNC_META: Record<string, string> = {
  shell: COLORS.green,
  command: COLORS.cyan,
  "reverse-shell": COLORS.red,
  "bind-shell": COLORS.orange,
  upload: COLORS.blue,
  download: COLORS.blue,
  "file-write": COLORS.purple,
  "file-read": COLORS.purple,
  "library-load": COLORS.yellow,
  "privilege-escalation": COLORS.red,
  inherit: COLORS.teal,
}

export function funcColor(type: string): string {
  return FUNC_META[type] ?? COLORS.muted
}

/** Preferred order for the tab-cycle filter; extra upstream types appended. */
export const FILTER_ORDER = [
  "shell",
  "command",
  "reverse-shell",
  "bind-shell",
  "file-read",
  "file-write",
  "upload",
  "download",
  "library-load",
  "privilege-escalation",
  "inherit",
]

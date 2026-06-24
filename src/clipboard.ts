/** Best-effort clipboard copy across Wayland/X11/macOS, then OSC 52 fallback. */

const CANDIDATES: string[][] = [
  ["wl-copy"],
  ["xclip", "-selection", "clipboard"],
  ["xsel", "--clipboard", "--input"],
  ["pbcopy"],
]

export async function copyToClipboard(text: string): Promise<boolean> {
  for (const argv of CANDIDATES) {
    if (!Bun.which(argv[0]!)) continue
    try {
      const proc = Bun.spawn(argv, { stdin: "pipe", stdout: "ignore", stderr: "ignore" })
      proc.stdin.write(text)
      await proc.stdin.end()
      if ((await proc.exited) === 0) return true
    } catch {
      // try the next tool
    }
  }
  // Fallback: OSC 52 escape sequence (works over SSH in many terminals).
  try {
    const b64 = Buffer.from(text, "utf8").toString("base64")
    process.stdout.write(`\x1b]52;c;${b64}\x07`)
    return true
  } catch {
    return false
  }
}

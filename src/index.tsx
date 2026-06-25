#!/usr/bin/env bun
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import pkg from "../package.json" with { type: "json" }
import { App } from "./App.tsx"

const args = Bun.argv.slice(2)
if (args.includes("--version") || args.includes("-v")) {
  console.log(pkg.version)
  process.exit(0)
}
if (args.includes("--help") || args.includes("-h")) {
  console.log(`gbins v${pkg.version} — ${pkg.description}\n\nUsage: gbins\n\nA terminal UI: type to filter, ↵ to copy the snippet, Esc to quit.`)
  process.exit(0)
}

const renderer = await createCliRenderer({ exitOnCtrlC: true })
createRoot(renderer).render(<App />)

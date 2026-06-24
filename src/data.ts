/**
 * Fetch, parse and cache the GTFOBins dataset.
 *
 * Source of truth: https://github.com/GTFOBins/GTFOBins.github.io (_gtfobins/*).
 * Each binary is a YAML front-matter document. We download the repo tarball
 * once (a single request), parse every entry, and cache the normalised result
 * as JSON under the user cache directory. Subsequent runs read the cache and
 * work fully offline; `load(true)` forces a re-download.
 */

import { gunzipSync } from "bun"
import { parse as parseYaml } from "yaml"
import { homedir } from "node:os"
import { join } from "node:path"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"

const REPO = "GTFOBins/GTFOBins.github.io"
const BRANCH = "master"
const TARBALL_URL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${BRANCH}`
const ENTRY_PREFIX = "_gtfobins/"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

export interface Snippet {
  code: string
  note: string // contexts / override label, e.g. "sudo · suid"
  comment: string // upstream explanatory comment
}

export interface Func {
  type: string // "shell", "file-read", "reverse-shell", ...
  snippets: Snippet[]
}

export interface Binary {
  name: string
  description: string
  functions: Func[]
  functionTypes: string[]
}

interface CacheBlob {
  fetchedAt: number
  binaries: Binary[]
}

// --------------------------------------------------------------------------- //
// Cache location
// --------------------------------------------------------------------------- //
function cacheDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache")
  const dir = join(base, "gbins")
  mkdirSync(dir, { recursive: true })
  return dir
}

function cacheFile(): string {
  return join(cacheDir(), "gtfobins.json")
}

// --------------------------------------------------------------------------- //
// Minimal tar reader (regular files only; GTFOBins paths stay < 100 chars)
// --------------------------------------------------------------------------- //
function* untar(buf: Uint8Array): Generator<{ name: string; data: Uint8Array }> {
  const dec = new TextDecoder()
  let offset = 0
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512)
    // Two consecutive zero blocks mark the end of the archive.
    if (header.every((b) => b === 0)) break

    const name = dec.decode(header.subarray(0, 100)).replace(/\0.*$/, "")
    const sizeField = dec.decode(header.subarray(124, 136)).replace(/\0.*$/, "").trim()
    const size = parseInt(sizeField, 8) || 0
    const typeflag = String.fromCharCode(header[156]!)

    offset += 512
    const data = buf.subarray(offset, offset + size)
    // Regular file: typeflag '0' or NUL.
    if (typeflag === "0" || typeflag === "\0") {
      yield { name, data }
    }
    offset += Math.ceil(size / 512) * 512
  }
}

// --------------------------------------------------------------------------- //
// Parsing a single binary's front matter
// --------------------------------------------------------------------------- //
function frontMatter(text: string): string {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== "---") return text
  const out: string[] = []
  for (const line of lines.slice(1)) {
    const t = line.trim()
    if (t === "---" || t === "...") break
    out.push(line)
  }
  return out.join("\n")
}

function contextsToSnippets(
  defaultCode: string,
  comment: string,
  contexts: unknown,
): Snippet[] {
  if (!contexts || typeof contexts !== "object") {
    return [{ code: defaultCode, note: "", comment }]
  }
  const plain: string[] = []
  const overrides: Snippet[] = []
  for (const [ctx, spec] of Object.entries(contexts as Record<string, unknown>)) {
    if (spec && typeof spec === "object" && "code" in spec && (spec as any).code) {
      overrides.push({ code: String((spec as any).code).trim(), note: ctx, comment })
    } else {
      plain.push(ctx)
    }
  }
  const snippets: Snippet[] = []
  if (plain.length || overrides.length === 0) {
    snippets.push({ code: defaultCode, note: plain.join(" · "), comment })
  }
  return snippets.concat(overrides)
}

function parseEntry(name: string, text: string): Binary | null {
  let doc: any
  try {
    doc = parseYaml(frontMatter(text))
  } catch {
    return null
  }
  if (!doc || typeof doc !== "object") return null

  const functions: Func[] = []
  const fns = doc.functions
  if (fns && typeof fns === "object") {
    for (const [ftype, entries] of Object.entries(fns)) {
      if (!Array.isArray(entries)) continue
      const snippets: Snippet[] = []
      for (const entry of entries) {
        if (!entry || typeof entry !== "object") continue
        const code = String((entry as any).code ?? "").trim()
        if (!code) continue
        const comment = String((entry as any).comment ?? "").trim()
        snippets.push(...contextsToSnippets(code, comment, (entry as any).contexts))
      }
      if (snippets.length) functions.push({ type: ftype, snippets })
    }
  }

  return {
    name,
    description: String(doc.description ?? "").trim(),
    functions,
    functionTypes: functions.map((f) => f.type),
  }
}

// --------------------------------------------------------------------------- //
// Fetch + cache
// --------------------------------------------------------------------------- //
async function fetchFromUpstream(): Promise<Binary[]> {
  const res = await fetch(TARBALL_URL, { headers: { "User-Agent": "gbins" } })
  if (!res.ok) throw new Error(`upstream returned ${res.status}`)
  const gz = new Uint8Array(await res.arrayBuffer())
  const tar = gunzipSync(gz)

  const binaries: Binary[] = []
  const dec = new TextDecoder()
  for (const { name, data } of untar(tar)) {
    const idx = name.indexOf("/")
    if (idx < 0) continue
    const rel = name.slice(idx + 1)
    if (!rel.startsWith(ENTRY_PREFIX)) continue
    const bin = rel.slice(ENTRY_PREFIX.length)
    if (!bin || bin.includes("/")) continue
    const parsed = parseEntry(bin, dec.decode(data))
    if (parsed && parsed.functions.length) binaries.push(parsed)
  }
  binaries.sort((a, b) => a.name.localeCompare(b.name))
  return binaries
}

function readCache(): CacheBlob | null {
  const path = cacheFile()
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf8")) as CacheBlob
  } catch {
    return null
  }
}

function writeCache(binaries: Binary[]): void {
  const blob: CacheBlob = { fetchedAt: Date.now(), binaries }
  writeFileSync(cacheFile(), JSON.stringify(blob), "utf8")
}

export interface LoadResult {
  binaries: Binary[]
  fetchedAt: number
}

/**
 * Returns the dataset, preferring a fresh cache. Falls back to a stale cache
 * when the network is unavailable so the tool keeps working offline.
 */
export async function load(forceRefresh = false): Promise<LoadResult> {
  const cached = readCache()
  if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { binaries: cached.binaries, fetchedAt: cached.fetchedAt }
  }
  try {
    const binaries = await fetchFromUpstream()
    writeCache(binaries)
    return { binaries, fetchedAt: Date.now() }
  } catch (err) {
    if (cached) return { binaries: cached.binaries, fetchedAt: cached.fetchedAt }
    throw err
  }
}

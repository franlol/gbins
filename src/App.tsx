import { useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { bold, type ScrollBoxRenderable, type BorderCharacters } from "@opentui/core"
import { load, type Binary } from "./data.ts"
import { WORDMARK_GRADIENT, COLORS, FILTER_ORDER, funcColor, sampleGradient } from "./theme.ts"
import { copyToClipboard } from "./clipboard.ts"

const PRINTABLE = /^[a-zA-Z0-9._-]$/

// A faint dotted rule used to separate function categories in the preview.
// Only the top edge is drawn, so just `horizontal` is visible; it tiles to
// fill whatever width the preview pane currently has.
const DOTTED: BorderCharacters = {
  topLeft: "", topRight: "", bottomLeft: "", bottomRight: "",
  horizontal: "┈", vertical: "", topT: "", bottomT: "", leftT: "", rightT: "", cross: "",
}

export function App() {
  const { height } = useTerminalDimensions()

  const [binaries, setBinaries] = useState<Binary[]>([])
  const [error, setError] = useState<string>("")
  const [query, setQuery] = useState("")
  const [funcFilter, setFuncFilter] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [snipIndex, setSnipIndex] = useState(0)
  const [toast, setToast] = useState("")

  const [phase, setPhase] = useState(0)

  const listRef = useRef<ScrollBoxRenderable>(null)
  const previewRef = useRef<ScrollBoxRenderable>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // -- animated tagline gradient ------------------------------------------ //
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => p + 0.04), 90)
    return () => clearInterval(id)
  }, [])

  // -- data load ---------------------------------------------------------- //
  useEffect(() => {
    load()
      .then((r) => setBinaries(r.binaries))
      .catch((e) => setError(String(e?.message ?? e)))
  }, [])

  // -- derived ------------------------------------------------------------ //
  const filterCycle = useMemo<(string | null)[]>(() => {
    const types = new Set<string>()
    for (const b of binaries) for (const t of b.functionTypes) types.add(t)
    const ordered = FILTER_ORDER.filter((t) => types.has(t))
    for (const t of [...types].sort()) if (!ordered.includes(t)) ordered.push(t)
    return [null, ...ordered]
  }, [binaries])

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return binaries.filter(
      (b) =>
        (!q || b.name.toLowerCase().includes(q)) &&
        (funcFilter === null || b.functionTypes.includes(funcFilter)),
    )
  }, [binaries, query, funcFilter])

  const selected = filtered[Math.min(index, Math.max(0, filtered.length - 1))]

  // Flatten the selected binary's snippets so a single cursor can walk every
  // command across all function categories, in render order. The active
  // snippet is what ↵ copies; ^a still copies the whole flattened set.
  const flatSnippets = useMemo(() => {
    const out: { code: string; type: string }[] = []
    if (selected)
      for (const fn of selected.functions)
        for (const s of fn.snippets) out.push({ code: s.code, type: fn.type })
    return out
  }, [selected])

  // Clamp into [-1, last]; -1 keeps the "nothing selected" neutral state.
  const activeSnip = snipIndex < 0 ? -1 : Math.min(snipIndex, flatSnippets.length - 1)

  // list viewport height: terminal minus chrome (header/search/status/padding)
  const listH = Math.max(3, height - 8)

  // useKeyboard registers its handler once, so reading state directly inside it
  // would be stale. Mirror the live values into a ref the handler can read.
  const live = useRef({ query, funcFilter, filtered, filterCycle, selected, listH, flatSnippets, activeSnip })
  live.current = { query, funcFilter, filtered, filterCycle, selected, listH, flatSnippets, activeSnip }

  // keep the selected row visible inside the scrollbox viewport
  useEffect(() => {
    const sb = listRef.current
    if (!sb) return
    if (index < sb.scrollTop) sb.scrollTop = index
    else if (index >= sb.scrollTop + listH) sb.scrollTop = index - listH + 1
  }, [index, listH]) // eslint-disable-line

  // reset the snippet cursor (and preview scroll) when the binary changes.
  // -1 means "nothing selected": the preview opens neutral, with no box
  // marked until the user starts navigating with ^n/^p.
  useEffect(() => {
    setSnipIndex(-1)
    if (previewRef.current) previewRef.current.scrollTop = 0
  }, [selected?.name])

  // keep the active snippet visible as the cursor walks the preview
  useEffect(() => {
    previewRef.current?.scrollChildIntoView(`snip-${activeSnip}`)
  }, [activeSnip])

  function flashToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(""), 1600)
  }

  function resetView() {
    setIndex(0)
    if (listRef.current) listRef.current.scrollTop = 0
  }

  async function copyActive() {
    const { selected: sel, flatSnippets: snips, activeSnip: idx } = live.current
    if (!sel) return
    const snip = snips[idx]
    if (!snip) {
      flashToast("↵ pick a snippet first — ^n/^p")
      return
    }
    const ok = await copyToClipboard(snip.code)
    flashToast(ok ? `✓ copied ${sel.name} · ${snip.type}` : "⚠ clipboard unavailable")
  }

  async function copyAll() {
    const sel = live.current.selected
    if (!sel) return
    const code = sel.functions.flatMap((f) => f.snippets.map((s) => s.code)).join("\n")
    const ok = await copyToClipboard(code)
    flashToast(ok ? `✓ copied all ${sel.name} snippets` : "⚠ clipboard unavailable")
  }

  async function refresh() {
    flashToast("⟳ refreshing from upstream…")
    try {
      const r = await load(true)
      setBinaries(r.binaries)
      flashToast(`✓ loaded ${r.binaries.length} binaries`)
    } catch (e) {
      flashToast("⚠ refresh failed")
    }
  }

  // -- input -------------------------------------------------------------- //
  useKeyboard((key) => {
    const n = key.name
    const s = live.current
    if (n === "down") setIndex((i) => Math.min(i + 1, s.filtered.length - 1))
    else if (n === "up") setIndex((i) => Math.max(i - 1, 0))
    else if (n === "pagedown") setIndex((i) => Math.min(i + s.listH, s.filtered.length - 1))
    else if (n === "pageup") setIndex((i) => Math.max(i - s.listH, 0))
    else if (n === "home") setIndex(0)
    else if (n === "end") setIndex(Math.max(0, s.filtered.length - 1))
    else if (key.ctrl && n === "n") setSnipIndex((j) => Math.min(j + 1, s.flatSnippets.length - 1))
    else if (key.ctrl && n === "p") setSnipIndex((j) => Math.max(j - 1, -1))
    else if (key.ctrl && n === "d") previewRef.current?.scrollBy(Math.ceil(s.listH / 2))
    else if (key.ctrl && n === "u") previewRef.current?.scrollBy(-Math.ceil(s.listH / 2))
    else if (n === "tab") {
      const cur = s.filterCycle.indexOf(s.funcFilter)
      setFuncFilter(s.filterCycle[(cur + 1) % s.filterCycle.length] ?? null)
      resetView()
    } else if (n === "backspace") {
      setQuery((q) => q.slice(0, -1))
      resetView()
    } else if (n === "escape") {
      if (s.query || s.funcFilter !== null) {
        setQuery("")
        setFuncFilter(null)
        resetView()
      } else process.exit(0)
    } else if (n === "return" || (key.ctrl && n === "y")) {
      void copyActive()
    } else if (key.ctrl && n === "a") {
      void copyAll()
    } else if (key.ctrl && n === "r") {
      void refresh()
    } else {
      const ch = key.sequence
      if (ch && ch.length === 1 && !key.ctrl && !key.meta && PRINTABLE.test(ch)) {
        setQuery((q) => q + ch)
        resetView()
      }
    }
  })

  // -- render ------------------------------------------------------------- //
  if (error) {
    return (
      <box style={{ padding: 2, backgroundColor: COLORS.bg }}>
        <text fg={COLORS.red}>Could not load GTFOBins data:</text>
        <text fg={COLORS.muted}>{error}</text>
      </box>
    )
  }

  const countLabel = `${filtered.length}/${binaries.length}`
  const filterLabel =
    funcFilter !== null ? `filter: ${funcFilter} · tab to cycle` : "all functions · tab to filter"

  return (
    <box style={{ flexDirection: "column", width: "100%", height: "100%", backgroundColor: COLORS.bg }}>
      {/* header */}
      <box
        style={{
          height: 1,
          flexDirection: "row",
          justifyContent: "space-between",
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <text>
          <b>
            {"GTFOBins".split("").map((ch, i) => (
              <span key={i} fg={sampleGradient(WORDMARK_GRADIENT, phase - i * 0.12)}>
                {ch}
              </span>
            ))}
          </b>
          <span fg={COLORS.muted}>  live-off-the-land lookup</span>
        </text>
        <text fg={COLORS.faint}>{filterLabel}</text>
      </box>

      {/* search */}
      <box
        style={{
          height: 3,
          marginLeft: 2,
          marginRight: 2,
          paddingLeft: 1,
          paddingRight: 1,
          border: true,
          borderStyle: "rounded",
          borderColor: COLORS.borderBright,
          backgroundColor: COLORS.bgDark,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <text>
          <span fg={COLORS.cyan}>❯ </span>
          <span fg={COLORS.fg}>{query}</span>
          <span fg={COLORS.cyan}>█</span>
        </text>
        <text fg={COLORS.muted}>{countLabel}</text>
      </box>

      {/* main panes */}
      <box style={{ flexGrow: 1, flexDirection: "row", paddingLeft: 2, paddingRight: 2, paddingTop: 1 }}>
        {/* list */}
        <scrollbox
          ref={listRef}
          style={{
            width: 34,
            flexShrink: 0,
            marginRight: 2,
            rootOptions: { backgroundColor: COLORS.bg },
            wrapperOptions: { backgroundColor: COLORS.bg },
            viewportOptions: { backgroundColor: COLORS.bg },
            contentOptions: { backgroundColor: COLORS.bg },
            scrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: COLORS.borderBright, backgroundColor: COLORS.bg } },
          }}
        >
          {filtered.map((b, i) => {
            const active = i === index
            return (
              <box
                key={b.name}
                style={{
                  height: 1,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingLeft: 1,
                  paddingRight: 1,
                  backgroundColor: active ? COLORS.active : undefined,
                }}
              >
                <text>
                  <span fg={active ? COLORS.cyan : COLORS.bg}>{active ? "▌ " : "  "}</span>
                  <span fg={active ? COLORS.fg : COLORS.fgDim}>{b.name}</span>
                </text>
                <text fg={COLORS.faint}>{b.functions.length}fn</text>
              </box>
            )
          })}
        </scrollbox>

        {/* preview */}
        <scrollbox
          ref={previewRef}
          style={{
            flexGrow: 1,
            rootOptions: { backgroundColor: COLORS.panel },
            wrapperOptions: { backgroundColor: COLORS.panel },
            viewportOptions: { backgroundColor: COLORS.panel },
            contentOptions: { backgroundColor: COLORS.panel, paddingLeft: 2, paddingRight: 2, paddingTop: 1 },
            scrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: COLORS.borderBright, backgroundColor: COLORS.panel } },
          }}
        >
          {selected ? <Preview binary={selected} active={activeSnip} /> : <text fg={COLORS.muted}>No matches. Adjust your search.</text>}
        </scrollbox>
      </box>

      {/* status bar */}
      <box
        style={{
          height: 1,
          flexDirection: "row",
          justifyContent: "space-between",
          backgroundColor: COLORS.bgDark,
          paddingLeft: 2,
          paddingRight: 2,
        }}
      >
        <text>
          <span fg={COLORS.blue}>↑↓</span>
          <span fg={COLORS.muted}> nav   </span>
          <span fg={COLORS.blue}>⇞⇟</span>
          <span fg={COLORS.muted}> page   </span>
          <span fg={COLORS.blue}>⤒⤓</span>
          <span fg={COLORS.muted}> top/bottom   </span>
          <span fg={COLORS.blue}>tab</span>
          <span fg={COLORS.muted}> function   </span>
          <span fg={COLORS.blue}>^n^p</span>
          <span fg={COLORS.muted}> snippet   </span>
          <span fg={COLORS.blue}>↵</span>
          <span fg={COLORS.muted}> copy   </span>
          <span fg={COLORS.blue}>^a</span>
          <span fg={COLORS.muted}> all   </span>
          <span fg={COLORS.blue}>esc</span>
          <span fg={COLORS.muted}> clear/quit</span>
        </text>
        <text fg={COLORS.faint}>{toast || `${countLabel} ${filtered.length === 1 ? "match" : "matches"}`}</text>
      </box>
    </box>
  )
}

function Preview({ binary, active }: { binary: Binary; active: number }) {
  // Running index across every snippet, matching the flattened cursor in App.
  let flat = -1
  return (
    <box style={{ flexDirection: "column" }}>
      <text>
        <span fg={COLORS.cyan}>{binary.name}</span>
        <span fg={COLORS.muted}>{`   ${binary.functions.length} function ${binary.functions.length === 1 ? "category" : "categories"}`}</span>
      </text>
      {binary.description ? (
        <text fg={COLORS.muted}>{binary.description}</text>
      ) : null}
      <text> </text>

      {binary.functions.map((fn, fi) => {
        const color = funcColor(fn.type)
        return (
          <box key={fn.type} style={{ flexDirection: "column", marginBottom: 1 }}>
            {fi > 0 ? (
              <box
                style={{
                  height: 1,
                  marginBottom: 1,
                  border: ["top"],
                  borderColor: COLORS.faint,
                  customBorderChars: DOTTED,
                }}
              />
            ) : null}
            <box style={{ flexDirection: "row" }}>
              <box style={{ backgroundColor: color, paddingLeft: 1, paddingRight: 1 }}>
                <text fg={COLORS.bgDark}>{fn.type}</text>
              </box>
            </box>
            {fn.snippets.map((s, i) => {
              const idx = ++flat
              const isActive = idx === active
              return (
                <box key={i} id={`snip-${idx}`} style={{ flexDirection: "column", marginTop: 1 }}>
                  {s.note ? <text fg={COLORS.faint}>  {s.note}</text> : null}
                  {/* Every box keeps its category colour; the active one stands
                      out with a heavy border + a "↵ copy" tag on its top edge. */}
                  <box
                    title={isActive ? " ↵ copy " : undefined}
                    titleColor={color}
                    titleAlignment="right"
                    style={{
                      border: true,
                      borderStyle: isActive ? "heavy" : "rounded",
                      borderColor: color,
                      backgroundColor: COLORS.bg,
                      paddingLeft: 1,
                      paddingRight: 1,
                    }}
                  >
                    <text fg={COLORS.code}>{s.code}</text>
                  </box>
                  {s.comment ? <text fg={COLORS.muted}>  {s.comment}</text> : null}
                </box>
              )
            })}
          </box>
        )
      })}
    </box>
  )
}

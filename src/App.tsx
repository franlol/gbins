import { useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import { bold, type ScrollBoxRenderable } from "@opentui/core"
import { load, type Binary } from "./data.ts"
import { WORDMARK_GRADIENT, COLORS, FILTER_ORDER, funcColor, sampleGradient } from "./theme.ts"
import { copyToClipboard } from "./clipboard.ts"

const PRINTABLE = /^[a-zA-Z0-9._-]$/

export function App() {
  const { height } = useTerminalDimensions()

  const [binaries, setBinaries] = useState<Binary[]>([])
  const [error, setError] = useState<string>("")
  const [query, setQuery] = useState("")
  const [funcFilter, setFuncFilter] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [scroll, setScroll] = useState(0)
  const [toast, setToast] = useState("")

  const [phase, setPhase] = useState(0)

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

  // list viewport height: terminal minus chrome (header/search/status/padding)
  const listH = Math.max(3, height - 8)

  // useKeyboard registers its handler once, so reading state directly inside it
  // would be stale. Mirror the live values into a ref the handler can read.
  const live = useRef({ query, funcFilter, filtered, filterCycle, selected, listH })
  live.current = { query, funcFilter, filtered, filterCycle, selected, listH }

  // keep selection within the rendered window
  useEffect(() => {
    if (index < scroll) setScroll(index)
    else if (index >= scroll + listH) setScroll(index - listH + 1)
  }, [index, listH]) // eslint-disable-line

  // reset preview scroll on selection change
  useEffect(() => {
    if (previewRef.current) previewRef.current.scrollTop = 0
  }, [selected?.name])

  function flashToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(""), 1600)
  }

  function resetView() {
    setIndex(0)
    setScroll(0)
  }

  async function copySelected() {
    const sel = live.current.selected
    if (!sel) return
    const code = sel.functions.flatMap((f) => f.snippets.map((s) => s.code)).join("\n")
    const ok = await copyToClipboard(code)
    flashToast(ok ? `✓ copied ${sel.name} snippets` : "⚠ clipboard unavailable")
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
    else if (n === "pagedown") previewRef.current?.scrollBy(s.listH)
    else if (n === "pageup") previewRef.current?.scrollBy(-s.listH)
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
      void copySelected()
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
  const windowRows = filtered.slice(scroll, scroll + listH)

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
        <box style={{ width: 34, flexShrink: 0, flexDirection: "column", marginRight: 2 }}>
          {windowRows.map((b, i) => {
            const active = scroll + i === index
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
        </box>

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
          {selected ? <Preview binary={selected} /> : <text fg={COLORS.muted}>No matches. Adjust your search.</text>}
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
          <span fg={COLORS.muted}> navigate   </span>
          <span fg={COLORS.blue}>type</span>
          <span fg={COLORS.muted}> filter   </span>
          <span fg={COLORS.blue}>tab</span>
          <span fg={COLORS.muted}> function   </span>
          <span fg={COLORS.blue}>↵</span>
          <span fg={COLORS.muted}> copy   </span>
          <span fg={COLORS.blue}>^r</span>
          <span fg={COLORS.muted}> refresh   </span>
          <span fg={COLORS.blue}>esc</span>
          <span fg={COLORS.muted}> clear/quit</span>
        </text>
        <text fg={COLORS.faint}>{toast || `${countLabel} matches`}</text>
      </box>
    </box>
  )
}

function Preview({ binary }: { binary: Binary }) {
  return (
    <box style={{ flexDirection: "column" }}>
      <text>
        <span fg={COLORS.cyan}>{binary.name}</span>
        <span fg={COLORS.muted}>   {binary.functions.length} function categories</span>
      </text>
      {binary.description ? (
        <text fg={COLORS.muted}>{binary.description}</text>
      ) : null}
      <text> </text>

      {binary.functions.map((fn) => {
        const color = funcColor(fn.type)
        return (
          <box key={fn.type} style={{ flexDirection: "column", marginBottom: 1 }}>
            <box style={{ flexDirection: "row" }}>
              <box style={{ backgroundColor: color, paddingLeft: 1, paddingRight: 1 }}>
                <text fg={COLORS.bgDark}>{fn.type}</text>
              </box>
            </box>
            {fn.snippets.map((s, i) => (
              <box key={i} style={{ flexDirection: "column", marginTop: 1 }}>
                {s.note ? <text fg={COLORS.faint}>  {s.note}</text> : null}
                <box
                  style={{
                    border: true,
                    borderStyle: "rounded",
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
            ))}
          </box>
        )
      })}
    </box>
  )
}

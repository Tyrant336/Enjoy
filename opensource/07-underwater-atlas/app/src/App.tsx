import { useEffect, useRef, useState } from 'react'
import { createAtlas, loadPdfGraph, currentGraph, buildCards, toAnkiText } from './lib/atlas.js'
import { pickDeck } from './lib/decks.js'

type Cluster = { id: string; name: string; color: string; count: number }
type Row = { i: number; name: string; color: string; deg: number; on: boolean }
type Item = { i: number; name: string; color: string }
type Card = { front: string; back: string; tags?: string }
type Drawer = {
  i: number; name: string; desc: string; cname: string; color: string
  deg: number; depth: number; card: { front: string; back: string }
  groups: { title: string; tag: string; items: Item[] }[]
}
type Stage = { label: string; status: 'wait' | 'run' | 'done' }

/* The fake import pipeline — pure theatre, no AI anywhere near it. */
const PIPELINE = [
  'Reading PDF',
  'Extracting knowledge points',
  'Connecting the graph',
  'Writing flashcards',
]

/* Escape regex metacharacters, then wrap the matched parts in <mark> */
function mark(name: string, q: string) {
  if (!q) return name
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig')
  return name.split(re).map((part, i) => i % 2 ? <mark key={i}>{part}</mark> : part)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export default function App() {
  const stage = useRef<HTMLDivElement>(null)
  const labels = useRef<HTMLDivElement>(null)
  const hudMode = useRef<HTMLElement>(null)
  const hudSel = useRef<HTMLDivElement>(null)
  const pathbar = useRef<HTMLDivElement>(null)
  const chain = useRef<HTMLSpanElement>(null)
  const zlvl = useRef<HTMLButtonElement>(null)
  const sNode = useRef<HTMLDivElement>(null)
  const sEdge = useRef<HTMLDivElement>(null)
  const sDeg = useRef<HTMLDivElement>(null)
  const sFps = useRef<HTMLDivElement>(null)
  const q = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const api = useRef<ReturnType<typeof createAtlas> | null>(null)
  const alive = useRef(true)

  const [gate, setGate] = useState(false)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [list, setList] = useState<{ q: string; rows: Row[] }>({ q: '', rows: [] })
  const [drawer, setDrawer] = useState<Drawer | null>(null)
  const [tools, setTools] = useState({ flow: true, label: true, spin: true })
  const [view, setView] = useState('atlas')
  const [off, setOff] = useState<string[]>([])

  const [deckName, setDeckName] = useState(() => currentGraph().meta.name)
  const [pipe, setPipe] = useState<{ file: string; stages: Stage[] } | null>(null)
  const [cards, setCards] = useState<Card[]>(() => buildCards())
  const [ankiOpen, setAnkiOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const els = () => ({
    stage: stage.current!, labels: labels.current!, hudMode: hudMode.current!,
    hudSel: hudSel.current!, pathbar: pathbar.current!, chain: chain.current!,
    zlvl: zlvl.current!, sNode: sNode.current!, sEdge: sEdge.current!,
    sDeg: sDeg.current!, sFps: sFps.current!, q: q.current!,
  })
  const emit = {
    gate: setGate, list: setList, drawer: setDrawer, tools: setTools, clusters: setClusters,
  }

  useEffect(() => {
    alive.current = true
    const a = createAtlas({ els: els(), emit })
    api.current = a
    return () => { alive.current = false; a.dispose(); api.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Swap the entire dataset: rebuild module state, dispose the old atlas,
     re-create the scene on the new graph. */
  const rebuild = () => {
    api.current?.dispose()
    if (q.current) q.current.value = ''
    setOff([])
    setView('atlas')
    const a = createAtlas({ els: els(), emit })
    api.current = a
    setCards(buildCards())
    setDeckName(currentGraph().meta.name)
  }

  const onPickPdf = async (file: File) => {
    if (pipe) return
    const stages: Stage[] = PIPELINE.map(label => ({ label, status: 'wait' }))
    setPipe({ file: file.name, stages: [...stages] })
    for (let i = 0; i < stages.length; i++) {
      if (!alive.current) return
      stages[i].status = 'run'
      setPipe({ file: file.name, stages: [...stages] })
      await sleep(620 + i * 160)
      if (!alive.current) return
      stages[i].status = 'done'
      setPipe({ file: file.name, stages: [...stages] })
    }
    await sleep(280)
    if (!alive.current) return
    const deck = pickDeck(file.name)          // deterministic: same name → same reef
    loadPdfGraph(deck.nodes, deck.edges, deck.clusters, { id: deck.id, name: deck.name })
    rebuild()
    setPipe(null)
    setAnkiOpen(true)
  }

  const copyCards = async () => {
    const text = toAnkiText(cards, deckName)
    try { await navigator.clipboard.writeText(text) }
    catch {
      const ta = document.createElement('textarea')
      ta.value = text; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); ta.remove()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const downloadCards = () => {
    const blob = new Blob([toAnkiText(cards, deckName)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `anki-abyss-${deckName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleCluster = (id: string) => {
    setOff(o => o.includes(id) ? o.filter(x => x !== id) : [...o, id])
    api.current?.toggleCluster(id)
  }

  return (
    <div id="app" className={drawer ? 'open' : ''}>
      <aside>
        <div className="brand">
          <h1><span className="dot"></span>Anki Abyss</h1>
          <p>{deckName} · drop a PDF, surface a reef of flashcards</p>
        </div>

        <div className="pdfzone">
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onPickPdf(f)
              e.target.value = ''
            }} />
          <button className="pdfbtn" type="button" disabled={!!pipe}
            onClick={() => fileInput.current?.click()}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 15V4m0 0 3.5 3.5M10 4 6.5 7.5" />
              <path d="M3 15c1.2 1 2.3 1.5 3.5 1.5S8.8 16 10 15s2.3-1.5 3.5-1.5S15.8 16 17 15" />
            </svg>
            {pipe ? 'Sinking…' : 'Drop a PDF into the sea'}
          </button>

          {pipe && (
            <div className="pipe">
              <div className="pipe-file">{pipe.file}</div>
              {pipe.stages.map(s => (
                <div key={s.label} className={'ps ' + s.status}>
                  <i></i>{s.label}
                </div>
              ))}
            </div>
          )}

          {!pipe && (
            <>
              <button className={'ankibtn' + (ankiOpen ? ' on' : '')} type="button"
                onClick={() => setAnkiOpen(o => !o)}>
                Anki cards ({cards.length})
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
                  style={{ transform: ankiOpen ? 'rotate(180deg)' : 'none' }}>
                  <path d="M2.5 4.5 6 8l3.5-3.5" />
                </svg>
              </button>
              {ankiOpen && (
                <div className="ankipanel">
                  <pre>{toAnkiText(cards, deckName)}</pre>
                  <div className="ankiact">
                    <button className="btn" type="button" onClick={copyCards}>{copied ? 'Copied!' : 'Copy'}</button>
                    <button className="btn primary" type="button" onClick={downloadCards}>Download</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="searchbox">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
          <input id="q" type="search" placeholder="Search the reef…" autoComplete="off" spellCheck={false} ref={q}
            onChange={e => api.current?.setQuery(e.target.value)} />
        </div>

        <div className="legend" id="legend">
          {clusters.map(c => (
            <button key={c.id} className={'cl' + (off.includes(c.id) ? ' off' : '')} type="button"
              onClick={() => toggleCluster(c.id)}>
              <i style={{ background: c.color }}></i>{c.name}<b>{c.count}</b></button>
          ))}
        </div>
        <div className="listwrap" id="list">
          {list.rows.length ? list.rows.map(n => (
            <div key={n.i} className={'lrow' + (n.on ? ' on' : '')} data-i={n.i}
              onClick={() => api.current?.selectAt(n.i)}
              onMouseOver={() => api.current?.hoverAt(n.i)}
              onMouseLeave={() => api.current?.hoverAt(null)}>
              <i style={{ background: n.color }}></i><span>{mark(n.name, list.q)}</span><b>{n.deg}</b>
            </div>
          )) : <div style={{ padding: '14px 16px', color: 'var(--faint)', fontSize: '12px' }}>Nothing surfaces for that search</div>}
        </div>

        <div className="foot">
          <div><div className="k" id="s-node" ref={sNode}>—</div><div className="l">Visible nodes</div></div>
          <div><div className="k" id="s-edge" ref={sEdge}>—</div><div className="l">Visible edges</div></div>
          <div><div className="k" id="s-deg" ref={sDeg}>—</div><div className="l">Average degree</div></div>
          <div><div className="k" id="s-fps" ref={sFps}>—</div><div className="l">FPS</div></div>
        </div>
      </aside>

      <div id="stage" ref={stage}>
        {/* Labels are projected every frame and drawn from a fixed div pool; React is not involved */}
        <div id="labels" ref={labels}></div>

        <div id="hud">
          <div><b id="hud-mode" ref={hudMode}>REEF VIEW</b></div>
          <div id="hud-sel" ref={hudSel}>Nothing selected</div>
        </div>

        <div id="pathbar" ref={pathbar}>
          <span className="chain" id="chain" ref={chain}></span>
          <button className="x" id="path-x" type="button" onClick={() => api.current?.clearPath()}>✕</button>
        </div>

        <div id="tools">
          {[['atlas', 'Reef'], ['shell', 'School'], ['tier', 'Depths']].map(([v, label]) => (
            <button key={v} className={'tb' + (view === v ? ' on' : '')} data-view={v} type="button"
              onClick={() => { setView(v); api.current?.setView(v) }}>{label}</button>
          ))}
          <span className="sep"></span>
          <button className={'tb' + (tools.flow ? ' on' : '')} id="t-flow" type="button"
            onClick={() => api.current?.toggleFlow()}>Currents</button>
          <button className={'tb' + (tools.label ? ' on' : '')} id="t-label" type="button"
            onClick={() => api.current?.toggleLabel()}>Labels</button>
          <button className={'tb' + (tools.spin ? ' on' : '')} id="t-spin" type="button"
            onClick={() => api.current?.toggleSpin()}>Drift</button>
          <span className="sep"></span>
          <button className="tb" id="zout" type="button" title="Zoom out" onClick={() => api.current?.dolly(1.18)}>−</button>
          <button className="tb" id="zlvl" type="button" title="Reset zoom" ref={zlvl}
            onClick={() => api.current?.zoomReset()}>100%</button>
          <button className="tb" id="zin" type="button" title="Zoom in" onClick={() => api.current?.dolly(1 / 1.18)}>＋</button>
          <span className="sep"></span>
          <button className="tb" id="t-reset" type="button" onClick={() => api.current?.reset()}>Reset</button>
        </div>

        <div id="hint">
          Drag to swim around · wheel or <kbd>+</kbd>/<kbd>−</kbd> to zoom · click a bead for its card<br />{' '}
          <kbd>Shift</kbd>+click a second bead for shortest path · <kbd>Esc</kbd> to clear
        </div>

        <div id="gate" style={gate ? { display: 'grid' } : undefined}>WebGL is unavailable on this device.<br />Search and flashcards remain available.</div>
      </div>

      <div id="drawer"><div className="dr" id="dr">
        {drawer && <>
          <div className="dr-head">
            <div className="kind"><i style={{ background: drawer.color }}></i>{drawer.cname} · degree {drawer.deg} · depth {drawer.depth}</div>
            <h2>{drawer.name}</h2>
            <p>{drawer.desc}</p>
          </div>
          <div className="dr-body">
            <div className="fcard">
              <h3>Flashcard</h3>
              <div className="fc-q"><u>Q</u>{drawer.card.front}</div>
              <div className="fc-a"><u>A</u>{drawer.card.back}</div>
            </div>
            {drawer.groups.map(g => (
              <div className="dr-sec" key={g.tag}>
                <h3>{g.title} <b style={{ color: 'var(--faint)', opacity: .6 }}>{g.items.length}</b></h3>
                {g.items.map(m => (
                  <div className="nb" data-i={m.i} key={m.i} onClick={() => api.current?.selectAt(m.i)}>
                    <i style={{ background: m.color }}></i>
                    <span>{m.name}</span><u>{g.tag}</u></div>
                ))}
              </div>
            ))}
          </div>
          <div className="dr-act">
            <button className="btn" id="a-center" type="button" onClick={() => api.current?.centerOn(drawer.i)}>Center here</button>
            <button className="btn primary" id="a-path" type="button" onClick={() => api.current?.startPath(drawer.i)}>Find path from here</button>
          </div>
        </>}
      </div></div>
    </div>
  )
}

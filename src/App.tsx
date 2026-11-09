import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, UIEvent } from 'react'

type Platform = 'WhatsApp' | 'Instagram'
type ChatMessage = {
  timestamp: number
  sender: string
  platform?: Platform
  message: string
}

const ROW_GAP = 12
const OVERSCAN = 8

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)
    && typeof row.sender === 'string' && typeof row.message === 'string'
    && (row.platform === undefined || row.platform === 'WhatsApp' || row.platform === 'Instagram')
}

function formatDate(timestamp: number) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Invalid date'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function localDateKey(timestamp: number) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function estimateHeight(message: ChatMessage, width: number) {
  const bubbleWidth = Math.max(210, width * 0.74)
  const charsPerLine = Math.max(22, Math.floor(bubbleWidth / 8.2))
  const lines = message.message.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
  return Math.max(92, 66 + lines * 21 + ROW_GAP)
}

function App() {
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('keepsake-theme')
    return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sourceName, setSourceName] = useState('public/chat.json')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [activePlatform, setActivePlatform] = useState('All platforms')
  const [activeSender, setActiveSender] = useState('All people')
  const [activeDate, setActiveDate] = useState('')
  const [containerHeight, setContainerHeight] = useState(0)
  const [containerWidth, setContainerWidth] = useState(900)
  const [scrollTop, setScrollTop] = useState(0)
  const [measurements, setMeasurements] = useState<Map<number, number>>(() => new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dateFilterRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('keepsake-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const loadRows = useCallback((rows: unknown, name: string) => {
    if (!Array.isArray(rows) || !rows.every(isChatMessage)) {
      setError('This file does not match the chat format. Expected an array of messages with timestamp, sender, and message fields.')
      return
    }
    setMessages(rows)
    setSourceName(name)
    setMeasurements(new Map())
    setScrollTop(0)
    setError('')
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])

  useEffect(() => {
    let active = true
    fetch('/chat.json')
      .then((response) => {
        if (!response.ok) throw new Error('No chat.json found in the public folder.')
        return response.json()
      })
      .then((rows: unknown) => { if (active) loadRows(rows, 'public/chat.json') })
      .catch(() => { /* The empty state explains how to add a file. */ })
    return () => { active = false }
  }, [loadRows])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerHeight(entry.contentRect.height)
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setMeasurements(new Map())
  }, [containerWidth])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  const senders = useMemo(() => [...new Set(messages.map((message) => message.sender))], [messages])
  const availablePlatforms = useMemo(() => [...new Set(messages.map((message) => message.platform).filter(Boolean))] as Platform[], [messages])
  const visibleMessages = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return messages.map((message, originalIndex) => ({ message, originalIndex }))
      .filter(({ message }) => (activePlatform === 'All platforms' || message.platform === activePlatform)
        && (activeSender === 'All people' || message.sender === activeSender)
        && (!activeDate || localDateKey(message.timestamp) === activeDate)
        && (!normalizedQuery || `${message.sender} ${message.message} ${message.platform ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)))
  }, [messages, activePlatform, activeSender, activeDate, query])

  const offsets = useMemo(() => {
    const result = new Array<number>(visibleMessages.length)
    let total = 0
    visibleMessages.forEach(({ message, originalIndex }, index) => {
      result[index] = total
      total += measurements.get(originalIndex) ?? estimateHeight(message, containerWidth)
    })
    return { positions: result, total }
  }, [visibleMessages, measurements, containerWidth])

  const startIndex = useMemo(() => {
    let low = 0
    let high = offsets.positions.length
    const target = Math.max(0, scrollTop - 320)
    while (low < high) {
      const mid = (low + high) >>> 1
      if (offsets.positions[mid] < target) low = mid + 1
      else high = mid
    }
    return Math.max(0, low - OVERSCAN)
  }, [offsets.positions, scrollTop])

  const endIndex = useMemo(() => {
    const target = scrollTop + containerHeight + 420
    let index = startIndex
    while (index < visibleMessages.length && offsets.positions[index] < target) index += 1
    return Math.min(visibleMessages.length, index + OVERSCAN)
  }, [containerHeight, offsets.positions, scrollTop, startIndex, visibleMessages.length])

  const measureRow = useCallback((originalIndex: number, height: number) => {
    setMeasurements((current) => {
      if (Math.abs((current.get(originalIndex) ?? 0) - height) < 1) return current
      const next = new Map(current)
      next.set(originalIndex, height)
      return next
    })
  }, [])

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      loadRows(JSON.parse(await file.text()), file.name)
    } catch {
      setError('Could not read this file as JSON. Check the file and try again.')
    }
    event.target.value = ''
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)
  const lastActivity = messages.length ? formatDate(messages[messages.length - 1].timestamp) : 'Waiting for your archive'

  return (
    <main id="top" className="min-h-screen bg-paper text-ink transition-colors duration-300">
      <input ref={fileInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={handleFile} />
      <section className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 gap-7 px-4 py-5 sm:px-7 lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,2.8fr)] lg:gap-10 lg:px-10 lg:py-7">
        <aside className="flex flex-col px-1 sm:px-2 lg:min-h-[calc(100vh-56px)] lg:py-1">
          <div className="mb-8 flex items-center justify-between gap-3 lg:mb-16">
            <a className="inline-flex items-center gap-2.5 text-[19px] font-semibold tracking-[-0.06em] text-ink no-underline" href="#top" aria-label="Keepsake home">
              <span className="grid size-9 place-items-center rounded-xl bg-terracotta text-white shadow-sm"><svg className="size-5 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.3 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20Z" /></svg></span>
              <span>keepsake<span className="text-terracotta">.</span></span>
            </a>
            <button className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-muted transition hover:border-terracotta/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={() => fileInputRef.current?.click()}><svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" /></svg>Open file</button>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-terracotta"><span className="h-px w-6 bg-terracotta/60" />A little place for your words</div>
          <h1 className="mt-5 mb-3 font-serif text-[clamp(2.65rem,4vw,4rem)] leading-[1.03] tracking-[-.055em] text-ink">Some things<br />are worth <em className="font-medium text-terracotta">keeping.</em></h1>
          <p className="max-w-sm text-sm leading-7 text-muted">Your conversations, gathered in one quiet place. Pick a moment and take your time.</p>
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-line bg-surface/80 p-3.5 shadow-[0_8px_24px_var(--shadow)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-terracotta"><svg className="size-5 fill-none stroke-current stroke-[1.5]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5L13.5 3Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M13 3v7h7M8 14h8M8 17h5"/></svg></span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-semibold text-ink">{sourceName}</strong><span className="mt-1 block text-[11px] text-muted">{messages.length ? `${messages.length.toLocaleString()} messages loaded` : 'Your chat file lives here'}</span></span>
            <span className="text-sm font-semibold text-sage">{messages.length ? '✓' : '·'}</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted"><span className="text-base text-terracotta">◷</span>Times shown in your local timezone</div>
          <div className="mt-8 flex items-center gap-2 lg:mt-auto lg:pt-12"><span className="text-xs text-sage">✳</span><span className="text-[9px] font-semibold tracking-[.16em] text-muted/70">MADE FOR THE MOMENTS IN BETWEEN</span></div>
        </aside>

        <section className="flex h-[min(790px,calc(100svh-40px))] min-h-[580px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_20px_60px_var(--shadow)] sm:h-[min(820px,calc(100svh-56px))]" aria-label="Conversation viewer">
          <div className="flex min-h-[82px] items-center justify-between gap-4 border-b border-line px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex shrink-0 pl-1"><span className="grid size-9 place-items-center rounded-full border-2 border-surface bg-[#e8caba] text-xs font-semibold text-[#765e51]">J</span><span className="-ml-2 grid size-9 place-items-center rounded-full border-2 border-surface bg-[#ded0e3] text-xs font-semibold text-[#725f76]">S</span></div>
              <div className="min-w-0"><h2 className="truncate text-sm font-semibold tracking-tight text-ink">Your conversations</h2><p className="mt-1 truncate text-xs text-muted">{messages.length ? `${messages.length.toLocaleString()} messages · ${lastActivity}` : 'A collection of little moments'}</p></div>
            </div>
            <div className="hidden shrink-0 items-center gap-4 text-[11px] text-muted sm:flex"><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-sage" />WhatsApp</span><span className="flex items-center gap-2"><i className="size-2 rounded-full bg-lilac" />Instagram</span></div>
            <button className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-paper text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={() => setDarkMode((current) => !current)} aria-label={`Switch to ${darkMode ? 'light' : 'dark'} mode`} title={`Switch to ${darkMode ? 'light' : 'dark'} mode`}>
              {darkMode ? <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg> : <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>}
            </button>
          </div>
          <div className="flex flex-col gap-2 border-b border-line bg-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <label className="flex h-10 min-w-0 items-center gap-2.5 rounded-lg border border-line bg-paper px-3 text-muted transition focus-within:border-terracotta/60 focus-within:ring-2 focus-within:ring-terracotta/10 sm:w-[min(290px,42%)]"><svg className="size-4 shrink-0 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path strokeLinecap="round" d="m16 16 4 4"/></svg><input ref={searchRef} className="min-w-0 flex-1 border-0 bg-transparent text-xs text-ink outline-none placeholder:text-muted/70" aria-label="Search messages" placeholder="Find a message..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] text-muted sm:block">⌘ K</kbd></label>
            <div className="grid grid-cols-3 gap-2">
              <label className="filter-control relative min-w-0">
                <select className="h-10 w-full appearance-none rounded-lg border border-line bg-paper py-0 pl-2 pr-8 text-[11px] text-muted outline-none focus:border-terracotta/60 focus:ring-2 focus:ring-terracotta/10 sm:pl-3 sm:text-xs" aria-label="Filter by platform" value={activePlatform} onChange={(event) => setActivePlatform(event.target.value)}><option>All platforms</option>{availablePlatforms.map((platform) => <option key={platform}>{platform}</option>)}</select>
                <svg className="filter-icon pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </label>
              <div className="filter-control relative min-w-0">
                <input ref={dateFilterRef} className="date-filter h-10 w-full rounded-lg border border-line bg-paper py-0 pl-2 pr-9 text-[11px] text-muted outline-none focus:border-terracotta/60 focus:ring-2 focus:ring-terracotta/10 sm:pl-3 sm:text-xs" aria-label="Filter by date" type="date" value={activeDate} onChange={(event) => setActiveDate(event.target.value)} />
                <button className="filter-icon absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta" type="button" aria-label="Open date picker" onClick={() => {
                  const input = dateFilterRef.current
                  if (!input) return
                  if (typeof input.showPicker === 'function') input.showPicker()
                  else { input.focus(); input.click() }
                }}><svg className="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2" stroke="currentColor" strokeWidth="1.7" /><path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg></button>
              </div>
              <label className="filter-control relative min-w-0">
                <select className="h-10 w-full appearance-none rounded-lg border border-line bg-paper py-0 pl-2 pr-8 text-[11px] text-muted outline-none focus:border-terracotta/60 focus:ring-2 focus:ring-terracotta/10 sm:pl-3 sm:text-xs" aria-label="Filter by person" value={activeSender} onChange={(event) => setActiveSender(event.target.value)}><option>All people</option>{senders.map((sender) => <option key={sender}>{sender}</option>)}</select>
                <svg className="filter-icon pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </label>
            </div>
          </div>
          {error && <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-xs leading-5 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200" role="alert">{error}</div>}
          <div className="message-list min-h-0 flex-1 overflow-auto overscroll-contain" ref={scrollRef} onScroll={handleScroll}>
            {visibleMessages.length > 0 ? <div className="relative w-full" style={{ height: offsets.total }}>
              {visibleMessages.slice(startIndex, endIndex).map(({ message, originalIndex }, index) => {
                const virtualIndex = startIndex + index
                return <MessageRow key={`${originalIndex}-${message.timestamp}`} message={message} top={offsets.positions[virtualIndex]} onMeasure={(height) => measureRow(originalIndex, height)} />
              })}
            </div> : <div className="flex min-h-full flex-col items-center justify-center px-6 py-10 text-center">
              {messages.length ? <><span className="mb-4 grid size-12 place-items-center rounded-full bg-soft text-xl text-terracotta">⌕</span><h3 className="font-serif text-2xl text-ink">No messages found</h3><p className="mt-2 text-xs leading-6 text-muted">Try a different search or filter.</p><button className="mt-3 text-xs font-semibold text-terracotta underline decoration-terracotta/40 underline-offset-4" onClick={() => { setQuery(''); setActivePlatform('All platforms'); setActiveSender('All people'); setActiveDate('') }}>Clear filters</button></> : <><span className="mb-4 grid size-12 place-items-center rounded-full bg-soft text-xl text-terracotta">✳</span><h3 className="font-serif text-2xl text-ink">Your story starts here</h3><p className="mt-2 max-w-sm text-xs leading-6 text-muted">Place your <code className="rounded bg-soft px-1.5 py-1 font-mono text-[11px] text-terracotta">chat.json</code> file in the project’s <code className="rounded bg-soft px-1.5 py-1 font-mono text-[11px] text-terracotta">public/</code> folder, then refresh.</p><p className="mt-1 text-xs text-muted">Or open a file from anywhere on your device.</p><button className="mt-5 inline-flex h-10 items-center gap-3 rounded-lg bg-terracotta px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={() => fileInputRef.current?.click()}>Choose chat.json <span>↗</span></button><div className="mt-4 text-[10px] text-muted">A JSON array of messages · timestamps in milliseconds</div></>}
            </div>}
          </div>
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-t border-line bg-surface px-3 text-[10px] text-muted sm:px-5 sm:text-[11px]"><span className="flex items-center gap-2"><i className="text-sm not-italic text-sage">⌑</i>A private little archive</span><span>{visibleMessages.length.toLocaleString()} {visibleMessages.length === 1 ? 'message' : 'messages'}<span className="mx-2 text-muted/50">·</span>Scroll to wander</span></div>
        </section>
      </section>
    </main>
  )
}

function MessageRow({ message, top, onMeasure }: { message: ChatMessage, top: number, onMeasure: (height: number) => void }) {
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = rowRef.current
    if (!node) return
    const observer = new ResizeObserver(() => onMeasure(node.getBoundingClientRect().height))
    observer.observe(node)
    onMeasure(node.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [onMeasure])
  const isSystem = message.sender === 'System'
  const platformClass = message.platform === 'Instagram' ? 'instagram' : message.platform === 'WhatsApp' ? 'whatsapp' : 'neutral'
  const isRightSide = message.sender.toLowerCase() === 'sushmita'
  const tone = platformClass === 'instagram' ? 'border-lilac/30 bg-lilac/5' : platformClass === 'whatsapp' ? 'border-sage/35 bg-sage/5' : 'border-line bg-surface'
  return <article ref={rowRef} className={`absolute left-0 right-0 flex items-start gap-2.5 px-3 pb-3 sm:px-6 ${isRightSide ? 'flex-row-reverse justify-start' : ''} ${isSystem ? 'justify-center pt-2' : ''}`} style={{ top }}>
    {!isSystem && <div className={`mt-5 grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold ${message.sender.toLowerCase() === 'sushmita' ? 'bg-[#ded0e3] text-[#725f76]' : 'bg-[#e8caba] text-[#765e51]'}`}>{message.sender.slice(0, 1).toUpperCase()}</div>}
    <div className={`min-w-0 max-w-[78%] ${isSystem ? 'max-w-[90%]' : ''}`}>
      <div className={`mb-1.5 flex items-center gap-2 px-1 text-[11px] ${isRightSide ? 'justify-end' : ''} ${isSystem ? 'hidden' : ''}`}><strong className="font-semibold text-muted">{message.sender}</strong>{message.platform && <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${platformClass === 'instagram' ? 'bg-lilac/15 text-lilac' : platformClass === 'whatsapp' ? 'bg-sage/15 text-sage' : 'bg-soft text-muted'}`}>{message.platform}</span>}</div>
      <div className={`rounded-xl border px-3.5 py-3 shadow-[0_2px_8px_var(--shadow)] ${tone} ${isSystem ? 'rounded-lg text-center' : isRightSide ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}><p className={`m-0 whitespace-pre-wrap break-words text-[13px] leading-[1.65] ${isSystem ? 'text-muted' : 'text-ink'}`}>{message.message}</p><time className={`mt-2 block text-right text-[10px] text-muted/75 ${isSystem ? 'text-center' : ''}`} dateTime={new Date(message.timestamp).toISOString()}>{formatDate(message.timestamp)} <span className="px-0.5 text-muted/50">·</span> {formatTime(message.timestamp)}</time></div>
    </div>
    {isSystem && <span className="absolute left-1/2 -mt-1 -translate-x-1/2 text-[10px] text-terracotta/60">✳</span>}
  </article>
}

export default App

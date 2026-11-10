import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

type ChatMessage = {
  timestamp: number
  sender: string
  platform?: string
  message: string
}

const ROW_GAP = 12
const OVERSCAN = 8
type ThemePreference = 'system' | 'light' | 'dark'

function getSavedThemePreference(): ThemePreference {
  const saved = localStorage.getItem('keepsake-theme')
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)
    && typeof row.sender === 'string' && typeof row.message === 'string'
    && (row.platform === undefined || typeof row.platform === 'string')
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
  const [themePreference, setThemePreference] = useState<ThemePreference>(getSavedThemePreference)
  const [systemDarkMode, setSystemDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const darkMode = themePreference === 'system' ? systemDarkMode : themePreference === 'dark'
  const nextThemePreference: ThemePreference = themePreference === 'system' ? 'light' : themePreference === 'light' ? 'dark' : 'system'
  const themeLabel = themePreference === 'system' ? `System (${darkMode ? 'dark' : 'light'})` : themePreference === 'dark' ? 'Dark' : 'Light'
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sourceName, setSourceName] = useState('No archive selected')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [activePlatform, setActivePlatform] = useState('All platforms')
  const [activeSender, setActiveSender] = useState('All people')
  const [activeDate, setActiveDate] = useState('')
  const [containerWidth, setContainerWidth] = useState(900)
  const scrollRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dateFilterRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
  }, [darkMode])

  useEffect(() => {
    localStorage.setItem('keepsake-theme', themePreference)
  }, [themePreference])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = (event: MediaQueryListEvent) => setSystemDarkMode(event.matches)
    setSystemDarkMode(mediaQuery.matches)
    mediaQuery.addEventListener('change', updateSystemTheme)
    return () => mediaQuery.removeEventListener('change', updateSystemTheme)
  }, [])

  const loadRows = useCallback((rows: unknown, name: string) => {
    if (!Array.isArray(rows) || !rows.every(isChatMessage)) {
      setError('This file does not match the chat format. Expected an array of messages with timestamp, sender, and message fields.')
      return
    }
    setMessages(rows)
    setSourceName(name)
    setError('')
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

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
  const participants = useMemo(() => senders.filter((sender) => sender !== 'System'), [senders])
  const availablePlatforms = useMemo(() => [...new Set(messages.map((message) => message.platform).filter((platform): platform is string => Boolean(platform?.trim())))], [messages])
  const visibleMessages = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return messages.map((message, originalIndex) => ({ message, originalIndex }))
      .filter(({ message }) => (activePlatform === 'All platforms' || message.platform === activePlatform)
        && (activeSender === 'All people' || message.sender === activeSender)
        && (!normalizedQuery || `${message.sender} ${message.message} ${message.platform ?? ''}`.toLocaleLowerCase().includes(normalizedQuery)))
  }, [messages, activePlatform, activeSender, query])

  const virtualizer = useVirtualizer({
    count: visibleMessages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimateHeight(visibleMessages[index].message, containerWidth),
    getItemKey: (index) => {
      const { message, originalIndex } = visibleMessages[index]
      return `${originalIndex}-${message.timestamp}`
    },
    overscan: OVERSCAN,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [containerWidth, messages, virtualizer])

  useEffect(() => {
    if (!activeDate) return
    const targetIndex = visibleMessages.findIndex(({ message }) => localDateKey(message.timestamp) === activeDate)
    if (targetIndex < 0) return
    const frame = requestAnimationFrame(() => virtualizer.scrollToIndex(targetIndex, { align: 'start', behavior: 'smooth' }))
    return () => cancelAnimationFrame(frame)
  }, [activeDate, visibleMessages, virtualizer])

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

  const loadSample = async () => {
    try {
      const response = await fetch('/sample-conversations.json')
      if (!response.ok) throw new Error('Sample request failed')
      loadRows(await response.json(), 'Sample conversation')
    } catch {
      setError('Could not load the sample conversation. Please choose a chat file instead.')
    }
  }

  const unloadChat = () => {
    setMessages([])
    setSourceName('No archive selected')
    setError('')
    setQuery('')
    setActivePlatform('All platforms')
    setActiveSender('All people')
    setActiveDate('')
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const lastActivity = messages.length ? formatDate(messages[messages.length - 1].timestamp) : 'Waiting for your archive'

  return (
    <main id="top" className="min-h-screen bg-paper text-ink transition-colors duration-300">
      <input ref={fileInputRef} className="sr-only" type="file" accept=".json,application/json" onChange={handleFile} />
      <section className={`mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 lg:grid-cols-[minmax(230px,0.72fr)_minmax(0,2.8fr)] ${messages.length > 0 ? 'gap-0 px-0 py-0 lg:gap-10 lg:px-10 lg:py-7' : 'gap-7 px-4 py-5 sm:px-7 lg:gap-10 lg:px-10 lg:py-7'}`}>
        <aside className={`${messages.length > 0 ? 'hidden lg:flex' : 'flex'} flex-col px-1 sm:px-2 lg:min-h-[calc(100vh-56px)] lg:py-1`}>
          <div className="mb-8 flex items-center justify-between gap-3 lg:mb-16">
            <a className="inline-flex items-center gap-2.5 text-[19px] font-semibold tracking-[-0.06em] text-ink no-underline" href="#top" aria-label="Keepsake home">
              <span className="grid size-9 place-items-center rounded-xl bg-terracotta text-white shadow-sm"><svg className="size-5 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.3 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20Z" /></svg></span>
              <span>keepsake<span className="text-terracotta">.</span></span>
            </a>
            {messages.length > 0 && <button className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-xs font-semibold text-muted transition hover:border-terracotta/50 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={() => fileInputRef.current?.click()}><svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" /></svg>Open file</button>}
            <button className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta lg:hidden" onClick={() => setThemePreference(nextThemePreference)} aria-label={`Theme: ${themeLabel}. Switch to ${nextThemePreference} theme`} title={`Theme: ${themeLabel} · Click for ${nextThemePreference}`}>
              {darkMode ? <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg> : <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>}
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-terracotta"><span className="h-px w-6 bg-terracotta/60" />A little place for your words</div>
          <h1 className="mt-5 mb-3 font-serif text-[clamp(2.65rem,4vw,4rem)] leading-[1.03] tracking-[-.055em] text-ink">Some things<br />are worth <em className="font-medium text-terracotta">keeping.</em></h1>
          <p className="max-w-sm text-sm leading-7 text-muted">Your conversations, gathered in one quiet place. Pick a moment and take your time.</p>
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-line bg-surface/80 p-3.5 shadow-[0_8px_24px_var(--shadow)]">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft text-terracotta"><svg className="size-5 fill-none stroke-current stroke-[1.5]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5L13.5 3Z"/><path strokeLinecap="round" strokeLinejoin="round" d="M13 3v7h7M8 14h8M8 17h5"/></svg></span>
            <span className="min-w-0 flex-1"><strong className="block truncate text-xs font-semibold text-ink">{sourceName}</strong><span className="mt-1 block text-[11px] text-muted">{messages.length ? `${messages.length.toLocaleString()} messages loaded` : 'Choose a JSON file to begin'}</span></span>
            <span className="text-sm font-semibold text-sage">{messages.length ? '✓' : '·'}</span>
          </div>
          {messages.length > 0 && <button className="mt-3 self-start rounded-md px-1 py-1 text-[11px] font-semibold text-muted underline decoration-line underline-offset-4 transition hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={unloadChat}>Unload chat</button>}
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted"><span className="text-base text-terracotta">◷</span>Times shown in your local timezone</div>
          <div className="mt-8 flex items-center gap-2 lg:mt-auto lg:pt-12"><span className="text-xs text-sage">✳</span><span className="text-[9px] font-semibold tracking-[.16em] text-muted/70">MADE FOR THE MOMENTS IN BETWEEN</span></div>
        </aside>

        {messages.length > 0 && <section className="flex h-[100svh] min-h-0 flex-col overflow-hidden border-0 bg-surface lg:h-[min(790px,calc(100svh-56px))] lg:min-h-[580px] lg:rounded-2xl lg:border lg:border-line lg:shadow-[0_20px_60px_var(--shadow)]" aria-label="Conversation viewer">
          <div className="flex min-h-[82px] items-center justify-between gap-4 border-b border-line px-4 sm:px-7">
            <div className="flex min-w-0 items-center gap-3.5">
              {participants.length > 0 && <div className="flex shrink-0 pl-1">{participants.slice(0, 2).map((participant, index) => <span key={participant} title={participant} aria-label={participant} className={`grid size-9 place-items-center rounded-full border-2 border-surface text-xs font-semibold ${index % 2 ? 'bg-[#ded0e3] text-[#725f76] -ml-2' : 'bg-[#e8caba] text-[#765e51]'}`}>{participant.trim().slice(0, 1).toUpperCase() || '?'}</span>)}{participants.length > 2 && <span className="-ml-2 grid size-9 place-items-center rounded-full border-2 border-surface bg-soft text-[10px] font-semibold text-muted" title={`${participants.length - 2} more participants`}>+{participants.length - 2}</span>}</div>}
              <div className="min-w-0"><h2 className="truncate text-sm font-semibold tracking-tight text-ink">Your conversations</h2><p className="mt-1 truncate text-xs text-muted">{messages.length ? `${messages.length.toLocaleString()} messages · ${lastActivity}` : 'A collection of little moments'}</p></div>
            </div>
            {availablePlatforms.length > 0 && <div className="hidden shrink-0 items-center gap-4 text-[11px] text-muted sm:flex">{availablePlatforms.map((platform) => {
              const normalizedPlatform = platform.trim().toLocaleLowerCase()
              const markerColor = normalizedPlatform === 'whatsapp' ? 'bg-sage' : normalizedPlatform === 'instagram' ? 'bg-lilac' : normalizedPlatform === 'telegram' ? 'bg-telegram' : 'bg-muted'
              return <span key={platform} className="flex items-center gap-2"><i className={`size-2 rounded-full ${markerColor}`} />{platform}</span>
            })}</div>}
            <div className="flex shrink-0 items-center gap-2">
              <button className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-paper text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta lg:hidden" onClick={unloadChat} aria-label="Unload chat" title="Unload chat">
                <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m7 7 10 10M17 7 7 17" /></svg>
              </button>
            <button className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-paper text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta lg:hidden" onClick={() => fileInputRef.current?.click()} aria-label="Open another chat file" title="Open another chat file">
              <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" /></svg>
            </button>
            <button className="grid size-9 shrink-0 place-items-center rounded-full border border-line bg-paper text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={() => setThemePreference(nextThemePreference)} aria-label={`Theme: ${themeLabel}. Switch to ${nextThemePreference} theme`} title={`Theme: ${themeLabel} · Click for ${nextThemePreference}`}>
              {darkMode ? <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg> : <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>}
            </button>
            </div>
          </div>
          <div className="flex flex-col gap-2 border-b border-line bg-surface px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <label className="flex h-10 min-w-0 items-center gap-2.5 rounded-lg border border-line bg-paper px-3 text-muted transition focus-within:border-terracotta/60 focus-within:ring-2 focus-within:ring-terracotta/10 sm:w-[min(290px,42%)]"><svg className="size-4 shrink-0 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path strokeLinecap="round" d="m16 16 4 4"/></svg><input ref={searchRef} className="min-w-0 flex-1 border-0 bg-transparent text-xs text-ink outline-none placeholder:text-muted/70" aria-label="Search messages" placeholder="Find a message..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[10px] text-muted sm:block">⌘ K</kbd></label>
            <div className="grid grid-cols-3 gap-2">
              <label className="filter-control relative min-w-0">
                <select className="h-10 w-full appearance-none rounded-lg border border-line bg-paper py-0 pl-2 pr-8 text-[11px] text-muted outline-none focus:border-terracotta/60 focus:ring-2 focus:ring-terracotta/10 sm:pl-3 sm:text-xs" aria-label="Filter by platform" value={activePlatform} onChange={(event) => setActivePlatform(event.target.value)}><option>All platforms</option>{availablePlatforms.map((platform) => <option key={platform}>{platform}</option>)}</select>
                <svg className="filter-icon pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </label>
              <div className="filter-control relative min-w-0">
                <input ref={dateFilterRef} className="date-filter h-10 w-full rounded-lg border border-line bg-paper py-0 pl-2 pr-9 text-[11px] text-muted outline-none focus:border-terracotta/60 focus:ring-2 focus:ring-terracotta/10 sm:pl-3 sm:text-xs" aria-label="Jump to date" title="Jump to date" type="date" value={activeDate} onChange={(event) => setActiveDate(event.target.value)} />
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
          <div className="message-list min-h-0 flex-1 overflow-auto overscroll-contain" ref={scrollRef}>
            {visibleMessages.length > 0 ? <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const { message } = visibleMessages[virtualRow.index]
                return <MessageRow key={virtualRow.key} message={message} participants={participants} measureRef={virtualizer.measureElement} index={virtualRow.index} top={virtualRow.start} />
              })}
            </div> : <div className="flex min-h-full w-full flex-col items-center justify-center px-6 py-10 text-center">
              {messages.length ? <><span className="mb-4 grid size-12 place-items-center rounded-full bg-soft text-xl text-terracotta">⌕</span><h3 className="font-serif text-2xl text-ink">No messages found</h3><p className="mt-2 text-xs leading-6 text-muted">Try a different search or filter.</p><button className="mt-3 text-xs font-semibold text-terracotta underline decoration-terracotta/40 underline-offset-4" onClick={() => { setQuery(''); setActivePlatform('All platforms'); setActiveSender('All people'); setActiveDate('') }}>Clear filters</button></> : <div className="w-full max-w-md"><span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-soft text-xl text-terracotta">✳</span><h3 className="font-serif text-2xl text-ink">Your story starts here</h3><p className="mt-2 text-xs leading-6 text-muted">Choose a JSON file to browse your conversation. Your archive is read in this browser and is not uploaded.</p><button className="mt-4 inline-flex h-10 items-center gap-3 rounded-lg bg-terracotta px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={() => fileInputRef.current?.click()}>Choose a chat file <span>↗</span></button><div className="mt-6 rounded-xl border border-line bg-paper p-4 text-left"><h4 className="text-[10px] font-bold uppercase tracking-[.16em] text-terracotta">Expected JSON format</h4><p className="mt-2 text-[11px] leading-5 text-muted">Use an array of messages. Each needs a numeric <code className="font-mono text-ink">timestamp</code> in milliseconds since the Unix epoch, plus <code className="font-mono text-ink">sender</code> and <code className="font-mono text-ink">message</code> strings. For <code className="font-mono text-ink">platform</code>, use <code className="font-mono text-ink">"WhatsApp"</code>, <code className="font-mono text-ink">"Instagram"</code>, or <code className="font-mono text-ink">"Telegram"</code> for distinct colors (case-insensitive). Other or blank values use the default background.</p><pre className="mt-3 overflow-x-auto rounded-lg bg-soft p-3 font-mono text-[10px] leading-5 text-ink">{`[\n  {\n    "timestamp": 1735689600000,\n    "sender": "Jordan",\n    "platform": "WhatsApp",\n    "message": "Hello!"\n  }\n]`}</pre></div></div>}
            </div>}
          </div>
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-t border-line bg-surface px-3 text-[10px] text-muted sm:px-5 sm:text-[11px]"><span className="flex items-center gap-2"><i className="text-sm not-italic text-sage">⌑</i>A private little archive</span><span>{visibleMessages.length.toLocaleString()} {visibleMessages.length === 1 ? 'message' : 'messages'}<span className="mx-2 text-muted/50">·</span>Scroll to wander</span></div>
        </section>}
        {messages.length === 0 && <section className="flex min-h-[420px] flex-col lg:min-h-[calc(100svh-56px)]" aria-label="Get started">
          <div className="flex justify-end">
            <button className="hidden size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta lg:grid" onClick={() => setThemePreference(nextThemePreference)} aria-label={`Theme: ${themeLabel}. Switch to ${nextThemePreference} theme`} title={`Theme: ${themeLabel} · Click for ${nextThemePreference}`}>
              {darkMode ? <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg> : <svg className="size-4 fill-none stroke-current stroke-[1.7]" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z"/></svg>}
            </button>
          </div>
          <div className="flex flex-1 items-center justify-center py-8 lg:py-4">
            <div className="w-full max-w-xl">
              {error && <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200" role="alert">{error}</div>}
              <div className="mb-5 text-center"><span className="mx-auto mb-3 grid size-11 place-items-center rounded-full bg-soft text-xl text-terracotta">✳</span><h2 className="font-serif text-2xl text-ink">Your story starts here</h2><p className="mx-auto mt-2 max-w-md text-xs leading-6 text-muted">Choose a JSON file to browse your conversation. Your archive is read in this browser and is not uploaded.</p><div className="mt-4 flex flex-col items-center gap-2"><button className="inline-flex h-10 items-center gap-3 rounded-lg bg-terracotta px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={() => fileInputRef.current?.click()}>Choose a chat file <span>↗</span></button><button className="text-[11px] font-medium text-muted underline decoration-line underline-offset-4 transition hover:text-terracotta focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta" onClick={loadSample}>Or explore a sample conversation</button></div></div>
              <div className="rounded-xl border border-line bg-surface p-4 text-left shadow-[0_8px_24px_var(--shadow)]"><h3 className="text-[10px] font-bold uppercase tracking-[.16em] text-terracotta">Expected JSON format</h3><p className="mt-2 text-[11px] leading-5 text-muted">Use an array of messages. Each needs a numeric <code className="font-mono text-ink">timestamp</code> in milliseconds since the Unix epoch, plus <code className="font-mono text-ink">sender</code> and <code className="font-mono text-ink">message</code> strings. For <code className="font-mono text-ink">platform</code>, use <code className="font-mono text-ink">"WhatsApp"</code>, <code className="font-mono text-ink">"Instagram"</code>, or <code className="font-mono text-ink">"Telegram"</code> for distinct colors (case-insensitive). Other or blank values use the default background.</p><pre className="mt-3 overflow-x-auto rounded-lg bg-soft p-3 font-mono text-[10px] leading-5 text-ink">{`[\n  {\n    "timestamp": 1735689600000,\n    "sender": "Jordan",\n    "platform": "WhatsApp",\n    "message": "Hello!"\n  }\n]`}</pre></div>
            </div>
          </div>
        </section>}
      </section>
    </main>
  )
}

function MessageRow({ message, participants, measureRef, index, top }: { message: ChatMessage, participants: string[], measureRef: (node: HTMLDivElement | null) => void, index: number, top: number }) {
  const isSystem = message.sender === 'System'
  const normalizedPlatform = message.platform?.trim().toLocaleLowerCase()
  const platformClass = normalizedPlatform === 'instagram' ? 'instagram' : normalizedPlatform === 'whatsapp' ? 'whatsapp' : normalizedPlatform === 'telegram' ? 'telegram' : 'neutral'
  const participantIndex = participants.indexOf(message.sender)
  const isRightSide = participantIndex >= 0 && participantIndex % 2 === 1
  const senderAvatarTone = participantIndex % 2 ? 'bg-[#ded0e3] text-[#725f76]' : 'bg-[#e8caba] text-[#765e51]'
  const tone = platformClass === 'instagram' ? 'border-lilac/30 bg-lilac/5' : platformClass === 'whatsapp' ? 'border-sage/35 bg-sage/5' : platformClass === 'telegram' ? 'border-telegram/30 bg-telegram/5' : 'border-line bg-surface'
  return <article ref={measureRef} data-index={index} className={`absolute left-0 right-0 flex items-start gap-2.5 px-3 pb-3 sm:px-6 ${isRightSide ? 'flex-row-reverse justify-start' : ''} ${isSystem ? 'justify-center pt-2' : ''}`} style={{ transform: `translateY(${top}px)` }}>
    {!isSystem && <div className={`mt-5 grid size-7 shrink-0 place-items-center rounded-full text-[10px] font-bold ${senderAvatarTone}`}>{message.sender.trim().slice(0, 1).toUpperCase() || '?'}</div>}
    <div className={`min-w-0 max-w-[78%] ${isSystem ? 'max-w-[90%]' : ''}`}>
      <div className={`mb-1.5 flex items-center gap-2 px-1 text-[11px] ${isRightSide ? 'justify-end' : ''} ${isSystem ? 'hidden' : ''}`}><strong className="font-semibold text-muted">{message.sender}</strong>{message.platform?.trim() && <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${platformClass === 'instagram' ? 'bg-lilac/15 text-lilac' : platformClass === 'whatsapp' ? 'bg-sage/15 text-sage' : platformClass === 'telegram' ? 'bg-telegram/15 text-telegram' : 'bg-soft text-muted'}`}>{message.platform}</span>}</div>
      <div className={`rounded-xl border px-3.5 py-3 shadow-[0_2px_8px_var(--shadow)] ${tone} ${isSystem ? 'rounded-lg text-center' : isRightSide ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}><p className={`m-0 whitespace-pre-wrap break-words text-[13px] leading-[1.65] ${isSystem ? 'text-muted' : 'text-ink'}`}>{message.message}</p><time className={`mt-2 block text-right text-[10px] text-muted/75 ${isSystem ? 'text-center' : ''}`} dateTime={new Date(message.timestamp).toISOString()}>{formatDate(message.timestamp)} <span className="px-0.5 text-muted/50">·</span> {formatTime(message.timestamp)}</time></div>
    </div>
    {isSystem && <span className="absolute left-1/2 -mt-1 -translate-x-1/2 text-[10px] text-terracotta/60">✳</span>}
  </article>
}

export default App

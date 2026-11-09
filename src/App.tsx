import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, UIEvent } from 'react'
import './App.css'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    <main className="app-shell">
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={handleFile} />
      <section className="workspace" id="top">
        <aside className="intro-panel">
          <div className="side-masthead">
            <a className="brand" href="#top" aria-label="Keepsake home">
              <span className="brand-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 7.3 4.2 4.2 0 0 1 19.5 10C19.5 15.4 12 20 12 20Z" /></svg></span>
              <span>keepsake<span className="brand-period">.</span></span>
            </a>
            <button className="upload-button" onClick={() => fileInputRef.current?.click()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" /></svg><span>Open file</span></button>
          </div>
          <div className="eyebrow"><span className="eyebrow-line" />A little place for your words</div>
          <h1>Some things<br />are worth <em>keeping.</em></h1>
          <p className="intro-copy">Your conversations, gathered in one quiet place. Pick a moment and take your time.</p>
          <div className="file-card">
            <div className="file-card-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9.5L13.5 3Z"/><path d="M13 3v7h7M8 14h8M8 17h5"/></svg></div>
            <div className="file-card-text"><strong>{sourceName}</strong><span>{messages.length ? `${messages.length.toLocaleString()} messages loaded` : 'Your chat file lives here'}</span></div>
            <span className="file-check">{messages.length ? '✓' : '·'}</span>
          </div>
          <div className="timezone-note"><span className="clock-icon">◷</span>Times shown in your local timezone</div>
          <div className="side-footer"><span>MADE FOR THE MOMENTS IN BETWEEN</span><span>✳</span></div>
        </aside>

        <section className="chat-panel" aria-label="Conversation viewer">
          <div className="chat-header">
            <div className="chat-heading"><div className="avatar-stack"><span className="avatar avatar-one">J</span><span className="avatar avatar-two">S</span></div><div><h2>Your conversations</h2><p>{messages.length ? `${messages.length.toLocaleString()} messages · ${lastActivity}` : 'A collection of little moments'}</p></div></div>
            <div className="platform-legend"><span><i className="legend-dot whatsapp-dot" />WhatsApp</span><span><i className="legend-dot instagram-dot" />Instagram</span></div>
          </div>
          <div className="filterbar">
            <label className="searchbox"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4 4"/></svg><input ref={searchRef} aria-label="Search messages" placeholder="Find a message..." value={query} onChange={(event) => setQuery(event.target.value)} /><kbd>⌘ K</kbd></label>
            <div className="filter-selects">
              <select aria-label="Filter by platform" value={activePlatform} onChange={(event) => setActivePlatform(event.target.value)}><option>All platforms</option>{availablePlatforms.map((platform) => <option key={platform}>{platform}</option>)}</select>
              <input className="date-filter" aria-label="Filter by date" type="date" value={activeDate} onChange={(event) => setActiveDate(event.target.value)} />
              <select aria-label="Filter by person" value={activeSender} onChange={(event) => setActiveSender(event.target.value)}><option>All people</option>{senders.map((sender) => <option key={sender}>{sender}</option>)}</select>
            </div>
          </div>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className={`message-list ${messages.some((message) => message.platform === 'Instagram') ? 'has-instagram' : ''}`} ref={scrollRef} onScroll={handleScroll}>
            {visibleMessages.length > 0 ? <div className="virtual-space" style={{ height: offsets.total }}>
              {visibleMessages.slice(startIndex, endIndex).map(({ message, originalIndex }, index) => {
                const virtualIndex = startIndex + index
                return <MessageRow key={`${originalIndex}-${message.timestamp}`} message={message} top={offsets.positions[virtualIndex]} onMeasure={(height) => measureRow(originalIndex, height)} />
              })}
            </div> : <div className="empty-state">
              {messages.length ? <><span className="empty-flower">⌕</span><h3>No messages found</h3><p>Try a different search or filter.</p><button className="text-button" onClick={() => { setQuery(''); setActivePlatform('All platforms'); setActiveSender('All people'); setActiveDate('') }}>Clear filters</button></> : <><span className="empty-flower">✳</span><h3>Your story starts here</h3><p>Place your <code>chat.json</code> file in the project’s <code>public/</code> folder, then refresh.</p><p className="empty-alt">Or open a file from anywhere on your device.</p><button className="empty-upload" onClick={() => fileInputRef.current?.click()}>Choose chat.json <span>↗</span></button><div className="format-hint">A JSON array of messages · timestamps in milliseconds</div></>}
            </div>}
          </div>
          <div className="chat-footer"><span><i className="footer-lock">⌑</i> A private little archive</span><span>{visibleMessages.length.toLocaleString()} {visibleMessages.length === 1 ? 'message' : 'messages'}<span className="footer-separator">·</span>Scroll to wander</span></div>
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
  return <article ref={rowRef} className={`message-row ${platformClass} ${isSystem ? 'system-message' : ''} ${isRightSide ? 'right-side' : 'left-side'}`} style={{ top }}>
    {!isSystem && <div className={`sender-avatar ${message.sender.toLowerCase() === 'sushmita' ? 'sender-s' : 'sender-j'}`}>{message.sender.slice(0, 1).toUpperCase()}</div>}
    <div className="message-content">
      <div className="message-meta"><strong>{message.sender}</strong>{message.platform && <span className={`platform-pill ${platformClass}`}>{message.platform}</span>}</div>
      <div className="message-bubble"><p>{message.message}</p><time dateTime={new Date(message.timestamp).toISOString()}>{formatDate(message.timestamp)} <span>·</span> {formatTime(message.timestamp)}</time></div>
    </div>
    {isSystem && <span className="system-mark">✳</span>}
  </article>
}

export default App

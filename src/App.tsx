import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { dateLabel, findMemories, getJourney, getRecentMemories, youtubeThumbnail } from './lib/memory'
import type { Memory, Screen, Settings } from './types'

const defaults: Settings = { reducedMotion: false, notifications: false, excludedSites: [] }
const examples = ['The MrBeast video I watched yesterday', 'That hoodie from last week', 'The AI website Theo shared', 'The pizza recipe', 'The article about Chrome extensions']

function Arrow() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13m-5-5 5 5-5 5" /></svg> }
function Spark() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.65 6.35L20 10l-6.35 1.65L12 18l-1.65-6.35L4 10l6.35-1.65L12 2Z" /></svg> }
function Heart({ filled = false }: { filled?: boolean }) { return <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? 'fill-current' : ''}><path d="M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.8l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.4 1-1a5.5 5.5 0 0 0 0-7.8Z" /></svg> }

function openMemory(memory: Memory) {
  if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url: memory.url })
  else window.open(memory.url, '_blank', 'noopener,noreferrer')
}

function useLocalData() {
  const [settings, setSettings] = useState<Settings>(defaults)
  const [favorites, setFavorites] = useState<Memory[]>([])
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return
    chrome.storage.local.get(['settings', 'favorites']).then((saved: { settings?: Settings; favorites?: Memory[] }) => {
      setSettings({ ...defaults, ...(saved.settings ?? {}) })
      setFavorites(saved.favorites ?? [])
    })
  }, [])
  const saveSettings = (next: Settings) => { setSettings(next); if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.set({ settings: next }) }
  const saveFavorites = (next: Memory[]) => { setFavorites(next); if (typeof chrome !== 'undefined' && chrome.storage) chrome.storage.local.set({ favorites: next }) }
  return { settings, saveSettings, favorites, saveFavorites }
}

function Portal({ active, reduced }: { active: boolean; reduced: boolean }) {
  const dates = ['NOW', 'TODAY', 'YESTERDAY', 'MONDAY', 'LAST WEEK', 'JUL 22', 'JUL 15']
  return <AnimatePresence>{active && <motion.div className="portal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: .35 } }}>
    <div className="portal-noise" />
    <motion.div className="portal-copy" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .18 }}>
      <span className="eyebrow inverse"><i /> REWINDING YOUR TIMELINE</span>
      <div className="rewind-dates">{dates.map((date, index) => <motion.span key={date} initial={{ opacity: 0, y: -10 }} animate={{ opacity: [0, 1, 0], y: reduced ? 0 : [22, -52] }} transition={{ duration: .55, delay: .14 + index * .11 }}>{date}</motion.span>)}</div>
    </motion.div>
    <div className="portal-stage">
      {[0, 1, 2].map((ring) => <motion.div key={ring} className={`portal-ring ring-${ring}`} animate={reduced ? {} : { rotate: ring % 2 ? -360 : 360 }} transition={{ duration: 2.8 + ring, ease: 'linear', repeat: Infinity }} />)}
      <motion.div className="portal-core" initial={{ scale: .1, opacity: 0 }} animate={{ scale: [0.1, 1.18, 1], opacity: 1 }} transition={{ duration: .72, ease: [.16, 1, .3, 1] }} />
      {[...Array(18)].map((_, index) => <span key={index} className="particle" style={{ '--i': index } as React.CSSProperties} />)}
    </div>
    <motion.div className="found-copy" initial={{ opacity: 0, scale: .92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.08 }}><Spark /> Memory found</motion.div>
  </motion.div>}</AnimatePresence>
}

function Brand() { return <button className="brand" aria-label="Browser Time Travel home"><span className="brand-mark"><span /></span><span>Browser Time Travel</span></button> }

function Nav({ screen, setScreen }: { screen: Screen; setScreen: (screen: Screen) => void }) {
  return <header className="topbar"><Brand /><nav><button className={screen === 'favorites' ? 'active' : ''} onClick={() => setScreen('favorites')}>Memories</button><button className={screen === 'settings' ? 'active' : ''} onClick={() => setScreen('settings')}>Settings</button></nav><button className="privacy-pill" onClick={() => setScreen('settings')}><span /> Private by design</button></header>
}

function MemoryCard({ memory, compact = false, favorite, onFavorite, onJourney }: { memory: Memory; compact?: boolean; favorite?: boolean; onFavorite?: () => void; onJourney?: () => void }) {
  const thumb = youtubeThumbnail(memory.url)
  return <motion.article className={`memory-card ${compact ? 'compact' : ''}`} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .42 }}>
    {thumb ? <img className="video-thumb" src={thumb} alt="" /> : <div className="site-orb">{memory.domain.charAt(0).toUpperCase()}</div>}
    <div className="memory-text"><p className="memory-domain">{memory.domain} <span>·</span> {dateLabel(memory.lastVisitTime)}</p><h3>{memory.title}</h3></div>
    {!compact && <div className="card-actions"><button className="icon-button" onClick={onFavorite} title="Save memory"><Heart filled={favorite} /></button><button className="travel-icon" onClick={() => openMemory(memory)} title="Travel back"><Arrow /></button></div>}
    {compact && <button className="compact-open" onClick={() => openMemory(memory)}><Arrow /></button>}
    {onJourney && <button className="journey-link" onClick={onJourney}>View journey <Arrow /></button>}
  </motion.article>
}

function Home({ recent, onSearch, setScreen }: { recent: Memory[]; onSearch: (value: string) => void; setScreen: (screen: Screen) => void }) {
  const [query, setQuery] = useState('')
  const [example, setExample] = useState(0)
  useEffect(() => { const timer = window.setInterval(() => setExample((current) => (current + 1) % examples.length), 2800); return () => window.clearInterval(timer) }, [])
  const submit = (event: FormEvent) => { event.preventDefault(); if (query.trim()) onSearch(query.trim()) }
  return <main className="home-shell">
    <section className="hero">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .55 }} className="eyebrow"><i /> YOUR PERSONAL TIMELINE</motion.div>
      <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .08, duration: .65 }}>Where do you want<br />to go back to?</motion.h1>
      <motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .16, duration: .65 }}>Describe anything you remember seeing online.<br />Your browser remembers the rest.</motion.p>
      <motion.form className="search-box" onSubmit={submit} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .24, duration: .65 }}>
        <Spark /><div className="input-wrap"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={examples[example]} aria-label="Describe a memory" autoFocus /><span>Try a memory, a moment, a feeling…</span></div><button type="submit" disabled={!query.trim()}>Travel Back <Arrow /></button>
      </motion.form>
      <div className="suggestions"><span>Try:</span>{['yesterday', 'last week', 'before bed'].map((item) => <button key={item} onClick={() => { setQuery(item); onSearch(item) }}>{item}</button>)}</div>
    </section>
    <section className="recent-section"><div className="section-heading"><div><span className="eyebrow"><i /> RECENTLY ON YOUR TIMELINE</span><h2>Small moments, still here.</h2></div><button onClick={() => setScreen('favorites')}>Saved memories <Arrow /></button></div><div className="recent-grid">{recent.slice(0, 3).map((memory) => <MemoryCard key={memory.id} memory={memory} compact />)}</div></section>
  </main>
}

function Results({ query, results, favorites, onFavorite, onJourney, onHome }: { query: string; results: Memory[]; favorites: Memory[]; onFavorite: (memory: Memory) => void; onJourney: (memory: Memory) => void; onHome: () => void }) {
  if (!results.length) return <main className="state-shell"><div className="empty-orbit"><span /></div><span className="eyebrow"><i /> NO SIGNAL DETECTED</span><h1>The timeline went cold.</h1><p>Try fewer details, a different day, or a name you remember.</p><button className="secondary-button" onClick={onHome}>Try another memory</button></main>
  const [featured, ...alternatives] = results
  const thumb = youtubeThumbnail(featured.url)
  return <main className="results-shell"><button className="back-button" onClick={onHome}>← Back to the present</button><div className="results-intro"><span className="eyebrow success"><i /> MEMORY FOUND</span><h1>We found a way back.</h1><p>Here’s the closest moment to “{query}”.</p></div>
    <motion.section className="featured-card" initial={{ opacity: 0, scale: .96, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}>
      <div className="featured-image">{thumb ? <img src={thumb} alt="" /> : <div className="featured-orb">{featured.domain.charAt(0).toUpperCase()}</div>}<span className="time-chip">{dateLabel(featured.lastVisitTime)}</span></div>
      <div className="featured-content"><p className="memory-domain">{featured.domain}</p><h2>{featured.title}</h2><p className="feature-note">A page from your browsing timeline, ready when you are.</p><div className="feature-buttons"><button className="primary-button" onClick={() => openMemory(featured)}>Travel Back <Arrow /></button><button className="secondary-button" onClick={() => onJourney(featured)}>View journey</button><button className="icon-button favorite" onClick={() => onFavorite(featured)}><Heart filled={favorites.some((memory) => memory.url === featured.url)} /></button></div></div>
    </motion.section>
    {alternatives.length > 0 && <section className="alternatives"><div className="section-heading"><div><span className="eyebrow"><i /> OTHER POSSIBILITIES</span><h2>Nearby moments.</h2></div></div><div className="alt-list">{alternatives.map((memory) => <MemoryCard key={memory.id} memory={memory} favorite={favorites.some((item) => item.url === memory.url)} onFavorite={() => onFavorite(memory)} onJourney={() => onJourney(memory)} />)}</div></section>}
  </main>
}

function Journey({ anchor, items, onHome, onOpenAll }: { anchor: Memory | null; items: Memory[]; onHome: () => void; onOpenAll: () => void }) {
  return <main className="journey-shell"><button className="back-button" onClick={onHome}>← Back to results</button><section className="journey-header"><span className="eyebrow"><i /> A MOMENT IN CONTEXT</span><h1>The path you took.</h1><p>{anchor ? `Around ${dateLabel(anchor.lastVisitTime)}` : 'A quiet stretch of your timeline.'}</p><button className="secondary-button" onClick={onOpenAll}>Reopen this journey <Arrow /></button></section><section className="timeline">{items.map((memory, index) => <motion.div className="timeline-row" key={`${memory.id}-${index}`} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * .06 }}><div className="timeline-stem"><span />{index < items.length - 1 && <i />}</div><time>{new Date(memory.lastVisitTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><button className="journey-memory" onClick={() => openMemory(memory)}><div className="site-orb small">{memory.domain.charAt(0).toUpperCase()}</div><div><strong>{memory.title}</strong><span>{memory.domain}</span></div><Arrow /></button></motion.div>)}</section></main>
}

function Favorites({ favorites, onFavorite, onHome }: { favorites: Memory[]; onFavorite: (memory: Memory) => void; onHome: () => void }) {
  const [filter, setFilter] = useState('')
  const matches = favorites.filter((memory) => `${memory.title} ${memory.domain}`.toLowerCase().includes(filter.toLowerCase()))
  return <main className="favorites-shell"><button className="back-button" onClick={onHome}>← Back to the present</button><span className="eyebrow"><i /> YOUR SAVED MOMENTS</span><h1>Memories worth keeping.</h1><div className="favorite-search"><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search saved memories" /></div>{matches.length ? <div className="alt-list">{matches.map((memory) => <MemoryCard key={memory.id} memory={memory} favorite onFavorite={() => onFavorite(memory)} />)}</div> : <div className="empty-favorites"><Heart /><h2>{favorites.length ? 'No saved memory matches that.' : 'Nothing saved yet.'}</h2><p>When a page feels worth returning to, save it here.</p><button className="secondary-button" onClick={onHome}>Explore your timeline</button></div>}</main>
}

function Toggle({ active, onClick }: { active: boolean; onClick: () => void }) { return <button role="switch" aria-checked={active} className={`toggle ${active ? 'on' : ''}`} onClick={onClick}><span /></button> }
function SettingsPanel({ settings, saveSettings, onHome }: { settings: Settings; saveSettings: (settings: Settings) => void; onHome: () => void }) {
  const [site, setSite] = useState('')
  const addSite = () => { const cleaned = site.trim().replace(/^https?:\/\//, '').replace(/^www\./, ''); if (cleaned && !settings.excludedSites.includes(cleaned)) saveSettings({ ...settings, excludedSites: [...settings.excludedSites, cleaned] }); setSite('') }
  const clear = async () => { if (!window.confirm('Clear saved memories and settings from this device?')) return; if (typeof chrome !== 'undefined' && chrome.storage) await chrome.storage.local.clear(); window.location.reload() }
  return <main className="settings-shell"><button className="back-button" onClick={onHome}>← Back to the present</button><span className="eyebrow"><i /> YOUR CONTROLS</span><h1>Keep time your way.</h1><section className="settings-card"><div className="setting"><div><h3>Reduced motion</h3><p>Keep the experience calmer and skip the full rewind effect.</p></div><Toggle active={settings.reducedMotion} onClick={() => saveSettings({ ...settings, reducedMotion: !settings.reducedMotion })} /></div><div className="setting"><div><h3>Timeline ripples</h3><p>Occasional, playful reminders about a moment you may want to revisit.</p></div><Toggle active={settings.notifications} onClick={() => saveSettings({ ...settings, notifications: !settings.notifications })} /></div></section><section className="settings-card"><div className="setting-block"><h3>Excluded websites</h3><p>Pages from these sites won’t appear in searches or journeys.</p><form className="excluded-form" onSubmit={(event) => { event.preventDefault(); addSite() }}><input value={site} onChange={(event) => setSite(event.target.value)} placeholder="example.com" /><button className="secondary-button">Add</button></form><div className="site-tags">{settings.excludedSites.map((item) => <button key={item} onClick={() => saveSettings({ ...settings, excludedSites: settings.excludedSites.filter((siteName) => siteName !== item) })}>{item} ×</button>)}</div></div></section><section className="settings-card privacy-card"><div><h3>Private by design</h3><p>Your history stays in Chrome. Browser Time Travel does not use accounts, analytics, cloud sync, cookies, passwords, messages, or Incognito history.</p></div><button className="danger-button" onClick={clear}>Clear local data</button></section></main>
}

export default function App() {
  const { settings, saveSettings, favorites, saveFavorites } = useLocalData()
  const systemReduced = useReducedMotion()
  const reduced = Boolean(settings.reducedMotion || systemReduced)
  const [screen, setScreen] = useState<Screen>('home')
  const [recent, setRecent] = useState<Memory[]>([])
  const [results, setResults] = useState<Memory[]>([])
  const [query, setQuery] = useState('')
  const [traveling, setTraveling] = useState(false)
  const [anchor, setAnchor] = useState<Memory | null>(null)
  const [journey, setJourney] = useState<Memory[]>([])
  useEffect(() => { getRecentMemories(settings.excludedSites).then(setRecent).catch(() => setRecent([])) }, [settings.excludedSites])
  const toggleFavorite = (memory: Memory) => saveFavorites(favorites.some((item) => item.url === memory.url) ? favorites.filter((item) => item.url !== memory.url) : [memory, ...favorites])
  const search = async (value: string) => { setQuery(value); setTraveling(true); const resultPromise = findMemories(value, settings.excludedSites).catch(() => []); await Promise.all([resultPromise, new Promise((resolve) => window.setTimeout(resolve, reduced ? 400 : 1550))]); setResults(await resultPromise); setTraveling(false); setScreen('results') }
  const showJourney = async (memory: Memory) => { setAnchor(memory); setJourney(await getJourney(memory, settings.excludedSites)); setScreen('journey') }
  const home = () => setScreen('home')
  const content = useMemo(() => {
    if (screen === 'results') return <Results query={query} results={results} favorites={favorites} onFavorite={toggleFavorite} onJourney={showJourney} onHome={home} />
    if (screen === 'journey') return <Journey anchor={anchor} items={journey} onHome={() => setScreen('results')} onOpenAll={() => journey.forEach(openMemory)} />
    if (screen === 'favorites') return <Favorites favorites={favorites} onFavorite={toggleFavorite} onHome={home} />
    if (screen === 'settings') return <SettingsPanel settings={settings} saveSettings={saveSettings} onHome={home} />
    return <Home recent={recent} onSearch={search} setScreen={setScreen} />
  // Functions are intentionally recreated: this keeps storage-backed state current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, query, results, favorites, journey, anchor, recent, settings])
  return <div className="app-shell"><Nav screen={screen} setScreen={setScreen} /><AnimatePresence mode="wait"><motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .22 }}>{content}</motion.div></AnimatePresence><Portal active={traveling} reduced={reduced} /><footer>Browser Time Travel <span>·</span> Everything stays on this device.</footer></div>
}

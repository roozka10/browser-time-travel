import type { Memory, SearchWindow } from '../types'

const DAY = 86_400_000
const stopWords = new Set(['the', 'a', 'an', 'i', 'watched', 'watch', 'saw', 'seen', 'that', 'from', 'about', 'website', 'site', 'article', 'video', 'for', 'on', 'at', 'to', 'my'])

export const demoMemories: Memory[] = [
  { id: '1', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'The future of the internet is more human', domain: 'youtube.com', lastVisitTime: Date.now() - 82 * 60 * 1000, visitCount: 2 },
  { id: '2', url: 'https://www.notion.so/product', title: 'Notion — The connected workspace', domain: 'notion.so', lastVisitTime: Date.now() - DAY, visitCount: 1 },
  { id: '3', url: 'https://www.nytimes.com', title: 'The quiet art of a perfect morning', domain: 'nytimes.com', lastVisitTime: Date.now() - 3 * DAY, visitCount: 1 },
]

function atStart(date: Date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() }

export function parseMemoryQuery(query: string): { terms: string[]; window: SearchWindow } {
  const lower = query.toLowerCase()
  const now = new Date()
  let startTime = Date.now() - 180 * DAY
  let endTime = Date.now()
  let label: string | undefined
  let nighttimeOnly = false
  const today = atStart(now)

  if (/\btoday\b/.test(lower)) { startTime = today; label = 'today' }
  if (/\byesterday\b/.test(lower)) { startTime = today - DAY; endTime = today; label = 'yesterday' }
  if (/\bthis morning\b/.test(lower)) { startTime = today; endTime = Math.min(Date.now(), today + 12 * 60 * 60 * 1000); label = 'this morning' }
  if (/\bbefore bed\b|\btonight\b/.test(lower)) { startTime = Date.now() - 7 * DAY; nighttimeOnly = true; label = 'before bed' }
  if (/\blast week\b/.test(lower)) { startTime = today - 7 * DAY; endTime = today; label = 'last week' }

  const weekday = lower.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)?.[1]
  if (weekday) {
    const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const wanted = names.indexOf(weekday)
    const distance = (now.getDay() - wanted + 7) % 7 || 7
    startTime = today - distance * DAY
    endTime = startTime + DAY
    label = weekday
  }

  const terms = lower.replace(/\b(today|yesterday|this morning|before bed|tonight|last week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, ' ')
    .split(/[^a-z0-9]+/).filter((term) => term.length > 1 && !stopWords.has(term))
  return { terms, window: { startTime, endTime, nighttimeOnly, label } }
}

export function getDomain(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// Chrome may retain extension, chrome://, and internal pages in its history.
// They are not useful memories to reopen and should never enter the timeline.
function isWebMemory(url: string) {
  try {
    const protocol = new URL(url).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch { return false }
}

function matchesTerm(term: string, words: string[]) {
  return words.some((word) => {
    if (word.includes(term) || term.includes(word)) return true
    if (term.length < 4 || word.length < 4 || Math.abs(word.length - term.length) > 1) return false
    let differences = 0
    for (let index = 0; index < term.length; index += 1) if (term[index] !== word[index]) differences += 1
    return differences <= 1
  })
}

function matchedTerms(item: Memory, terms: string[]) {
  const haystack = `${item.title} ${item.domain} ${item.url}`.toLowerCase()
  const words = haystack.split(/[^a-z0-9]+/).filter(Boolean)
  return terms.filter((term) => matchesTerm(term, words))
}

function scoreItem(item: Memory, terms: string[], now = Date.now()) {
  const matching = matchedTerms(item, terms).length
  const title = item.title.toLowerCase()
  const titleMatches = terms.reduce((total, term) => total + (title.includes(term) ? 1 : 0), 0)
  const recency = Math.max(0, 1 - (now - item.lastVisitTime) / (30 * DAY))
  return matching * 28 + titleMatches * 16 + Math.min(item.visitCount, 12) * 2 + recency * 8
}

export async function findMemories(query: string, excludedSites: string[]): Promise<Memory[]> {
  const { terms, window } = parseMemoryQuery(query)
  if (typeof chrome === 'undefined' || !chrome.history) {
    return demoMemories.map((memory) => ({ ...memory, score: scoreItem(memory, terms) })).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }
  // Chrome's text query is fast but occasionally misses voice-transcribed
  // phrases. Fall back to a local ranking pass over recent history instead of
  // telling the user the timeline is cold.
  const strict: chrome.history.HistoryItem[] = terms.length
    ? await chrome.history.search({ text: terms.join(' '), startTime: window.startTime, endTime: window.endTime, maxResults: 120 })
    : []
  const raw: chrome.history.HistoryItem[] = strict.length
    ? strict
    : await chrome.history.search({ text: '', startTime: window.startTime, endTime: window.endTime, maxResults: 1000 })
  const memories = raw
    .filter((item) => item.url && item.title && item.lastVisitTime)
    .filter((item) => isWebMemory(item.url!))
    .filter((item) => !excludedSites.some((site) => getDomain(item.url!).includes(site.toLowerCase())))
    .filter((item) => !window.nighttimeOnly || (() => { const hour = new Date(item.lastVisitTime!).getHours(); return hour >= 20 || hour < 3 })())
    .map((item) => ({ id: item.id, url: item.url!, title: item.title!, domain: getDomain(item.url!), lastVisitTime: item.lastVisitTime!, visitCount: item.visitCount ?? 1 }))
    // A broad local fallback is useful for imperfect speech recognition, but
    // it must still match something the person actually said.
    .filter((item) => terms.length === 0 || matchedTerms(item, terms).length > 0)
    .map((item) => ({ ...item, score: scoreItem(item, terms) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.lastVisitTime - a.lastVisitTime)
  return memories.slice(0, 5)
}

export async function getRecentMemories(excludedSites: string[]): Promise<Memory[]> {
  if (typeof chrome === 'undefined' || !chrome.history) return demoMemories
  const raw: chrome.history.HistoryItem[] = await chrome.history.search({ text: '', startTime: Date.now() - 14 * DAY, maxResults: 6 })
  return raw.filter((item) => item.url && item.title && item.lastVisitTime)
    .filter((item) => isWebMemory(item.url!))
    .filter((item) => !excludedSites.some((site) => getDomain(item.url!).includes(site.toLowerCase())) )
    .map((item) => ({ id: item.id, url: item.url!, title: item.title!, domain: getDomain(item.url!), lastVisitTime: item.lastVisitTime!, visitCount: item.visitCount ?? 1 }))
}

export async function getJourney(anchor: Memory, excludedSites: string[]): Promise<Memory[]> {
  if (typeof chrome === 'undefined' || !chrome.history) return demoMemories
  // A history item represents a URL; visits lets us anchor the journey to the
  // exact viewing event when that URL was opened more than once.
  const visits: chrome.history.VisitItem[] = await chrome.history.getVisits({ url: anchor.url }).catch(() => [])
  const anchorTime = visits.reduce((closest, visit) => {
    if (!visit.visitTime || Math.abs(visit.visitTime - anchor.lastVisitTime) >= Math.abs(closest - anchor.lastVisitTime)) return closest
    return visit.visitTime
  }, anchor.lastVisitTime)
  const startTime = anchorTime - 50 * 60 * 1000
  const endTime = anchorTime + 50 * 60 * 1000
  const raw: chrome.history.HistoryItem[] = await chrome.history.search({ text: '', startTime, endTime, maxResults: 40 })
  const unique = new Map<string, Memory>()
  raw.forEach((item) => {
    if (!item.url || !item.title || !item.lastVisitTime || !isWebMemory(item.url) || excludedSites.some((site) => getDomain(item.url!).includes(site.toLowerCase()))) return
    const key = `${item.url}-${Math.floor(item.lastVisitTime / 300000)}`
    unique.set(key, { id: item.id, url: item.url, title: item.title, domain: getDomain(item.url), lastVisitTime: item.lastVisitTime, visitCount: item.visitCount ?? 1 })
  })
  return [...unique.values()].sort((a, b) => a.lastVisitTime - b.lastVisitTime).slice(0, 12)
}

export function dateLabel(timestamp: number) {
  const date = new Date(timestamp)
  const today = atStart(new Date())
  const day = atStart(date)
  const prefix = day === today ? 'Today' : day === today - DAY ? 'Yesterday' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${prefix} · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

export function youtubeThumbnail(url: string) {
  const id = url.match(/[?&]v=([^&]+)/)?.[1] ?? url.match(/youtu\.be\/([^?]+)/)?.[1]
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined
}

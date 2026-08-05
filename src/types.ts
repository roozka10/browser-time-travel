export type Screen = 'home' | 'results' | 'journey' | 'favorites' | 'settings'

export type Memory = {
  id: string
  url: string
  title: string
  domain: string
  lastVisitTime: number
  visitCount: number
  score?: number
}

export type Settings = {
  reducedMotion: boolean
  notifications: boolean
  excludedSites: string[]
}

export type SearchWindow = {
  startTime: number
  endTime: number
  nighttimeOnly?: boolean
  label?: string
}

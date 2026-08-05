import { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { findMemories } from './lib/memory'
import './voice.css'

type VoiceState = 'idle' | 'recording' | 'ready' | 'traveling' | 'found' | 'error'
type VoiceAction = { command: 'start' | 'finish'; id: number; createdAt?: number }
const isExtension = typeof chrome !== 'undefined' && Boolean(chrome.runtime)

function rewindLabel(timestamp: number) {
  const date = new Date(timestamp)
  const today = new Date()
  const dayStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const distance = (dayStart(today) - dayStart(date)) / 86_400_000
  const day = distance === 0 ? 'TODAY' : distance === 1 ? 'YESTERDAY' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
  return `${day} · ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toUpperCase()}`
}

function makeRewindFrames(from: number, to: number) {
  const points = [0, .015, .04, .09, .18, .34, .56, .78, 1]
  return [...new Set(points.map((point) => rewindLabel(from - (from - to) * point)))]
}

function setVoiceState(state: VoiceState) {
  if (isExtension) chrome.runtime.sendMessage({ type: 'VOICE_STATE', state })
}

function VoicePanel() {
  const recognition = useRef<SpeechRecognition | null>(null)
  const transcript = useRef('')
  const finalTranscript = useRef('')
  const transcriptCandidates = useRef<string[]>([])
  const shouldTravel = useRef(false)
  const isTraveling = useRef(false)
  const keepListening = useRef(false)
  const lastAction = useRef(0)
  const stateRef = useRef<VoiceState>('idle')
  const [state, setState] = useState<VoiceState>('idle')
  const [message, setMessage] = useState('Click the extension icon to start.')
  const [destinationTime, setDestinationTime] = useState<number | null>(null)
  const [rewindTime, setRewindTime] = useState('NOW')
  const [memoryLabel, setMemoryLabel] = useState('')
  const [hasConsent, setHasConsent] = useState(!isExtension)
  const setPhase = useCallback((next: VoiceState) => {
    stateRef.current = next
    setState(next)
    setVoiceState(next)
  }, [])

  const travel = useCallback(async () => {
    if (isTraveling.current) return
    const query = transcript.current.trim()
    if (!query) { setPhase('idle'); setMessage('I did not catch that. Try again.'); return }
    isTraveling.current = true
    let openedMemory = false
    setDestinationTime(null)
    setPhase('traveling'); setMessage(`Finding “${query}”…`)
    try {
      const saved = isExtension ? await chrome.storage.local.get('settings') : {}
      const settings = (saved.settings ?? {}) as { excludedSites?: string[] }
      // Compare the best few Chrome speech alternatives against the user's
      // real, local history and open only the highest-scoring page.
      const queries = [...new Set([query, ...transcriptCandidates.current].filter(Boolean))].slice(0, 2)
      const memories = (await Promise.all(queries.map((voiceQuery) => findMemories(voiceQuery, settings.excludedSites ?? []))))
        .flat().sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.lastVisitTime - a.lastVisitTime)
      if (!memories[0]) { setPhase('idle'); setMessage('No match yet. Say a site, title, or day.'); return }
      setDestinationTime(memories[0].lastVisitTime)
      setMemoryLabel(memories[0].title || query)
      setMessage('Memory found. Traveling back…')
      const frames = makeRewindFrames(Date.now(), memories[0].lastVisitTime)
      for (const frame of frames) {
        setRewindTime(frame)
        await new Promise((resolve) => window.setTimeout(resolve, 150))
      }
      if (isExtension) await chrome.tabs.create({ url: memories[0].url })
      else window.open(memories[0].url, '_blank', 'noopener,noreferrer')
      openedMemory = true
    } catch {
      setMessage('Could not search your history. Try again.')
    } finally {
      transcript.current = ''
      finalTranscript.current = ''
      transcriptCandidates.current = []
      shouldTravel.current = false
      isTraveling.current = false
      setPhase(openedMemory ? 'found' : 'idle')
    }
  }, [setPhase])

  const finish = useCallback(() => {
    if (stateRef.current !== 'recording' && stateRef.current !== 'ready') return
    shouldTravel.current = true
    keepListening.current = false
    if (recognition.current && stateRef.current === 'recording') {
      recognition.current.stop()
      setMessage('One moment…')
    } else {
      void travel()
    }
  }, [travel])

  const start = useCallback(() => {
    if (stateRef.current === 'recording') return
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) { setPhase('error'); setMessage('Voice recognition is not available in this Chrome profile.'); return }
    transcript.current = ''
    finalTranscript.current = ''
    transcriptCandidates.current = []
    setMemoryLabel('')
    setDestinationTime(null)
    shouldTravel.current = false
    keepListening.current = true
    const next = new Recognition()
    next.continuous = true
    next.interimResults = true
    next.maxAlternatives = 3
    next.lang = navigator.language || 'en-US'
    next.onresult = (event) => {
      let latestFinal = ''
      let interim = ''
      // Chrome sends results in parts. Retain every final segment so a phrase
      // such as “that MrBeast video from yesterday” is never replaced by its
      // final word or two.
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const words = event.results[index][0].transcript.trim()
        if (!words) continue
        if (event.results[index].isFinal) {
          latestFinal += `${words} `
          for (let alternative = 0; alternative < event.results[index].length; alternative += 1) {
            const option = event.results[index][alternative].transcript.trim()
            if (option) transcriptCandidates.current.push(`${finalTranscript.current} ${option}`.trim())
          }
        }
        else interim += `${words} `
      }
      if (latestFinal) finalTranscript.current = `${finalTranscript.current} ${latestFinal}`.trim()
      transcript.current = `${finalTranscript.current} ${interim}`.trim()
      if (transcript.current) setMessage(`“${transcript.current}”`)
    }
    next.onend = () => {
      recognition.current = null
      if (shouldTravel.current) { void travel(); return }
      // Chrome's recognizer can stop after a brief pause even with
      // `continuous` enabled. Restart it until the user clicks the icon again.
      if (keepListening.current) {
        window.setTimeout(() => {
          if (!keepListening.current || shouldTravel.current) return
          try { next.start(); recognition.current = next } catch { /* Chrome is already restarting. */ }
        }, 140)
        return
      }
      if (transcript.current) { setPhase('ready'); setMessage(`“${transcript.current}”\nClick the icon again to travel.`) }
      else { setPhase('idle'); setMessage('I did not catch that. Click the icon to try again.') }
    }
    next.onerror = (event) => {
      if (event.error === 'not-allowed') { keepListening.current = false; setPhase('error'); setMessage('Allow microphone access, then click the icon again.') }
      else if (event.error !== 'aborted') setMessage('Still listening…')
    }
    recognition.current = next
    try {
      next.start()
      setPhase('recording'); setMessage('Listening… say the moment you remember.')
    } catch { setPhase('idle'); setMessage('Click the icon to start.') }
  }, [setPhase, travel])

  const handleAction = useCallback((action: VoiceAction | null) => {
    if (!action || action.id === lastAction.current) return
    if (action.createdAt && Date.now() - action.createdAt > 10_000) return
    lastAction.current = action.id
    if (!hasConsent) return
    if (action.command === 'start') start()
    else finish()
  }, [finish, hasConsent, start])

  useEffect(() => {
    if (!isExtension) return
    chrome.storage.local.get('privacyConsent').then(({ privacyConsent }) => setHasConsent(privacyConsent === true))
    const listener = (message: { type?: string; action?: VoiceAction }) => {
      if (message.type !== 'VOICE_ACTION') return
      chrome.storage.session.remove('voiceAction')
      handleAction(message.action ?? null)
    }
    chrome.runtime.onMessage.addListener(listener)
    chrome.runtime.sendMessage({ type: 'GET_VOICE_ACTION' }, handleAction)
    return () => {
      chrome.runtime.onMessage.removeListener(listener)
      keepListening.current = false
      recognition.current?.stop()
      setVoiceState('idle')
    }
  }, [handleAction])

  const acceptConsent = async () => {
    if (isExtension) await chrome.storage.local.set({ privacyConsent: true })
    setHasConsent(true)
    window.setTimeout(start, 0)
  }

  if (!hasConsent) return <main className="voice-panel consent-panel">
    <header><span className="voice-logo"><i /></span><strong>Browser Time Travel</strong></header>
    <section className="consent-card"><span className="consent-dot" /><h1>Your timeline stays yours.</h1><p>To find spoken memories, Browser Time Travel reads your local Chrome history only when you ask. Chrome voice recognition processes your microphone input. We do not store, sell, or upload your browsing history.</p><button onClick={acceptConsent}>Continue privately</button><a href="privacy.html" target="_blank">Privacy policy</a></section>
  </main>

  return <main className="voice-panel">
    <header><span className="voice-logo"><i /></span><strong>Browser Time Travel</strong></header>
    <section className="voice-center">
      {(state === 'traveling' || state === 'found') && <p className="travel-memory" title={memoryLabel}>{memoryLabel}</p>}
      <button className={`record-orb ${state}`} onClick={() => state === 'recording' || state === 'ready' ? finish() : start()} aria-label={state === 'recording' ? 'Stop recording' : 'Start recording'}><span /><i /><i /><i /></button>
      {state === 'traveling' || state === 'found'
        ? <><p className="travel-found">Memory found. Traveling back…</p><div className="time-rewind numeric travel-time"><span>REWINDING</span><strong key={rewindTime}>{destinationTime ? rewindTime : 'SEARCHING…'}</strong></div></>
        : <><p className="voice-status">{state === 'recording' ? 'Listening' : state === 'ready' ? 'Ready to travel' : 'Browser Time Travel'}</p><h1>{message}</h1></>}
    </section>
    <footer>Click the toolbar icon again when you’re done speaking.</footer>
  </main>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<VoicePanel />)

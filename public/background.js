async function queueVoiceAction(command) {
  const action = { command, id: Date.now(), createdAt: Date.now() }
  await chrome.storage.session.set({ voiceAction: action })
  // The panel may still be mounting on the first click, so it also reads this
  // command from session storage when it becomes ready.
  chrome.runtime.sendMessage({ type: 'VOICE_ACTION', action }).catch(() => {})
}

function setRecordingBadge(recording) {
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })
  chrome.action.setBadgeText({ text: recording ? '•' : '' })
}

chrome.action.onClicked.addListener((tab) => {
  // This must happen immediately inside the click handler. Awaiting storage
  // first drops Chrome's user-gesture signal and prevents the panel opening.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {})
  void (async () => {
    const { voiceState = 'idle', voiceStateUpdatedAt = 0 } = await chrome.storage.session.get(['voiceState', 'voiceStateUpdatedAt'])
    // Only a current microphone session may be finished. Any older panel
    // state starts a clean transcript instead of reusing an old search.
    const isLiveRecording = voiceState === 'recording' && Date.now() - voiceStateUpdatedAt < 5 * 60_000
    const command = isLiveRecording ? 'finish' : 'start'
    setRecordingBadge(command === 'start')
    await queueVoiceAction(command)
  })()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'VOICE_STATE') {
    chrome.storage.session.set({ voiceState: message.state, voiceStateUpdatedAt: Date.now() })
    setRecordingBadge(message.state === 'recording')
    return
  }
  if (message.type === 'GET_VOICE_ACTION') {
    chrome.storage.session.get('voiceAction').then(({ voiceAction }) => {
      chrome.storage.session.remove('voiceAction')
      const isFresh = voiceAction && Date.now() - (voiceAction.createdAt ?? 0) < 10_000
      sendResponse(isFresh ? voiceAction : null)
    })
    return true
  }
})

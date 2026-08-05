# Browser Time Travel

A local-first Chrome extension that helps people return to moments they remember—not URLs they can recite.

## Install in Chrome

1. Run `npm install` and `npm run build` from this folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the generated `dist` folder.
5. Pin **Browser Time Travel** and click its toolbar icon to open the voice-first Chrome Side Panel.

Click the icon once to record a memory and again to travel to the best matching page. Choosing travel opens the remembered page in a normal browser tab.

## Privacy

The extension only reads Chrome history to perform a search or construct a local journey. Favorites and preferences stay in `chrome.storage.local`. It has no backend, accounts, analytics, cookies, password access, message access, or Incognito-history access.

## Development

Run `npm run dev` to preview the interface in a normal browser. The preview displays safe sample memories because Chrome extension APIs are unavailable outside an installed extension.

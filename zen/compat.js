// Firefox/Zen exposes the standards-based browser namespace. Chromium uses chrome.
globalThis.LumenAPI = globalThis.browser ?? globalThis.chrome;

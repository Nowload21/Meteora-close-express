// Runs in the ISOLATED world. Its only job is to bridge chrome.storage to the
// MAIN-world script (which cannot access chrome.* APIs).

import { DEFAULT_SETTINGS, STORAGE_KEY, type Settings } from "./settings";

const SRC = "mx";
const SRC_BRIDGE = "mx-bridge";

async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] ?? {}) };
}

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== SRC) return;

  if (msg.type === "get-settings") {
    const settings = await loadSettings();
    window.postMessage({ source: SRC_BRIDGE, type: "settings", reqId: msg.reqId, payload: settings }, "*");
  }

  if (msg.type === "set-settings") {
    const current = await loadSettings();
    const next = { ...current, ...msg.payload };
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    window.postMessage({ source: SRC_BRIDGE, type: "settings", reqId: msg.reqId, payload: next }, "*");
  }

  // Relay a cross-origin fetch (e.g. Jupiter API) to the background worker,
  // which is not subject to the page's CSP / CORS / ad-block.
  if (msg.type === "mx-fetch") {
    chrome.runtime.sendMessage({ type: "mx-fetch", url: msg.url, init: msg.init }, (result) => {
      window.postMessage(
        {
          source: SRC_BRIDGE,
          type: "mx-fetch-result",
          reqId: msg.reqId,
          payload: chrome.runtime.lastError
            ? { ok: false, status: 0, error: chrome.runtime.lastError.message }
            : result,
        },
        "*"
      );
    });
  }
});

// Push updates if settings change from the popup while a Meteora tab is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) {
    window.postMessage(
      { source: SRC_BRIDGE, type: "settings", payload: { ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue } },
      "*"
    );
  }
});

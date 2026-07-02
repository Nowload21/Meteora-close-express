// Background service worker. Its job: perform cross-origin fetches (Jupiter API)
// on behalf of the MAIN-world script. Running here bypasses the page's CSP,
// CORS, and any page-level ad-block rules that block quote-api.jup.ag when the
// request originates from app.meteora.ag's own context.

interface MxFetchMsg {
  type: "mx-fetch";
  url: string;
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
}

interface MxFetchResult {
  ok: boolean;
  status: number;
  body?: string;
  error?: string;
}

chrome.runtime.onMessage.addListener((msg: MxFetchMsg, _sender, sendResponse) => {
  if (msg?.type !== "mx-fetch") return;
  (async () => {
    try {
      const res = await fetch(msg.url, msg.init);
      const body = await res.text();
      sendResponse({ ok: res.ok, status: res.status, body } satisfies MxFetchResult);
    } catch (e) {
      sendResponse({
        ok: false,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      } satisfies MxFetchResult);
    }
  })();
  return true; // keep the message channel open for the async sendResponse
});

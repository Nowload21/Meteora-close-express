# ⚡ Meteora Express — Close & Swap

> Close a Meteora **DLMM** position and swap the proceeds to **SOL** or **USDC** in a single click — as fast as possible.

![Chrome](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)
![Solana](https://img.shields.io/badge/Solana-Meteora%20DLMM-14F195?logo=solana&logoColor=white)
![Jupiter](https://img.shields.io/badge/Swaps-Jupiter-FBA43A)
![License](https://img.shields.io/badge/License-MIT-green)

A floating **⚡ Close & Swap** button appears at the bottom of every `app.meteora.ag` page. It reads the position from the page you're on, removes 100% of the liquidity, claims fees, closes the position, and routes the released tokens through Jupiter to the currency you picked — all signed by **your own wallet** (Solflare / Jupiter). The extension never holds your keys.

> [!IMPORTANT]
> **Clicking Close & Swap closes *all* of your open positions on that pool — not just one.**
> If you hold several positions in the same pool, one click removes 100% liquidity, claims fees and closes **every one of them**, then swaps the combined proceeds to your target. It cannot close a single position on its own, because the page URL identifies the **pool**, not an individual position.
>
> This is intentional for a fast, full exit. A per-position picker (choose which positions to close) may be added **based on user feedback** — if you need it, please [open an issue](https://github.com/Nowload21/meteora-close-express/issues).

---

## Features

- **One click** — close + swap chained automatically, no back-and-forth.
- **Reads the position from the page** — no copy-pasting pool or position addresses.
- **Swap target selector** — SOL or USDC, right next to the button, remembered across sessions.
- **Fast by design** — high priority fees, skip-preflight, and requests routed to your own RPC.
- **Token-2022 ready** — handles the newer memecoin token standard.
- **Honest status** — verifies each transaction on-chain and shows the amount received + total time (e.g. `≈ +12.3456 SOL in 8.2s`).
- **Settings sync** — your config replicates across computers via your Chrome profile.

---

## Installation

### Option A — Download & load (easiest, no tools needed)

1. Go to the [**Releases**](https://github.com/Nowload21/meteora-close-express/releases) page and download the latest `meteora-close-express.zip`.
2. Unzip it — you get a folder named `meteora-close-express`.
3. Open `chrome://extensions` and turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select that folder. Done — the ⚡ icon appears in your toolbar.

### Option B — Build from source

Requires [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/Nowload21/meteora-close-express.git
cd meteora-close-express
npm install
npm run build        # outputs dist/
```

Then in `chrome://extensions` → **Developer mode** → **Load unpacked** → select the **`dist/`** folder.

> A pre-built `dist/` is also committed to the repo, so Option B works even without running the build.

---

## Get a free Helius RPC (beginners — do this, it really matters)

The extension talks to Solana through an **RPC endpoint**. The default public one is slow and rate-limited, which makes the swap step drag. A free **Helius** endpoint makes everything land in 1–2 seconds instead of 10–40. Two minutes:

1. Go to **https://helius.dev** → **Sign up** (free).
2. On the **Dashboard**, your API key is created automatically. Find your **Mainnet RPC URL**, which looks like:
   `https://mainnet.helius-rpc.com/?api-key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
3. Click **Copy** on that URL (it already contains your key).
4. Open the extension (toolbar ⚡ icon → **settings**), paste it into **RPC endpoint**, and **Save**.

Keep this URL private — anyone with it can spend your request quota (but they **cannot** touch your funds; your wallet keys are never involved).

---

## Recommended settings

A solid starting point. **Adapt to your own risk/speed preference** — this is not one-size-fits-all.

| Setting | Recommended | When to change |
|---|---|---|
| **RPC endpoint** | Your Helius URL | The single biggest speed factor. Always use a private RPC. |
| **Default consolidation** | `SOL` | Pick `USDC` to exit to a stablecoin. Also switchable live next to the button. |
| **Slippage** | `2 %` | Volatile/illiquid memecoins may need 3–5%; blue-chips can go 0.5–1%. Too low → the swap can fail when price moves. |
| **Priority fee** | `Very High` | Lower it (`High`/`Medium`) on calm days to save on fees. |
| **Priority fee cap (SOL)** | `0.008` | Safety ceiling on the validator tip. `0.002` is fine most days; raise it during congestion. |
| **Skip preflight** | `ON` | Faster. Turn **OFF** to debug a failing swap. |

Settings are stored with `chrome.storage.sync`, so the same Chrome profile on multiple computers replicates them automatically.

---

## Usage

1. Open one of your DLMM positions on `app.meteora.ag/dlmm/<pool>`.
2. Choose the target in the selector next to the button (`→ SOL` / `→ USDC`).
3. Click **⚡ Close & Swap**.
4. Watch the status: `Closing…` → `Waiting for released tokens…` → `Building swaps…` → `Signing…` → `≈ +<amount> <target> in <time>s`.

> ⚠️ Have several positions on this pool? All of them are closed in one go (the status shows `Closing N position(s)…`). See the note at the top of this README.

---

## How it works

```
 Meteora page (MAIN world)                Extension background
 ┌───────────────────────────┐           ┌──────────────────────┐
 │ ⚡ button + DLMM SDK       │  fetch    │ Jupiter API proxy     │
 │ + wallet (Solflare/Jup)   │──────────▶│ (bypasses page CSP,   │
 │                           │◀──────────│  CORS & ad-block)     │
 └───────────┬───────────────┘           └──────────────────────┘
             │ signAllTransactions + send via your RPC
             ▼
    Solana: removeLiquidity (+claim +close)  →  Jupiter swap → SOL/USDC
```

1. Detect the pool from the URL and load all your positions via the Meteora DLMM SDK.
2. Build `removeLiquidity` (100% + claim + close) with a priority fee; sign and send via your RPC.
3. Poll until the released tokens show up, then quote + build a Jupiter swap for every non-target token.
4. Sign and send the swaps; verify each transaction's real on-chain status before reporting success.

---

## Auto-approve (going fully click-free)

A browser extension **cannot** click another wallet's confirmation popup — Solflare/Jupiter run in their own `chrome-extension://` context, out of reach. To make the flow require **no clicks**: enable **Auto-Approve** in Solflare (Settings → *Auto-Approve*) or the Jupiter equivalent for `app.meteora.ag` at the start of your session. The extension calls `signAllTransactions`; with Auto-Approve on, nothing blocks. Without it, you simply confirm 2 popups (close, then swap). Only enable it on `app.meteora.ag`, and turn it off when done.

---

## APIs used

- **Meteora DLMM SDK** (`@meteora-ag/dlmm`) — read positions, build close transactions.
- **Jupiter** (`lite-api.jup.ag/swap/v1`) — quote + build the swap transaction.
- **Your Solana RPC** — sending and confirming transactions (Helius recommended).

---

## Known limitations

- **Wallet must be already connected** to the site. Detection order: `window.solflare`, `window.jupiter`, `window.solana`.
- The amount shown is Jupiter's **estimated** output (hence `≈`); the executed amount can vary slightly with slippage.
- Public RPCs can lag on the post-close balance read (the extension waits up to ~45s). Helius removes this.

### Native-SOL coverage (which pool + target combos are fully handled)

When a position closes you get **both** pool tokens back. The extension swaps every **SPL token** that isn't your target — but the **SOL side of a pool comes back as native SOL** (not a swappable token), so it is never re-swapped.

| Pool | Target | Result | Fully covered? |
|---|---|---|---|
| `TOKEN/SOL` | **SOL** | TOKEN → SOL; the SOL stays SOL | ✅ Yes — you wanted SOL |
| `TOKEN/SOL` | **USDC** | TOKEN → USDC, **but the SOL stays SOL** | ⚠️ No — you end up with USDC **+** leftover SOL |
| `TOKEN/USDC` | SOL or USDC | works normally | ✅ Yes |
| `TOKEN/TOKEN` | SOL or USDC | works normally | ✅ Yes |

**Takeaway:** the only partial case is a pool containing SOL **when you pick USDC as the target**. For `X/SOL` pools, choose **SOL** (or swap the leftover SOL manually afterwards).

---

## Security — verify it yourself

- The extension holds **no keys** — your own wallet signs every transaction.
- **No secrets in the repo.** Your RPC URL and settings live only in your browser's local storage, never in the code.
- Every transaction's real on-chain status is checked before the UI reports success.
- The priority-fee cap bounds how much you can ever overpay in fees.
- All source is here and readable: `src/` (TypeScript) is bundled into `dist/` by `build.mjs`.

---

## Project structure

```
public/manifest.json      MV3 manifest (MAIN + ISOLATED content scripts + background)
public/icons/             extension icons (16/48/128)
public/popup.html         settings page
src/main-world.ts         MAIN world: button + DLMM + Jupiter + wallet
src/ui.ts                 floating button (shadow DOM)
src/content-bridge.ts     ISOLATED world: chrome.storage + fetch relay
src/background.ts         service worker: cross-origin fetch proxy
src/popup.ts              settings logic
src/settings.ts           shared schema + defaults
build.mjs                 esbuild bundling + node polyfills
```

---

## License

[MIT](LICENSE) © 2026 Nowload21

*Not affiliated with Meteora, Jupiter, Helius or Solflare. Use at your own risk.*

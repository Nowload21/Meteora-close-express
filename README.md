# ⚡ Meteora Express — Close & Swap

A Chrome extension that **closes a Meteora DLMM position and swaps the proceeds to SOL or USDC in one click**, as fast as possible. A floating button appears at the bottom of any `app.meteora.ag` page.

It reads the position straight from the page you're on, closes it (removes 100% liquidity + claims fees + closes the position) and routes the released tokens through **Jupiter** to the currency you picked — all signed by your own wallet (Solflare / Jupiter).

---

## What it does, in one pass

1. Detects the pool from the URL `app.meteora.ag/dlmm/<pool>`.
2. Fetches **all your positions** on that pool via the Meteora DLMM SDK.
3. Builds the `removeLiquidity` transactions (100%, **claim fees + close** the position), with a high priority fee.
4. Signs everything at once and sends it through **your RPC** (skip-preflight by default for speed).
5. Waits for the released tokens to land, then **swaps every non-target token to your target** (SOL or USDC) via Jupiter.
6. Shows the amount received and the total time on the button bar, e.g. `≈ +12.3456 SOL in 8.2s`.

---

## Install

You need [Node.js](https://nodejs.org) (v18+) installed.

```bash
git clone https://github.com/<your-username>/meteora-close-express.git
cd meteora-close-express
npm install
npm run build      # produces dist/  (use `npm run watch` while developing)
```

Then load it into Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the **`dist/`** folder inside the project

A card named **⚡ Meteora Express — Close & Swap** appears. Done.

> A pre-built `dist/` is committed to the repo, so if you don't want to build it yourself you can just download the repo and load the `dist/` folder directly.

---

## Get a free Helius RPC (beginners — do this, it matters a lot)

The extension talks to the Solana blockchain through an **RPC endpoint**. The default public one is slow and rate-limited, which makes the "wait for tokens" step drag on. A private **Helius** endpoint is free and makes everything land in 1–2 seconds instead of 10–40. Setup takes two minutes:

1. Go to **https://helius.dev** and click **Sign up** (free, email or Google).
2. Once logged in, you land on the **Dashboard**. Your first API key is created automatically — look for a line like:
   `https://mainnet.helius-rpc.com/?api-key=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
3. Click **Copy** on that **Mainnet RPC URL** (it already contains your key).
4. Open the extension (puzzle icon 🧩 in Chrome → pin **Meteora Express** → click it).
5. Paste the URL into the **RPC endpoint** field and click **Save**.

That's it. Keep this URL private — anyone with it can send requests on your quota (but they **cannot** touch your funds; your wallet keys are never involved).

---

## Recommended settings

These are a solid starting point. **Adapt them to your own risk/speed preference** — they are not one-size-fits-all.

| Setting | Recommended | Why / when to change |
|---|---|---|
| **RPC endpoint** | Your Helius URL | The single biggest speed factor. Always use a private RPC. |
| **Default consolidation** | `SOL` | Pick `USDC` if you'd rather exit to a stablecoin. Also switchable live via the selector next to the button. |
| **Slippage** | `2 %` | Price tolerance on the swap. Volatile/illiquid memecoins may need more (3–5%); blue-chips can go lower (0.5–1%). Too low → the swap can fail when price moves. |
| **Priority fee** | `Very High` | How aggressively you tip validators to land fast. Lower it (`High`/`Medium`) on calm days to save fees. |
| **Priority fee cap (SOL)** | `0.008` | Hard ceiling on that tip, for safety. `0.002` is fine most days; raise it when the network is congested and you *must* get out. |
| **Skip preflight** | `ON` | Faster (skips a simulation). Turn it **OFF** if you want to debug a failing transaction (a failed tx still costs fees on-chain when skip-preflight is on). |

> Settings are stored with `chrome.storage.sync`, so if you use the same Chrome profile on several computers they replicate automatically.

---

## Auto-approve (going fully click-free)

A browser extension **cannot** click another wallet's confirmation popup (Solflare/Jupiter run in their own `chrome-extension://` context, out of reach). To make the flow require **no clicks**:

1. Enable **Auto-Approve** in **Solflare** (Settings → *Auto-Approve* / trusted session) or the Jupiter equivalent, for `app.meteora.ag`, at the start of your session.
2. The extension calls `signAllTransactions`; with Auto-Approve on, nothing blocks and close + swap chain automatically.

Without Auto-Approve everything still works — you'll just confirm 2 popups (the close, then the swap). Only enable Auto-Approve on `app.meteora.ag`, and turn it off when you're done.

---

## How to use it

1. Open one of your DLMM positions on `app.meteora.ag/dlmm/<pool>`.
2. Pick the target currency in the selector next to the button (`→ SOL` / `→ USDC`).
3. Click **⚡ Close & Swap**.
4. Watch the status: `Closing…` → `Waiting for released tokens…` → `Building swaps…` → `Signing…` → `≈ +<amount> <target> in <time>s`.

---

## Known limitations

- **Wallet must be already connected** to the site. Detection order: `window.solflare`, `window.jupiter`, `window.solana`.
- **X/SOL pools with USDC target**: the SDK unwraps SOL natively on close, so the released SOL (native) isn't re-swapped. Use **SOL** as the target for `X/SOL` pools. `TOKEN/USDC → USDC` and `TOKEN/TOKEN` work fine.
- The amount shown is Jupiter's **estimated** output (hence `≈`); the executed amount can vary slightly with slippage.
- Public RPCs can lag on the post-close balance read (the extension waits up to ~45s). Helius removes this.

---

## Security

- The extension holds **no keys** — your own wallet signs every transaction.
- No settings, keys, or secrets are stored in the code or the repo; they live only in your browser's local storage.
- The priority-fee cap limits how much you can ever overpay in fees.

---

## Project structure

```
public/manifest.json      MV3 manifest (MAIN + ISOLATED content scripts)
public/popup.html         settings page
src/main-world.ts         MAIN world: button + DLMM + Jupiter + wallet
src/ui.ts                 floating button (shadow DOM)
src/content-bridge.ts     ISOLATED world: chrome.storage bridge
src/popup.ts              settings logic
src/settings.ts           shared schema + defaults
build.mjs                 esbuild bundling + node polyfills
```

---

*Not affiliated with Meteora, Jupiter, Helius or Solflare. Use at your own risk.*

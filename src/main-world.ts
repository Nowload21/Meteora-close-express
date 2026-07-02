// Runs in the MAIN world of app.meteora.ag so it can reach the injected wallet
// provider (window.solflare / window.solana). It renders the floating button and
// performs the whole close→swap flow directly via the DLMM SDK + Jupiter API.

import DLMM from "@meteora-ag/dlmm";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  DEFAULT_SETTINGS,
  KNOWN_MINTS,
  type Settings,
  type TargetToken,
} from "./settings";
import { mountUI, type UI } from "./ui";

const SRC = "mx";
const SRC_BRIDGE = "mx-bridge";

let settings: Settings = { ...DEFAULT_SETTINGS };
let ui: UI;

// ---------------------------------------------------------------------------
// Settings bridge (talks to content-bridge.ts in the ISOLATED world)
// ---------------------------------------------------------------------------

const pending = new Map<string, (s: Settings) => void>();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || msg.source !== SRC_BRIDGE) return;

  if (msg.type === "settings") {
    settings = msg.payload as Settings;
    if (msg.reqId && pending.has(msg.reqId)) {
      pending.get(msg.reqId)!(settings);
      pending.delete(msg.reqId);
    }
    ui?.syncSettings(settings);
  }

  if (msg.type === "mx-fetch-result" && msg.reqId && fetchPending.has(msg.reqId)) {
    fetchPending.get(msg.reqId)!(msg.payload as MxFetchResult);
    fetchPending.delete(msg.reqId);
  }
});

// --- Cross-origin fetch proxied through the background worker (bypasses the
// page CSP / CORS / ad-block that block quote-api.jup.ag from the page). ---
interface MxFetchResult {
  ok: boolean;
  status: number;
  body?: string;
  error?: string;
}

const fetchPending = new Map<string, (r: MxFetchResult) => void>();

function mxFetch(url: string, init?: RequestInit): Promise<MxFetchResult> {
  return new Promise((resolve) => {
    const reqId = Math.random().toString(36).slice(2);
    fetchPending.set(reqId, resolve);
    window.postMessage(
      {
        source: SRC,
        type: "mx-fetch",
        reqId,
        url,
        init: init
          ? { method: init.method, headers: init.headers, body: init.body }
          : undefined,
      },
      "*"
    );
    setTimeout(() => {
      if (fetchPending.has(reqId)) {
        fetchPending.delete(reqId);
        resolve({ ok: false, status: 0, error: "proxy fetch timeout" });
      }
    }, 20_000);
  });
}

async function mxFetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await mxFetch(url, init);
  if (!res.ok || res.error) {
    throw new Error(`fetch ${url} → ${res.error ?? "HTTP " + res.status}`);
  }
  try {
    return JSON.parse(res.body ?? "null");
  } catch {
    throw new Error(`invalid JSON from ${url}`);
  }
}

function requestSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    const reqId = Math.random().toString(36).slice(2);
    pending.set(reqId, resolve);
    window.postMessage({ source: SRC, type: "get-settings", reqId }, "*");
    setTimeout(() => {
      if (pending.has(reqId)) {
        pending.delete(reqId);
        resolve(settings);
      }
    }, 1500);
  });
}

function saveTarget(target: TargetToken) {
  window.postMessage({ source: SRC, type: "set-settings", payload: { defaultTarget: target } }, "*");
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

interface WalletProvider {
  publicKey?: { toString(): string } | null;
  isConnected?: boolean;
  connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  signAllTransactions?(txs: (Transaction | VersionedTransaction)[]): Promise<(Transaction | VersionedTransaction)[]>;
  signTransaction?(tx: Transaction | VersionedTransaction): Promise<Transaction | VersionedTransaction>;
}

function getProvider(): WalletProvider | null {
  const w = window as any;
  // Prefer an explicitly-Solflare provider, then Jupiter, then any generic one.
  if (w.solflare?.isSolflare) return w.solflare;
  if (w.jupiter) return w.jupiter;
  if (w.solana) return w.solana;
  if (w.solflare) return w.solflare;
  return null;
}

async function connectedPubkey(provider: WalletProvider): Promise<PublicKey> {
  if (provider.publicKey) return new PublicKey(provider.publicKey.toString());
  const res = await provider.connect();
  return new PublicKey(res.publicKey.toString());
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function poolAddressFromUrl(): string | null {
  // https://app.meteora.ag/dlmm/<poolAddress>
  const m = location.pathname.match(/\/dlmm\/([1-9A-HJ-NP-Za-km-z]{32,44})/);
  return m ? m[1] : null;
}

function priorityFeeIx(microLamports: number): TransactionInstruction {
  return ComputeBudgetProgram.setComputeUnitPrice({ microLamports });
}

/** Map the coarse priority level to a compute-unit price (µlamports/CU). */
function unitPriceForLevel(level: Settings["priorityLevel"]): number {
  switch (level) {
    case "medium":
      return 50_000;
    case "high":
      return 200_000;
    case "veryHigh":
    default:
      return 1_000_000;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Total balance of `mint` held by `owner`, summed across all token accounts and
 * working for both the classic SPL Token program AND Token-2022 (memecoins).
 */
async function tokenBalance(conn: Connection, owner: PublicKey, mint: PublicKey): Promise<bigint> {
  try {
    const res = await conn.getParsedTokenAccountsByOwner(owner, { mint }, "confirmed");
    let sum = 0n;
    for (const { account } of res.value) {
      const amt = (account.data as any)?.parsed?.info?.tokenAmount?.amount;
      if (amt) sum += BigInt(amt);
    }
    return sum;
  } catch {
    return 0n;
  }
}

/**
 * Poll until the token released by the close actually shows up on the RPC.
 * Post-close balances can lag the confirmation by many seconds on public RPCs,
 * so we wait up to ~45s (like the proven keeper does) before giving up.
 */
async function waitForBalance(
  conn: Connection,
  owner: PublicKey,
  mint: PublicKey,
  minRaw = 1n,
  maxWaitMs = 45_000,
  intervalMs = 2_000
): Promise<bigint> {
  const deadline = Date.now() + maxWaitMs;
  let last = 0n;
  while (Date.now() < deadline) {
    last = await tokenBalance(conn, owner, mint);
    if (last >= minRaw) return last;
    await sleep(intervalMs);
  }
  return last;
}

async function sendSigned(
  conn: Connection,
  tx: Transaction | VersionedTransaction
): Promise<string> {
  const raw = tx.serialize();
  const sig = await conn.sendRawTransaction(raw, {
    skipPreflight: settings.skipPreflight,
    maxRetries: 3,
  });
  return sig;
}

/**
 * Confirm a transaction AND fail loudly if it reverted on-chain. Polls the
 * signature status; on an on-chain error it fetches the tx logs so we know
 * *why* (slippage, Token-2022 issue, etc.) instead of silently reporting
 * success while the tokens stay in the wallet.
 */
async function confirmOrThrow(conn: Connection, sig: string, label: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const { value } = await conn.getSignatureStatuses([sig]);
    const st = value[0];
    if (st) {
      if (st.err) {
        let logs = "";
        try {
          const tx = await conn.getTransaction(sig, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });
          logs = (tx?.meta?.logMessages ?? []).slice(-4).join(" | ");
        } catch {
          /* logs are best-effort */
        }
        console.error(`[MeteoraExpress] ${label} FAILED`, sig, st.err, logs);
        throw new Error(
          `${label} échoué on-chain (${JSON.stringify(st.err)}). ` +
            `Sig: ${sig}${logs ? ` — ${logs}` : ""}`
        );
      }
      if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized") {
        console.log(`[MeteoraExpress] ${label} OK`, sig);
        return;
      }
    }
    await sleep(1500);
  }
  throw new Error(`${label}: timeout de confirmation. Sig: ${sig}`);
}

// ---------------------------------------------------------------------------
// Jupiter swap
// ---------------------------------------------------------------------------

interface SwapBuild {
  tx: VersionedTransaction;
  /** Expected output amount (raw units of the target mint), from the Jupiter quote. */
  outAmount: bigint;
}

async function jupiterSwapTx(
  inputMint: string,
  outputMint: string,
  amount: bigint,
  userPubkey: string
): Promise<SwapBuild | null> {
  if (amount <= 0n) return null;
  // Jupiter free (keyless) tier. Requests go through the background worker
  // (mxFetchJson) so the page CSP / CORS / ad-block can't block them.
  const quoteUrl =
    `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}` +
    `&outputMint=${outputMint}&amount=${amount.toString()}` +
    `&slippageBps=${settings.slippageBps}&onlyDirectRoutes=false`;
  const quote = await mxFetchJson(quoteUrl);
  if (!quote || quote.error) throw new Error(`Jupiter quote failed: ${quote?.error ?? "unknown"}`);

  const swapRes = await mxFetchJson("https://lite-api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: userPubkey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: settings.maxPriorityLamports,
          priorityLevel: settings.priorityLevel,
        },
      },
    }),
  });
  if (!swapRes?.swapTransaction) throw new Error(`Jupiter swap build failed`);
  const buf = Uint8Array.from(atob(swapRes.swapTransaction), (c) => c.charCodeAt(0));
  return {
    tx: VersionedTransaction.deserialize(buf),
    outAmount: BigInt(quote.outAmount ?? "0"),
  };
}

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------

async function closeAndSwap() {
  console.log(`[MeteoraExpress] ▶ Close & Swap cliqué (v${MX_VERSION})`);
  const t0 = performance.now();
  const provider = getProvider();
  if (!provider) return ui.fail("Aucun wallet détecté (Solflare / Jupiter).");
  if (!provider.signAllTransactions) return ui.fail("Le wallet ne supporte pas signAllTransactions.");

  const poolAddress = poolAddressFromUrl();
  if (!poolAddress) return ui.fail("Ouvre une page /dlmm/<pool> pour détecter la position.");

  ui.busy("Connexion wallet…");
  const conn = new Connection(settings.rpcUrl, "confirmed");
  const user = await connectedPubkey(provider);

  ui.busy("Lecture de la position…");
  const dlmm = await DLMM.create(conn, new PublicKey(poolAddress));
  const tokenXMint: PublicKey = dlmm.lbPair.tokenXMint;
  const tokenYMint: PublicKey = dlmm.lbPair.tokenYMint;

  const { userPositions } = await dlmm.getPositionsByUserAndLbPair(user);
  if (!userPositions.length) return ui.fail("Aucune position trouvée sur ce pool pour ce wallet.");

  // --- Build remove-liquidity (+claim +close) txs for every position ---
  ui.busy(`Fermeture de ${userPositions.length} position(s)…`);
  const removeTxs: Transaction[] = [];
  for (const pos of userPositions) {
    const built = await dlmm.removeLiquidity({
      position: pos.publicKey,
      user,
      fromBinId: pos.positionData.lowerBinId,
      toBinId: pos.positionData.upperBinId,
      bps: new BN(10_000), // 100%
      shouldClaimAndClose: true,
    });
    const arr = Array.isArray(built) ? built : [built];
    removeTxs.push(...arr);
  }

  const { blockhash } = await conn.getLatestBlockhash("confirmed");
  const price = unitPriceForLevel(settings.priorityLevel);
  for (const tx of removeTxs) {
    tx.feePayer = user;
    tx.recentBlockhash = blockhash;
    tx.instructions.unshift(priorityFeeIx(price));
  }

  ui.busy("Signature (auto-approve)…");
  const signedRemoves = (await provider.signAllTransactions!(removeTxs)) as Transaction[];

  ui.busy("Envoi close…");
  const removeSigs = await Promise.all(signedRemoves.map((tx) => sendSigned(conn, tx)));
  await Promise.all(removeSigs.map((s) => confirmOrThrow(conn, s, "Close")));

  // --- Swap every non-target token released by the position ---
  const target: TargetToken = settings.defaultTarget;
  const targetMint = KNOWN_MINTS[target];

  // Candidates = pool tokens that aren't already the target currency.
  const candidates = [tokenXMint, tokenYMint].filter((m) => m.toBase58() !== targetMint);
  console.log("[MeteoraExpress] tokenX", tokenXMint.toBase58(), "tokenY", tokenYMint.toBase58());
  console.log("[MeteoraExpress] target", target, targetMint, "candidates", candidates.map((m) => m.toBase58()));

  ui.busy("Attente des tokens libérés…");
  const swapBuilds: Promise<SwapBuild | null>[] = [];
  for (const mint of candidates) {
    const balance = await waitForBalance(conn, user, mint);
    console.log("[MeteoraExpress] balance", mint.toBase58(), "=", balance.toString());
    if (balance > 0n) {
      swapBuilds.push(jupiterSwapTx(mint.toBase58(), targetMint, balance, user.toBase58()));
    }
  }

  ui.busy("Construction des swaps…");
  const builds = (await Promise.all(swapBuilds)).filter((b): b is SwapBuild => !!b);
  const swapTxs = builds.map((b) => b.tx);
  const totalOutRaw = builds.reduce((sum, b) => sum + b.outAmount, 0n);
  console.log("[MeteoraExpress] swaps construits:", swapTxs.length, "outAmount total:", totalOutRaw.toString());

  if (swapTxs.length) {
    ui.busy("Signature swap (auto-approve)…");
    const signedSwaps = (await provider.signAllTransactions!(swapTxs)) as VersionedTransaction[];
    ui.busy("Envoi swap…");
    const swapSigs = await Promise.all(signedSwaps.map((tx) => sendSigned(conn, tx)));
    console.log("[MeteoraExpress] swap sigs", swapSigs);
    await Promise.all(swapSigs.map((s) => confirmOrThrow(conn, s, "Swap")));
  }

  // --- Final status: amount received + total time ---
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  const decimals = target === "SOL" ? 9 : 6;
  const received = Number(totalOutRaw) / 10 ** decimals;
  const amountStr = received.toFixed(target === "SOL" ? 4 : 2);
  if (swapTxs.length) {
    ui.done(`≈ +${amountStr} ${target} en ${secs}s`);
  } else {
    ui.done(`Position fermée (rien à swapper) en ${secs}s`);
  }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const MX_VERSION = "0.3.0";

(async function boot() {
  console.log(
    `%c[MeteoraExpress] booted v${MX_VERSION}`,
    "background:#22c55e;color:#08210f;font-weight:800;padding:2px 6px;border-radius:4px"
  );
  settings = await requestSettings();
  ui = mountUI({
    initialTarget: settings.defaultTarget,
    onRun: () => {
      closeAndSwap().catch((e) => {
        console.error("[MeteoraExpress]", e);
        ui.fail(e?.message ? String(e.message) : "Erreur inconnue");
      });
    },
    onTargetChange: (t) => {
      settings.defaultTarget = t;
      saveTarget(t);
    },
  });
})();

// Shared settings shape + defaults. Kept dependency-free so both worlds can import it.

export type PriorityLevel = "medium" | "high" | "veryHigh";

export interface Settings {
  /** RPC endpoint used to build/send transactions. Use a private one (Helius) for speed. */
  rpcUrl: string;
  /** Default consolidation target for the swap. */
  defaultTarget: TargetToken;
  /** Slippage for the Jupiter swap, in basis points (100 = 1%). */
  slippageBps: number;
  /** Jupiter priority-fee level. */
  priorityLevel: PriorityLevel;
  /** Hard cap on the priority fee, in lamports (safety). */
  maxPriorityLamports: number;
  /** Skip preflight simulation when sending (faster, riskier). */
  skipPreflight: boolean;
}

export type TargetToken = "SOL" | "USDC";

export const KNOWN_MINTS: Record<TargetToken, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

export const DEFAULT_SETTINGS: Settings = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  defaultTarget: "SOL",
  slippageBps: 100,
  priorityLevel: "veryHigh",
  maxPriorityLamports: 2_000_000, // 0.002 SOL cap
  skipPreflight: true,
};

export const STORAGE_KEY = "mx_settings";

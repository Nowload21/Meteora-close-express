// Ensure Buffer is available globally for @solana/web3.js & the DLMM SDK.
import { Buffer } from "buffer";
export { Buffer };
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

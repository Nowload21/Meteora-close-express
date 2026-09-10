import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount, WalletWithFeatures } from "@wallet-standard/base";
import {
  StandardConnect,
  type StandardConnectFeature,
} from "@wallet-standard/features";
import {
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
  type SolanaTransactionVersion,
} from "@solana/wallet-standard-features";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

const SOLANA_MAINNET = "solana:mainnet" as const;
const registry = getWallets();

type CompatibleWallet = WalletWithFeatures<StandardConnectFeature & SolanaSignTransactionFeature>;
type SignableTransaction = Transaction | VersionedTransaction;

export interface StandardWalletChoice {
  name: string;
  connected: boolean;
}

export interface StandardWalletSession {
  name: string;
  publicKey: PublicKey;
  signTransactions<T extends SignableTransaction>(txs: T[]): Promise<T[]>;
}

function isCompatible(wallet: Wallet): wallet is CompatibleWallet {
  return (
    StandardConnect in wallet.features &&
    SolanaSignTransaction in wallet.features &&
    wallet.chains.includes(SOLANA_MAINNET)
  );
}

function compatibleWallets(): CompatibleWallet[] {
  return registry.get().filter(isCompatible);
}

function supportsAccount(account: WalletAccount): boolean {
  return account.chains.includes(SOLANA_MAINNET) && account.features.includes(SolanaSignTransaction);
}

function accountFor(wallet: CompatibleWallet, accounts = wallet.accounts): WalletAccount | null {
  return accounts.find(supportsAccount) ?? null;
}

export function listStandardWallets(): StandardWalletChoice[] {
  return compatibleWallets().map((wallet) => ({
    name: wallet.name,
    connected: !!accountFor(wallet),
  }));
}

export function onStandardWalletsChanged(listener: () => void): () => void {
  const offRegister = registry.on("register", listener);
  const offUnregister = registry.on("unregister", listener);
  return () => {
    offRegister();
    offUnregister();
  };
}

function transactionVersion(tx: SignableTransaction): SolanaTransactionVersion {
  return tx instanceof VersionedTransaction ? 0 : "legacy";
}

function serializeForWallet(tx: SignableTransaction): Uint8Array {
  return tx instanceof VersionedTransaction
    ? tx.serialize()
    : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
}

function deserializeSigned<T extends SignableTransaction>(bytes: Uint8Array, original: T): T {
  return (original instanceof VersionedTransaction
    ? VersionedTransaction.deserialize(bytes)
    : Transaction.from(bytes)) as T;
}

export async function connectStandardWallet(name: string): Promise<StandardWalletSession> {
  const wallet = compatibleWallets().find((candidate) => candidate.name === name);
  if (!wallet) throw new Error(`Wallet Standard indisponible : ${name}`);

  let account = accountFor(wallet);
  if (!account) {
    const result = await wallet.features[StandardConnect].connect();
    account = accountFor(wallet, result.accounts);
  }
  if (!account) throw new Error(`${wallet.name} n'a fourni aucun compte Solana compatible.`);

  const signer = wallet.features[SolanaSignTransaction];
  const publicKey = new PublicKey(account.publicKey);

  return {
    name: wallet.name,
    publicKey,
    async signTransactions<T extends SignableTransaction>(txs: T[]): Promise<T[]> {
      for (const tx of txs) {
        const version = transactionVersion(tx);
        if (!signer.supportedTransactionVersions.includes(version)) {
          throw new Error(`${wallet.name} ne prend pas en charge les transactions ${String(version)}.`);
        }
      }

      const outputs = await signer.signTransaction(
        ...txs.map((tx) => ({
          account,
          chain: SOLANA_MAINNET,
          transaction: serializeForWallet(tx),
        }))
      );
      if (outputs.length !== txs.length) {
        throw new Error(`${wallet.name} a retourné ${outputs.length}/${txs.length} transactions signées.`);
      }
      return outputs.map((output, index) => deserializeSigned(output.signedTransaction, txs[index]));
    },
  };
}

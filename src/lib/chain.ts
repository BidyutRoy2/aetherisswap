import { defineChain } from "viem";

/**
 * GIWA Sepolia — the only chain AetherisSwap supports.
 * Testnet only. No mainnet anywhere in this codebase.
 */
export const GIWA_SEPOLIA_CHAIN_ID = 91342;
export const GIWA_RPC_URL =
  process.env.NEXT_PUBLIC_GIWA_RPC_URL ?? "https://sepolia-rpc.giwa.io";
export const GIWA_EXPLORER_URL = "https://sepolia-explorer.giwa.io";
export const AMMORA_DATA_API_URL =
  "https://ammora-giwa-sepolia-data.fly.dev";
export const SDK_VERSION = "0.3.9";

export const giwaSepolia = defineChain({
  id: GIWA_SEPOLIA_CHAIN_ID,
  name: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [GIWA_RPC_URL] } },
  blockExplorers: {
    default: { name: "GIWA Sepolia Explorer", url: GIWA_EXPLORER_URL },
  },
  testnet: true,
});

export function explorerTxUrl(hash: string): string {
  return `${GIWA_EXPLORER_URL}/tx/${hash}`;
}
export function explorerAddressUrl(address: string): string {
  return `${GIWA_EXPLORER_URL}/address/${address}`;
}
export function explorerTokenUrl(address: string): string {
  return `${GIWA_EXPLORER_URL}/token/${address}`;
}

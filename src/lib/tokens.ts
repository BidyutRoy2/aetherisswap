import type { Address } from "viem";

export interface SwapToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Where the token came from: the reviewed GIWA deployment, or the Data API. */
  source: "giwa-weth" | "ammora-launch" | "discovered-pool";
  /** Launch curve / pool address when known, for the Tokens page. */
  curve?: Address;
  status?: string;
}

/** WETH on GIWA Sepolia — the reviewed quote asset (0x4200…0006). */
export const WETH_ADDRESS =
  "0x4200000000000000000000000000000000000006" as Address;

export const WETH_TOKEN: SwapToken = {
  address: WETH_ADDRESS,
  symbol: "WETH",
  name: "Wrapped Ether",
  decimals: 18,
  source: "giwa-weth",
};

/**
 * AIV4C — "Ammora Isolated V4 Canary", the SDK's own reviewed fixture launch
 * (verified on-chain 2026-11-18: 9 decimals, totalSupply 750,000,000 AIV4C,
 * curve 0x2C4e147617Ca14502c438a35a370680494E8BD7B, configId 1, quote WETH).
 * Its curve is quotable live via ALCClient; its factory predates the current
 * reviewed auto-route factory, so planSwapExactInput refuses it with the
 * SDK's own factory error — the UI surfaces that honestly instead of
 * pretending a swap would succeed.
 */
export const AIV4C_ADDRESS =
  "0xc23220d34534aE3C8bbe231dB911b7E662743B6e" as Address;
export const AIV4C_CURVE =
  "0x2C4e147617Ca14502c438a35a370680494E8BD7B" as Address;

export const AIV4C_TOKEN: SwapToken = {
  address: AIV4C_ADDRESS,
  symbol: "AIV4C",
  name: "Ammora Isolated V4 Canary",
  decimals: 9,
  source: "ammora-launch",
  curve: AIV4C_CURVE,
  status: "canary fixture",
};

/**
 * Native ETH is NOT a swap token here: gas and spend are separate balances.
 * ETH pays gas; WETH is the ERC-20 spend balance. The UI shows both and only
 * offers wrapping (WETH deposit()) when the user explicitly asks.
 */
export const KNOWN_TOKENS: SwapToken[] = [WETH_TOKEN, AIV4C_TOKEN];

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatUnitsAmount(raw: bigint, decimals: number, maxDp = 6): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, maxDp).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${fracStr ? `.${fracStr}` : ""}`;
}

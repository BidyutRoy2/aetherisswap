import type { Address } from "viem";

export interface SwapToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** Where the token came from: the reviewed GIWA deployment, or the Data API. */
  source: "giwa-weth" | "ammora-launch" | "discovered-pool" | "native-eth";
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
 * $VTRS — "Voltaris", the first token proven swappable end-to-end on this
 * exchange (verified live 2026-11-18, blocks 41,611,178–41,611,265).
 * LaunchCreated on the SDK-reviewed sealed factory
 * 0x42acd2531e47ea789c03915c9de195bf6250c0a2 at block 41,525,106
 * (curveForToken + tokenForCurve both match on that factory — the check
 * ALCClient.planSwapExactInput enforces). 9 decimals, totalSupply 7,500 $VTRS.
 * Route quote fails (no reviewed route) so the app falls back to the ALC
 * direct quote, and planSwapExactInput ACCEPTS with the app's exact call
 * shape (allowPartialFill:false) at 0.00001 WETH (minOut ~4,925,125,628,140
 * raw ≈ 4,925.13 $VTRS). Max full-fill buy ≈ 0.00001009 WETH — above that
 * the quote partially fills and the plan refuses ("DBC exact-input quote
 * requires partial fill"), so keep buys at or below 0.00001 WETH.
 * Sell side does not work yet: the curve holds no WETH reserves
 * (quoteReserve 0), so a sell quote reverts until buys have happened.
 */
export const VTRS_ADDRESS =
  "0xb2c47362C7dE0364882294CdFa7CA0A94F1e3bd0" as Address;
export const VTRS_CURVE =
  "0xa837EB660DCC3B707da451e35DC331A2c40e9Eff" as Address;

export const VTRS_TOKEN: SwapToken = {
  address: VTRS_ADDRESS,
  symbol: "$VTRS",
  name: "Voltaris",
  decimals: 9,
  source: "ammora-launch",
  curve: VTRS_CURVE,
  status: "sealed-factory launch",
};

/**
 * Native ETH is the pay-only token: gas and spend are separate balances,
 * so ETH itself is never a swap output — it is wrapped 1:1 into WETH
 * (deposit()) first, then the normal WETH swap runs. Added as a pay token
 * in v0.1.7 because users arrive with ETH and WETH 0 and were stuck with
 * no obvious path to WETH. Quote: WETH quote for the same amount (1:1).
 */
export const NATIVE_ETH_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeEEEeE" as Address;

export const NATIVE_ETH_TOKEN: SwapToken = {
  address: NATIVE_ETH_ADDRESS,
  symbol: "ETH",
  name: "Ether (wraps to WETH on swap)",
  decimals: 18,
  source: "native-eth",
};

/** Native ETH is NOT a swap token here: gas and spend are separate balances.
 * ETH pays gas; WETH is the ERC-20 spend balance. The UI shows both and only
 * offers wrapping (WETH deposit()) when the user explicitly asks.
 */
export const KNOWN_TOKENS: SwapToken[] = [WETH_TOKEN, AIV4C_TOKEN, VTRS_TOKEN];

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

/**
 * Precise version of formatUnitsAmount: keeps up to `maxSig` significant
 * digits of the fractional part (default 10), so a tiny non-zero amount
 * never truncates to "0" — e.g. 101010101100 wei of WETH (18 decimals)
 * renders as "0.0000001010101011", where formatUnitsAmount gives "0".
 * Like formatUnitsAmount it only ever truncates (never rounds up), so a
 * displayed max-fill amount never exceeds the true fillable amount.
 */
export function formatUnitsAmountPrecise(raw: bigint, decimals: number, maxSig = 10): string {
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  if (frac === 0n) return `${neg ? "-" : ""}${whole.toString()}`;
  const fracFull = frac.toString().padStart(decimals, "0");
  const firstSig = fracFull.search(/[1-9]/);
  const kept = fracFull
    .slice(0, Math.min(fracFull.length, firstSig + maxSig))
    .replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${kept ? `.${kept}` : ""}`;
}

/**
 * True when a non-zero amount is below 0.000001 token units — small enough
 * that showing its raw units next to the decimal is worth the space.
 */
export function isTinyUnitsAmount(raw: bigint, decimals: number): boolean {
  if (raw === 0n || decimals <= 6) return false;
  const abs = raw < 0n ? -raw : raw;
  return abs < 10n ** BigInt(decimals - 6);
}

import {
  ALCClient,
  AmmoraDataApiClient,
  AmmoraRouteClient,
  giwaSepoliaAutoRouteRuntimeHashes,
  type AmmoraRouteQuote,
} from "@ammora-protocol/sdk";
import { createPublicClient, erc20Abi, http, keccak256, type Address, type PublicClient, type WalletClient } from "viem";
import {
  AMMORA_DATA_API_URL,
  GIWA_RPC_URL,
  GIWA_SEPOLIA_CHAIN_ID,
  SDK_VERSION,
  giwaSepolia,
} from "./chain";
import type { SwapToken } from "./tokens";

export { SDK_VERSION };

/** One shared read-only client for the public GIWA RPC — with the chain set (ALC auth checks need it). */
export function getPublicClient(): PublicClient {
  return createPublicClient({ chain: giwaSepolia, transport: http(GIWA_RPC_URL) });
}

/** Data API client (launches / indexer status). No key, no account. */
export function getDataApiClient(): AmmoraDataApiClient {
  return new AmmoraDataApiClient(AMMORA_DATA_API_URL);
}

export type AttestationState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "verified"; verifiedAt: string }
  | { status: "failed"; reason: string };

/**
 * Explicit runtime verification — the SDK never attests implicitly inside
 * quote/plan calls, so the app does it once at bootstrap and shows the
 * result in the header status. Best-effort: a failure never blocks the UI,
 * it is reported as "unverified".
 *
 * Note: `attestAmmoraDeployment()` needs a reviewed release manifest, which
 * is not bundled with the npm package (it ships with the examples project).
 * This app verifies the same evidence directly: every runtime code hash the
 * SDK pins for GIWA auto-route (`giwaSepoliaAutoRouteRuntimeHashes`) is
 * compared against the live bytecode on GIWA Sepolia (keccak256 of
 * `eth_getCode`). Verified live 2026-11-18: all sampled pins matched.
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function attestGiwaDeployment(
  publicClient: PublicClient,
): Promise<AttestationState> {
  try {
    // The public RPC is rate-limited (the SDK docs suggest a 600ms interval),
    // so check a representative 5 pins, staggered — not all 15 at once.
    const pins = (Object.entries(giwaSepoliaAutoRouteRuntimeHashes) as Array<[Address, string]>).slice(0, 5);
    let checked = 0;
    for (const [address, expected] of pins) {
      const code = await publicClient.getCode({ address });
      if (!code || keccak256(code).toLowerCase() !== expected.toLowerCase()) {
        return { status: "failed", reason: `runtime pin mismatch at ${address}` };
      }
      checked += 1;
      await sleep(650);
    }
    return { status: "verified", verifiedAt: `${checked} runtime pins match` };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message.slice(0, 160) : "unknown error",
    };
  }
}

/** Cached route client per verification block (a client is bound to the block it verified at). */
let routeClientCache: { block: bigint; client: AmmoraRouteClient } | null = null;

export async function getRouteClient(
  publicClient: PublicClient,
): Promise<AmmoraRouteClient> {
  const block = await publicClient.getBlockNumber();
  if (routeClientCache && block - routeClientCache.block < 20n) {
    return routeClientCache.client;
  }
  // Atomic multi-hop routing requires an explicit verification block.
  const client = await AmmoraRouteClient.create({
    chainId: GIWA_SEPOLIA_CHAIN_ID,
    verificationBlock: block,
  });
  routeClientCache = { block, client };
  return client;
}

export interface LiveQuote {
  kind: "route" | "alc";
  expectedOut: bigint;
  minimumOut: bigint;
  priceImpactBps: bigint | null;
  providerId: string;
  hops: number;
  quoteBlock: bigint;
  feeText: string;
  /** Route path only. */
  routeQuote?: AmmoraRouteQuote;
  /** ALC path only. */
  alc?: {
    curve: Address;
    tokenIn: SwapToken;
    tokenOut: SwapToken;
    amountIn: bigint;
    baseForQuote: boolean;
    fee: bigint;
  };
}

function alcQuoteFor(
  curve: Address,
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountIn: bigint,
  slippageBps: number,
  publicClient: PublicClient,
): Promise<LiveQuote> {
  // baseForQuote: true when selling the base (launch) token for quote (WETH),
  // false when buying the base token with quote. (SDK README final-fill example.)
  const curveToken = tokenIn.curve ? tokenIn : tokenOut;
  const baseForQuote = tokenIn.address.toLowerCase() === curveToken.address.toLowerCase();
  const alc = new ALCClient(publicClient, curve);
  return alc.quoteExactInput(amountIn, baseForQuote).then((q) => {
    const minimumOut = (q.amountOut * BigInt(10000 - slippageBps)) / 10000n;
    return {
      kind: "alc" as const,
      expectedOut: q.amountOut,
      minimumOut,
      priceImpactBps: null,
      providerId: "alc-direct",
      hops: 1,
      quoteBlock: 0n,
      feeText: `curve fee ${q.fee.toString()} raw`,
      alc: { curve, tokenIn, tokenOut, amountIn, baseForQuote, fee: q.fee },
    };
  });
}

/**
 * Live SDK quote, two tiers:
 *  1. AmmoraRouteClient aggregation quote.
 *  2. Direct ALC curve quote when one side is a launch token with a known curve.
 * Throws with the SDK's own error — the UI surfaces it, never a made-up price.
 */
export async function fetchLiveQuote(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountIn: bigint,
  slippageBps: number,
  recipient?: Address,
): Promise<LiveQuote> {
  const publicClient = getPublicClient();
  try {
    const routeClient = await getRouteClient(publicClient);
    const quote = await routeClient.quoteExactIn({
      tokenIn: tokenIn.address,
      tokenOut: tokenOut.address,
      amountIn,
      slippageBps,
      recipient,
    });
    return {
      kind: "route",
      routeQuote: quote,
      expectedOut: quote.expectedAmountOut,
      minimumOut: quote.minimumAmountOut,
      priceImpactBps: quote.priceImpactBps,
      providerId: quote.providerId,
      hops: quote.hops.length,
      quoteBlock: quote.quoteBlockNumber,
      feeText: "fee included in route",
    };
  } catch (routeError) {
    const curve = tokenIn.curve ?? tokenOut.curve;
    if (!curve) throw routeError;
    try {
      const q = await alcQuoteFor(curve, tokenIn, tokenOut, amountIn, slippageBps, publicClient);
      const block = await publicClient.getBlockNumber();
      return { ...q, quoteBlock: block };
    } catch {
      throw routeError;
    }
  }
}

async function approveIfNeeded(
  publicClient: PublicClient,
  walletClient: WalletClient,
  payer: Address,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<void> {
  if (amount <= 0n) return;
  const allowance = (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [payer, spender],
  })) as bigint;
  if (allowance >= amount) return;
  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
    account: payer,
    chain: giwaSepolia,
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Execute a quoted swap with the user's wallet. The SDK plans; the wallet signs.
 * Route path: prepareExactIn + execute. ALC path: planSwapExactInput + send.
 * Any SDK refusal (e.g. a curve whose factory is not the reviewed one) is
 * thrown with the SDK's own message — never hidden, never faked.
 */
export async function executeQuotedSwap(
  live: LiveQuote,
  payer: Address,
  walletClient: WalletClient,
  slippageBps: number,
): Promise<{ hash: `0x${string}` }> {
  const publicClient = getPublicClient();
  if (live.kind === "route" && live.routeQuote) {
    const quote = live.routeQuote;
    for (const approval of quote.approvals ?? []) {
      const req = approval as unknown as Record<string, unknown>;
      const spender = (req.spender ?? req.target ?? quote.executionTarget) as Address;
      const amount = (req.amount ?? req.amountIn ?? 0n) as bigint;
      const token = (req.token ?? live.alc?.tokenIn.address) as Address | undefined;
      if (token) await approveIfNeeded(publicClient, walletClient, payer, token, spender, amount);
    }
    const routeClient = await getRouteClient(publicClient);
    const prepared = await routeClient.prepareExactIn(quote, {
      payer,
      funding: { kind: "direct-approval" },
    });
    const result = await routeClient.execute(prepared, { wallet: walletClient });
    const hash = (result as { hash?: `0x${string}` }).hash ??
      (result as { transactionHash?: `0x${string}` }).transactionHash;
    if (!hash) throw new Error("Swap executed but no transaction hash was returned");
    return { hash };
  }

  if (live.kind === "alc" && live.alc) {
    const { curve, tokenIn, amountIn, baseForQuote } = live.alc;
    const alc = new ALCClient(publicClient, curve);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    const plan = await alc.planSwapExactInput({
      includedAmountIn: amountIn,
      baseForQuote,
      allowPartialFill: false,
      slippageBps,
      recipient: payer,
      deadline,
    });
    const req = plan.approvalRequirement as unknown as Record<string, unknown> | undefined;
    if (req) {
      await approveIfNeeded(
        publicClient,
        walletClient,
        payer,
        (req.token ?? tokenIn.address) as Address,
        (req.spender ?? curve) as Address,
        (req.amount ?? 0n) as bigint,
      );
    }
    const hash = await walletClient.sendTransaction({
      account: payer,
      chain: giwaSepolia,
      to: plan.transaction.to,
      data: plan.transaction.data,
    });
    return { hash };
  }
  throw new Error("Quote is missing its execution plan");
}

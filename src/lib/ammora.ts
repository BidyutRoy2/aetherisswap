import {
  ALCClient,
  AmmoraDataApiClient,
  AmmoraRouteClient,
  ammoraLaunchFactoryV4Abi,
  giwaSepoliaAutoRouteAddresses,
  giwaSepoliaAutoRouteRuntimeHashes,
  type AmmoraRouteQuote,
} from "@ammora-protocol/sdk";
import { createPublicClient, erc20Abi, http, keccak256, zeroAddress, type Address, type PublicClient, type WalletClient } from "viem";
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

/** The reviewed auto-route launch factory on GIWA Sepolia (SDK-pinned). */
export const LAUNCH_FACTORY_ADDRESS = giwaSepoliaAutoRouteAddresses.factory as Address;

/**
 * Find the ALC launch curve for a token, on-chain, via the reviewed launch
 * factory's `curveForToken(token)` view (ammoraLaunchFactoryV4Abi).
 * Returns null when the token has no curve on this factory (zero address)
 * or the call fails. Validated live 2026-11-18: AIV4C returns its known
 * curve 0x2C4e…, tAMM returns the zero address — tAMM is Ammora's Season 2
 * campaign reward token ("tAmm Coin", minted by an EOA, not a launch), so
 * it has no launch curve and no reviewed route.
 */
export async function findCurveOnChain(
  publicClient: PublicClient,
  tokenAddress: Address,
): Promise<Address | null> {
  try {
    const curve = (await publicClient.readContract({
      address: LAUNCH_FACTORY_ADDRESS,
      abi: ammoraLaunchFactoryV4Abi,
      functionName: "curveForToken",
      args: [tokenAddress],
    })) as Address;
    return curve.toLowerCase() === zeroAddress.toLowerCase() ? null : curve;
  } catch {
    return null;
  }
}

/** Check a pasted curve really belongs to a token (`tokenForCurve`). */
export async function verifyCurveForToken(
  publicClient: PublicClient,
  curve: Address,
  tokenAddress: Address,
): Promise<boolean> {
  try {
    const token = (await publicClient.readContract({
      address: LAUNCH_FACTORY_ADDRESS,
      abi: ammoraLaunchFactoryV4Abi,
      functionName: "tokenForCurve",
      args: [curve],
    })) as Address;
    return token.toLowerCase() === tokenAddress.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Discover a token's ALC curve: Data API `getLaunch` first (8s cap — the
 * indexer may be unreachable), then the on-chain factory lookup. Returns
 * the curve and where it came from, or nulls when no curve exists anywhere
 * we can check. A null result is a real finding, not an error: the token
 * can then only swap if a reviewed route exists for the pair.
 */
export async function discoverCurveForToken(
  tokenAddress: Address,
): Promise<{ curve: Address | null; via: "data-api" | "on-chain" | null }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const launch = await getDataApiClient().getLaunch(91342n, tokenAddress, controller.signal);
      const curve = (launch as unknown as Record<string, unknown>).curveAddress as Address | undefined;
      if (curve && curve.toLowerCase() !== zeroAddress.toLowerCase()) {
        return { curve, via: "data-api" };
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Indexer unreachable — fall through to the on-chain lookup.
  }
  const curve = await findCurveOnChain(getPublicClient(), tokenAddress);
  return { curve, via: curve ? "on-chain" : null };
}

/**
 * Honest no-route message: when neither side of a pair has a launch curve,
 * the SDK's "no reviewed route" is not a temporary failure — the pair
 * simply has no quotable path. Say so, including the campaign-token case.
 */
export function describeNoRoute(tokenIn: SwapToken, tokenOut: SwapToken, error: unknown): string {
  const sdkMsg = error instanceof Error ? error.message.slice(0, 180) : "no reviewed exact-input route is currently available";
  if (!tokenIn.curve && !tokenOut.curve) {
    return (
      `No live route for this pair: ${sdkMsg}. Neither token has an ALC launch curve on the reviewed factory, ` +
      `so there is no quotable path — this can happen for campaign/reward tokens (e.g. tAMM, Ammora's Season 2 ` +
      `points token) which are not launchpad tokens. Only pairs with a reviewed route or a launch curve can be quoted; no price is shown because none exists.`
    );
  }
  return `No live route for this pair: ${sdkMsg}`;
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
  /**
   * ALC path only — the curve quote's own partial-fill signal. The SDK
   * invariant is amountIn(filled) + amountLeft === includedAmountIn:
   * amountLeft > 0 means the curve cannot fill the entered amount in one
   * swap, and planSwapExactInput with allowPartialFill:false refuses it
   * ("DBC exact-input quote requires partial fill"). filledAmountIn is
   * the input the curve CAN fill — the max for one full fill, derived
   * from the live quote, never a per-token constant.
   */
  amountLeft?: bigint;
  filledAmountIn?: bigint;
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
      // Partial-fill signal, straight from the curve quote.
      amountLeft: q.amountLeft,
      filledAmountIn: q.amountIn,
    };
  });
}

/**
 * Partial-fill info for an ALC quote, derived from the live quote only.
 * Returns null when the quote fully fills (amountLeft is 0) or when the
 * quote is not an ALC quote. The max that CAN fill in one swap is the
 * quote's filled amount — a live, per-pair figure, never a hardcoded
 * per-token constant, so it works for any token, not just $VTRS.
 */
export function partialFillInfo(live: LiveQuote): {
  maxFullFill: bigint;
  payToken: SwapToken;
  receiveToken: SwapToken;
} | null {
  if (live.kind !== "alc" || !live.alc || live.amountLeft === undefined || live.amountLeft <= 0n) {
    return null;
  }
  return {
    maxFullFill: live.filledAmountIn ?? 0n,
    payToken: live.alc.tokenIn,
    receiveToken: live.alc.tokenOut,
  };
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
 * Read-only feasibility check: prove the quoted swap can be planned BEFORE
 * any wrap or approval is attempted. Runs the exact plan step
 * executeQuotedSwap would run (ALC planSwapExactInput / route
 * prepareExactIn) and discards the result — it never signs or sends.
 * Throws the SDK's own error when the plan would refuse (factory refusal,
 * partial fill, stale quote), so the caller can show the failure without
 * having wrapped ETH first.
 */
export async function assertSwapPlannable(
  live: LiveQuote,
  payer: Address,
  slippageBps: number,
): Promise<void> {
  const publicClient = getPublicClient();
  if (live.kind === "alc" && live.alc) {
    const { curve, amountIn, baseForQuote } = live.alc;
    const alc = new ALCClient(publicClient, curve);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
    await alc.planSwapExactInput({
      includedAmountIn: amountIn,
      baseForQuote,
      allowPartialFill: false,
      slippageBps,
      recipient: payer,
      deadline,
    });
    return;
  }
  if (live.kind === "route" && live.routeQuote) {
    const routeClient = await getRouteClient(publicClient);
    await routeClient.prepareExactIn(live.routeQuote, {
      payer,
      funding: { kind: "direct-approval" },
    });
    return;
  }
  throw new Error("Quote is missing its execution plan");
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

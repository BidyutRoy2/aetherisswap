"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  erc20Abi,
  formatUnits,
  parseUnits,
  type Address,
} from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { describeNoRoute, discoverCurveForToken, executeQuotedSwap, fetchLiveQuote, getPublicClient as getAmmoraPublicClient, verifyCurveForToken, type LiveQuote } from "@/lib/ammora";
import { explorerTxUrl, GIWA_SEPOLIA_CHAIN_ID, giwaSepolia } from "@/lib/chain";
import { AIV4C_TOKEN, formatUnitsAmount, KNOWN_TOKENS, NATIVE_ETH_TOKEN, shortAddress, WETH_ADDRESS, WETH_TOKEN, type SwapToken } from "@/lib/tokens";
import { getDataApiClient } from "@/lib/ammora";

type SwapPhase =
  | "idle"
  | "quoting"
  | "ready"
  | "wrapping"
  | "approving"
  | "swapping"
  | "success"
  | "error";

const SLIPPAGE_OPTIONS = [50, 100, 300];

export function SwapBox() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();

  // ETH is a pay-only token (it wraps 1:1 to WETH on swap); it is never a
  // receive token. WETH + launches are the receive side.
  const [tokens, setTokens] = useState<SwapToken[]>([NATIVE_ETH_TOKEN, ...KNOWN_TOKENS]);
  const [tokenIn, setTokenIn] = useState<SwapToken>(KNOWN_TOKENS[0]);
  const [tokenOut, setTokenOut] = useState<SwapToken | null>(AIV4C_TOKEN);
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [showSettings, setShowSettings] = useState(false);
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const [phase, setPhase] = useState<SwapPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [customAddress, setCustomAddress] = useState("");
  const [customCurve, setCustomCurve] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [customBusy, setCustomBusy] = useState(false);
  const [wrapAmount, setWrapAmount] = useState("");
  const [wrapBusy, setWrapBusy] = useState(false);
  const [wrapTxHash, setWrapTxHash] = useState<string | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onGiwa = chainId === GIWA_SEPOLIA_CHAIN_ID;

  // --- Balances: ETH (gas) and WETH (spend) are separate — show both. ---
  const { data: ethBalance } = useBalance({ address, chainId: GIWA_SEPOLIA_CHAIN_ID });
  const { data: wethBalance } = useReadContract({
    address: WETH_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: GIWA_SEPOLIA_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  // --- Token list: Data API launches (15s timeout, never blocks the swap). ---
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    getDataApiClient()
      .getLaunches({ chainId: 91342n, signal: controller.signal })
      .then((page) => {
        if (cancelled) return;
        const launches: SwapToken[] = (page.items ?? [])
          .map((item): SwapToken | null => {
            const summary = item as unknown as Record<string, unknown>;
            // The SDK type is AmmoraLaunchSummary: token address is `address`,
            // curve is `curveAddress`. Older code read `tokenAddress` first,
            // which the API never returns — so no launch ever populated.
            // Accept every known spelling; symbol/decimals are not in the
            // summary type, so fall back to name, then the address.
            const token = (summary.address ?? summary.tokenAddress ?? summary.baseToken ?? summary.token) as Address | undefined;
            const symbol = (summary.symbol as string | undefined) ?? (summary.tokenSymbol as string | undefined) ?? (summary.name as string | undefined);
            if (!token || !symbol) return null;
            return {
              address: token,
              symbol,
              name: (summary.name as string | undefined) ?? symbol,
              decimals: Number(summary.decimals ?? summary.tokenDecimals ?? 18),
              source: "ammora-launch" as const,
              curve: (summary.curveAddress ?? summary.poolAddress) as Address | undefined,
              status: summary.status as string | undefined,
            } satisfies SwapToken;
          })
          .filter((t): t is SwapToken => t !== null && t.address.toLowerCase() !== WETH_ADDRESS.toLowerCase());
        if (launches.length > 0) {
          setTokens((prev) => {
            const seen = new Set(prev.map((t) => t.address.toLowerCase()));
            return [...prev, ...launches.filter((t) => !seen.has(t.address.toLowerCase()))];
          });
          setTokenOut((prev) => prev ?? launches[0]);
        }
      })
      .catch(() => {
        // Data API unreachable: swap still works with WETH + custom tokens.
        if (!cancelled) setMessage("Token index unreachable — add a launch token by address below, or swap WETH pairs once a token is added.");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  const amountInRaw = useMemo(() => {
    if (!amountIn || Number(amountIn) <= 0) return null;
    try {
      return parseUnits(amountIn, tokenIn.decimals);
    } catch {
      return null;
    }
  }, [amountIn, tokenIn]);

  // --- Live quote, debounced 500ms. No quote = no price shown, ever. ---
  // Paying with native ETH quotes as WETH for the same amount (1:1 wrap);
  // the wrap happens first at swap time, the quote itself is a WETH quote.
  const isEthIn = tokenIn.source === "native-eth";
  const quoteTokenIn = isEthIn ? WETH_TOKEN : tokenIn;
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    setQuote(null);
    if (!amountInRaw || !tokenOut || tokenIn.address === tokenOut.address) {
      setPhase("idle");
      return;
    }
    setPhase("quoting");
    quoteTimer.current = setTimeout(() => {
      fetchLiveQuote(quoteTokenIn, tokenOut, amountInRaw, slippageBps, address)
        .then((q) => {
          setQuote(q);
          setPhase("ready");
          setMessage(null);
        })
        .catch((error: unknown) => {
          setPhase("error");
          setMessage(describeNoRoute(quoteTokenIn, tokenOut, error));
        });
    }, 500);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [amountInRaw, tokenIn, tokenOut, quoteTokenIn, slippageBps, address]);

  const flip = useCallback(() => {
    if (!tokenOut) return;
    // ETH is pay-only: flipping from ETH would put ETH on the receive side.
    // In that case the receive side becomes WETH instead.
    setTokenIn(tokenOut);
    setTokenOut(isEthIn ? WETH_TOKEN : tokenIn);
    setAmountIn("");
    setQuote(null);
  }, [tokenIn, tokenOut, isEthIn]);

  const addCustomToken = useCallback(async () => {
    setCustomError(null);
    const addr = customAddress.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setCustomError("Enter a valid 0x token address on GIWA Sepolia.");
      return;
    }
    const pastedCurve = customCurve.trim();
    if (pastedCurve && !/^0x[0-9a-fA-F]{40}$/.test(pastedCurve)) {
      setCustomError("The curve address must be a valid 0x address, or left blank.");
      return;
    }
    if (!publicClient) return;
    setCustomBusy(true);
    try {
      const [symbol, decimals, name] = await Promise.all([
        publicClient.readContract({ address: addr as Address, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address: addr as Address, abi: erc20Abi, functionName: "decimals" }),
        publicClient.readContract({ address: addr as Address, abi: erc20Abi, functionName: "name" }).catch(() => addr),
      ]);
      // Discover the token's ALC curve: Data API first, then the reviewed
      // launch factory's curveForToken on-chain. Without a curve, the token
      // can only quote if a reviewed route exists for the pair — that is
      // exactly why tAMM (a campaign token, no curve) shows "No live route".
      let curve: Address | undefined;
      let curveNote: string | null = null;
      if (pastedCurve) {
        const ok = await verifyCurveForToken(getAmmoraPublicClient(), pastedCurve as Address, addr as Address);
        if (!ok) {
          setCustomError("That curve does not belong to this token (tokenForCurve mismatch).");
          return;
        }
        curve = pastedCurve as Address;
        curveNote = `Curve ${shortAddress(curve)} verified on-chain for ${String(symbol)}.`;
      } else {
        const found = await discoverCurveForToken(addr as Address);
        if (found.curve) {
          curve = found.curve;
          curveNote = `ALC curve found for ${String(symbol)} (${shortAddress(curve)}, via ${found.via}) — direct-curve quotes are available.`;
        } else {
          curveNote = `No ALC curve found for ${String(symbol)} on the reviewed launch factory — it can only swap if a reviewed route exists for the pair. Campaign/reward tokens (e.g. tAMM) have no curve and no route.`;
        }
      }
      const token: SwapToken = {
        address: addr as Address,
        symbol: String(symbol),
        name: String(name),
        decimals: Number(decimals),
        source: curve ? "ammora-launch" : "discovered-pool",
        curve,
      };
      setTokens((prev) =>
        prev.some((t) => t.address.toLowerCase() === addr.toLowerCase())
          ? prev.map((t) => (t.address.toLowerCase() === addr.toLowerCase() ? token : t))
          : [...prev, token],
      );
      setTokenOut(token);
      setCustomAddress("");
      setCustomCurve("");
      setMessage(curveNote);
    } catch {
      setCustomError("That address is not a readable ERC-20 on GIWA Sepolia.");
    } finally {
      setCustomBusy(false);
    }
  }, [customAddress, customCurve, publicClient]);

  /**
   * Wrap an exact amount of ETH into WETH (deposit()) and wait for the
   * receipt. Explicit chain giwaSepolia — walletClient.chain may be
   * undefined or a different chain, which silently broke wraps before.
   * Returns the wrap tx hash. Throws with the wallet/RPC's real error.
   */
  const wrapExact = useCallback(
    async (value: bigint): Promise<`0x${string}`> => {
      if (!walletClient || !address) throw new Error("Wallet not connected.");
      const hash = await walletClient.writeContract({
        address: WETH_ADDRESS,
        abi: [
          {
            type: "function",
            name: "deposit",
            stateMutability: "payable",
            inputs: [],
            outputs: [],
          },
        ],
        functionName: "deposit",
        value,
        account: address,
        chain: giwaSepolia,
      });
      await getAmmoraPublicClient().waitForTransactionReceipt({ hash });
      // Balances must update without a page reload.
      void queryClient.invalidateQueries();
      return hash;
    },
    [walletClient, address, queryClient],
  );

  const wrapEth = useCallback(async () => {
    if (!walletClient || !address || !wrapAmount || Number(wrapAmount) <= 0) return;
    setWrapBusy(true);
    setMessage(null);
    setWrapTxHash(null);
    try {
      const value = parseUnits(wrapAmount, 18);
      const hash = await wrapExact(value);
      setWrapTxHash(hash);
      setMessage(`Wrapped ${wrapAmount} ETH → WETH. Your WETH balance is updated below.`);
      setWrapAmount("");
    } catch (error) {
      setMessage(error instanceof Error ? `Wrap failed: ${error.message.slice(0, 220)}` : "Wrap failed.");
    } finally {
      setWrapBusy(false);
    }
  }, [walletClient, address, wrapAmount, wrapExact]);

  const doSwap = useCallback(async () => {
    if (!quote || !address || !walletClient || !tokenOut || !amountInRaw) return;
    setPhase(isEthIn ? "wrapping" : "swapping");
    setMessage(null);
    setTxHash(null);
    setWrapTxHash(null);
    let wrappedHash: `0x${string}` | null = null;
    try {
      // ETH pay path: wrap the exact amount 1:1 first and wait for the
      // receipt. If the wrap fails, the swap is NOT attempted — and if the
      // wrap succeeds but the swap then fails, the message says exactly
      // that (never "swap succeeded" when only the wrap did).
      if (isEthIn) {
        wrappedHash = await wrapExact(amountInRaw);
        setWrapTxHash(wrappedHash);
        setPhase("swapping");
      }
      // Approval (only if the plan requires it) + plan + send all happen
      // inside executeQuotedSwap. The SDK plans; the wallet signs.
      const { hash } = await executeQuotedSwap(quote, address, walletClient, slippageBps);
      setTxHash(hash);
      setPhase("success");
      setMessage(
        isEthIn
          ? "Swap submitted (ETH was wrapped to WETH first, then swapped). Track it on the GIWA explorer."
          : "Swap submitted. Track it on the GIWA explorer.",
      );
      void queryClient.invalidateQueries();
    } catch (error) {
      setPhase("error");
      const msg = error instanceof Error ? error.message : "Swap failed.";
      setMessage(
        wrappedHash
          ? `Wrap succeeded but the swap failed: ${msg.slice(0, 220)}`
          : isEthIn
            ? `Wrap failed, swap was NOT attempted: ${msg.slice(0, 220)}`
            : `Swap failed: ${msg.slice(0, 260)}`,
      );
    }
  }, [quote, address, walletClient, tokenOut, amountInRaw, slippageBps, isEthIn, wrapExact, queryClient]);

  const swapDisabledReason = !isConnected
    ? "Connect your wallet to swap"
    : !onGiwa
      ? "Switch to GIWA Sepolia (91342)"
      : !tokenOut
        ? "Pick a token to receive"
        : !amountInRaw
          ? "Enter an amount"
          : phase === "quoting"
            ? "Getting a live quote…"
            : phase === "wrapping"
              ? "Wrapping ETH → WETH…"
              : phase === "approving"
                ? "Approve in your wallet…"
                : phase === "swapping"
                  ? "Confirm the swap in your wallet…"
                  : isEthIn && ethBalance && ethBalance.value < amountInRaw
                    ? "Not enough ETH for this amount + gas"
                    : !isEthIn && tokenIn.address === WETH_ADDRESS && typeof wethBalance === "bigint" && wethBalance === 0n
                      ? "No WETH — wrap ETH first"
                      : null;

  // Plain-language hint when the user has ETH but no WETH and tries to pay
  // in WETH: the swap cannot run on a zero spend balance.
  const wethZeroHint =
    isConnected &&
    onGiwa &&
    !isEthIn &&
    tokenIn.address === WETH_ADDRESS &&
    typeof wethBalance === "bigint" &&
    wethBalance === 0n &&
    !!amountInRaw;

  return (
    <div className="panel p-4 sm:p-5" role="region" aria-label="Swap terminal">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">Swap</h2>
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="btn-ghost px-3 py-1.5 text-xs text-[#9fb3a8]"
          aria-expanded={showSettings}
        >
          Slippage {slippageBps / 100}% ⚙
        </button>
      </div>

      {showSettings && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[#9fb3a8]">Slippage tolerance</span>
          {SLIPPAGE_OPTIONS.map((bps) => (
            <button
              key={bps}
              type="button"
              onClick={() => setSlippageBps(bps)}
              className={`rounded-full px-3 py-1 text-xs mono-num ${
                slippageBps === bps ? "bg-[#00d084] font-semibold text-[#04150d]" : "bg-[#111a16] text-[#9fb3a8]"
              }`}
            >
              {bps / 100}%
            </button>
          ))}
          <span className="text-xs text-[#9fb3a8]">Default 1.00% — the quote minimum-out uses this.</span>
        </div>
      )}

      {/* Balances — ETH gas vs WETH spend, kept separate on purpose. */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs mono-num text-[#9fb3a8]">
        <span>
          ETH (gas):{" "}
          <span className="text-[#eef4ef]">
            {ethBalance ? formatUnits(ethBalance.value, 18).slice(0, 10) : isConnected ? "…" : "—"}
          </span>
        </span>
        <span>
          WETH (spend):{" "}
          <span className="text-[#eef4ef]">
            {typeof wethBalance === "bigint" ? formatUnitsAmount(wethBalance, 18) : isConnected ? "…" : "—"}
          </span>
        </span>
      </div>

      {/* You pay */}
      <label className="mt-4 block">
        <span className="flex items-center justify-between text-xs text-[#9fb3a8]">
          <span>You pay{isEthIn ? " (wraps to WETH 1:1 on swap)" : ""}</span>
          <span className="mono-num">{tokenIn.symbol} · {tokenIn.source === "giwa-weth" ? "GIWA WETH" : tokenIn.source}</span>
        </span>
        <span className="field mt-1 flex items-center gap-2 px-3 py-2.5">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value.replace(/[^0-9.]/g, ""))}
            className="mono-num min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-[#24352c]"
            aria-label="Amount to pay"
          />
          <select
            value={tokenIn.address}
            onChange={(e) => {
              const t = tokens.find((x) => x.address === e.target.value);
              if (t) setTokenIn(t);
            }}
            className="max-w-[9rem] shrink-0 rounded-lg bg-[#111a16] px-2 py-1.5 text-sm outline-none"
            aria-label="Token to pay"
          >
            {tokens.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </span>
      </label>

      <div className="my-1 flex justify-center">
        <button
          type="button"
          onClick={flip}
          disabled={!tokenOut}
          className="grid h-9 w-9 place-items-center rounded-full border border-[#1e2d26] bg-[#111a16] text-[#00d084] transition-transform hover:rotate-180 disabled:opacity-40"
          aria-label="Flip tokens"
        >
          ↓↑
        </button>
      </div>

      {/* You receive */}
      <label className="block">
        <span className="flex items-center justify-between text-xs text-[#9fb3a8]">
          <span>You receive (live quote)</span>
          <span className="mono-num">{tokenOut ? tokenOut.symbol : "—"}</span>
        </span>
        <span className="field mt-1 flex items-center gap-2 px-3 py-2.5">
          <span className="mono-num min-w-0 flex-1 truncate text-lg text-[#eef4ef]">
            {quote ? formatUnitsAmount(quote.expectedOut, tokenOut?.decimals ?? 18) : phase === "quoting" ? "Quoting…" : "—"}
          </span>
          <select
            value={tokenOut?.address ?? ""}
            onChange={(e) => {
              const t = tokens.find((x) => x.address === e.target.value);
              if (t) setTokenOut(t);
            }}
            className="max-w-[9rem] shrink-0 rounded-lg bg-[#111a16] px-2 py-1.5 text-sm outline-none"
            aria-label="Token to receive"
          >
            <option value="" disabled>
              Select token
            </option>
            {tokens
              .filter((t) => t.address !== tokenIn.address && t.source !== "native-eth")
              .map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol}
                </option>
              ))}
          </select>
        </span>
      </label>

      {/* Quote details — only from a real SDK quote. */}
      {quote && tokenOut && (
        <dl className="mt-3 space-y-1.5 rounded-xl bg-[#0a0f0d] px-3 py-2.5 text-xs mono-num text-[#9fb3a8]">
          <div className="flex justify-between gap-2">
            <dt>Minimum received</dt>
            <dd className="text-[#eef4ef]">{formatUnitsAmount(quote.minimumOut, tokenOut.decimals)} {tokenOut.symbol}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Price impact</dt>
            <dd className="text-[#eef4ef]">{quote.priceImpactBps === null ? "—" : `${(Number(quote.priceImpactBps) / 100).toFixed(2)}%`}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Route</dt>
            <dd className="text-[#eef4ef]">{quote.providerId} · {quote.hops} hop{quote.hops === 1 ? "" : "s"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Quote block</dt>
            <dd className="text-[#eef4ef]">#{quote.quoteBlock.toString()}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Fees</dt>
            <dd className="text-[#eef4ef]">{quote.feeText}</dd>
          </div>
        </dl>
      )}

      {/* Wrap ETH → WETH — the way to get spend balance when WETH is 0. */}
      {isConnected && onGiwa && (
        <div className="mt-3 rounded-xl border border-[#1e2d26] bg-[#0a0f0d] px-3 py-2.5">
          <p className="text-xs font-semibold text-[#eef4ef]">Wrap ETH → WETH <span className="font-normal text-[#9fb3a8]">(needed before swapping — WETH is the spend balance)</span></p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#9fb3a8]">Wrap ETH:</span>
            <input
              inputMode="decimal"
              placeholder="0.01"
              value={wrapAmount}
              onChange={(e) => setWrapAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-24 rounded-lg border border-[#1e2d26] bg-[#0a0f0d] px-2 py-1.5 mono-num outline-none"
              aria-label="ETH amount to wrap"
            />
            <button type="button" onClick={wrapEth} disabled={wrapBusy || !wrapAmount || Number(wrapAmount) <= 0} className="btn-ghost px-3 py-1.5 disabled:opacity-40">
              {wrapBusy ? "Wrapping…" : "Wrap → WETH"}
            </button>
          </div>
        </div>
      )}

      {/* WETH balance is 0 but the user entered a WETH amount. */}
      {wethZeroHint && (
        <p className="mt-3 rounded-xl border border-[#ffc24b]/40 bg-[#ffc24b]/5 px-3 py-2.5 text-sm text-[#ffc24b]">
          Your WETH balance is 0 — wrap ETH → WETH first (box above) before swapping. Or pick ETH as the pay token and the swap will wrap it for you.
        </p>
      )}

      {/* Paying with ETH: wrap-first is automatic. */}
      {isEthIn && amountInRaw && (
        <p className="mt-3 rounded-xl border border-[#1e2d26] bg-[#111a16] px-3 py-2.5 text-sm text-[#9fb3a8]">
          Paying with ETH: it will be wrapped to WETH 1:1 first, then swapped at the live WETH quote.
        </p>
      )}

      {/* Swap action */}
      {!isConnected ? (
        <p className="mt-4 rounded-xl border border-[#ffc24b]/40 bg-[#ffc24b]/5 px-3 py-2.5 text-sm text-[#ffc24b]">
          Connect your wallet (header, top right) to swap on GIWA Sepolia testnet.
        </p>
      ) : !onGiwa ? (
        <button
          type="button"
          onClick={() => switchChain?.({ chainId: GIWA_SEPOLIA_CHAIN_ID })}
          className="btn-primary mt-4 w-full px-4 py-3.5 text-base"
        >
          Switch to GIWA Sepolia (91342)
        </button>
      ) : (
        <button
          type="button"
          onClick={doSwap}
          disabled={Boolean(swapDisabledReason) || phase === "swapping" || phase === "wrapping" || phase === "approving"}
          className="btn-primary mt-4 w-full px-4 py-3.5 text-base"
        >
          {swapDisabledReason ?? (quote ? `Swap ${tokenIn.symbol} → ${tokenOut?.symbol ?? ""}${isEthIn ? " (wraps ETH first)" : ""}` : "Swap")}
        </button>
      )}

      {message && (
        <p
          role="status"
          className={`mt-3 break-words rounded-xl px-3 py-2.5 text-sm ${
            phase === "error" ? "border border-red-500/40 bg-red-500/10 text-red-300" : "border border-[#1e2d26] bg-[#111a16] text-[#9fb3a8]"
          }`}
        >
          {message}
        </p>
      )}
      {txHash && (
        <p className="mt-2 text-sm">
          <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="text-[#00d084] underline underline-offset-2">
            View transaction on GIWA Explorer ↗
          </a>{" "}
          <span className="mono-num text-xs text-[#9fb3a8]">{shortAddress(txHash)}</span>
        </p>
      )}
      {wrapTxHash && (
        <p className="mt-2 text-sm">
          <a href={explorerTxUrl(wrapTxHash)} target="_blank" rel="noreferrer" className="text-[#00d084] underline underline-offset-2">
            View wrap transaction on GIWA Explorer ↗
          </a>{" "}
          <span className="mono-num text-xs text-[#9fb3a8]">{shortAddress(wrapTxHash)}</span>
        </p>
      )}

      {/* Custom token — curve is discovered automatically; a curve address
          can also be pasted and is verified on-chain (tokenForCurve). */}
      <div className="mt-4 border-t border-[#1e2d26] pt-3">
        <p className="text-xs text-[#9fb3a8]">
          Token not listed? Paste any GIWA Sepolia launch-token address — it is read on-chain (symbol / decimals) and its ALC curve is looked up automatically before it is added.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            placeholder="0x… token address"
            className="field flex-1 px-3 py-2 text-sm mono-num"
            aria-label="Custom token address"
          />
          <button type="button" onClick={addCustomToken} disabled={customBusy} className="btn-ghost shrink-0 px-4 py-2 text-sm disabled:opacity-40">
            {customBusy ? "Adding…" : "Add token"}
          </button>
        </div>
        <div className="mt-2">
          <input
            value={customCurve}
            onChange={(e) => setCustomCurve(e.target.value)}
            placeholder="0x… curve address (optional — verified on-chain if given)"
            className="field w-full px-3 py-2 text-sm mono-num"
            aria-label="Custom curve address (optional)"
          />
        </div>
        {customError && <p className="mt-2 text-sm text-red-300">{customError}</p>}
      </div>
    </div>
  );
}

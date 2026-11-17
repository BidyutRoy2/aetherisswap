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
import { executeQuotedSwap, fetchLiveQuote, type LiveQuote } from "@/lib/ammora";
import { explorerTxUrl, GIWA_SEPOLIA_CHAIN_ID } from "@/lib/chain";
import { AIV4C_TOKEN, formatUnitsAmount, KNOWN_TOKENS, shortAddress, WETH_ADDRESS, type SwapToken } from "@/lib/tokens";
import { getDataApiClient } from "@/lib/ammora";

type SwapPhase =
  | "idle"
  | "quoting"
  | "ready"
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

  const [tokens, setTokens] = useState<SwapToken[]>(KNOWN_TOKENS);
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
  const [customError, setCustomError] = useState<string | null>(null);
  const [wrapAmount, setWrapAmount] = useState("");
  const [wrapBusy, setWrapBusy] = useState(false);
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
            const token = (summary.tokenAddress ?? summary.baseToken ?? summary.token) as Address | undefined;
            const symbol = (summary.symbol as string | undefined) ?? (summary.tokenSymbol as string | undefined);
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
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    setQuote(null);
    if (!amountInRaw || !tokenOut || tokenIn.address === tokenOut.address) {
      setPhase("idle");
      return;
    }
    setPhase("quoting");
    quoteTimer.current = setTimeout(() => {
      fetchLiveQuote(tokenIn, tokenOut, amountInRaw, slippageBps, address)
        .then((q) => {
          setQuote(q);
          setPhase("ready");
          setMessage(null);
        })
        .catch((error: unknown) => {
          setPhase("error");
          setMessage(
            error instanceof Error
              ? `No live route for this pair: ${error.message.slice(0, 220)}`
              : "No live route for this pair.",
          );
        });
    }, 500);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [amountInRaw, tokenIn, tokenOut, slippageBps, address]);

  const flip = useCallback(() => {
    if (!tokenOut) return;
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
    setQuote(null);
  }, [tokenIn, tokenOut]);

  const addCustomToken = useCallback(async () => {
    setCustomError(null);
    const addr = customAddress.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setCustomError("Enter a valid 0x token address on GIWA Sepolia.");
      return;
    }
    if (!publicClient) return;
    try {
      const [symbol, decimals, name] = await Promise.all([
        publicClient.readContract({ address: addr as Address, abi: erc20Abi, functionName: "symbol" }),
        publicClient.readContract({ address: addr as Address, abi: erc20Abi, functionName: "decimals" }),
        publicClient.readContract({ address: addr as Address, abi: erc20Abi, functionName: "name" }).catch(() => addr),
      ]);
      const token: SwapToken = {
        address: addr as Address,
        symbol: String(symbol),
        name: String(name),
        decimals: Number(decimals),
        source: "discovered-pool",
      };
      setTokens((prev) =>
        prev.some((t) => t.address.toLowerCase() === addr.toLowerCase()) ? prev : [...prev, token],
      );
      setTokenOut(token);
      setCustomAddress("");
    } catch {
      setCustomError("That address is not a readable ERC-20 on GIWA Sepolia.");
    }
  }, [customAddress, publicClient]);

  const wrapEth = useCallback(async () => {
    if (!walletClient || !address || !wrapAmount || Number(wrapAmount) <= 0) return;
    setWrapBusy(true);
    setMessage(null);
    try {
      const value = parseUnits(wrapAmount, 18);
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
        chain: walletClient.chain,
      });
      setMessage(`Wrap submitted: ${hash}. Wait for confirmation, then your WETH balance updates.`);
      setWrapAmount("");
    } catch (error) {
      setMessage(error instanceof Error ? `Wrap failed: ${error.message.slice(0, 220)}` : "Wrap failed.");
    } finally {
      setWrapBusy(false);
    }
  }, [walletClient, address, wrapAmount]);

  const doSwap = useCallback(async () => {
    if (!quote || !address || !walletClient || !tokenOut) return;
    setPhase("swapping");
    setMessage(null);
    setTxHash(null);
    try {
      // Approval (only if the plan requires it) + plan + send all happen
      // inside executeQuotedSwap. The SDK plans; the wallet signs.
      const { hash } = await executeQuotedSwap(quote, address, walletClient, slippageBps);
      setTxHash(hash);
      setPhase("success");
      setMessage("Swap submitted. Track it on the GIWA explorer.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? `Swap failed: ${error.message.slice(0, 260)}` : "Swap failed.");
    }
  }, [quote, address, walletClient, tokenOut, slippageBps]);

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
            : phase === "approving"
              ? "Approve in your wallet…"
              : phase === "swapping"
                ? "Confirm the swap in your wallet…"
                : null;

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
          <span>You pay</span>
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
              .filter((t) => t.address !== tokenIn.address)
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

      {/* Wrap ETH → WETH */}
      {isConnected && onGiwa && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[#9fb3a8]">Need WETH? Wrap ETH:</span>
          <input
            inputMode="decimal"
            placeholder="0.01"
            value={wrapAmount}
            onChange={(e) => setWrapAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            className="w-24 rounded-lg border border-[#1e2d26] bg-[#0a0f0d] px-2 py-1.5 mono-num outline-none"
            aria-label="ETH amount to wrap"
          />
          <button type="button" onClick={wrapEth} disabled={wrapBusy || !wrapAmount} className="btn-ghost px-3 py-1.5 disabled:opacity-40">
            {wrapBusy ? "Wrapping…" : "Wrap → WETH"}
          </button>
        </div>
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
          disabled={Boolean(swapDisabledReason) || phase === "swapping" || phase === "approving"}
          className="btn-primary mt-4 w-full px-4 py-3.5 text-base"
        >
          {swapDisabledReason ?? (quote ? `Swap ${tokenIn.symbol} → ${tokenOut?.symbol ?? ""}` : "Swap")}
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

      {/* Custom token */}
      <div className="mt-4 border-t border-[#1e2d26] pt-3">
        <p className="text-xs text-[#9fb3a8]">
          Token not listed? Paste any GIWA Sepolia launch-token address — it is read on-chain (symbol / decimals) before it is added.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={customAddress}
            onChange={(e) => setCustomAddress(e.target.value)}
            placeholder="0x… token address"
            className="field flex-1 px-3 py-2 text-sm mono-num"
            aria-label="Custom token address"
          />
          <button type="button" onClick={addCustomToken} className="btn-ghost shrink-0 px-4 py-2 text-sm">
            Add token
          </button>
        </div>
        {customError && <p className="mt-2 text-sm text-red-300">{customError}</p>}
      </div>
    </div>
  );
}

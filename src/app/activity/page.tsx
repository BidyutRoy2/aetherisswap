"use client";

import { useEffect, useState } from "react";
import { getDataApiClient, getPublicClient } from "@/lib/ammora";
import { GIWA_EXPLORER_URL, GIWA_RPC_URL, AMMORA_DATA_API_URL } from "@/lib/chain";

export default function ActivityPage() {
  const [block, setBlock] = useState<bigint | null>(null);
  const [indexer, setIndexer] = useState<string | null>(null);
  const [feed, setFeed] = useState<Array<Record<string, unknown>>>([]);
  const [feedError, setFeedError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicClient()
      .getBlockNumber()
      .then((b) => {
        if (!cancelled) setBlock(b);
      })
      .catch(() => undefined);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const api = getDataApiClient();
    api
      .getIndexerStatus()
      .then((s) => {
        if (!cancelled) setIndexer(JSON.stringify(s).slice(0, 300));
      })
      .catch(() => {
        if (!cancelled) setIndexer("unreachable from this browser — the Data API did not answer within 15s");
      });
    api
      .getLaunchFeed({ chainId: 91342n, signal: controller.signal })
      .then((page) => {
        if (!cancelled) setFeed((page.items ?? []) as Array<Record<string, unknown>>);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setFeedError(e instanceof Error ? e.message.slice(0, 180) : "Launch feed did not answer.");
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return (
    <div className="mx-auto max-w-shell px-3 sm:px-6 pt-8 sm:pt-12">
      <p className="mono-num text-[11px] tracking-[0.24em] text-[#00d084]">03 · ACTIVITY</p>
      <h1 className="display mt-3">Network activity</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#9fb3a8]">
        Live chain head and indexer status, read at page load. Nothing here is cached
        sample data — when a source does not answer, the page says so.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4 sm:p-5">
          <p className="mono-num text-[11px] tracking-[0.18em] text-[#9fb3a8]">GIWA SEPOLIA HEAD</p>
          <p className="mono-num mt-2 text-2xl text-[#eef4ef]">{block ? `#${block.toString()}` : "…"}</p>
          <a className="mt-2 inline-block text-xs text-[#00d084] underline underline-offset-2" href={GIWA_EXPLORER_URL} target="_blank" rel="noreferrer">
            Explorer ↗
          </a>
        </div>
        <div className="panel p-4 sm:p-5">
          <p className="mono-num text-[11px] tracking-[0.18em] text-[#9fb3a8]">RPC</p>
          <p className="mono-num mt-2 break-all text-sm text-[#eef4ef]">{GIWA_RPC_URL}</p>
          <p className="mt-2 text-xs text-[#9fb3a8]">Public endpoint — read-only calls, no key.</p>
        </div>
        <div className="panel p-4 sm:p-5">
          <p className="mono-num text-[11px] tracking-[0.18em] text-[#9fb3a8]">INDEXER STATUS</p>
          <p className="mt-2 break-words text-sm text-[#eef4ef]">{indexer ?? "Checking…"}</p>
          <p className="mt-2 text-xs text-[#9fb3a8]">{AMMORA_DATA_API_URL}</p>
        </div>
      </div>

      <h2 className="font-display mt-10 text-xl font-semibold">Latest launch feed</h2>
      {feedError && (
        <p className="mt-3 rounded-xl border border-[#ffc24b]/40 bg-[#ffc24b]/5 px-4 py-3 text-sm text-[#ffc24b]" role="alert">
          Launch feed unavailable: {feedError}
        </p>
      )}
      {!feedError && feed.length === 0 && (
        <p className="panel mt-3 p-5 text-sm text-[#9fb3a8]">No feed items returned for chain 91342.</p>
      )}
      <ul className="mt-3 space-y-2">
        {feed.slice(0, 10).map((item, i) => (
          <li key={i} className="panel px-4 py-3 text-sm">
            <span className="mono-num text-xs text-[#9fb3a8]">
              {String(item.sourceId ?? item.kind ?? "launch")} ·{" "}
            </span>
            <span className="text-[#eef4ef]">
              {String(item.tokenSymbol ?? item.symbol ?? item.tokenAddress ?? "—")}
            </span>
            <span className="mono-num ml-2 text-xs text-[#9fb3a8]">
              {String(item.tokenAddress ?? item.address ?? "")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

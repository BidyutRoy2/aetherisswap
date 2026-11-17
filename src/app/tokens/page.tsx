"use client";

import { useEffect, useState } from "react";
import { getDataApiClient } from "@/lib/ammora";
import { explorerAddressUrl, explorerTokenUrl } from "@/lib/chain";
import { shortAddress } from "@/lib/tokens";

interface LaunchRow {
  address?: string;
  tokenAddress?: string;
  baseToken?: string;
  token?: string;
  symbol?: string;
  tokenSymbol?: string;
  name?: string;
  decimals?: number | string;
  tokenDecimals?: number | string;
  curveAddress?: string;
  poolAddress?: string;
  status?: string;
  creator?: string;
}

export default function TokensPage() {
  const [rows, setRows] = useState<LaunchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    getDataApiClient()
      .getLaunches({ chainId: 91342n, signal: controller.signal })
      .then((page) => {
        setRows((page.items ?? []) as unknown as LaunchRow[]);
      })
      .catch((e: unknown) => {
        setError(
          e instanceof Error
            ? `The Ammora Data API did not answer: ${e.message.slice(0, 180)}`
            : "The Ammora Data API did not answer.",
        );
        setRows([]);
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  };

  useEffect(load, []);

  return (
    <div className="mx-auto max-w-shell px-3 sm:px-6 pt-8 sm:pt-12">
      <p className="mono-num text-[11px] tracking-[0.24em] text-[#00d084]">02 · TOKENS</p>
      <h1 className="display mt-3">Launches on GIWA Sepolia</h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#9fb3a8]">
        Live from the Ammora Data API — launches and pools are dynamic data, never copied
        into the SDK release. If the indexer is unreachable, this page says so instead of
        showing stale rows.
      </p>

      {loading && (
        <div className="panel mt-6 p-5 text-sm text-[#9fb3a8]" role="status">
          Loading launches from the Data API…
        </div>
      )}

      {!loading && error && (
        <div className="mt-6 rounded-xl border border-[#ffc24b]/40 bg-[#ffc24b]/5 p-5" role="alert">
          <p className="font-semibold text-[#ffc24b]">Indexer unreachable</p>
          <p className="mt-1 text-sm text-[#9fb3a8]">{error}</p>
          <p className="mt-2 text-sm text-[#9fb3a8]">
            The swap terminal still works — paste a launch-token address there. You can also
            browse launches directly on the{" "}
            <a className="text-[#00d084] underline underline-offset-2" href="https://sepolia-explorer.giwa.io" target="_blank" rel="noreferrer">
              GIWA explorer ↗
            </a>
            .
          </p>
          <button type="button" onClick={load} className="btn-ghost mt-4 px-4 py-2 text-sm">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && rows && rows.length === 0 && (
        <div className="panel mt-6 p-5 text-sm text-[#9fb3a8]" role="status">
          No launches returned for chain 91342 right now. New launches appear here as the
          indexer records them.
        </div>
      )}

      {!loading && rows && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="panel w-full min-w-[40rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-[#1e2d26] text-[11px] mono-num tracking-[0.14em] text-[#9fb3a8]">
                <th className="px-4 py-3 font-medium">TOKEN</th>
                <th className="px-4 py-3 font-medium">ADDRESS</th>
                <th className="px-4 py-3 font-medium">CURVE / POOL</th>
                <th className="px-4 py-3 font-medium">STATUS</th>
                <th className="px-4 py-3 font-medium">LINKS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                // SDK type AmmoraLaunchSummary names the token `address`.
                const token = row.address ?? row.tokenAddress ?? row.baseToken ?? row.token ?? "";
                const symbol = row.symbol ?? row.tokenSymbol ?? "—";
                const curve = row.curveAddress ?? row.poolAddress ?? "";
                return (
                  <tr key={`${token}-${i}`} className="border-b border-[#1e2d26]/60 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-semibold text-[#eef4ef]">{symbol}</span>
                      <span className="ml-2 text-xs text-[#9fb3a8]">{row.name ?? ""}</span>
                    </td>
                    <td className="px-4 py-3 mono-num text-xs">
                      {token ? (
                        <a href={explorerTokenUrl(token)} target="_blank" rel="noreferrer" className="text-[#00d084] hover:underline">
                          {shortAddress(token)}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 mono-num text-xs">
                      {curve ? (
                        <a href={explorerAddressUrl(curve)} target="_blank" rel="noreferrer" className="text-[#00d084] hover:underline">
                          {shortAddress(curve)}
                        </a>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#9fb3a8]">{row.status ?? "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {token ? (
                        <a href={explorerTokenUrl(token)} target="_blank" rel="noreferrer" className="text-[#ffc24b] hover:underline">
                          Explorer ↗
                        </a>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useConnectors } from "wagmi";
import type { Connector } from "wagmi";

/**
 * Custom Connect modal — replaces the RainbowKit modal (v0.1.2).
 *
 * RainbowKit v2 only lists wallets from `connectorsForWallets` /
 * `getDefaultConfig`, which need a WalletConnect/Reown project ID.
 * This modal lists the wagmi connectors directly, so MetaMask and
 * Coinbase Wallet always appear — even in a clean browser with no
 * wallet installed — with an Install link instead of silently missing.
 * Discovered EIP-6963 wallets (Rabby, Phantom, Keplr, ...) are listed
 * from the `eip6963:announceProvider` event plus wagmi's own discovery.
 * No WalletConnect, no project ID, no fake entries: a wallet that is
 * not installed is shown as "Not installed" with its official
 * download page, and connect failures surface the real error.
 */

const INSTALL_URLS: Record<string, string> = {
  metamask: "https://metamask.io/download/",
  coinbase: "https://www.coinbase.com/wallet/downloads",
};

type AnnouncedProvider = {
  info: { uuid: string; name: string; icon: string; rdns: string };
};

type WalletRow = {
  key: string;
  name: string;
  detail: string;
  letter: string;
  color: string;
  connector: Connector | null;
  detected: boolean;
  installUrl: string | null;
};

function ethereumFlags(): { isMetaMask: boolean; isCoinbaseWallet: boolean } {
  if (typeof window === "undefined") return { isMetaMask: false, isCoinbaseWallet: false };
  const eth = (window as unknown as { ethereum?: Record<string, unknown> & { providers?: Record<string, unknown>[] } }).ethereum;
  if (!eth) return { isMetaMask: false, isCoinbaseWallet: false };
  const providers = Array.isArray(eth.providers) ? eth.providers : [eth];
  return {
    isMetaMask: providers.some((p) => p?.isMetaMask === true),
    isCoinbaseWallet: providers.some((p) => p?.isCoinbaseWallet === true),
  };
}

export function ConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connectors = useConnectors();
  const { connectAsync, isPending, error } = useConnect();
  const { isConnected } = useAccount();
  const [announced, setAnnounced] = useState<AnnouncedProvider[]>([]);
  const [connectingKey, setConnectingKey] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  // EIP-6963 discovery: ask injected wallets to announce themselves.
  useEffect(() => {
    if (!open) return;
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<AnnouncedProvider>).detail;
      if (!detail?.info?.uuid) return;
      setAnnounced((prev) =>
        prev.some((p) => p.info.uuid === detail.info.uuid) ? prev : [...prev, detail],
      );
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, [open ]);

  // Close on successful connect.
  useEffect(() => {
    if (open && isConnected) onClose();
  }, [open, isConnected, onClose]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock page scroll while the modal is open, so the panel itself
  // (not the page behind it) is the only thing that can scroll.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const rows: WalletRow[] = useMemo(() => {
    if (!open) return [];
    const flags = ethereumFlags();
    const byId = (id: string) => connectors.find((c) => c.id === id);
    const metaMaskConnector = byId("metaMask") ?? byId("io.metamask") ?? null;
    const coinbaseConnector = byId("coinbaseWallet") ?? byId("com.coinbase.wallet") ?? null;
    const injectedConnector = byId("injected") ?? null;

    const metaMaskDetected =
      announced.some((p) => p.info.rdns === "io.metamask") || flags.isMetaMask;
    const coinbaseDetected =
      announced.some((p) => p.info.rdns === "com.coinbase.wallet") || flags.isCoinbaseWallet;

    const out: WalletRow[] = [
      {
        key: "metamask",
        name: "MetaMask",
        detail: metaMaskDetected ? "Detected in this browser" : "Not installed",
        letter: "M",
        color: "#f6851b",
        connector: metaMaskConnector,
        detected: metaMaskDetected,
        installUrl: INSTALL_URLS.metamask,
      },
      {
        key: "coinbase",
        name: "Coinbase Wallet",
        detail: coinbaseDetected ? "Detected in this browser" : "Not installed",
        letter: "C",
        color: "#0052ff",
        connector: coinbaseConnector,
        detected: coinbaseDetected,
        installUrl: INSTALL_URLS.coinbase,
      },
    ];

    const coveredRdns = new Set(["io.metamask", "com.coinbase.wallet"]);
    // Other announced EIP-6963 wallets (Rabby, Phantom, Keplr, ...).
    for (const p of announced) {
      if (coveredRdns.has(p.info.rdns)) continue;
      const match =
        connectors.find((c) => c.id === p.info.rdns) ??
        connectors.find((c) => c.name.toLowerCase() === p.info.name.toLowerCase()) ??
        injectedConnector;
      out.push({
        key: `eip6963:${p.info.rdns}`,
        name: p.info.name,
        detail: "Detected in this browser",
        letter: p.info.name.charAt(0).toUpperCase(),
        color: "#00d084",
        connector: match ?? null,
        detected: true,
        installUrl: null,
      });
    }
    // Any other wagmi connector not already represented (wagmi's own
    // discovery can surface wallets before the announce event lands).
    for (const c of connectors) {
      if (["metaMask", "coinbaseWallet", "io.metamask", "com.coinbase.wallet", "injected"].includes(c.id)) continue;
      if (out.some((r) => r.connector?.id === c.id)) continue;
      out.push({
        key: `connector:${c.id}`,
        name: c.name,
        detail: "Detected in this browser",
        letter: c.name.charAt(0).toUpperCase(),
        color: "#00d084",
        connector: c,
        detected: true,
        installUrl: null,
      });
    }
    // Generic injected fallback when something is injected but no named
    // connector matched it.
    if (injectedConnector && typeof window !== "undefined" && (window as unknown as { ethereum?: unknown }).ethereum) {
      const alreadyCovered = out.some((r) => r.connector?.id === "injected" && r.detected);
      if (!alreadyCovered && !out.some((r) => r.key.startsWith("eip6963:"))) {
        out.push({
          key: "injected",
          name: "Browser Wallet",
          detail: "Detected in this browser",
          letter: "B",
          color: "#00d084",
          connector: injectedConnector,
          detected: true,
          installUrl: null,
        });
      }
    }
    // Dedupe by wallet name: wagmi can surface the same wallet through
    // more than one connector (e.g. "metaMask" and the EIP-6963
    // "io.metamask" connector), which rendered MetaMask/Coinbase twice
    // in a clean browser — once "Not installed", once "Detected".
    // Keep one row per wallet, preferring the detected one.
    const deduped: WalletRow[] = [];
    for (const row of out) {
      const at = deduped.findIndex((r) => r.name.toLowerCase() === row.name.toLowerCase());
      if (at === -1) deduped.push(row);
      else if (row.detected && !deduped[at].detected) deduped[at] = row;
    }
    return deduped;
  }, [open, announced, connectors]);

  if (!open) return null;

  const handleConnect = async (row: WalletRow) => {
    if (!row.connector) {
      setConnectError(`${row.name} is not available in this browser.`);
      return;
    }
    setConnectError(null);
    setConnectingKey(row.key);
    try {
      await connectAsync({ connector: row.connector });
      // onClose fires via the isConnected effect.
    } catch (e) {
      // Real error from the wallet/connector — never a faked success.
      setConnectError(e instanceof Error ? e.message : "Connection failed.");
    } finally {
      setConnectingKey(null);
    }
  };

  // Render through a portal to document.body: the modal lives inside the
  // sticky header, whose backdrop-blur masthead creates a containing block
  // for fixed-position descendants — without the portal the modal was
  // confined to the header's box, the ticker bar cut across it, and most
  // of the panel was hidden behind the page. In the portal it is a true
  // viewport overlay, centred, above everything.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Connect a wallet"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />
      <div className="relative my-auto flex w-full max-w-md max-h-[85dvh] flex-col overflow-hidden rounded-2xl border border-[#1e2d26] bg-[#0d1512] p-5 shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold">Connect a Wallet</h2>
            <p className="mt-1 text-xs text-[#9fb3a8]">
              GIWA Sepolia (91342) · Testnet only — your wallet signs, AetherisSwap never holds your keys.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close connect modal"
            className="btn-ghost grid h-8 w-8 shrink-0 place-items-center text-lg leading-none text-[#9fb3a8]"
          >
            ×
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-3 rounded-xl border border-[#1e2d26] bg-[#111a16] px-3 py-2.5"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-lg font-bold text-[#04150d]"
                style={{ backgroundColor: row.color }}
                aria-hidden
              >
                {row.letter}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{row.name}</span>
                <span className={`block text-xs ${row.detected ? "text-[#00d084]" : "text-[#9fb3a8]"}`}>
                  {row.detail}
                </span>
              </span>
              {row.detected ? (
                <button
                  type="button"
                  onClick={() => void handleConnect(row)}
                  disabled={isPending}
                  className="btn-primary shrink-0 px-3 py-2 text-sm disabled:opacity-40"
                >
                  {connectingKey === row.key ? "Connecting…" : "Connect"}
                </button>
              ) : (
                <a
                  href={row.installUrl ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost shrink-0 px-3 py-2 text-sm text-[#eef4ef]"
                >
                  Install ↗
                </a>
              )}
            </div>
          ))}
        </div>

        {(connectError || error) && (
          <p role="alert" className="mt-3 shrink-0 break-words rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-red-300">
            {connectError ?? error?.message ?? "Connection failed."}
          </p>
        )}

        <p className="mt-4 shrink-0 text-[11px] leading-relaxed text-[#9fb3a8]">
          No WalletConnect project ID is used — this list comes straight from the wallets
          in your browser. If your wallet is not listed, install it first, then reopen
          this modal.
        </p>
      </div>
    </div>,
    document.body,
  );
}

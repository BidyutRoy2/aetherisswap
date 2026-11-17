"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { ConnectModal } from "./ConnectModal";
import { attestGiwaDeployment, getPublicClient, type AttestationState } from "@/lib/ammora";
import { GIWA_SEPOLIA_CHAIN_ID, SDK_VERSION } from "@/lib/chain";
import { Ticker } from "./Ticker";

const NAV = [
  { n: "01", label: "Swap", href: "/" },
  { n: "02", label: "Tokens", href: "/tokens" },
  { n: "03", label: "Activity", href: "/activity" },
];

export function Header() {
  const pathname = usePathname();
  const chainId = useChainId();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [connectOpen, setConnectOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [attestation, setAttestation] = useState<AttestationState>({ status: "idle" });
  const [block, setBlock] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = getPublicClient();
    attestGiwaDeployment(client).then((s) => {
      if (!cancelled) setAttestation(s);
    });
    client
      .getBlockNumber()
      .then((b) => {
        if (!cancelled) setBlock(b);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Close the connected-wallet menu on outside click.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const onGiwa = chainId === GIWA_SEPOLIA_CHAIN_ID;
  const shortAddress = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <header className="sticky top-0 z-40">
      {/* Ribbon — hidden mid-section on phones so nothing clips. */}
      <div className="bg-[#070b09] border-b border-[#1e2d26]">
        <div className="mx-auto max-w-shell px-3 sm:px-6 flex items-center justify-between gap-3 py-1.5 text-[11px] mono-num text-[#9fb3a8]">
          <span className="flex items-center gap-2 min-w-0">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-[#00d084]" aria-hidden />
            <span className="truncate">
              {attestation.status === "verified"
                ? "DEPLOYMENT VERIFIED"
                : attestation.status === "failed"
                  ? "ATTESTATION UNVERIFIED"
                  : "VERIFYING DEPLOYMENT…"}
            </span>
            <span className="hidden md:inline text-[#24352c]">|</span>
            <span className="hidden md:inline">SDK {SDK_VERSION}</span>
            <span className="hidden md:inline text-[#24352c]">|</span>
            <span className="hidden md:inline">CHAIN {GIWA_SEPOLIA_CHAIN_ID}</span>
          </span>
          <span className="hidden sm:flex items-center gap-3 shrink-0">
            <a className="hover:text-[#00d084]" href="https://docs.ammora.org" target="_blank" rel="noreferrer">
              Docs
            </a>
            <a className="hover:text-[#00d084]" href="https://sepolia-explorer.giwa.io" target="_blank" rel="noreferrer">
              Explorer
            </a>
            <a className="hover:text-[#00d084]" href="https://ammora.org/waitlist#mission" target="_blank" rel="noreferrer">
              Mission
            </a>
          </span>
        </div>
      </div>

      {/* Masthead */}
      <div className="bg-[#0a0f0d]/95 backdrop-blur border-b border-[#1e2d26]">
        <div className="mx-auto max-w-shell px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 py-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0" aria-label="AetherisSwap home">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#00d084] font-display text-xl font-bold text-[#04150d]">
              Æ
            </span>
            <span className="min-w-0 leading-none">
              <span className="block font-display text-base sm:text-xl font-semibold truncate">
                Aetheris<span className="text-[#00d084]">Swap</span>
              </span>
              <span className="mt-1 hidden sm:block text-[10px] mono-num tracking-[0.18em] text-[#9fb3a8]">
                GIWA SEPOLIA · TESTNET
              </span>
            </span>
            <span className="ml-1 hidden min-[420px]:inline-flex rounded-full border border-[#ffc24b]/60 px-2 py-0.5 text-[10px] mono-num font-semibold text-[#ffc24b]">
              BETA
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === item.href
                    ? "bg-[#111a16] text-[#eef4ef] ring-1 ring-[#1e2d26]"
                    : "text-[#9fb3a8] hover:text-[#eef4ef]"
                }`}
              >
                <span className="mono-num text-[11px] text-[#00d084]">{item.n}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`hidden lg:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] mono-num ${
                isConnected && onGiwa
                  ? "border-[#00d084]/40 text-[#00d084]"
                  : "border-[#ffc24b]/40 text-[#ffc24b]"
              }`}
              title={isConnected ? (onGiwa ? "Connected to GIWA Sepolia" : "Wrong network — switch to GIWA Sepolia (91342)") : "Wallet not connected"}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isConnected && onGiwa ? "bg-[#00d084]" : "bg-[#ffc24b]"}`} />
              {isConnected ? (onGiwa ? "GIWA 91342" : "WRONG NET") : "NO WALLET"}
            </span>
            <span className="hidden xl:inline text-[11px] mono-num text-[#9fb3a8]">
              #{block ? block.toString() : "…"}
            </span>
            {isConnected && !onGiwa && (
              <button
                type="button"
                onClick={() => switchChain?.({ chainId: GIWA_SEPOLIA_CHAIN_ID })}
                disabled={isSwitching}
                className="hidden sm:inline-flex rounded-full border border-[#ffc24b]/60 bg-[#ffc24b]/10 px-2.5 py-1 text-[11px] mono-num font-semibold text-[#ffc24b] disabled:opacity-40"
              >
                {isSwitching ? "Switching…" : "Switch to GIWA 91342"}
              </button>
            )}
            {isConnected && address ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  className="btn-ghost flex items-center gap-2 px-3 py-2 text-sm font-semibold"
                >
                  <span className="h-2 w-2 rounded-full bg-[#00d084]" aria-hidden />
                  <span className="mono-num">{shortAddress}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[#1e2d26] bg-[#0d1512] p-2 shadow-2xl">
                    <p className="break-all px-2 py-1.5 text-xs mono-num text-[#9fb3a8]">{address}</p>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(address).then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1500);
                        });
                      }}
                      className="block w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-[#111a16]"
                    >
                      {copied ? "Copied ✓" : "Copy address"}
                    </button>
                    <a
                      href={`https://sepolia-explorer.giwa.io/address/${address}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block rounded-lg px-2 py-2 text-sm hover:bg-[#111a16]"
                    >
                      View on Explorer ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        disconnect();
                      }}
                      className="block w-full rounded-lg px-2 py-2 text-left text-sm text-red-300 hover:bg-[#111a16]"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setConnectOpen(true)} className="btn-primary px-3 sm:px-4 py-2 text-sm">
                Connect Wallet
              </button>
            )}
            <ConnectModal open={connectOpen} onClose={() => setConnectOpen(false)} />
          </div>
        </div>

        {/* Mobile nav — numbered pills, wraps cleanly. */}
        <nav className="md:hidden border-t border-[#1e2d26] px-3 py-2 flex items-center gap-2 overflow-x-auto" aria-label="Primary mobile">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${
                pathname === item.href ? "bg-[#00d084] text-[#04150d] font-semibold" : "bg-[#111a16] text-[#9fb3a8]"
              }`}
            >
              <span className="mono-num text-[10px]">{item.n}</span>
              {item.label}
            </Link>
          ))}
          <span className="ml-auto shrink-0 text-[10px] mono-num text-[#9fb3a8]">TESTNET · 91342</span>
        </nav>
      </div>

      <Ticker />
    </header>
  );
}

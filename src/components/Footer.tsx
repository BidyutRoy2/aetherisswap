import Link from "next/link";
import { AMMORA_DATA_API_URL, APP_VERSION, GIWA_EXPLORER_URL, GIWA_RPC_URL, GIWA_SEPOLIA_CHAIN_ID, SDK_VERSION } from "@/lib/chain";

export function Footer() {
  return (
    <footer className="mt-16 bg-[#070b09] border-t border-[#1e2d26]">
      {/* CTA band */}
      <div className="mx-auto max-w-shell px-4 sm:px-6 py-10 sm:py-12">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="mono-num text-[11px] tracking-[0.22em] text-[#00d084]">OBSERVATORY LEDGER — TESTNET</p>
            <h2 className="display mt-3">
              Trade the testnet.
              <br />
              <span className="text-[#ffc24b]">Prove the route.</span>
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#9fb3a8]">
              AetherisSwap routes testnet swaps through Ammora contracts on GIWA Sepolia.
              Every quote is live from the SDK — nothing here is a mock price.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Link href="/" className="btn-primary px-5 py-3 text-center text-sm">
              Open the Swap Terminal →
            </Link>
            <a
              href="https://ammora.org/waitlist#mission"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost px-5 py-3 text-center text-sm text-[#eef4ef]"
            >
              Builder Mission
            </a>
          </div>
        </div>

        {/* System status */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "GIWA RPC", value: GIWA_RPC_URL.replace("https://", ""), href: GIWA_RPC_URL },
            { label: "AMMORA DATA API", value: AMMORA_DATA_API_URL.replace("https://", ""), href: AMMORA_DATA_API_URL },
            { label: "EXPLORER", value: GIWA_EXPLORER_URL.replace("https://", ""), href: GIWA_EXPLORER_URL },
          ].map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="panel flex items-center justify-between gap-3 px-4 py-3 hover:border-[#00d084]/50 transition-colors"
            >
              <span>
                <span className="block text-[10px] mono-num tracking-[0.18em] text-[#9fb3a8]">{s.label}</span>
                <span className="mono-num mt-1 block truncate text-xs text-[#eef4ef]">{s.value}</span>
              </span>
              <span className="shrink-0 text-[#00d084]" aria-hidden>↗</span>
            </a>
          ))}
        </div>

        {/* Link columns — stack to 1 column on phones. */}
        <div className="mt-10 grid grid-cols-2 gap-8 border-t border-[#1e2d26] pt-8 sm:grid-cols-4">
          <div>
            <h3 className="mono-num text-[11px] tracking-[0.18em] text-[#eef4ef]">EXCHANGE</h3>
            <ul className="mt-3 space-y-2 text-sm text-[#9fb3a8]">
              <li><Link className="hover:text-[#00d084]" href="/">Swap</Link></li>
              <li><Link className="hover:text-[#00d084]" href="/tokens">Tokens</Link></li>
              <li><Link className="hover:text-[#00d084]" href="/activity">Activity</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="mono-num text-[11px] tracking-[0.18em] text-[#eef4ef]">PROTOCOL</h3>
            <ul className="mt-3 space-y-2 text-sm text-[#9fb3a8]">
              <li><a className="hover:text-[#00d084]" href="https://ammora.org" target="_blank" rel="noreferrer">Ammora</a></li>
              <li><a className="hover:text-[#00d084]" href="https://docs.ammora.org" target="_blank" rel="noreferrer">Docs</a></li>
              <li><a className="hover:text-[#00d084]" href="https://www.npmjs.com/package/@ammora-protocol/sdk" target="_blank" rel="noreferrer">SDK {SDK_VERSION} on npm</a></li>
            </ul>
          </div>
          <div>
            <h3 className="mono-num text-[11px] tracking-[0.18em] text-[#eef4ef]">DEVELOPERS</h3>
            <ul className="mt-3 space-y-2 text-sm text-[#9fb3a8]">
              <li><a className="hover:text-[#00d084]" href="https://github.com/BidyutRoy2/aetherisswap" target="_blank" rel="noreferrer">GitHub repo</a></li>
              <li><a className="hover:text-[#00d084]" href="https://github.com/AmmoraLabs/ammora-examples" target="_blank" rel="noreferrer">Ammora examples</a></li>
              <li><a className="hover:text-[#00d084]" href="https://faucet.giwa.io" target="_blank" rel="noreferrer">GIWA faucet</a></li>
            </ul>
          </div>
          <div>
            <h3 className="mono-num text-[11px] tracking-[0.18em] text-[#eef4ef]">NETWORK</h3>
            <ul className="mt-3 space-y-2 text-sm text-[#9fb3a8]">
              <li className="mono-num text-xs">Chain ID — {GIWA_SEPOLIA_CHAIN_ID}</li>
              <li className="mono-num text-xs break-all">RPC — {GIWA_RPC_URL}</li>
              <li className="mono-num text-xs break-all">Explorer — {GIWA_EXPLORER_URL}</li>
            </ul>
          </div>
        </div>

        {/* Ledger line + legal */}
        <div className="mt-10 flex flex-col gap-3 border-t border-[#1e2d26] pt-5 text-xs text-[#9fb3a8] sm:flex-row sm:items-center sm:justify-between">
          <p className="mono-num">Æ AETHERIS RESEARCH · x.com/aetherisweb3 · COORD 23.81°N 90.41°E · <span className="text-[#00d084]">v{APP_VERSION}</span></p>
          <p className="flex gap-4">
            <a className="hover:text-[#00d084]" href="https://x.com/aetherisweb3" target="_blank" rel="noreferrer">X</a>
            <a className="hover:text-[#00d084]" href="https://github.com/BidyutRoy2" target="_blank" rel="noreferrer">GitHub</a>
            <a className="hover:text-[#00d084]" href="https://ammora.org" target="_blank" rel="noreferrer">Ammora</a>
          </p>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-[#9fb3a8]/70">
          Testnet only. AetherisSwap runs on GIWA Sepolia with the Ammora SDK {SDK_VERSION} (beta testnet
          software — no mainnet deployment, no independent security audit). Never use real funds here.
          Testnet ETH and testnet tokens have no monetary value. Built by Bidyut Roy · MIT License.
        </p>
      </div>
    </footer>
  );
}

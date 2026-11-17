import Link from "next/link";
import { SwapBox } from "@/components/SwapBox";
import { SDK_VERSION } from "@/lib/chain";

const STEPS = [
  { n: "01", title: "Connect", text: "Connect a wallet on GIWA Sepolia (91342). No wallet, no swap — the button says so." },
  { n: "02", title: "Quote live", text: "The Ammora SDK quotes the route on-chain. No mock price is ever shown." },
  { n: "03", title: "Approve & swap", text: "Approve the token once if the route needs it, then sign the swap. Track it on the explorer." },
];

const ROUTE_STEPS = ["Wallet", "AmmoraRouteClient", "GIWA Sepolia contracts", "Explorer receipt"];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-shell px-3 sm:px-6">
      {/* Hero */}
      <section className="pt-8 sm:pt-12 pb-6 text-center">
        <p className="mono-num text-[11px] tracking-[0.24em] text-[#00d084]">
          AMMORA SDK {SDK_VERSION} · GIWA SEPOLIA · TESTNET ONLY
        </p>
        <h1 className="display mx-auto mt-4 max-w-3xl">
          Swap the testnet,
          <br />
          <span className="text-[#00d084]">see the real route.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-[#9fb3a8]">
          AetherisSwap is a testnet exchange built with the Ammora SDK. Quotes come live
          from Ammora routing on GIWA Sepolia — testnet ETH only, never real funds.
        </p>
      </section>

      {/* Swap terminal + side panel */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <SwapBox />

        <aside className="space-y-4">
          <div className="panel p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">How a swap travels</h2>
            <ol className="mt-3 space-y-2.5">
              {ROUTE_STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm">
                  <span className="mono-num grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#00d084]/50 text-[11px] text-[#00d084]">
                    {i + 1}
                  </span>
                  <span className="pt-0.5 text-[#eef4ef]">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs leading-relaxed text-[#9fb3a8]">
              The SDK plans the route and returns an unsigned plan. Your wallet signs —
              the SDK never signs or sends on your behalf.
            </p>
          </div>

          <div className="panel p-4 sm:p-5">
            <h2 className="font-display text-lg font-semibold">Testnet checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-[#9fb3a8]">
              <li>· Get test ETH — <a className="text-[#00d084] underline underline-offset-2" href="https://faucet.giwa.io" target="_blank" rel="noreferrer">faucet.giwa.io</a> (0.005 ETH / 24h)</li>
              <li>· Backup faucet — <a className="text-[#00d084] underline underline-offset-2" href="https://faucet.lambda256.io/giwa-sepolia" target="_blank" rel="noreferrer">Lambda256</a> (0.01 ETH / 24h)</li>
              <li>· Wrap ETH → WETH only when a swap needs spend balance</li>
              <li>· Every swap lands on the GIWA explorer with a hash</li>
            </ul>
            <Link href="/tokens" className="btn-ghost mt-4 inline-block px-4 py-2 text-sm">
              Browse launches →
            </Link>
          </div>
        </aside>
      </section>

      {/* Steps */}
      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <article key={s.n} className="panel p-4 sm:p-5">
            <p className="mono-num text-xs text-[#ffc24b]">{s.n}</p>
            <h3 className="font-display mt-2 text-lg font-semibold">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#9fb3a8]">{s.text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

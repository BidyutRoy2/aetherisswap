"use client";

/**
 * Price ticker strip. Items are labelled SAMPLE — design-review sample data
 * until the live build wires the Data API. The strip itself is masked with
 * overflow:hidden so it can never cause horizontal page scroll on mobile.
 */
const SAMPLE_ITEMS = [
  { label: "WETH / GIWA", value: "1.0000", change: "+0.00%" },
  { label: "tAMM / WETH", value: "—", change: "indexing" },
  { label: "ALC CURVES", value: "live", change: "GIWA Sepolia" },
  { label: "SDK", value: "0.3.9", change: "pinned" },
  { label: "CHAIN", value: "91342", change: "testnet" },
  { label: "GAS", value: "< 0.1 gwei", change: "testnet" },
];

export function Ticker() {
  const items = [...SAMPLE_ITEMS, ...SAMPLE_ITEMS];
  return (
    <div className="ticker-mask border-y border-[#1e2d26] bg-[#0d1512]" aria-label="Market ticker (sample data)">
      <div className="ticker-track py-2">
        {items.map((item, i) => (
          <span key={i} className="mx-5 inline-flex items-center gap-2 text-xs mono-num text-[#9fb3a8]">
            <span className="text-[#eef4ef] font-semibold">{item.label}</span>
            <span className="text-[#00d084]">{item.value}</span>
            <span className="text-[#ffc24b]">{item.change}</span>
            <span className="text-[#24352c]">◆</span>
          </span>
        ))}
      </div>
      <span className="sr-only">Ticker values are sample data for design review.</span>
    </div>
  );
}

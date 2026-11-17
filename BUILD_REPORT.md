# AetherisSwap — Build Report v0.1.0

**Date:** 2026-11-18 (Dhaka) · **Repo target:** `BidyutRoy2/aetherisswap` (not pushed — owner uploads)
**Stack:** Next.js 15.5 (App Router) + React 19 + strict TypeScript 5.9 + Tailwind 3.4 + viem 2.38 + wagmi 2.18 + RainbowKit 2.2.9 + `@ammora-protocol/sdk@0.3.9` (exact) + `@ammora-protocol/math@0.3.0` · Node 24 · **Cost: $0** (GitHub public + Vercel free, no domain, no paid RPC/API, no secrets committed)

## What was built

- **Swap terminal (`/`)** — RainbowKit connect, network guard for GIWA Sepolia (91342) with Switch button, From/To token select, amount input, live SDK quote (price, min received, fee, provider), slippage 50/100/300 bps (default 100), ETH (gas) vs WETH (spend) shown separately, Wrap ETH→WETH (`deposit()`) on request, approval tx first if the route needs it, then swap tx, explorer link on success. Wallet disconnected = swap disabled with the exact reason. Custom token by address (on-chain ERC-20 read: symbol/decimals). Default pair: WETH → AIV4C.
- **Tokens (`/tokens`)** — live launches from the Ammora Data API (name / symbol / address / curve / status / explorer link) with real loading / empty / error + retry states.
- **Activity (`/activity`)** — live chain head, RPC status, indexer status, launch feed.
- **Header / footer** — approved "Observatory" design (ink / emerald `#00D084` / amber `#FFC24B`, Fraunces headlines, IBM Plex Mono numbers, no purple gradient): dark ribbon (live attestation status, SDK 0.3.9, chain 91342, Docs/Explorer/Mission), Æ logo + BETA badge, numbered nav 01 Swap / 02 Tokens / 03 Activity, gas pill, chain selector, masked scrolling ticker; dark "Observatory Ledger" footer with CTA headline, System Status cards, 4-column links (Exchange / Protocol / Developers / Network), social links, testnet disclaimer.
- **Two-tier quoting (`src/lib/ammora.ts`)** — `AmmoraRouteClient` first (with `verificationBlock`, per SDK requirement for atomic multi-hop routing); on "no reviewed route", direct ALC quote fallback (`ALCClient.quoteExactInput`). Execution: route path via `prepareExactIn` + `execute`; ALC path via `planSwapExactInput` + approval + `walletClient.sendTransaction`. SDK refusals are surfaced with the SDK's own message — never faked.
- **Runtime verification** — the app verifies the SDK-pinned runtime code hashes (`giwaSepoliaAutoRouteRuntimeHashes`) against live `eth_getCode` on GIWA Sepolia at bootstrap (5 pins, staggered 650 ms for the public-RPC rate limit), shown in the ribbon. `attestAmmoraDeployment()` needs a reviewed release manifest that is not bundled with the npm package, so this is the equivalent direct check.
- **WalletConnect is optional** — if `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is unset, the app uses injected wallets only (MetaMask / Rabby) and never calls WalletConnect's cloud config.

## Files

`package.json` · `tsconfig.json` (strict) · `next.config.ts` · `tailwind.config.ts` · `postcss.config.js` · `.gitignore` · `.env.example` · `LICENSE` (MIT) · `README.md` · `BUILD_REPORT.md` · `public/favicon.svg` · `src/app/layout.tsx` · `src/app/globals.css` · `src/app/page.tsx` · `src/app/tokens/page.tsx` · `src/app/activity/page.tsx` · `src/lib/chain.ts` · `src/lib/tokens.ts` · `src/lib/ammora.ts` · `src/lib/wagmi.ts` · `src/components/Providers.tsx` · `src/components/Header.tsx` · `src/components/Footer.tsx` · `src/components/Ticker.tsx` · `src/components/SwapBox.tsx`

## Verification results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS, 0 errors** (4 errors fixed: SwapBox map typing, attestation rewritten to direct runtime-pin check) |
| `npm run build` | **PASS** — routes `/`, `/tokens`, `/activity` static; First Load JS ~494 kB home. Two extra deps added to fix a wagmi build failure: `@x402/evm@2.31.0` + `@x402/svm@2.31.0` (missing peers of `@coinbase/cdp-sdk` pulled in by wagmi 2.18 / RainbowKit 2.2.9) |
| Local run (`npm run start`, port 3100) | **PASS** — `/`, `/tokens`, `/activity` all HTTP 200 |
| Responsive / overflow (Playwright, headless Chromium) | **PASS** — `scrollWidth == innerWidth` at 1440px and 390px on all pages; swap box intact on mobile; footer stacks to 1 column; ticker masked. Screenshots reviewed: desktop-home, desktop-tokens, mobile-home, mobile-tokens, mobile-activity |
| Console errors in sandbox | Only `ERR_TUNNEL_CONNECTION_FAILED` for **external** hosts (sepolia-rpc.giwa.io, Data API, WalletConnect cloud, Google Fonts) — the sandbox browser blocks all non-local egress. These are not app errors; the same calls succeed from Node on this VM. **No app/JS errors.** |
| Live quote, node probes vs GIWA Sepolia (block ~41,607,288) | **Route quote FAILS** for WETH↔AIV4C ("no reviewed exact-input route is currently available", both directions). **ALC direct quote WORKS both ways:** BUY 0.001 WETH → 987,499,855,646,210 raw AIV4C (987,499.86 AIV4C), fee 12,500,000,000,000 raw, min-out at 1% slippage 977,624,857,089,747; SELL 1,000 AIV4C → 987,460,167 raw WETH (0.000987 WETH), fee 12,499,496 |
| Runtime pins | Sampled 4/15 pins matched in probe; app checks 5 at bootstrap with stagger |
| Data API | **Unreachable from this VM** (direct curl hung >40s; `/health` timeout 15s). Tokens/Activity pages show explicit error + Retry, never stale rows |
| `discoverPools` | 0 pools in last 2,000 blocks and 0 in last 500,000 blocks; not called on load |
| Live swap (funded wallet) | **NOT verified** — needs the user's wallet + faucet test ETH. `ALCClient.planSwapExactInput` refuses the canary curve ("the reviewed launch factory … did not create curve 0x2C4e…") because the canary predates the current reviewed auto-route factory. Route-path execution is wired for any pair where the route client returns a quote |

## Honest limits

- No live swap has been proven end-to-end for any pair from this VM. No graduation, mainnet, or live trading is claimed.
- The Tokens/Activity pages depend on the Data API; if it stays unreachable after deploy, they keep showing their honest error state — the swap terminal still works via paste-by-address.
- WalletConnect needs a real project ID (free at cloud.reown.com) for non-injected wallets; without it only injected wallets (MetaMask/Rabby) connect.
- Google Fonts are loaded via `next/font/google`; in offline/sandbox browsers they fall back to system serif/sans — no breakage, just a different face.

## Next steps for the user

1. **Upload** this repo to GitHub as `BidyutRoy2/aetherisswap` (public).
2. **Deploy free on Vercel** — import the repo, framework Next.js, no env vars required (optional: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` from a free Reown account).
3. **Get test ETH** — faucet.giwa.io (0.005 ETH / 24h) or faucet.lambda256.io/giwa-sepolia (0.01 ETH / 24h); add GIWA Sepolia (chain 91342, RPC `https://sepolia-rpc.giwa.io`) to the wallet.
4. **Wallet test** — connect on the live site, wrap a little ETH → WETH if needed, quote WETH → AIV4C, and attempt the swap. Report the exact SDK message if it refuses; if the canary curve stays unplannable, try a newer launch token from the Tokens page.
5. **X post** — from **@aetherisweb3** (the only usable account; @BidyutQuant and @0xAiExp are suspended): one original research-style post with a screenshot + the live link, then Verify X on the Ammora waitlist.
6. **Submit** at ammora.org/waitlist#mission — Project name **AetherisSwap**, website link, X post link. (The submit button first opens a Connect Wallet dialog.)

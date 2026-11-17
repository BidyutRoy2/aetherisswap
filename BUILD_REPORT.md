# AetherisSwap — Build Report v0.1.0

**Date:** 2026-11-18 (Dhaka) · **Repo target:** `BidyutRoy2/aetherisswap` (not pushed — owner uploads)
**Stack:** Next.js 15.5 (App Router) + React 19 + strict TypeScript 5.9 + Tailwind 3.4 + viem 2.38 + wagmi 2.18 + RainbowKit 2.2.9 + `@ammora-protocol/sdk@0.3.9` (exact) + `@ammora-protocol/math@0.3.0` · Node 24 · **Cost: $0** (GitHub public + Vercel free, no domain, no paid RPC/API, no secrets committed)

## v0.1.2 — custom wagmi Connect modal (2026-11-18 04:17 Dhaka)

**Problem (verified live):** in a clean browser the RainbowKit "Connect a Wallet" modal was empty — no MetaMask, no Coinbase. RainbowKit v2 only lists wallets from `connectorsForWallets`/`getDefaultConfig`, which need a WalletConnect/Reown project ID; raw wagmi connectors were not mapped to its wallet entries.
**Fix:** removed RainbowKit entirely (provider, ConnectButton, dependency + lockfile entry). New `src/components/ConnectModal.tsx` lists wagmi connectors directly: MetaMask and Coinbase Wallet always appear (with an official Install link when not detected), plus EIP-6963-discovered wallets (Rabby, Phantom, Keplr, …) via `eip6963:announceProvider` + wagmi discovery. Connect failures surface the connector's real error. Header now shows truncated address + Copy/Explorer/Disconnect menu and a "Switch to GIWA 91342" button on the wrong chain. **No WalletConnect, no project ID, no fake entries.** Live repo: `BidyutRoy2/aetherisswap` main; live site: https://aetherisswap.vercel.app (Vercel auto-deploys from main). **Not verified live:** a real wallet connection — no wallet is available on this VM; the user must confirm Connect works in their browser.


## What was built

- **Swap terminal (`/`)** — RainbowKit connect, network guard for GIWA Sepolia (91342) with Switch button, From/To token select, amount input, live SDK quote (price, min received, fee, provider), slippage 50/100/300 bps (default 100), ETH (gas) vs WETH (spend) shown separately, Wrap ETH→WETH (`deposit()`) on request, approval tx first if the route needs it, then swap tx, explorer link on success. Wallet disconnected = swap disabled with the exact reason. Custom token by address (on-chain ERC-20 read: symbol/decimals). Default pair: WETH → AIV4C.
- **Tokens (`/tokens`)** — live launches from the Ammora Data API (name / symbol / address / curve / status / explorer link) with real loading / empty / error + retry states.
- **Activity (`/activity`)** — live chain head, RPC status, indexer status, launch feed.
- **Header / footer** — approved "Observatory" design (ink / emerald `#00D084` / amber `#FFC24B`, Fraunces headlines, IBM Plex Mono numbers, no purple gradient): dark ribbon (live attestation status, SDK 0.3.9, chain 91342, Docs/Explorer/Mission), Æ logo + BETA badge, numbered nav 01 Swap / 02 Tokens / 03 Activity, gas pill, chain selector, masked scrolling ticker; dark "Observatory Ledger" footer with CTA headline, System Status cards, 4-column links (Exchange / Protocol / Developers / Network), social links, testnet disclaimer.
- **Two-tier quoting (`src/lib/ammora.ts`)** — `AmmoraRouteClient` first (with `verificationBlock`, per SDK requirement for atomic multi-hop routing); on "no reviewed route", direct ALC quote fallback (`ALCClient.quoteExactInput`). Execution: route path via `prepareExactIn` + `execute`; ALC path via `planSwapExactInput` + approval + `walletClient.sendTransaction`. SDK refusals are surfaced with the SDK's own message — never faked.
- **Runtime verification** — the app verifies the SDK-pinned runtime code hashes (`giwaSepoliaAutoRouteRuntimeHashes`) against live `eth_getCode` on GIWA Sepolia at bootstrap (5 pins, staggered 650 ms for the public-RPC rate limit), shown in the ribbon. `attestAmmoraDeployment()` needs a reviewed release manifest that is not bundled with the npm package, so this is the equivalent direct check.
- **WalletConnect is gone (v0.1.2)** — the custom wagmi modal lists MetaMask, Coinbase Wallet and injected wallets with no project ID at all. No WalletConnect cloud call is made anywhere.

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
- No WalletConnect project ID is used or needed (v0.1.2); the Connect modal lists MetaMask, Coinbase Wallet and injected wallets directly.
- Google Fonts are loaded via `next/font/google`; in offline/sandbox browsers they fall back to system serif/sans — no breakage, just a different face.

## Next steps for the user

1. **Upload** this repo to GitHub as `BidyutRoy2/aetherisswap` (public).
2. **Deploy free on Vercel** — import the repo, framework Next.js, no env vars required (optional: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` from a free Reown account).
3. **Get test ETH** — faucet.giwa.io (0.005 ETH / 24h) or faucet.lambda256.io/giwa-sepolia (0.01 ETH / 24h); add GIWA Sepolia (chain 91342, RPC `https://sepolia-rpc.giwa.io`) to the wallet.
4. **Wallet test** — connect on the live site, wrap a little ETH → WETH if needed, quote WETH → AIV4C, and attempt the swap. Report the exact SDK message if it refuses; if the canary curve stays unplannable, try a newer launch token from the Tokens page.
5. **X post** — from **@aetherisweb3** (the only usable account; @BidyutQuant and @0xAiExp are suspended): one original research-style post with a screenshot + the live link, then Verify X on the Ammora waitlist.
6. **Submit** at ammora.org/waitlist#mission — Project name **AetherisSwap**, website link, X post link. (The submit button first opens a Connect Wallet dialog.)

## v0.1.7 — tAMM route fix + ETH pay token (2026-11-18)

- **tAMM verdict (probed live):** tAMM `0x10B3…B06` ("tAmm Coin", 6 decimals, 1B supply) is Ammora's Season 2 campaign reward token, minted by EOA `0xd83C…46ac` — not a launch token. `curveForToken(tAMM)` on the reviewed factory `0x3535…68fA` returns the zero address (same call returns the canary curve for AIV4C, so the method is validated); route quote WETH→tAMM fails "no reviewed exact-input route". No quotable path exists for tAMM via the SDK; the app now says so plainly.
- **Curve discovery for custom tokens:** `discoverCurveForToken` (Data API `getLaunch` 8s cap, then on-chain `curveForToken` via `ammoraLaunchFactoryV4Abi`); optional pasted curve verified with `tokenForCurve`. Found curve is attached to the token so the ALC fallback can run.
- **Data API mapping bug fixed:** `AmmoraLaunchSummary` names the token `address`, not `tokenAddress` — launches never populated before; SwapBox + Tokens page now read `address` first.
- **ETH as pay token:** ETH wraps 1:1 to WETH first (explicit `giwaSepolia` chain, receipt awaited), then the normal WETH swap runs at the WETH quote. Wrap failure → swap never attempted; wrap-ok/swap-fail is reported as exactly that. Standalone Wrap row fixed the same way (explicit chain, explorer link, balance queries invalidated so numbers update without reload). WETH-balance-0 hint shown when a WETH amount is entered with 0 WETH.
- **Data API still unreachable from this VM** (3× curl timeout, exit 28, 2026-11-18) — on-chain discovery is the path that works everywhere.
- **Live swap still NOT proven end-to-end for any pair** — needs the user's wallet. ALC quote for AIV4C re-proven in the v0.1.7 probe (0.001 WETH → 987,499.86 AIV4C).

## v0.1.8 — first swappable token: $VTRS (2026-11-18)

- **Why AIV4C could never swap:** `ALCClient.planSwapExactInput` checks the curve against the SDK catalog's reviewed deployment (`giwaSepoliaSealed`, protocol v3, launch factory `0x42acd2531e47ea789c03915c9de195bf6250c0a2`) — NOT the auto-route factory `0x3535…68fA` the app used for curve discovery. AIV4C's curve `0x2C4e…D7B` was created by the auto-route factory, so the plan refuses it. The app's `findCurveOnChain` still uses the auto-route factory; known tokens carry their curve explicitly, so this does not block $VTRS.
- **Enumeration (proven on-chain):** the sealed factory emitted exactly 10 `LaunchCreated` events (topic `0x0d8c51…`) from its start block 32,472,683 to 41,611,178: 5 in Sep 2025 (AGC — since migrated, status 3, canonical pool `0x8Da2…782D`; VRFY/VRF3/VRF4/VRF5 verify fixtures, 9 dec, 1.0 token supply) and 5 on 2026-11-18 (BBPT "Bebop Test Token", $VLTS/$vlts "voltaris", HR "hddr", $VTRS "Voltaris" — all 9 dec, 7,500 supply, full reserves intact).
- **$VTRS proven swappable (blocks 41,611,178–41,611,265):** token `0xb2c47362C7dE0364882294CdFa7CA0A94F1e3bd0`, curve `0xa837EB660DCC3B707da451e35DC331A2c40e9Eff`, launched block 41,525,106. `curveForToken` + `tokenForCurve` match on the sealed factory; route quote fails (no reviewed route) so the app falls back to ALC; `planSwapExactInput` ACCEPTS with the app's exact call shape at 0.00001 WETH (minOut ~4,925.13 $VTRS). Max full-fill buy ≈ 0.00001009 WETH — above that the quote partially fills and the plan refuses, so buys must stay ≤ 0.00001 WETH. All 9 active sealed-factory curves behave the same; $VTRS was picked as the newest with full reserves.
- **Sell side not yet possible:** the curve holds no WETH (`quoteReserve` 0), so a sell quote reverts until buys have happened. Normal bonding-curve behaviour, not a bug.
- **Canary direct-buy question (research only, NOT implemented):** the curve contract (`segmentedBondingCurveV3Abi`) directly exposes `swapExactInput`/`swapExactOutput` — anyone can call the canary curve without the SDK. Doing that in the app would skip the reviewed-factory authenticity check, so a spoofed curve could consume a WETH approval without delivering tokens. No bypass built; needs the user's explicit approval first.
- **Still needs the user's wallet:** the actual Swap click on the live site (ETH → $VTRS, 0.00001, after Vercel redeploys). No transaction was signed or sent by the agent; all probes were read-only.

## v0.1.9 — partial-fill guard + plan check before wrap (2026-11-18)

- **Partial-fill signal (proven live):** the ALC quote returns `amountLeft`; `amountLeft > 0` means the curve cannot fill the entered amount in one swap. `LiveQuote` now carries `amountLeft` + `filledAmountIn`; `partialFillInfo()` derives the max full-fill from the live quote (never a per-token constant). At 0.0001 WETH the $VTRS quote fills only ≈0.0000101 WETH (`amountLeft` 89898989898989); at 0.00001 WETH it fully fills and the plan accepts.
- **Guard:** a partial-fill quote shows an amber warning and disables Swap ("Too large for one full fill — max ≈ …"). For ETH pay, `assertSwapPlannable()` runs the plan check *before* wrapping, so a doomed swap never sends a wrap tx ("Swap cannot proceed, so nothing was wrapped").

## v0.1.10 — deployed version visible (2026-11-18)

- `APP_VERSION` (from `package.json`, single source of truth) is shown in the header ribbon and footer, so a live check can confirm which build is serving instead of trusting the "DEPLOYMENT VERIFIED" banner.

## v0.1.11 — tiny max-fill amounts no longer truncate to "0" (2026-11-18)

- **Bug:** after the user's $VTRS buy moved the curve, the live max full-fill fell to 101010101100 wei (≈0.000000101 WETH) and the warning rendered as "can only fill ≈ 0 WETH… Enter 0 WETH or less" — `formatUnitsAmount` keeps only 6 decimal places. The warning logic itself (`amountLeft > 0`) was correct; only the display was wrong.
- **Fix:** new `formatUnitsAmountPrecise()` (keeps up to 10 significant fractional digits, truncation-only so a displayed max never exceeds the true fillable amount) + `isTinyUnitsAmount()` (below 0.000001 units). The warning and the disabled-Swap reason use the precise value; for a max below 0.000001 the warning also shows the raw units in parentheses, e.g. "can only fill ≈ 0.0000001010101011 WETH (101010101100 raw units)". The "You receive" quote and minimum-received displays use the same precise formatter (identical output for normal amounts — verified: 9874.998527 AIV4C, 5000 $VTRS, 0.00059 WETH all unchanged).

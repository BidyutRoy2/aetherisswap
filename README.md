# AetherisSwap

A testnet exchange on **GIWA Sepolia** (chain ID `91342`) built with the
**Ammora SDK `@ammora-protocol/sdk@0.3.9`** (Math `0.3.0`).

> **Testnet only.** This is beta testnet software. Ammora has announced no
> mainnet deployment and no independent security audit has been completed.
> Never use real funds here. Testnet ETH and testnet tokens have no monetary
> value.

## What it does

- **Swap terminal** — connect a wallet (custom wagmi modal — no WalletConnect project ID needed), pick tokens, get a live
  quote from `AmmoraRouteClient.quoteExactIn`, then approve (only if the route
  requires it) and execute. The SDK plans; your wallet signs. Every swap ends
  with a GIWA Explorer link.
- **Tokens** — launches listed live from the Ammora Data API
  (`https://ammora-giwa-sepolia-data.fly.dev`). Loading / empty / error states
  are real: if the indexer does not answer, the page says so.
- **Activity** — live GIWA Sepolia chain head, RPC and indexer status, plus the
  latest launch feed.
- **ETH vs WETH, kept separate** — ETH pays gas, WETH is the ERC-20 spend
  balance. A Wrap button (`deposit()`) is offered only when you ask for it.

## Free stack — $0

Next.js + Vercel (free plan) + GitHub (public repo) + GIWA Sepolia public RPC
(`https://sepolia-rpc.giwa.io`) + Ammora Data API + GIWA faucets. No domain,
no paid RPC, no paid API, no key is committed anywhere.

## Run locally

```bash
node --version   # 22 or 24
npm install
cp .env.example .env.local   # optional: WalletConnect project ID
npm run dev                  # http://localhost:3000
npm run typecheck
npm run build
```

## Deploy (Vercel, free)

1. Push this repo to GitHub (`BidyutRoy2/aetherisswap`).
2. Vercel → Add New → Project → import the repo. Framework: Next.js.
   Build command `npm run build`, output default. No env vars required
   (WalletConnect project ID is optional).
3. Deploy. The URL is your website link for the Ammora Builder Mission
   (Project name: **AetherisSwap**).

## Test it

1. Add GIWA Sepolia to your wallet: chain ID `91342`,
   RPC `https://sepolia-rpc.giwa.io`, explorer `https://sepolia-explorer.giwa.io`.
2. Get test ETH: [faucet.giwa.io](https://faucet.giwa.io) (0.005 ETH / 24h)
   or [faucet.lambda256.io/giwa-sepolia](https://faucet.lambda256.io/giwa-sepolia)
   (0.01 ETH / 24h).
3. Connect on the site, wrap a little ETH → WETH if needed, pick a launch
   token (or paste its address in the swap box), get a live quote, swap.
4. Verify the transaction on the GIWA explorer.

## Ammora Builder Mission

Ship an exchange or launchpad with the Ammora SDK → post it on X from
[@aetherisweb3](https://x.com/aetherisweb3) → submit the website link for
review at [ammora.org/waitlist#mission](https://ammora.org/waitlist#mission).
Reward is a bonus draw for approved builders ($tAMM + SBT) — not guaranteed.

## Notes / honest limits (verified 2026-11-18, GIWA Sepolia block ~41,607,288)

- **Two-tier quoting.** `AmmoraRouteClient.quoteExactIn` returns
  "no reviewed exact-input route is currently available" for WETH↔AIV4C (both
  directions). The app falls back to a direct ALC quote, which works:
  0.001 WETH → 987,499.86 AIV4C (fee 0.0000125 WETH); 1,000 AIV4C →
  0.000987 WETH. The live canary pair is ALC curve
  `0x2C4e…D7B`, base token AIV4C `0xc232…3B6e` ("Ammora Isolated V4 Canary",
  9 decimals, 750M supply).
- **Execution not yet proven end-to-end.** `ALCClient.planSwapExactInput`
  refuses the canary curve — "the reviewed launch factory … did not create
  curve 0x2C4e…" — because the canary predates the current reviewed
  auto-route factory. A live swap therefore still needs a funded wallet
  test; the app surfaces the SDK's own error instead of faking a success.
  Route-path execution (`prepareExactIn` + `execute`) is wired for any pair
  where the route client does return a quote.
- **Runtime attestation.** `attestAmmoraDeployment()` needs a reviewed
  release manifest (not bundled with the npm package), so the app verifies
  the same evidence directly: the SDK-pinned runtime code hashes
  (`giwaSepoliaAutoRouteRuntimeHashes`) against live `eth_getCode` on GIWA
  Sepolia (5 pins, staggered for the public RPC rate limit). All sampled
  pins matched in the 2026-11-18 probe.
- The Ammora Data API was unreachable from the build VM (connection timeouts
  on 2026-11-18); the Tokens/Activity pages handle that with an explicit
  error state and retry. Re-check after deploy.
- `discoverPools` log scans are slow on the public RPC (a 500k-block window
  did not finish in ~150s, and 0 pools in the last 2,000 blocks); the app
  does not call it on load. Token discovery goes through the Data API, plus
  paste-by-address.
- No graduation, no mainnet, no live trading is claimed. A swap can only be
  completed with a funded testnet wallet.

## License

MIT — see [LICENSE](LICENSE).

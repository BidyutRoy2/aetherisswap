import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http, injected } from "wagmi";
import { coinbaseWallet, metaMask } from "wagmi/connectors";
import { GIWA_RPC_URL, giwaSepolia } from "./chain";

/**
 * WalletConnect is OPTIONAL and only enabled when a real project ID is set
 * (free at cloud.reown.com -> NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID).
 * Without one, the app uses explicit injected wallets only, so the page
 * never depends on WalletConnect's cloud config. No key is committed.
 *
 * Explicit connectors (not just `injected()`) so RainbowKit lists
 * MetaMask and Coinbase Wallet even when the extension is not installed
 * in the visitor's browser — they then get an install prompt instead of
 * the wallet silently missing from the modal. `injected()` still adds
 * every other installed EIP-6963 wallet (Rabby, Phantom, Keplr, ...).
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export const wagmiConfig = projectId
  ? getDefaultConfig({
      appName: "AetherisSwap",
      projectId,
      chains: [giwaSepolia],
      transports: { [giwaSepolia.id]: http(GIWA_RPC_URL) },
      ssr: true,
    })
  : createConfig({
      chains: [giwaSepolia],
      transports: { [giwaSepolia.id]: http(GIWA_RPC_URL) },
      connectors: [
        metaMask(),
        coinbaseWallet({ appName: "AetherisSwap" }),
        injected(),
      ],
      ssr: true,
    });

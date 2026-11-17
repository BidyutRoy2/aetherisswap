import { createConfig, http, injected } from "wagmi";
import { coinbaseWallet, metaMask } from "wagmi/connectors";
import { GIWA_RPC_URL, giwaSepolia } from "./chain";

/**
 * No WalletConnect, no project ID — by design.
 *
 * RainbowKit v2 only lists wallets from `connectorsForWallets` /
 * `getDefaultConfig`, which require a WalletConnect/Reown project ID.
 * With raw wagmi connectors its modal came up empty for a fresh visitor,
 * so the app now drives its own Connect modal (see ConnectModal.tsx)
 * directly from these connectors:
 * - metaMask() — MetaMask (EIP-6963 discovered)
 * - coinbaseWallet() — Coinbase Wallet (no project ID needed)
 * - injected() — every other installed EIP-6963 wallet (Rabby, Phantom,
 *   Keplr, ...), auto-discovered by wagmi.
 */
export const wagmiConfig = createConfig({
  chains: [giwaSepolia],
  transports: { [giwaSepolia.id]: http(GIWA_RPC_URL) },
  connectors: [
    metaMask(),
    coinbaseWallet({ appName: "AetherisSwap" }),
    injected(),
  ],
  ssr: true,
});

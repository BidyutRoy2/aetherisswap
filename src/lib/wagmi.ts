import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { createConfig, http, injected } from "wagmi";
import { metaMask } from "wagmi/connectors";
import { GIWA_RPC_URL, giwaSepolia } from "./chain";

/**
 * WalletConnect is OPTIONAL and only enabled when a real project ID is set.
 * Without one, the app uses injected wallets only (MetaMask / Rabby) so the
 * page never depends on WalletConnect's cloud config. No key is committed.
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
      connectors: [injected(), metaMask()],
      ssr: true,
    });

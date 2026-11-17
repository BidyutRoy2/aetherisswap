import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // RainbowKit / wagmi pull in optional React Native shims; keep the
  // webpack resolution identical to the documented wagmi + Next setup.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;

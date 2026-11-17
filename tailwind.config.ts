import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070b09",
          900: "#0a0f0d",
          850: "#0d1512",
          800: "#111a16",
          700: "#1a2620",
          600: "#24352c",
        },
        emerald: { glow: "#00d084" },
        amber: { gold: "#ffc24b" },
        mist: "#9fb3a8",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: { shell: "76rem" },
    },
  },
  plugins: [],
};

export default config;

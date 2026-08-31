import type { Config } from "tailwindcss";

// Design-Tokens gemäß abgenommenem Mockup (neutral/schlicht, Tiefblau-Akzent).
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        "accent-weak": "var(--accent-weak)",
        good: "var(--good)",
        bad: "var(--bad)",
        warn: "var(--warn)",
      },
      borderRadius: { card: "10px" },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: { colors: { ink: "#111111", panel: "#1b1b1b", gold: "#f3c623" } } },
  plugins: [],
} satisfies Config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        pass: "#16a34a",
        fail: "#dc2626",
        warn: "#d97706",
      },
    },
  },
  plugins: [],
};
export default config;

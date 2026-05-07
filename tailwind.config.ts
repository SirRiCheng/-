import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        sand: "#f3efe7",
        amberline: "#f59e0b",
      },
      boxShadow: {
        float: "0 28px 70px -42px rgba(15, 23, 42, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;

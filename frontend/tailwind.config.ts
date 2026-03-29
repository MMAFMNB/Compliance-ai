import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        tam: {
          primary: "#0A2647",
          secondary: "#144272",
          accent: "#205295",
          light: "#2C74B3",
          gold: "#C4A55A",
        },
        cma: {
          green: "#1B5E20",
          blue: "#0D47A1",
        },
      },
      fontFamily: {
        arabic: ["IBM Plex Sans Arabic", "Tajawal", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

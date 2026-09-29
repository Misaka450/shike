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
        background: "var(--background)",
        foreground: "var(--foreground)",
        linen: {
          50: "#FAFAF7",
          100: "#F4F4EE",
          200: "#EAEAE2",
          300: "#DCDCD2",
          400: "#B8B8AC",
          500: "#8C8C80",
          600: "#5E5F57",
          700: "#3D3E3A",
          800: "#272825",
          900: "#1C1D1B",
        },
        forest: {
          50: "#F2F7F4",
          100: "#E2ECE6",
          200: "#C4D8CD",
          300: "#9EBEAD",
          400: "#6F9C86",
          500: "#4A7C64",
          600: "#36634F",
          700: "#2B4F3F",
          800: "#223E32",
          900: "#1B3229",
          950: "#0F1E18",
        },
        sage: {
          50: "#F5F8F6",
          100: "#E8EFEA",
          200: "#D2DFD6",
          300: "#B2C7B9",
          400: "#8EA997",
          500: "#6E8B78",
          600: "#55705E",
          700: "#44594B",
          800: "#38483E",
          900: "#2F3B33",
        },
        caramel: {
          50: "#FDF8F3",
          100: "#F9ECE0",
          200: "#F3D6BF",
          300: "#E9B893",
          400: "#DC9362",
          500: "#CD7438",
          600: "#BA5C29",
          700: "#9A4623",
          800: "#7C3822",
          900: "#662F1F",
        },
      },
    },
  },
  plugins: [],
};
export default config;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* ---- CARGOX brand (pitch mark + accents) ------------------------- */
        forest: "#123D32",
        emerald: { DEFAULT: "#16A36A", 600: "#128a59", 700: "#0f7450" },
        lime: "#B8E986",

        /* ---- workspace design system ("axiom" style) -------------------- */
        rail: { DEFAULT: "#151515", soft: "#1D1D1D", line: "#2A2A2A", mute: "#8A8A8A" },
        accent: { DEFAULT: "#FFD60A", 600: "#F2C200", 100: "#FFF4BF", 50: "#FFFBEB" },
        shell: "#EDEDED",
        panel: "#FFFFFF",
        ink: { DEFAULT: "#171717", muted: "#7A7A7A", faint: "#A5A5A5" },
        line: "#E8E8E8",
        soft: "#F5F5F5",
        surface: "#FFFFFF",
        canvas: "#F7F7F7",

        /* ---- marketing (dark cinematic) -------------------------------- */
        night: { DEFAULT: "#0A1016", 800: "#111A22", 700: "#1B2733", line: "#22303C" },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "Poppins", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["var(--font-poppins)", "Poppins", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,23,23,0.04)",
        lift: "0 10px 30px -18px rgba(17,17,17,0.35)",
        rail: "0 20px 45px -25px rgba(0,0,0,0.55)",
        cinema: "0 30px 80px -40px rgba(0,0,0,0.8)",
      },
      borderRadius: { xl2: "1.25rem", xl3: "1.75rem", pill: "999px" },
      keyframes: {
        "fade-up": { from: { opacity: 0, transform: "translateY(10px)" }, to: { opacity: 1, transform: "none" } },
        "fade-in": { from: { opacity: 0 }, to: { opacity: 1 } },
        "pulse-line": { "0%,100%": { opacity: 0.25 }, "50%": { opacity: 1 } },
        dash: { to: { strokeDashoffset: -240 } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "slide-right": { from: { transform: "translateX(24px)", opacity: 0 }, to: { transform: "none", opacity: 1 } },
      },
      animation: {
        "fade-up": "fade-up .5s cubic-bezier(.2,.8,.3,1) both",
        "fade-in": "fade-in .6s ease both",
        "pulse-line": "pulse-line 2.6s ease-in-out infinite",
        dash: "dash 6s linear infinite",
        shimmer: "shimmer 1.6s infinite",
        "slide-right": "slide-right .45s cubic-bezier(.2,.8,.3,1) both",
      },
    },
  },
  plugins: [],
};

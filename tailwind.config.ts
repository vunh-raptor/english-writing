import type { Config } from "tailwindcss";

/**
 * Scriptorium design system, expressed as shadcn/ui tokens.
 * Colors are driven by HSL CSS variables (see globals.css) so a single `.dark`
 * class on <html> repaints the whole app between "paper" (light) and
 * "lamplight" (dark). Oxford blue carries every interactive affordance; ochre
 * is reserved for grammar annotations; corners are square and surfaces flat.
 */
const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1200px" },
    },
    extend: {
      fontFamily: {
        // One face (layout.tsx). `serif` and `mono` are kept as names so older
        // class strings resolve into the same system instead of breaking.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        serif: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        // App-specific accents (sage + gold) exposed as tokens so both
        // themes stay coherent. Under Scriptorium, sage resolves to Oxford
        // and gold to Ochre.
        sage: {
          DEFAULT: "hsl(var(--sage) / <alpha-value>)",
          foreground: "hsl(var(--sage-foreground) / <alpha-value>)",
          muted: "hsl(var(--sage-muted) / <alpha-value>)",
          ink: "hsl(var(--sage-ink) / <alpha-value>)",
        },
        gold: {
          DEFAULT: "hsl(var(--gold) / <alpha-value>)",
          foreground: "hsl(var(--gold-foreground) / <alpha-value>)",
        },
        brand: {
          DEFAULT: "hsl(var(--brand) / <alpha-value>)",
          foreground: "hsl(var(--brand-foreground) / <alpha-value>)",
          muted: "hsl(var(--brand-muted) / <alpha-value>)",
          ink: "hsl(var(--brand-ink) / <alpha-value>)",
        },
        // Scriptorium signature accents for the annotation + feedback motif.
        // Oxford = interactive UI / style suggestions; Ochre = grammar issues.
        oxford: {
          DEFAULT: "hsl(var(--oxford) / <alpha-value>)",
          deep: "hsl(var(--oxford-deep) / <alpha-value>)",
          tint: "hsl(var(--oxford-tint) / <alpha-value>)",
          line: "hsl(var(--oxford-line) / <alpha-value>)",
          hl: "hsl(var(--oxford-hl) / <alpha-value>)",
        },
        ochre: {
          DEFAULT: "hsl(var(--ochre) / <alpha-value>)",
          tint: "hsl(var(--ochre-tint) / <alpha-value>)",
          line: "hsl(var(--ochre-line) / <alpha-value>)",
          hl: "hsl(var(--ochre-hl) / <alpha-value>)",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          primary: "hsl(var(--sidebar-primary) / <alpha-value>)",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          accent: "hsl(var(--sidebar-accent) / <alpha-value>)",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
        },
      },
      // Rounded, lifted surfaces. The scale is fixed rather than derived from
      // --radius so `rounded-2xl` means the same thing in every component.
      borderRadius: {
        none: "0px",
        sm: "6px",
        DEFAULT: "8px",
        md: "10px",
        lg: "14px",
        xl: "18px",
        "2xl": "22px",
        "3xl": "28px",
        full: "9999px",
      },
      boxShadow: {
        soft: "0 1px 2px hsl(var(--shadow-color) / 0.03)",
        md: "0 8px 28px -10px hsl(var(--shadow-color) / 0.16)",
        lg: "0 22px 50px -18px hsl(var(--shadow-color) / 0.26)",
        frame: "0 12px 32px hsl(var(--shadow-color) / 0.10)",
        glow: "0 10px 24px -10px hsl(var(--primary) / 0.6)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pop: {
          "0%": { transform: "scale(0.3)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "spark-in": {
          from: { opacity: "0", transform: "translateY(16px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.35s ease both",
        pop: "pop 0.5s cubic-bezier(0.2, 1.4, 0.4, 1) both",
        "spark-in": "spark-in 0.35s cubic-bezier(0.2, 1.2, 0.4, 1) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;

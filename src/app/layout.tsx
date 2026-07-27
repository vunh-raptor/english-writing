import type { Metadata, Viewport } from "next";
import { Newsreader, Source_Sans_3, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/store/AppProviders";
import { ThemeProvider } from "@/components/theme-provider";

/**
 * Scriptorium type system — one standardized set for every page:
 *   --font-serif — Newsreader, the display serif: headings, wordmark, document
 *                  titles, empty-state prose. A scholarly-journal voice.
 *   --font-sans  — Source Sans 3, the writing surface and every UI control.
 *                  Open apertures and a tall x-height so ESL readers parse it
 *                  fast at 17px.
 *   --font-mono  — IBM Plex Mono, metadata only: word counts, save state,
 *                  rubric codes, uppercase kickers.
 * All three are self-hosted by next/font, so they render identically on every
 * device. Vietnamese subset shipped alongside latin.
 */
const fontSerif = Newsreader({
  subsets: ["latin", "vietnamese"],
  variable: "--font-serif",
  display: "swap",
  // next/font ships no fallback-metric overrides for Newsreader; skip the
  // auto-adjust (and its build warning) and fall back to Georgia explicitly.
  adjustFontFallback: false,
  fallback: ["Georgia", "serif"],
});

const fontSans = Source_Sans_3({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
  display: "swap",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Flowrite — learn it today, say it today",
  description:
    "A few new English words every day — met properly, recalled from memory, then used in a sentence you wrote yourself.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F8FA" },
    { media: "(prefers-color-scheme: dark)", color: "#14161C" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`}
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}

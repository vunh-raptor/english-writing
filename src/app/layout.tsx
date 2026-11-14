import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/store/AppProviders";
import { ThemeProvider } from "@/components/theme-provider";

/**
 * One typeface for everything: Plus Jakarta Sans — a geometric sans with open
 * apertures, readable at writing-surface sizes, heavy and tight at heading
 * sizes. It replaced a three-face scholarly set (Newsreader, Source Sans 3,
 * IBM Plex Mono) when the app moved to its softer look.
 *
 * `--font-serif` and `--font-mono` point at the same face, so any `font-serif`
 * or `font-mono` class left in a component renders as part of the one system
 * rather than as a stray voice. Self-hosted by next/font; Vietnamese subset
 * shipped alongside latin.
 */
const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  variable: "--font-sans",
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
    { media: "(prefers-color-scheme: light)", color: "#F8F8FC" },
    { media: "(prefers-color-scheme: dark)", color: "#101018" },
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
      className={fontSans.variable}
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

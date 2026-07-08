import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProviders } from "@/store/AppProviders";

export const metadata: Metadata = {
  title: "Flowrite — write English freely",
  description:
    "Write English freely, polish it later. A calm, trend-driven freewriting habit for language learners.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#fbf8f3",
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
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

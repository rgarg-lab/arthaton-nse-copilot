import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { env } from "@/lib/env";
import { IDEA_TAGLINE } from "@/lib/config/client";
import { ASSISTANT_NAME, IDEA_NAME } from "@/lib/config/client";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(env("NEXT_PUBLIC_SITE_URL") ?? "http://localhost:3000"),
  // Every string here comes from idea.config.ts: this is the browser tab and the social
  // card, so inherited copy about someone else's product is exactly the wrong thing to ship.
  title: { default: `${IDEA_NAME} — ${IDEA_TAGLINE}`, template: `%s · ${IDEA_NAME}` },
  description: IDEA_TAGLINE,
  applicationName: IDEA_NAME,
  openGraph: {
    title: `${IDEA_NAME} — ${IDEA_TAGLINE}`,
    description: IDEA_TAGLINE,
    siteName: IDEA_NAME,
    type: "website",
  },
  twitter: { card: "summary_large_image", title: `${IDEA_NAME} — ${IDEA_TAGLINE}` },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} h-full`}
      /**
       * Browser extensions write attributes onto <html> before React hydrates — a reader
       * extension adding `data-…-bridge-ready` is enough to trip the hydration check and
       * fill the console with a mismatch warning about markup the app never produced.
       * Scoped to this element only, so a genuine mismatch inside the app still reports.
       */
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

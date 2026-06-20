import type { Metadata } from "next";
import { Dancing_Script, Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const dancing = Dancing_Script({
  subsets: ["latin"],
  variable: "--font-dancing",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sathuuty.vercel.app"),
  title: "SathukuttyntePDF",
  description: "Convert hundreds of photos into a single beautiful PDF. Free, private, browser-only.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: {
    title: "SathukuttyntePDF",
    description: "Turn your memories into pages.",
    images: ["/og-image.svg"],
  },
};

export const viewport = {
  themeColor: "#e8637a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable} ${dancing.variable} h-full`}>
      <body className="min-h-full bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased">{children}</body>
    </html>
  );
}

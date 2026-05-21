import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuroraBackground } from "@/components/effects/aurora-background";
import { ScrollProgress } from "@/components/effects/scroll-progress";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GoSpots — One screen to run your gaming venue",
  description:
    "GoSpots is the operating system for billiard halls, gaming lounges, and entertainment centers. Live sessions, automatic billing, staff control, and daily revenue from one realtime dashboard.",
  metadataBase: new URL("https://gospots.app"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="relative min-h-full bg-[var(--color-background)] font-sans text-zinc-100">
        <AuroraBackground />
        <ScrollProgress />
        {children}
      </body>
    </html>
  );
}

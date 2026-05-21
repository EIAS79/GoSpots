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
  title: "GoSpots — Find your next spot",
  description:
    "GoSpots helps players find billiard halls, gaming lounges, and entertainment venues — and gives owners one screen to run sessions, billing, and staff.",
  metadataBase: new URL("https://gospots.vercel.app"),
  icons: {
    icon: "/gospots.png",
    apple: "/gospots.png",
  },
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

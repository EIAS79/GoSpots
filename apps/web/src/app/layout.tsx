import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AppProviders } from "@/components/layout/app-providers";
import { getSiteUrlString } from "@/lib/site-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrlString();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GoSpots — live venue operations & discovery",
    template: "%s · GoSpots",
  },
  description:
    "GoSpots is a private-beta platform for venue operators: one live screen for tables and consoles, session timers, reservations, billing, staff controls, and daily revenue clarity. Players can browse the growing public directory and reserve where venues enable it.",
  applicationName: "GoSpots",
  keywords: [
    "billiard hall software",
    "gaming lounge POS",
    "snooker club reservations",
    "venue session timer",
    "entertainment venue billing",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "GoSpots",
    title: "GoSpots — live venue operations & discovery",
    description:
      "Run sessions, reservations, billing, and staff from one dashboard. Players discover billiard halls, lounges, and game cafés as venues publish on GoSpots.",
    images: [
      {
        url: "/gospots.png",
        alt: "GoSpots",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "GoSpots — live venue operations & discovery",
    description:
      "One live operations screen for entertainment venues. Honest beta — onboarding operators first.",
    images: ["/gospots.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} relative h-full antialiased`}
    >
      <body className="relative min-h-full bg-[var(--color-background)] font-sans text-[var(--color-foreground)] transition-colors duration-300">
        <Script id="gospots-theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('gospots-theme');var r=document.documentElement;if(t==='light'){r.classList.remove('dark');r.dataset.theme='light';}else{r.classList.add('dark');r.dataset.theme='dark';}}catch(e){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';}})();`}
        </Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}

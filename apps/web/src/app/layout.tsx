import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AppProviders } from "@/components/layout/app-providers";
import { OfflineBanner } from "@/components/layout/offline-banner";
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
    default: "Locora — host every location",
    template: "%s · Locora",
  },
  description:
    "Locora is the dashboard for gaming centers, restaurants, and venues: publish your site, take reservations, collect reviews, and run day-to-day operations from one place.",
  applicationName: "Locora",
  keywords: [
    "venue dashboard",
    "gaming center software",
    "restaurant reservations",
    "venue website builder",
    "host venue management",
    "venue reviews and contact",
    "entertainment venue billing",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "Locora",
    title: "Locora — host every location",
    description:
      "Dashboard for gaming centers, restaurants, and venues — publish your site, take reservations, collect reviews.",
    images: [
      {
        url: "/brand/locora-og.svg",
        alt: "Locora",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Locora — host every location",
    description:
      "Host every location: dashboard, public venue site, bookings, reviews, and contact.",
    images: ["/brand/locora-og.svg"],
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
        <Script id="locora-theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('locora-theme')||localStorage.getItem('gospots-theme');var r=document.documentElement;if(t==='light'){r.classList.remove('dark');r.dataset.theme='light';}else{r.classList.add('dark');r.dataset.theme='dark';}}catch(e){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';}})();`}
        </Script>
        <AppProviders>
          <OfflineBanner />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { AppProviders } from "@/components/layout/app-providers";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
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
const defaultTitle = `${BRAND_NAME} — ${BRAND_TAGLINE}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: defaultTitle,
    template: `%s · ${BRAND_NAME}`,
  },
  description:
    "GoSpots is the dashboard for gaming centers, restaurants, and venues: publish your site, take reservations, collect reviews, and run day-to-day operations from one place.",
  applicationName: BRAND_NAME,
  keywords: [
    "venue dashboard",
    "gaming center software",
    "restaurant reservations",
    "venue website builder",
    "host venue management",
    "venue reviews and contact",
    "entertainment venue billing",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/brand/gospots-icon.png", type: "image/png", sizes: "804x804" },
    ],
    shortcut: "/favicon.ico",
    apple: "/brand/gospots-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: BRAND_NAME,
    title: defaultTitle,
    description:
      "Dashboard for gaming centers, restaurants, and venues — publish your site, take reservations, collect reviews.",
    images: [
      {
        url: "/brand/gospots-og.png",
        alt: BRAND_NAME,
      },
    ],
  },
  twitter: {
    card: "summary",
    title: defaultTitle,
    description:
      `${BRAND_TAGLINE} — dashboard, public venue site, bookings, reviews, and contact.`,
    images: ["/brand/gospots-og.png"],
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
          {`(function(){try{var t=localStorage.getItem('gospots-theme')||localStorage.getItem('locora-theme');var r=document.documentElement;if(t==='light'){r.classList.remove('dark');r.dataset.theme='light';}else{r.classList.add('dark');r.dataset.theme='dark';}}catch(e){document.documentElement.classList.add('dark');document.documentElement.dataset.theme='dark';}})();`}
        </Script>
        <AppProviders>
          <OfflineBanner />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { LocoraLogo as GoSpotsLogo } from "@/components/brand/locora-logo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How GoSpots collects, uses, and protects account, venue, booking, and payment data.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-full bg-zinc-950 text-zinc-200">
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16">
        <GoSpotsLogo href="/" size="md" showTagline />
        <p className="mt-6">
          <Link
            href="/"
            className="text-sm text-emerald-400 transition hover:text-emerald-300"
          >
            ← Back to home
          </Link>
        </p>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-white md:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Last updated: July 19, 2026
        </p>

        <div className="prose-invert mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
          <p>
            GoSpots (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates
            a venue operations and discovery platform. This Privacy Policy
            explains what information we process when you use gospots.eu and
            related services, and why. It is informational only and is not legal
            advice.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              1. Who this applies to
            </h2>
            <p>
              This policy covers venue operators (owners, managers, and staff),
              guests who browse or book venues, and anyone who contacts us or
              creates an account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              2. Data we process
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-zinc-400">
              <li>
                <span className="text-zinc-200">Account data</span> — name,
                email, password (hashed), phone (optional), and role within a
                venue.
              </li>
              <li>
                <span className="text-zinc-200">Venue data</span> — venue name,
                address, hours, photos, resources (tables, stations, rooms),
                menus, rates, and public listing content you publish.
              </li>
              <li>
                <span className="text-zinc-200">Bookings &amp; operations</span>{" "}
                — reservations, session timers, orders, staff actions, and
                related operational records.
              </li>
              <li>
                <span className="text-zinc-200">Payments</span> — subscription
                billing for venue features is processed by Lemon Squeezy. We
                receive billing status and related metadata; we do not store full
                card numbers on our servers.
              </li>
              <li>
                <span className="text-zinc-200">Emails &amp; messages</span> —
                transactional emails (e.g. invites, password resets, booking
                confirmations) and optional guest↔staff chat content when that
                feature is enabled.
              </li>
              <li>
                <span className="text-zinc-200">Technical data</span> — IP
                address, device/browser type, and basic usage logs needed to
                secure and improve the service.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              3. How we use data
            </h2>
            <p>We use personal and venue data to:</p>
            <ul className="list-disc space-y-2 pl-5 text-zinc-400">
              <li>Provide, maintain, and improve the GoSpots platform</li>
              <li>Authenticate users and enforce tenant isolation between venues</li>
              <li>Process bookings, sessions, and operational workflows</li>
              <li>Bill venue subscriptions via Lemon Squeezy</li>
              <li>Send service emails and respond to support requests</li>
              <li>Detect abuse, prevent fraud, and keep the service secure</li>
            </ul>
            <p>
              We do not sell personal data. Venue directory content you choose to
              publish is visible to the public as part of discovery.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              4. Sharing &amp; processors
            </h2>
            <p>
              We share data with service providers only as needed to run GoSpots,
              including hosting, email delivery, and Lemon Squeezy for payments.
              Venue staff you invite can access operational data for that venue
              according to their roles. We may disclose information if required
              by law or to protect the rights and safety of users and the
              platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              5. Retention &amp; security
            </h2>
            <p>
              We retain account and venue data while your account is active and
              for a reasonable period afterward as needed for billing, audits,
              and legal obligations. We use industry-standard measures (including
              encryption in transit and access controls) to protect data. No
              method of transmission or storage is 100% secure.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">6. Your choices</h2>
            <p>
              You may update account details in the product, request access or
              deletion where applicable, and unsubscribe from non-essential
              marketing emails. Venue owners control what appears on their public
              listing. For privacy requests, contact{" "}
              <a
                href="mailto:support@gospots.eu"
                className="text-emerald-400 hover:text-emerald-300"
              >
                support@gospots.eu
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">7. Children</h2>
            <p>
              GoSpots is intended for business operators and adult guests. We do
              not knowingly collect personal information from children under 16.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">8. Changes</h2>
            <p>
              We may update this policy from time to time. The &quot;Last
              updated&quot; date above will change when we do. Continued use of
              the service after an update constitutes acceptance of the revised
              policy where permitted by law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">9. Contact</h2>
            <p>
              Questions about privacy:{" "}
              <a
                href="mailto:support@gospots.eu"
                className="text-emerald-400 hover:text-emerald-300"
              >
                support@gospots.eu
              </a>
              .
            </p>
          </section>

          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-500">
            This page is a plain-language summary for product transparency. It is
            not legal advice. If you need advice for your jurisdiction or
            business, consult a qualified attorney.
          </p>
        </div>
      </div>
    </main>
  );
}

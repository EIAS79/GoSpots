import type { Metadata } from "next";
import Link from "next/link";
import { LocoraLogo } from "@/components/brand/locora-logo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing use of the Locora venue operations and discovery platform.",
};

export default function TermsPage() {
  return (
    <main className="min-h-full bg-zinc-950 text-zinc-200">
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16">
        <LocoraLogo href="/" size="md" showTagline />
        <p className="mt-6">
          <Link
            href="/"
            className="text-sm text-emerald-400 transition hover:text-emerald-300"
          >
            ← Back to home
          </Link>
        </p>

        <h1 className="mt-8 text-3xl font-bold tracking-tight text-white md:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Last updated: July 19, 2026
        </p>

        <div className="prose-invert mt-10 space-y-8 text-sm leading-relaxed text-zinc-300">
          <p>
            These Terms of Service (&quot;Terms&quot;) govern access to and use
            of Locora, a software platform for venue operations (sessions,
            reservations, billing tools, staff controls) and public venue
            discovery. By creating an account or using the service, you agree to
            these Terms. This document is informational and is not legal advice.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              1. The service
            </h2>
            <p>
              Locora provides web-based tools for entertainment and hospitality
              venues and a public directory where published venues can be found
              and, where enabled, reserved by guests. Features available to a
              venue depend on the modules and add-ons selected (and any trial
              period). We may change, suspend, or discontinue parts of the
              service with reasonable notice when practicable.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              2. Accounts &amp; eligibility
            </h2>
            <p>
              You must provide accurate registration information and keep
              credentials secure. Venue operator accounts are for businesses and
              authorized staff. You are responsible for activity under your
              account and for staff you invite. Guests may browse without an
              account; booking flows may require sign-in when a venue enables
              them.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              3. Venue content &amp; operations
            </h2>
            <p>
              You retain ownership of content you upload (photos, menus,
              descriptions, rates). You grant Locora a license to host, display,
              and process that content to operate the platform, including public
              listings you choose to publish. You are solely responsible for the
              accuracy of venue information, pricing, availability, and
              compliance with local laws (including alcohol, age, and consumer
              rules).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              4. Bookings &amp; guest use
            </h2>
            <p>
              Reservations and session records are between the guest and the
              venue unless we expressly state otherwise. Locora is not a party
              to on-premise services sold by venues. Guests agree not to misuse
              bookings, scrape the directory, or interfere with other users.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              5. Subscriptions &amp; payments
            </h2>
            <p>
              Paid venue features and employee seats are billed through Lemon
              Squeezy. Prices are shown in-product (for example, feature add-ons
              and per-seat fees). Trials, renewals, and cancellations follow the
              checkout and billing terms presented at purchase. Taxes may apply.
              Failure to pay may result in suspension of paid modules while core
              data is retained as described in our Privacy Policy.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              6. Acceptable use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc space-y-2 pl-5 text-zinc-400">
              <li>Attempt to access another venue&apos;s tenant data</li>
              <li>Reverse engineer, overload, or disrupt the service</li>
              <li>Upload unlawful, infringing, or harmful content</li>
              <li>Use Locora to send spam or deceptive communications</li>
              <li>Misrepresent your venue or impersonate others</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              7. Intellectual property
            </h2>
            <p>
              The Locora name, logo, software, and design are our property or
              that of our licensors. These Terms do not grant you rights to our
              trademarks except as needed to identify your use of the product.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              8. Disclaimers
            </h2>
            <p>
              The service is provided &quot;as is&quot; and &quot;as
              available.&quot; We do not warrant uninterrupted or error-free
              operation, nor that directory listings or operational tools will
              meet every business need. To the fullest extent permitted by law,
              we disclaim implied warranties of merchantability, fitness for a
              particular purpose, and non-infringement.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              9. Limitation of liability
            </h2>
            <p>
              To the fullest extent permitted by law, Locora and its suppliers
              are not liable for indirect, incidental, special, consequential, or
              punitive damages, or for lost profits, revenue, or data, arising
              from use of the service. Our aggregate liability for claims
              relating to the service is limited to the fees you paid us for the
              three months preceding the claim (or zero if you are on a free
              trial with no fees paid).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">10. Termination</h2>
            <p>
              You may stop using Locora at any time. We may suspend or terminate
              access for breach of these Terms, non-payment, or risk to the
              platform. Provisions that by nature should survive (including IP,
              disclaimers, and liability limits) will survive termination.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">11. Changes</h2>
            <p>
              We may update these Terms. Material changes will be reflected by
              the &quot;Last updated&quot; date. Continued use after changes take
              effect constitutes acceptance where permitted by law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">
              12. Contact
            </h2>
            <p>
              Questions about these Terms:{" "}
              <a
                href="mailto:hello@locora.app"
                className="text-emerald-400 hover:text-emerald-300"
              >
                hello@locora.app
              </a>
              . See also our{" "}
              <Link
                href="/privacy"
                className="text-emerald-400 hover:text-emerald-300"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <p className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-zinc-500">
            These Terms are a standard SaaS-style summary for product clarity.
            They are not legal advice. For jurisdiction-specific counsel, consult
            a qualified attorney.
          </p>
        </div>
      </div>
    </main>
  );
}

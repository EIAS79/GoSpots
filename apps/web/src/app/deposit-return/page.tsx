import Link from "next/link";

export default function DepositReturnPage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
        <section className="w-full rounded-2xl border border-border bg-card p-8 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            Reservation deposit
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Checkout returned to GoSpots
          </h1>
          <p className="mt-4 leading-7 text-muted-foreground">
            If your payment succeeded, GoSpots confirms it from Stripe on the
            server and records the deposit against your reservation. The browser
            return page is never used as proof of payment.
          </p>
          <p className="mt-3 leading-7 text-muted-foreground">
            Provider confirmation can occasionally take a short time. GoSpots
            can reconcile the Stripe Checkout session without charging you
            again.
          </p>
          <div className="mt-8">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 font-medium text-primary-foreground"
            >
              Return to GoSpots
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function OfflineFallbackPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-zinc-950 px-6 text-zinc-100">
      <section className="max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-6">
        <h1 className="text-xl font-bold">GoSpots is offline</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Return to an already opened venue dashboard to continue supported Offline Lite work. Card payments, refunds, fiscalization and KSeF remain unavailable until the connection returns.
        </p>
      </section>
    </main>
  );
}

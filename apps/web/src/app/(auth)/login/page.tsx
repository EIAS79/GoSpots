import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-8 shadow-xl">
      <h1 className="text-2xl font-semibold text-white">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Auth provider will be wired in the next step (Better Auth / Auth.js).
      </p>
      <form className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-zinc-400">Email</span>
          <input
            type="email"
            name="email"
            placeholder="owner@venue.com"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none ring-emerald-500/50 focus:ring-2"
            disabled
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-zinc-400">Password</span>
          <input
            type="password"
            name="password"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-white outline-none ring-emerald-500/50 focus:ring-2"
            disabled
          />
        </label>
        <button
          type="button"
          disabled
          className="mt-2 rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 opacity-50"
        >
          Continue (coming soon)
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-zinc-500">
        <Link href="/" className="text-emerald-400 hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}

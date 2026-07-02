import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold">SafeTracks HQ</h1>
      <p className="text-slate-400">
        Verifiable Intelligence Platform for the Azimuth Foundation.
      </p>
      <div className="flex gap-4">
        <Link
          href="/public"
          className="rounded-md bg-slate-100 px-4 py-2 font-medium text-ink hover:bg-white"
        >
          Transparency Dashboard
        </Link>
        <Link
          href="/admin"
          className="rounded-md border border-slate-700 px-4 py-2 font-medium text-slate-100 hover:border-slate-500"
        >
          Executive Hub
        </Link>
      </div>
    </main>
  );
}

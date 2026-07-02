import Link from "next/link";
import { getActorRole } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActorRole();

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/admin" className="font-semibold">
            SafeTracks Executive Hub
          </Link>
          {actor && (
            <span className="text-sm text-slate-400">
              {actor.display_name} &middot; {actor.role}
            </span>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}

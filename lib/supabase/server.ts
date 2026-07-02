import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server-side client for use in Server Components, Route Handlers, and
 * Server Actions. Reads the session from cookies so RLS policies evaluate
 * against the signed-in user (auth.uid()), not the anon role.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component - middleware handles session refresh instead.
          }
        },
      },
    }
  );
}

/**
 * Looks up the caller's organizational role via actor_roles. Returns null
 * for signed-out visitors or signed-in users with no role assigned (both
 * are treated as PUBLIC by lib/events/rbac.ts).
 */
export async function getActorRole() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("actor_roles")
    .select("role, display_name")
    .eq("actor_id", user.id)
    .maybeSingle();

  return data ?? null;
}

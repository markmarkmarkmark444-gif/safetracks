import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getActorRole } from "@/lib/supabase/server";
import { EventType, defaultVisibility, eventSchemas } from "@/lib/events/taxonomy";
import { EventVisibility, canWrite } from "@/lib/events/rbac";

const createEventRequest = z.object({
  event_type: EventType,
  event_payload: z.record(z.unknown()),
  visibility: EventVisibility.optional(),
});

/**
 * Appends a new event to org_events. This is the only supported way to
 * write events from the UI - it validates the payload against the taxonomy
 * (lib/events/taxonomy.ts) before insert, so malformed events never reach
 * the log. RLS (see migration 0001) enforces the write is actually allowed
 * even if this check is bypassed.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const actor = await getActorRole();
  if (!canWrite(actor?.role ?? null)) {
    return NextResponse.json({ error: "Not authorized to log events." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createEventRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { event_type, event_payload, visibility } = parsed.data;

  const payloadSchema = eventSchemas[event_type];
  const payloadResult = payloadSchema.safeParse(event_payload);
  if (!payloadResult.success) {
    return NextResponse.json(
      { error: `Invalid payload for ${event_type}`, details: payloadResult.error.flatten() },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("org_events")
    .insert({
      event_type,
      actor_id: user.id,
      visibility: visibility ?? defaultVisibility[event_type],
      event_payload: payloadResult.data,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ event: data }, { status: 201 });
}

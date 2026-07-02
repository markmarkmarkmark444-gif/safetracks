import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getActorRole } from "@/lib/supabase/server";
import { anchorEventToHedera, type HcsPayload } from "@/lib/hedera";
import { canWrite } from "@/lib/events/rbac";

const anchorRequest = z.object({ event_id: z.string().uuid() });

/**
 * Anchors an already-written org_events row onto Hedera Consensus Service
 * and records the receipt in event_anchors (see migration 0001).
 *
 * Anchoring is deliberately a separate step from creating the event
 * (/api/events): writing to Postgres must never fail because Hedera is
 * unreachable, and anchoring should be retryable independent of the event
 * itself. Only the payload's hash goes on-chain (see lib/hedera.ts) -
 * EXECUTIVE_ONLY events get the same integrity guarantee as PUBLIC ones
 * without ever exposing their contents.
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
    return NextResponse.json({ error: "Not authorized to anchor events." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = anchorRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: event, error: fetchError } = await supabase
    .from("org_events")
    .select("*")
    .eq("event_id", parsed.data.event_id)
    .single();

  if (fetchError || !event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const { data: existingAnchor } = await supabase
    .from("event_anchors")
    .select("event_id")
    .eq("event_id", event.event_id)
    .maybeSingle();

  if (existingAnchor) {
    return NextResponse.json({ error: "Event is already anchored." }, { status: 409 });
  }

  const payloadHash = createHash("sha256")
    .update(JSON.stringify(event.event_payload))
    .digest("hex");

  const hcsPayload: HcsPayload = {
    event_id: event.event_id,
    event_type: event.event_type,
    visibility: event.visibility,
    created_at: event.created_at,
    payload_hash: payloadHash,
  };

  let anchor;
  try {
    anchor = await anchorEventToHedera(hcsPayload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Hedera error.";
    return NextResponse.json({ error: `Hedera anchoring failed: ${message}` }, { status: 502 });
  }

  const { data: anchorRow, error: insertError } = await supabase
    .from("event_anchors")
    .insert({
      event_id: event.event_id,
      hedera_topic_id: anchor.topicId,
      hedera_sequence_number: anchor.sequenceNumber,
      hedera_consensus_timestamp: anchor.consensusTimestamp,
      payload_hash: payloadHash,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: `Anchored on Hedera but failed to record receipt: ${insertError.message}`, anchor },
      { status: 500 }
    );
  }

  return NextResponse.json({ anchor: anchorRow }, { status: 201 });
}

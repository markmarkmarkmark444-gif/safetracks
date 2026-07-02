/**
 * Seeds the initial event stream: the NDEWS pivot decision, Chapter 252
 * certification project status, and the first published SOP.
 *
 * Run with `npm run seed` after you have:
 *   1. Applied supabase/migrations/0001_org_events.sql to your project
 *   2. Created your own Supabase Auth user (sign up once via /admin/login,
 *      or through the Supabase dashboard)
 *   3. Set SUPABASE_SERVICE_ROLE_KEY and SEED_EXECUTIVE_EMAIL in .env.local
 *      (service role key bypasses RLS - never expose it to the browser,
 *      it's only ever read here, server-side, at seed time)
 *
 * This script grants that user the EXECUTIVE role if they don't have one
 * yet, then appends the seed events as that user.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "../lib/supabase/database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const executiveEmail = process.env.SEED_EXECUTIVE_EMAIL;

if (!supabaseUrl || !serviceRoleKey || !executiveEmail) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SEED_EXECUTIVE_EMAIL before seeding."
  );
}

const supabase = createClient<Database>(supabaseUrl, serviceRoleKey);

async function main() {
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) throw userError;

  const executive = users.users.find((u) => u.email === executiveEmail);
  if (!executive) {
    throw new Error(
      `No auth user found for ${executiveEmail}. Sign up via /admin/login first, then re-run the seed.`
    );
  }

  await supabase
    .from("actor_roles")
    .upsert({ actor_id: executive.id, role: "EXECUTIVE", display_name: "Founder" });

  const ndewsDecisionId = randomUUID();
  const chapter252ProjectId = randomUUID();
  const forensicKitProjectId = randomUUID();
  const sopId = randomUUID();

  const { error: insertError } = await supabase.from("org_events").insert([
    {
      event_type: "DECISION_APPROVED",
      actor_id: executive.id,
      visibility: "BOARD",
      event_payload: {
        decision_id: ndewsDecisionId,
        title: "Pivot to NDEWS feed for syndromic surveillance",
        summary:
          "SafeTracks will source overdose and drug-checking signal data from the National Drug Early Warning System (NDEWS) rather than building a bespoke ingestion pipeline.",
        rationale:
          "NDEWS is already validated, funded, and maintained; building our own feed duplicates effort we can't sustain at current headcount and delays the Chapter 252 certification timeline.",
        alternatives_considered: [
          "Build a proprietary ingestion pipeline from county EMS data",
          "Delay surveillance features until post-certification",
        ],
        related_project_id: chapter252ProjectId,
        sop_reference: null,
        approved_by: [executive.id],
        effective_date: new Date().toISOString().slice(0, 10),
      },
    },
    {
      event_type: "PROJECT_STATUS_UPDATED",
      actor_id: executive.id,
      visibility: "PARTNER_MAP",
      event_payload: {
        project_id: chapter252ProjectId,
        project_name: "Chapter 252 Certification",
        status: "IN_PROGRESS",
        percent_complete: 25,
        status_note: "NDEWS integration decided; certification application drafting underway.",
      },
    },
    {
      event_type: "PROJECT_STATUS_UPDATED",
      actor_id: executive.id,
      visibility: "EXECUTIVE_ONLY",
      event_payload: {
        project_id: forensicKitProjectId,
        project_name: "DPS Forensic Kit Module",
        status: "NOT_STARTED",
        percent_complete: 0,
        status_note: "Scoping module requirements with DPS forensic team.",
      },
    },
    {
      event_type: "SOP_PUBLISHED",
      actor_id: executive.id,
      visibility: "PARTNER_MAP",
      event_payload: {
        sop_id: sopId,
        title: "Mobile SSP Field Operations SOP",
        version: "1.0",
        summary: "Standard operating procedure for mobile syringe service point operations across Kennebec, Oxford, and Franklin counties.",
        document_url: null,
      },
    },
  ]);

  if (insertError) throw insertError;

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

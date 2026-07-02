import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { HederaWidget } from "@/components/HederaWidget";

export const revalidate = 30;

export default async function PublicDashboardPage() {
  const supabase = createClient();

  // No visibility filter needed here: RLS (org_events_read policy in
  // migration 0001) already restricts anonymous/anon-key reads to PUBLIC
  // events. Adding `.eq('visibility', 'PUBLIC')` would be redundant, not a
  // safety net - the safety net is the database, not this query.
  const { data: events } = await supabase
    .from("org_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: anchors } = await supabase
    .from("event_anchors")
    .select("event_id, hedera_topic_id");

  const anchoredIds = new Set(anchors?.map((a) => a.event_id));
  const topicId = anchors?.[0]?.hedera_topic_id ?? process.env.NEXT_PUBLIC_HEDERA_TOPIC_ID ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <p className="text-sm uppercase tracking-wide text-slate-500">Azimuth Foundation</p>
        <h1 className="text-2xl font-semibold">SafeTracks Transparency Feed</h1>
        <p className="mt-2 text-sm text-slate-400">
          Verified milestones, partnerships, and funding outcomes. Sensitive operational and
          participant data is never published here.
        </p>
      </header>

      <div className="mb-8">
        <HederaWidget
          anchoredCount={events?.filter((e) => anchoredIds.has(e.event_id)).length ?? 0}
          totalCount={events?.length ?? 0}
          topicId={topicId}
        />
      </div>

      <div className="space-y-4">
        {events && events.length > 0 ? (
          events.map((event) => (
            <EventCard key={event.event_id} event={event} anchored={anchoredIds.has(event.event_id)} />
          ))
        ) : (
          <p className="text-sm text-slate-500">No public events yet.</p>
        )}
      </div>
    </main>
  );
}

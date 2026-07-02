import { createClient } from "@/lib/supabase/server";
import { DecisionRegisterTable } from "@/components/DecisionRegisterTable";
import { ProjectTracker } from "@/components/ProjectTracker";
import { EventCard } from "@/components/EventCard";

export default async function AdminDashboardPage() {
  const supabase = createClient();

  // No visibility filter here either: RLS scopes this to whatever the
  // signed-in user's actor_role clears (EXECUTIVE sees everything, BOARD
  // sees BOARD-and-below, etc) - see org_events_read policy in migration 0001.
  const { data: events } = await supabase
    .from("org_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const allEvents = events ?? [];

  return (
    <div className="space-y-10">
      <ProjectTracker events={allEvents} />
      <DecisionRegisterTable events={allEvents} />

      <section>
        <h2 className="mb-3 text-lg font-medium">Full Event Log</h2>
        <div className="space-y-3">
          {allEvents.map((event) => (
            <EventCard key={event.event_id} event={event} />
          ))}
          {allEvents.length === 0 && (
            <p className="text-sm text-slate-500">No events logged yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}

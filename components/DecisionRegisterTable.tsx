import type { Database } from "@/lib/supabase/database.types";

type OrgEvent = Database["public"]["Tables"]["org_events"]["Row"];

const decisionEventTypes = ["DECISION_PROPOSED", "DECISION_APPROVED", "DECISION_SUPERSEDED"];

export function DecisionRegisterTable({ events }: { events: OrgEvent[] }) {
  const decisions = events.filter((e) => decisionEventTypes.includes(e.event_type));

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Decision Register</h2>
      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-panel text-slate-400">
            <tr>
              <th className="px-4 py-2 font-normal">Date</th>
              <th className="px-4 py-2 font-normal">Type</th>
              <th className="px-4 py-2 font-normal">Title</th>
              <th className="px-4 py-2 font-normal">Visibility</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {decisions.map((event) => {
              const payload = event.event_payload as { title?: string };
              return (
                <tr key={event.event_id}>
                  <td className="px-4 py-2 text-slate-400">
                    {new Date(event.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-slate-400">{event.event_type}</td>
                  <td className="px-4 py-2">{payload.title ?? "-"}</td>
                  <td className="px-4 py-2 text-slate-400">{event.visibility}</td>
                </tr>
              );
            })}
            {decisions.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-slate-500">
                  No decisions logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

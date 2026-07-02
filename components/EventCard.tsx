import type { Database } from "@/lib/supabase/database.types";

type OrgEvent = Database["public"]["Tables"]["org_events"]["Row"];

const eventTitles: Record<string, (payload: Record<string, unknown>) => string> = {
  DECISION_PROPOSED: (p) => `Proposed: ${p.title as string}`,
  DECISION_APPROVED: (p) => `Decision approved: ${p.title as string}`,
  DECISION_SUPERSEDED: (p) => `Decision superseded`,
  GRANT_SUBMITTED: (p) => `Grant submitted to ${p.funder_name as string}`,
  GRANT_AWARDED: (p) => `Grant awarded by ${p.funder_name as string}`,
  GRANT_DECLINED: (p) => `Grant declined by ${p.funder_name as string}`,
  PARTNERSHIP_MILESTONE: (p) => `${p.partner_name as string}: ${p.milestone_title as string}`,
  PROJECT_STATUS_UPDATED: (p) => `${p.project_name as string} - ${p.status as string}`,
  SOP_PUBLISHED: (p) => `SOP published: ${p.title as string}`,
};

const eventSummaries: Record<string, (payload: Record<string, unknown>) => string | null> = {
  DECISION_PROPOSED: (p) => p.summary as string,
  DECISION_APPROVED: (p) => p.summary as string,
  GRANT_AWARDED: (p) => p.public_summary as string,
  PARTNERSHIP_MILESTONE: (p) => p.milestone_description as string,
  PROJECT_STATUS_UPDATED: (p) => p.status_note as string,
  SOP_PUBLISHED: (p) => p.summary as string,
};

export function EventCard({ event, anchored }: { event: OrgEvent; anchored?: boolean }) {
  const payload = event.event_payload;
  const title = eventTitles[event.event_type]?.(payload) ?? event.event_type;
  const summary = eventSummaries[event.event_type]?.(payload) ?? null;

  return (
    <article className="rounded-lg border border-slate-800 bg-panel p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs uppercase tracking-wide text-slate-500">{event.event_type}</span>
        <time className="text-xs text-slate-500" dateTime={event.created_at}>
          {new Date(event.created_at).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </time>
      </div>
      <h3 className="mt-1 text-lg font-medium">{title}</h3>
      {summary && <p className="mt-1 text-sm text-slate-400">{summary}</p>}
      {anchored && (
        <span className="mt-2 inline-block rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-400">
          Anchored on Hedera
        </span>
      )}
    </article>
  );
}

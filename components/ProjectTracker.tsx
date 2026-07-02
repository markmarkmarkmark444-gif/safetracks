import type { Database } from "@/lib/supabase/database.types";

type OrgEvent = Database["public"]["Tables"]["org_events"]["Row"];

interface ProjectStatusPayload {
  project_id: string;
  project_name: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETE";
  percent_complete: number;
  status_note: string;
}

const statusColor: Record<ProjectStatusPayload["status"], string> = {
  NOT_STARTED: "bg-slate-700",
  IN_PROGRESS: "bg-blue-600",
  BLOCKED: "bg-red-600",
  COMPLETE: "bg-emerald-600",
};

/**
 * The projects table doesn't exist - a project's current status is a
 * projection of its most recent PROJECT_STATUS_UPDATED event, per the
 * event-sourcing model. This walks the (already newest-first) event list
 * and keeps only the first occurrence of each project_id.
 */
function latestStatusByProject(events: OrgEvent[]): ProjectStatusPayload[] {
  const seen = new Map<string, ProjectStatusPayload>();
  for (const event of events) {
    if (event.event_type !== "PROJECT_STATUS_UPDATED") continue;
    const payload = event.event_payload as unknown as ProjectStatusPayload;
    if (!seen.has(payload.project_id)) {
      seen.set(payload.project_id, payload);
    }
  }
  return Array.from(seen.values());
}

export function ProjectTracker({ events }: { events: OrgEvent[] }) {
  const projects = latestStatusByProject(events);

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Project Tracker</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((project) => (
          <div key={project.project_id} className="rounded-lg border border-slate-800 bg-panel p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">{project.project_name}</h3>
              <span
                className={`rounded-full px-2 py-0.5 text-xs text-white ${statusColor[project.status]}`}
              >
                {project.status.replace("_", " ")}
              </span>
            </div>
            <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${project.percent_complete}%` }}
              />
            </div>
            <p className="text-sm text-slate-400">{project.status_note}</p>
          </div>
        ))}
        {projects.length === 0 && (
          <p className="text-sm text-slate-500">No project status events yet.</p>
        )}
      </div>
    </section>
  );
}

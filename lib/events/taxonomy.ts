import { z } from "zod";

/**
 * The Event Taxonomy.
 *
 * Every row in org_events has an `event_type` and a `event_payload` whose
 * shape depends on that type. This file is the single source of truth for
 * that shape - Postgres only checks "is it an object" (see migration 0001),
 * so everything else is enforced here before an insert is attempted.
 *
 * Adding a new event type: add the literal to EventType, add a schema below,
 * register it in eventSchemas, and add a default visibility in
 * defaultVisibility. Nothing else needs to change - existing rows are
 * unaffected because the payload column is JSONB.
 */

export const EventType = z.enum([
  // Governance
  "DECISION_PROPOSED",
  "DECISION_APPROVED",
  "DECISION_SUPERSEDED",
  // Funding
  "GRANT_SUBMITTED",
  "GRANT_AWARDED",
  "GRANT_DECLINED",
  // Partnerships
  "PARTNERSHIP_MILESTONE",
  // Program / compliance
  "PROJECT_STATUS_UPDATED",
  "SOP_PUBLISHED",
]);
export type EventType = z.infer<typeof EventType>;

const decisionCore = {
  decision_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  summary: z.string().min(1),
  rationale: z.string().min(1),
  alternatives_considered: z.array(z.string()).default([]),
  related_project_id: z.string().uuid().nullable().default(null),
  sop_reference: z.string().nullable().default(null),
};

export const DecisionProposedPayload = z.object(decisionCore);

export const DecisionApprovedPayload = z.object({
  ...decisionCore,
  approved_by: z.array(z.string().uuid()).min(1),
  effective_date: z.string().date(),
});

export const DecisionSupersededPayload = z.object({
  decision_id: z.string().uuid(),
  superseded_by_decision_id: z.string().uuid(),
  reason: z.string().min(1),
});

const grantCore = {
  grant_id: z.string().uuid(),
  funder_name: z.string().min(1),
  program_name: z.string().min(1),
  amount_requested_usd: z.number().nonnegative(),
  related_project_id: z.string().uuid().nullable().default(null),
};

export const GrantSubmittedPayload = z.object({
  ...grantCore,
  submitted_date: z.string().date(),
});

export const GrantAwardedPayload = z.object({
  ...grantCore,
  amount_awarded_usd: z.number().nonnegative(),
  award_date: z.string().date(),
  public_summary: z.string().min(1),
});

export const GrantDeclinedPayload = z.object({
  ...grantCore,
  decision_date: z.string().date(),
  reason: z.string().nullable().default(null),
});

export const PartnershipMilestonePayload = z.object({
  partner_name: z.string().min(1),
  milestone_title: z.string().min(1),
  milestone_description: z.string().min(1),
  related_project_id: z.string().uuid().nullable().default(null),
  achieved_date: z.string().date(),
});

export const ProjectStatusUpdatedPayload = z.object({
  project_id: z.string().uuid(),
  project_name: z.string().min(1),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETE"]),
  percent_complete: z.number().min(0).max(100),
  status_note: z.string().min(1),
});

export const SopPublishedPayload = z.object({
  sop_id: z.string().uuid(),
  title: z.string().min(1),
  version: z.string().min(1),
  summary: z.string().min(1),
  document_url: z.string().url().nullable().default(null),
});

export const eventSchemas = {
  DECISION_PROPOSED: DecisionProposedPayload,
  DECISION_APPROVED: DecisionApprovedPayload,
  DECISION_SUPERSEDED: DecisionSupersededPayload,
  GRANT_SUBMITTED: GrantSubmittedPayload,
  GRANT_AWARDED: GrantAwardedPayload,
  GRANT_DECLINED: GrantDeclinedPayload,
  PARTNERSHIP_MILESTONE: PartnershipMilestonePayload,
  PROJECT_STATUS_UPDATED: ProjectStatusUpdatedPayload,
  SOP_PUBLISHED: SopPublishedPayload,
} as const satisfies Record<EventType, z.ZodTypeAny>;

/**
 * Sensible default visibility per event type. Callers can override (e.g. a
 * GRANT_SUBMITTED stays EXECUTIVE_ONLY until awarded), but most event types
 * have an obvious default that should require an explicit override to change.
 */
export const defaultVisibility: Record<EventType, "PUBLIC" | "PARTNER_MAP" | "BOARD" | "EXECUTIVE_ONLY"> = {
  DECISION_PROPOSED: "EXECUTIVE_ONLY",
  DECISION_APPROVED: "BOARD",
  DECISION_SUPERSEDED: "BOARD",
  GRANT_SUBMITTED: "EXECUTIVE_ONLY",
  GRANT_AWARDED: "PUBLIC",
  GRANT_DECLINED: "EXECUTIVE_ONLY",
  PARTNERSHIP_MILESTONE: "PUBLIC",
  PROJECT_STATUS_UPDATED: "PARTNER_MAP",
  SOP_PUBLISHED: "PARTNER_MAP",
};

export type EventPayload<T extends EventType> = z.infer<(typeof eventSchemas)[T]>;

export function parseEventPayload<T extends EventType>(eventType: T, payload: unknown): EventPayload<T> {
  const schema = eventSchemas[eventType];
  return schema.parse(payload) as EventPayload<T>;
}

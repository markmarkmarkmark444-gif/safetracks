import { z } from "zod";

/**
 * RBAC tiers. Mirrors actor_role in supabase/migrations/0001_org_events.sql -
 * keep these in sync. STAFF/BOARD/EXECUTIVE can log events; PARTNER_MAP is
 * read-only. Anonymous visitors (no session) are treated as PUBLIC and never
 * appear here.
 */
export const ActorRole = z.enum(["EXECUTIVE", "BOARD", "PARTNER_MAP", "STAFF"]);
export type ActorRole = z.infer<typeof ActorRole>;

export const EventVisibility = z.enum(["PUBLIC", "PARTNER_MAP", "BOARD", "EXECUTIVE_ONLY"]);
export type EventVisibility = z.infer<typeof EventVisibility>;

/** Roles that may see a given visibility tier, most restrictive to least. */
const visibilityAccess: Record<EventVisibility, ActorRole[]> = {
  EXECUTIVE_ONLY: ["EXECUTIVE"],
  BOARD: ["EXECUTIVE", "BOARD"],
  PARTNER_MAP: ["EXECUTIVE", "BOARD", "PARTNER_MAP"],
  PUBLIC: ["EXECUTIVE", "BOARD", "PARTNER_MAP", "STAFF"],
};

/** Roles that may append new events. PARTNER_MAP is read-only by design. */
const writeRoles: ActorRole[] = ["EXECUTIVE", "BOARD", "STAFF"];

export function canRead(role: ActorRole | null, visibility: EventVisibility): boolean {
  if (visibility === "PUBLIC") return true;
  if (!role) return false;
  return visibilityAccess[visibility].includes(role);
}

export function canWrite(role: ActorRole | null): boolean {
  return role !== null && writeRoles.includes(role);
}

/**
 * This is a defense-in-depth check for use in server components/route
 * handlers so we can return a clean 403 before hitting the database. The
 * actual security boundary is the Postgres RLS policy in
 * supabase/migrations/0001_org_events.sql - never rely on this function
 * alone to protect data.
 */
export function assertCanWrite(role: ActorRole | null): void {
  if (!canWrite(role)) {
    throw new Error("Not authorized to log events for this role.");
  }
}

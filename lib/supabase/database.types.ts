/**
 * Hand-written types matching supabase/migrations/0001_org_events.sql.
 * If you have the Supabase CLI configured, prefer generating this file with
 * `supabase gen types typescript` and deleting this hand-written version.
 *
 * Shape (Row/Insert/Update/Relationships per table) follows postgrest-js's
 * GenericTable so type inference on `.from(...)` calls actually resolves
 * instead of collapsing to `never`.
 */

export type ActorRoleRow = "EXECUTIVE" | "BOARD" | "PARTNER_MAP" | "STAFF";
export type EventVisibilityRow = "PUBLIC" | "PARTNER_MAP" | "BOARD" | "EXECUTIVE_ONLY";

export interface Database {
  public: {
    Tables: {
      org_events: {
        Row: {
          event_id: string;
          event_type: string;
          actor_id: string;
          visibility: EventVisibilityRow;
          event_payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          event_id?: string;
          event_type: string;
          actor_id: string;
          visibility?: EventVisibilityRow;
          event_payload: Record<string, unknown>;
          created_at?: string;
        };
        // org_events is append-only (see protect_event_update/delete rules) -
        // there is intentionally no real Update; Row shape stands in so the
        // GenericTable contract is satisfied.
        Update: Partial<{
          event_id: string;
          event_type: string;
          actor_id: string;
          visibility: EventVisibilityRow;
          event_payload: Record<string, unknown>;
          created_at: string;
        }>;
        Relationships: [];
      };
      event_anchors: {
        Row: {
          event_id: string;
          hedera_topic_id: string;
          hedera_sequence_number: number;
          hedera_consensus_timestamp: string;
          payload_hash: string;
          anchored_at: string;
        };
        Insert: {
          event_id: string;
          hedera_topic_id: string;
          hedera_sequence_number: number;
          hedera_consensus_timestamp: string;
          payload_hash: string;
          anchored_at?: string;
        };
        // Insert-only, see protect_anchor_update/delete rules.
        Update: Partial<{
          event_id: string;
          hedera_topic_id: string;
          hedera_sequence_number: number;
          hedera_consensus_timestamp: string;
          payload_hash: string;
          anchored_at: string;
        }>;
        Relationships: [];
      };
      actor_roles: {
        Row: {
          actor_id: string;
          role: ActorRoleRow;
          display_name: string;
          created_at: string;
        };
        Insert: {
          actor_id: string;
          role: ActorRoleRow;
          display_name: string;
          created_at?: string;
        };
        Update: Partial<{
          actor_id: string;
          role: ActorRoleRow;
          display_name: string;
          created_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}

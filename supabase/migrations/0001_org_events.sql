-- SafeTracks HQ: Event Engine
-- Single append-only event log. Current-state views (dashboards, trackers)
-- are projections computed by filtering/aggregating this stream.

-- ---------------------------------------------------------------------------
-- Roles (RBAC)
-- ---------------------------------------------------------------------------

create type actor_role as enum ('EXECUTIVE', 'BOARD', 'PARTNER_MAP', 'STAFF');

-- Maps a Supabase auth user to an organizational role. A user with no row
-- here has no elevated access - RLS below treats them as anonymous/public.
create table actor_roles (
    actor_id uuid primary key references auth.users (id) on delete cascade,
    role actor_role not null,
    display_name text not null,
    created_at timestamptz not null default now()
);

alter table actor_roles enable row level security;

-- Actors can see their own role row (needed client-side to branch UI).
-- Only EXECUTIVE can manage role assignments.
create policy actor_roles_self_read on actor_roles
    for select
    using (actor_id = auth.uid());

create policy actor_roles_executive_all on actor_roles
    for all
    using (
        exists (
            select 1 from actor_roles ar
            where ar.actor_id = auth.uid() and ar.role = 'EXECUTIVE'
        )
    );

-- ---------------------------------------------------------------------------
-- Event log
-- ---------------------------------------------------------------------------

create type event_visibility as enum ('PUBLIC', 'PARTNER_MAP', 'BOARD', 'EXECUTIVE_ONLY');

create table org_events (
    event_id uuid primary key default gen_random_uuid(),
    event_type varchar(100) not null,
    actor_id uuid not null references auth.users (id),
    visibility event_visibility not null default 'EXECUTIVE_ONLY',

    -- Shape validated at the application layer per event_type (see
    -- lib/events/taxonomy.ts). Postgres only enforces "is an object".
    event_payload jsonb not null,

    created_at timestamptz not null default now(),

    constraint event_payload_is_object check (jsonb_typeof(event_payload) = 'object')
);

create index org_events_visibility_idx on org_events (visibility, created_at desc);
create index org_events_event_type_idx on org_events (event_type, created_at desc);
create index org_events_payload_gin_idx on org_events using gin (event_payload);

-- Immutability: this is a log, not a mutable record. Corrections are made by
-- appending a new event (e.g. DECISION_SUPERSEDED), never by editing history.
create rule protect_event_update as on update to org_events do instead nothing;
create rule protect_event_delete as on delete to org_events do instead nothing;

alter table org_events enable row level security;

-- Helper: role rank so we can compare "does this actor's role clear the
-- visibility bar" without a giant OR chain per policy.
create or replace function current_actor_role() returns actor_role
    language sql stable security definer
    set search_path = public
as $$
    select role from actor_roles where actor_id = auth.uid();
$$;

-- Read policy: visibility is a tier, and each role sees its tier and every
-- more-public tier below it. Anonymous/public visitors (auth.uid() is null,
-- or no actor_roles row) only ever match the PUBLIC branch.
create policy org_events_read on org_events
    for select
    using (
        visibility = 'PUBLIC'
        or (visibility = 'PARTNER_MAP' and current_actor_role() in ('PARTNER_MAP', 'BOARD', 'EXECUTIVE'))
        or (visibility = 'BOARD' and current_actor_role() in ('BOARD', 'EXECUTIVE'))
        or (visibility = 'EXECUTIVE_ONLY' and current_actor_role() = 'EXECUTIVE')
    );

-- Write policy: only STAFF and above may append events, and only as
-- themselves (actor_id must match the authenticated user - no impersonation).
-- Inserts always go through the /api/events route so payloads are validated
-- against the taxonomy before they hit the log.
create policy org_events_insert on org_events
    for insert
    with check (
        actor_id = auth.uid()
        and current_actor_role() in ('STAFF', 'BOARD', 'EXECUTIVE')
    );

comment on table org_events is 'Append-only event log. Dashboards are projections of this stream, filtered by visibility.';
comment on column org_events.event_payload is 'Validated against lib/events/taxonomy.ts per event_type before insert.';

-- ---------------------------------------------------------------------------
-- Hedera anchors
-- ---------------------------------------------------------------------------

-- Deliberately a separate table rather than columns on org_events. Anchoring
-- happens asynchronously after an event is written (Postgres must never fail
-- because Hedera is unreachable), and org_events is immutable by rule - a
-- second insert-only table lets the anchor's own timestamp join the log
-- without ever mutating the original event row. One anchor per event.
create table event_anchors (
    event_id uuid primary key references org_events (event_id),
    hedera_topic_id varchar(100) not null,
    hedera_sequence_number bigint not null,
    hedera_consensus_timestamp timestamptz not null,
    -- SHA-256 hex digest of the anchored event's event_payload. Only the
    -- hash goes on-chain (see lib/hedera.ts) - EXECUTIVE_ONLY events get the
    -- same public integrity guarantee as PUBLIC ones without ever exposing
    -- their contents to the public topic.
    payload_hash varchar(64) not null,
    anchored_at timestamptz not null default now()
);

create rule protect_anchor_update as on update to event_anchors do instead nothing;
create rule protect_anchor_delete as on delete to event_anchors do instead nothing;

alter table event_anchors enable row level security;

-- Readable by anyone who can read the event it anchors.
create policy event_anchors_read on event_anchors
    for select
    using (
        exists (
            select 1 from org_events e
            where e.event_id = event_anchors.event_id
        )
    );

-- Writable by the same roles that can write events.
create policy event_anchors_insert on event_anchors
    for insert
    with check (current_actor_role() in ('STAFF', 'BOARD', 'EXECUTIVE'));

comment on table event_anchors is 'Insert-only Hedera Consensus Service receipts, one per anchored org_events row.';

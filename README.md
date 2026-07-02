# SafeTracks HQ

The Azimuth Foundation's Governance OS: a Next.js + Supabase hub built around a
single append-only **event log** rather than per-domain tables. The current
state of anything — the transparency feed, the decision register, the
project tracker — is a projection computed by filtering that log, not a
row you update in place. See [Architecture](#architecture) below for why.

## Stack

- **Next.js 14** (App Router, TypeScript, Tailwind)
- **Supabase** (Postgres + Auth + Row Level Security)
- **Hedera Consensus Service** (`@hashgraph/sdk`) — public integrity anchor
- **Aleo / Provable SDK** — stubbed, see [`lib/aleo.ts`](lib/aleo.ts)

## Architecture

Everything that happens in the organization — a decision, a grant outcome, a
partnership milestone, a project status change — is appended to one table,
`org_events` (`supabase/migrations/0001_org_events.sql`). Each row has an
`event_type`, a `visibility` tier, and a JSONB `event_payload` whose shape is
defined per type in [`lib/events/taxonomy.ts`](lib/events/taxonomy.ts). The
table is append-only by Postgres rule — corrections happen by appending a new
event (e.g. `DECISION_SUPERSEDED`), never by editing history.

**Visibility is enforced by Postgres Row Level Security, not application
code.** The public dashboard queries Supabase with the anon key, which is
exposed to the browser — if visibility were just a `WHERE` clause in a
Next.js query, anyone could remove it in devtools and read
`EXECUTIVE_ONLY` events. Instead, the `org_events_read` RLS policy checks the
caller's role (via `actor_roles`, looked up from `auth.uid()`) against the
row's `visibility` tier server-side, inside Postgres, on every query — the
same query that powers `/public` returns fewer rows for an anonymous visitor
than it does for a signed-in board member, with no code difference between
the two.

| Visibility tier  | Who can read it                          |
|-------------------|-------------------------------------------|
| `PUBLIC`          | Everyone, including anonymous visitors    |
| `PARTNER_MAP`     | `PARTNER_MAP` role and above               |
| `BOARD`           | `BOARD` role and above                     |
| `EXECUTIVE_ONLY`  | `EXECUTIVE` role only                      |

Writes work the same way: `org_events_insert` only allows `STAFF`, `BOARD`,
or `EXECUTIVE` roles to append, and only as themselves. `PARTNER_MAP` is
read-only by design. See [`lib/events/rbac.ts`](lib/events/rbac.ts) for the
same rules mirrored in TypeScript, used for early (non-authoritative) checks
in API routes.

Hedera anchoring lives in a separate `event_anchors` table rather than
columns on `org_events`, for two reasons: anchoring happens asynchronously
after an event is written (a Hedera outage must never block writing to
Postgres), and `org_events` is immutable, so there's nowhere to write the
anchor result back onto the original row anyway. Only a SHA-256 hash of the
payload is submitted to the public Hedera topic — `EXECUTIVE_ONLY` events get
the same public, independently-verifiable timestamp as `PUBLIC` ones without
ever exposing their contents.

### Event taxonomy

The initial set of event types (`lib/events/taxonomy.ts`), each with a Zod
schema and a default visibility:

| Event type                 | Default visibility | Notes |
|-----------------------------|--------------------|-------|
| `DECISION_PROPOSED`         | `EXECUTIVE_ONLY`   | Internal drafting stage |
| `DECISION_APPROVED`         | `BOARD`             | Promote to `PUBLIC` explicitly if it's a public milestone |
| `DECISION_SUPERSEDED`       | `BOARD`             | Points at the decision it replaces |
| `GRANT_SUBMITTED`           | `EXECUTIVE_ONLY`   | |
| `GRANT_AWARDED`             | `PUBLIC`             | Carries a separate `public_summary` field |
| `GRANT_DECLINED`            | `EXECUTIVE_ONLY`   | |
| `PARTNERSHIP_MILESTONE`     | `PUBLIC`             | |
| `PROJECT_STATUS_UPDATED`    | `PARTNER_MAP`       | Latest event per `project_id` drives the Project Tracker |
| `SOP_PUBLISHED`             | `PARTNER_MAP`       | |

Adding a new event type doesn't require a migration: add the literal, a Zod
schema, and a default visibility in `taxonomy.ts`, and it flows through
`/api/events`, the admin event log, and (if `PUBLIC`) the transparency feed
automatically.

## Setup

1. **Create a Supabase project**, then in the SQL editor run
   `supabase/migrations/0001_org_events.sql`.
2. **Install dependencies**: `npm install`.
3. **Copy `.env.local.example` to `.env.local`** and fill in your Supabase
   URL/anon key. Hedera and Aleo vars can stay empty until you're ready for
   Phase 3 — the app runs without them, anchoring just isn't available.
4. **Create your first user**: run `npm run dev`, visit `/admin/login`, and
   sign up (or create the user in the Supabase dashboard). Note the email.
5. **Grant yourself EXECUTIVE and seed initial events**: set
   `SUPABASE_SERVICE_ROLE_KEY` and `SEED_EXECUTIVE_EMAIL` in `.env.local`,
   then `npm run seed`. This grants your account `EXECUTIVE` and appends the
   NDEWS pivot decision, Chapter 252 and DPS Forensic Kit project status, and
   the first published SOP.
6. **Run it**: `npm run dev`, then visit `/public` (transparency feed) and
   `/admin` (executive hub, requires sign-in).

### Adding Jana and Scotty

Have them sign up via `/admin/login`, then insert a row into `actor_roles`
for their `auth.users` id with the role you want (`STAFF`, `BOARD`, or
`EXECUTIVE`) — either via the Supabase dashboard or as an `EXECUTIVE` user
through a future admin UI (not yet built; the `actor_roles_executive_all` RLS
policy already allows it).

### Hedera anchoring

Once `HEDERA_OPERATOR_ID`, `HEDERA_OPERATOR_KEY`, and `HEDERA_TOPIC_ID` are
set (create a testnet account and topic at
[portal.hedera.com](https://portal.hedera.com)), `POST /api/anchor-decision`
with `{ "event_id": "<uuid>" }` anchors that event and records the receipt in
`event_anchors`. The public dashboard's Hedera widget links out to HashScan
so anyone can verify the topic independently of this app.

### Deployment

Push to GitHub and import the repo into Vercel. Set the same environment
variables from `.env.local` in the Vercel project settings (server-only vars
like `SUPABASE_SERVICE_ROLE_KEY` should **not** be set there unless a
server-side seed/admin action needs them — the running app itself only needs
the `NEXT_PUBLIC_*` and Hedera vars).

## What's not built yet

- **Aleo / VDP integration** (`lib/aleo.ts`) — stubbed pending the deployed
  `compliance_proof.leo` circuit and a decision on where proof generation
  happens (browser via `@provablehq/wasm`, or server-side).
- **Admin UI for creating events** — `/api/events` and `/api/anchor-decision`
  are ready to call, but there's no form yet; use the Supabase dashboard or a
  REST client in the meantime.
- **Role management UI** — role assignment is currently a direct
  `actor_roles` insert (see above), not a UI flow.

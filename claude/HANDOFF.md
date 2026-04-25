# PaceMatch — Engineering Handoff

_Last updated 2026-04-24 (branch `discover-runner`)._

A runner matchmaking + run-club management app. This document is the single
on-ramp for anyone picking up the codebase. Read this once; then see the
companion files in this directory — `STATUS.md` (current state) and
`ROADMAP.md` (what's left).

---

## TL;DR

- **Frontend:** Expo Router (SDK 54) + React Native + TypeScript. iOS / Android / Web targets.
- **Auth:** Clerk (`@clerk/clerk-expo`). Issues JWTs from a `supabase` template.
- **Backend:** Supabase (Postgres + Realtime + Edge Functions + pg_cron).
- **Authorization:** Postgres RLS. JWT `sub` (Clerk user ID) → `users.clerk_id` → `users.id` (uuid) via `current_user_id()` SQL helper.
- **State:** React Context (`AppContext`) wraps custom hooks in `lib/hooks/*`. No Zustand/Redux.
- **Two role experiences** routed at the top level: `(runner)` and `(leader)` segment groups.
- **Status today:** Internal-beta milestone hit (sign up → profile → discover → request → DM → run-invite all wired through Supabase, no mock data, no dead buttons). Edge Functions live for matching scoring + emergency push fan-out. Leader-side edit/delete and runner RSVP still pending — see `STATUS.md` and `ROADMAP.md`.

---

## Repo map

```
pace-match/
├── app/                            Expo Router file-based routes
│   ├── _layout.tsx                 Root: ClerkProvider → AppProvider → Stack
│   ├── index.tsx                   Welcome / landing
│   ├── login.tsx · signup.tsx      Clerk email + OAuth flows
│   ├── role-select.tsx             Picks runner|leader after signup
│   ├── (runner)/                   Tabs: discover · filter · ready · messages · profile
│   │   ├── _layout.tsx             Bottom tabs config
│   │   ├── runners.tsx · start-run.tsx   (hidden, nested via filter flow)
│   │   └── ...
│   ├── (leader)/                   Tabs: dashboard · schedule · events · announcements · safety
│   │   ├── members.tsx             (hidden, nested)
│   │   └── ...
│   ├── messages/[connection_id].tsx  1:1 DM thread (chat bubbles + realtime)
│   ├── invite/[run_id].tsx         Push-notification deep link target
│   ├── run/[run_id]/accepted.tsx   Host-side realtime list of accepted runners
│   ├── components/                 RunnerCard, ClubCard, RunEventCard, StatusBadge, Button, Input, OAuthButton
│   ├── context/AppContext.tsx      Wires hooks → context, registers push token
│   ├── hooks/useTheme.tsx          Light/dark color tokens
│   ├── theme.ts                    spacing / radius / fontSize / fontWeight
│   └── styles/login.ts
│
├── lib/
│   ├── supabase.ts                 Base + authedClient(token) factory
│   ├── notifications.ts            Expo push registration + listener + send helper
│   ├── database.types.ts           Hand-written DB types (mirrors migrations)
│   └── hooks/                      All Supabase data hooks
│       ├── useSupabase.ts            useGetSupabase() — returns auth'd client
│       ├── useCurrentUser.ts         loads/creates the user row from clerk_id
│       ├── useUsersById.ts           batched user-row lookup with module cache
│       ├── useRunners.ts             calls match-runners Edge Function
│       ├── useReadyStatus.ts         set/clear my ready_status row
│       ├── useReadyRunners.ts        feed of currently-available runners
│       ├── useConnections.ts         connection_requests + accept/decline (realtime)
│       ├── useMessages.ts            messages within a connection (realtime)
│       ├── useClub.ts · useClubs.ts  club list + single club details
│       └── useRuns.ts                runs / run_invites / accepted runners (realtime)
│
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260319000001_schema.sql       Core tables (users, clubs, events, ...)
│   │   ├── 20260319000002_rls.sql          RLS + current_user_id() helper
│   │   ├── 20260319000003_cron.sql         pg_cron: expire ready_status every 5m
│   │   └── 20260402000001_runs.sql         runs + run_invites + run_messages
│   └── functions/
│       ├── match-runners/index.ts          Scoring algorithm (pace+club+goals+ready)
│       └── send-emergency-alert/index.ts   Fan-out push + pinned announcement
│
├── types/index.ts                  Public-facing TS types (Run, RunInvite, filters)
├── app.json                        Expo config (scheme: pacematch, EAS projectId set)
├── eas.json                        development / preview / production profiles
└── CLAUDE.md                       Project rules for AI assistants
```

---

## Auth & data flow

```
Clerk sign-in
   └─ session.getToken({ template: 'supabase' })  →  JWT (RS256, sub=clerk_id)
        └─ authedClient(token) attaches it to Authorization header
             └─ Postgres RLS calls auth.jwt() ->> 'sub'
                  └─ current_user_id() SQL helper resolves to users.id (uuid)
                       └─ all RLS policies key off that uuid
```

Two important consequences:

1. **`users.id` is a uuid, NOT the Clerk ID.** `users.clerk_id` is the Clerk ID.
   Never pass a Clerk ID where a uuid is expected (or vice versa).
2. **Every screen must fetch via `useGetSupabase()`** — it produces a fresh
   client per call with the current Clerk token. Calling the bare `supabase`
   client from `lib/supabase.ts` will hit RLS as anon and return empty results.

The Clerk JWT template **must be named `supabase`**. If it isn't,
`useSupabase.ts` throws "Failed to get Supabase token from Clerk".

---

## State architecture

```
AppProvider (app/context/AppContext.tsx)
   ├─ useCurrentUser()        →  dbUser, createUser, updateUser
   ├─ useReadyStatus(userId)  →  readyStatus, setReadyNow, setTimeWindow, clearStatus
   └─ useConnections(userId)  →  connections, sendRequest, accept/decline
```

Per-screen hooks (`useRunners`, `useClubs`, `useRuns`, `useMessages`,
`useReadyRunners`, `useClub`) are called directly in the screens that need
them, not lifted into context. This keeps the global state small.

`registerForPushNotifications()` runs once when `dbUser` loads and persists the
Expo push token to `users.expo_push_token` via `updateUser`.

---

## Database (current shape)

Tables (see `supabase/migrations/*` for the source of truth):

| Table                 | Purpose                                              |
|-----------------------|------------------------------------------------------|
| `users`               | Profile + Clerk mapping + location + push token      |
| `ready_status`        | One active row per user, expires_at indexed          |
| `run_clubs`           | Club records, `leader_id` → users                    |
| `club_members`        | M:N join, leader-or-self insert/delete               |
| `run_events`          | Events under a club, with pace_groups jsonb          |
| `rsvps`               | event_id+user_id PK, status enum                     |
| `announcements`       | Per-club, supports `pinned` flag                     |
| `connection_requests` | Generic 1:1 connect request, becomes the "thread"    |
| `messages`            | Tied to a connection (DM only after accepted)        |
| `runs`                | An ad-hoc invited run hosted by one user             |
| `run_invites`         | Per-runner invite to a `runs` row                    |
| `run_messages`        | Broadcast or 1:1 within a run                        |
| `push_tokens`         | Multi-device tokens (currently unused — using `users.expo_push_token`) |

**Realtime publications:** `run_invites` and `run_messages` are broadcast on
`supabase_realtime`. The `messages` table is also subscribed to per-connection
(see `useMessages.ts`).

**Cron:** `pg_cron` deletes expired `ready_status` rows every 5 minutes.

**Two parallel "match" data models exist:**
- `connection_requests` → 1:1 partner pairing (Discover → Messages tab).
- `runs` / `run_invites` → 1:N invited runs (Filter → Available Runners → Start a Run → Accepted).

These do not currently share a single funnel; the `(runner)/discover` flow
produces connection_requests, while `(runner)/filter` + `runners` + `start-run`
produces a `runs` row. Plan to unify or document the boundary as part of
ROADMAP item P0-F.

---

## Environment

`.env.local` (already populated for dev):

```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=     # required for react-native-maps on Android
```

Edge functions (set via `supabase secrets set`):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

EAS project ID: `618c8ec0-9fdc-437e-9f16-240dde8610a5`
Owner: `abaydar1022s-organization`
Scheme: `pacematch://`

---

## Running locally

```bash
npm install
npx expo start            # then press i / a / w
npm run lint
npx tsc --noEmit          # type-check; should be clean
```

Push notifications and `react-native-maps` require a real device or a
development build (`eas build --profile development`). Expo Go will silently
no-op on those features.

There is **no test suite yet** — adding one is in `ROADMAP.md` (P2-A).

---

## Testing the social flows (no second person needed)

Most flows need two accounts (sender + recipient). You don't need a second
human — pick whichever is fastest:

| Setup | What it covers | What it doesn't |
|---|---|---|
| **Two simulators** (iOS sim + Android emulator), two Clerk emails (Gmail aliasing works) | Discover, request, accept, DM realtime, ready-feed, run-invite create | Push notifications |
| Sim + your phone via Expo Go | Same as above | Push notifications (Expo Go can't receive since SDK 50) |
| Two `--web` windows (one incognito) | All UI flows + DM realtime | GPS, maps, push |
| **Real device with `eas build --profile development`** | Everything, including push | — |
| Insert rows directly in Supabase Studio (one fake `users` row + one `accepted` `connection_requests` row pointing at you) | DM screen, Discover lookup logic | Two-way realtime |

Smoke-test order for any new contributor:
1. Auth → role-select
2. Profile edit
3. Discover → "Request to run" on the second account
4. Switch accounts → Messages → accept
5. Open DM, send a message, confirm bubble appears on the other side within ~1s
6. Filter → Available Runners → Start a Run → confirm `runs` + `run_invites` rows in Supabase
7. (Real device only) Confirm push fires on step 6 and deep-links to `/invite/[run_id]`

---

## Conventions worth knowing

- **Theme colors** come from `useTheme()`. Don't hardcode hex values in screens.
- **Spacing/typography** come from `app/theme.ts`.
- **No `useEffect` for fetching new actions** — fetch in event handlers, or inside the data hook itself. Reads on mount are fine inside the hook.
- **Always unsubscribe Realtime channels** in the `useEffect` cleanup. See `useRuns.ts:133` (`sb.removeChannel`) and `useMessages.ts:47` (`sub?.unsubscribe`) for the pattern.
- **Components > 150 lines should be split.** Several leader screens currently exceed this and are flagged in `STATUS.md` §10.
- **No `console.log` in committed code paths** other than the explicit token-debug log in `useSupabase.ts:13` (worth removing — see ROADMAP P2-E).

---

## Known gotchas

1. **Two model groups for "matching" (see above).** Don't extend either without deciding which one wins. Tracked as ROADMAP P0-F.
2. **Push tokens live on `users.expo_push_token`,** but a `push_tokens` table
   also exists with RLS. Pick one (multi-device → `push_tokens`; simple →
   inline column) and remove the loser. ROADMAP P2-D.
3. **`expo-router` typed routes are enabled** (`app.json: experiments.typedRoutes`).
   New routes need a Metro restart before TS sees them — the type file lives at
   `.expo/types/router.d.ts` and is regenerated on `expo start`. Until then, use
   the object form `router.push({ pathname, params })` rather than a template literal.
4. **`reactCompiler` is enabled** — be aware that side-effects in render get
   memoized aggressively. If you see a hook that "doesn't re-run," check
   whether it's pure-by-accident.
5. **Profile location is a free-text string.** `users.location` is hand-typed;
   `users.latitude` / `users.longitude` are populated only via the `start-run`
   GPS capture on the host. Discover-time distance is computed live from each
   client's GPS, not from a stored profile lat/lng. ROADMAP P1-A.
6. **`useSupabase.ts:13` logs the Clerk token prefix** for debugging. Remove or
   gate behind `__DEV__` before launch — ROADMAP P2-E.

---

## Next steps for someone picking this up

1. Read `STATUS.md` to see what's wired vs stubbed.
2. Pick a P0/P1 item from `ROADMAP.md` — the next two are P0-E (runner RSVP)
   and P0-F (unify the two matching models).
3. Skim the Testing section above and bring up two simulators before writing code.
4. Confirm the smoke-test order works for you on `main` before branching.

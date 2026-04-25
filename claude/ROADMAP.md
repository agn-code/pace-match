# PaceMatch — Roadmap to a Fully Functional App

Phased plan to ship PaceMatch as a complete runner-matchmaking product. Each
item is sized so a single engineer can land it in a focused session. Update
emoji status inline as work completes; don't re-paginate phases.

## Legend
- ✅ **Done** — landed and verified
- 🚧 **In progress** — actively being built
- ⏳ **To do** — scoped, not started
- 🧊 **Deferred** — pulled out of scope for now

## At-a-glance status

| Phase | Theme                              | Status | Done | Total |
|-------|------------------------------------|--------|-----:|------:|
| P0    | Make every screen real & connected | 🚧     |   4  |   6   |
| P1    | Polish & launch-readiness          | ⏳     |   0  |   7   |
| P2    | Hardening & observability          | ⏳     |   0  |   7   |
| P3    | Growth & v1.1                      | ⏳     |   0  |   7   |

**P0** — Core flows that block beta.
**P1** — Quality / polish required for a real launch.
**P2** — Hardening, observability, infra.
**P3** — Growth, retention, "v1.1" features.

---

## 🚧 Phase P0 — Make every screen real & connected

Goal: any new user can sign up, set a profile, find a partner, message them,
and run together. No mock data, no dead buttons.

### ✅ P0-A · Wire run-invite push notifications

Already implemented in `app/(runner)/start-run.tsx:96-117` — fetches
`expo_push_token` for each invitee and fans out `sendRunInviteNotification`.
Verified by code read on 2026-04-24.

- ✅ Fetch invitees' `expo_push_token` after creating the run.
- ✅ Loop and call `sendRunInviteNotification` per token.
- ✅ Confirm deep link via `setupNotificationListener` lands on `/invite/[run_id]`.
- ⏳ Smoke-test on a real device (Expo Go won't work).

**Files:** `app/(runner)/start-run.tsx`, `lib/notifications.ts`.

### ✅ P0-B · Display real runner names in Messages

- ✅ `lib/hooks/useUsersById.ts` — batches `users.select.in(ids)` with a module-scope `Map<string,UserRow>` cache.
- ✅ `(runner)/messages.tsx` renders the partner's name, initials, and location (was `Runner {uuid-prefix}`).
- ✅ Inline `initialsOf` helper.

**Files:** new `lib/hooks/useUsersById.ts`, `app/(runner)/messages.tsx`.

### ✅ P0-C · Replace remaining `mockData.ts` references

- ✅ Audit confirmed no imports of `mockData` anywhere in `app/`, `lib/`, or `types/`.
- ✅ `(leader)/schedule.tsx` already loads from `run_events` via `useLeaderClub`.
- ✅ `(leader)/dashboard.tsx` already uses `useLeaderClub`.
- ✅ `app/data/mockData.ts` and the empty `app/data/` directory deleted.

**Files:** ~~`app/data/mockData.ts`~~ (deleted).

### ✅ P0-D · DM thread UI

- ✅ New route `app/messages/[connection_id].tsx` with chat-bubble UI, header, KeyboardAvoidingView composer, blocked-state banner if connection isn't `accepted`.
- ✅ Auto-scroll on new message; consumes `useMessages` (with realtime subscription).
- ✅ "Send Message" button on `(runner)/messages.tsx` accepted-card now navigates via typed-route object form.
- ✅ "Message" button on `RunnerCard` (Discover) wired: only renders when an accepted connection with that runner exists; navigates to that DM.
- ✅ Route registered in `app/_layout.tsx`.
- ✅ Bonus: while here, fixed pre-existing TS errors in `runners.tsx` (`paceSecondsToBucket` / `distanceToBucket` return types).

**Files:** new `app/messages/[connection_id].tsx`, edits to `app/(runner)/messages.tsx`, `app/(runner)/discover.tsx`, `app/components/RunnerCard.tsx`, `app/_layout.tsx`, `app/(runner)/runners.tsx`.

### ⏳ P0-E · Runner RSVP to club events

The leader can create events, but runners can't see or RSVP to them.

- ⏳ New route or section under `(runner)` that lists upcoming club events for clubs the runner has joined.
- ⏳ Reuse `RunEventCard` with going / maybe / not_going buttons.
- ⏳ `useRsvp(eventId)` hook (insert/update by `(event_id, user_id)` PK).

**Files:** new `app/(runner)/events.tsx` + tab entry in `(runner)/_layout.tsx`, new `lib/hooks/useRsvp.ts`.

### ⏳ P0-F · Decide and unify the "matching" flow

Two parallel data models exist (see HANDOFF §gotcha 1). Pick one as canonical:

- **Option A:** `runs` + `run_invites` is the "I want to run now" funnel; `connection_requests` is for "be running partners ongoing." Document, keep both.
- **Option B:** Collapse to one. (Probably overkill for v1.)

- ⏳ Decide and document in `claude/HANDOFF.md` §"Database (current shape)".
- ⏳ Add cross-links in the app so the runner journey is discoverable from a single tab.

---

## ⏳ Phase P1 — Polish & launch-readiness

### ⏳ P1-A · GPS-driven location

Today `users.latitude/longitude` is rarely populated; `(runner)/runners.tsx`
fakes distance computations.

- ⏳ On profile save, capture `Location.getCurrentPositionAsync()` and store on `users`.
- ⏳ Re-prompt at intervals (e.g., once per session) — or use `expo-location` foreground service for live discover.
- ⏳ Make `match-runners` Edge Function include distance in scoring (radius bucket from filters).

**Files:** `app/(runner)/profile.tsx`, `supabase/functions/match-runners/index.ts`.

### ⏳ P1-B · Maps with real Google Maps key on Android

`app.json` has no `expo-maps` / `react-native-maps` plugin block; on Android the map will silently fail.

- ⏳ Add `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` to `.env.local`.
- ⏳ Add the plugin config to `app.json` Android section.
- ⏳ Verify via dev build (not Expo Go).

**Files:** `app.json`, `.env.local`.

### ⏳ P1-C · Edit / delete for events & announcements

Leader screens currently only support create.

- ⏳ Add long-press or kebab menu on each card → "Edit" / "Delete".
- ⏳ `useClub.updateEvent`, `useClub.deleteEvent`, same for announcements.
- ⏳ RLS already permits leader update/delete — just need UI.

**Files:** `app/(leader)/events.tsx`, `app/(leader)/announcements.tsx`, `lib/hooks/useClub.ts`.

### ⏳ P1-D · Editable emergency contacts

`(leader)/safety.tsx` hardcodes contacts.

- ⏳ New table `club_emergency_contacts (id, club_id, name, phone, role)`.
- ⏳ RLS: leader-only insert/update/delete; members can read.
- ⏳ CRUD UI in the Safety tab.

**Files:** new migration, `lib/hooks/useClub.ts` extension, `app/(leader)/safety.tsx`.

### ⏳ P1-E · In-run group chat

`run_messages` table + `useAcceptedRunners.sendMessage` exist but no reader UI.

- ⏳ On `app/run/[run_id]/accepted.tsx`, add a "Chat" tab or modal.
- ⏳ Subscribe via Supabase Realtime to `run_messages` filtered by `run_id`.
- ⏳ Distinguish broadcast (`recipient_id is null`) from DMs.

**Files:** `app/run/[run_id]/accepted.tsx`, `lib/hooks/useRuns.ts`.

### ⏳ P1-F · Notification UX

- ⏳ Notification on new connection request → deep link to `(runner)/messages`.
- ⏳ Notification on accepted DM thread first-message → deep link to chat.
- ⏳ Notification on RSVP'd event 1 hour before start (scheduled local notif).

**Files:** `lib/notifications.ts`, new Edge Function or DB trigger for connection-request side, scheduling logic in `(runner)/events.tsx`.

### ⏳ P1-G · Component splits for the ten >250-line files

Top three (`dashboard.tsx`, `safety.tsx`, `ready.tsx`) are tractable:

- ⏳ Extract sections into co-located subcomponents (e.g., `dashboard/NextRunCard.tsx`, `dashboard/RsvpSummary.tsx`).
- ⏳ Keep prop interfaces narrow.

---

## ⏳ Phase P2 — Hardening & observability

### ⏳ P2-A · Test scaffolding

- ⏳ Add `jest-expo` + `@testing-library/react-native`.
- ⏳ Smoke tests: render each screen with mock context, assert no crash.
- ⏳ Hook tests: `useReadyStatus`, `useConnections`, `useRuns` against a Supabase test project (or mocked client).

### ⏳ P2-B · Error reporting

- ⏳ Add Sentry (`@sentry/react-native` Expo plugin).
- ⏳ Wrap top-level layout in error boundary.
- ⏳ Pipe Edge Function errors to Sentry too.

### ⏳ P2-C · Analytics

- ⏳ PostHog or Amplitude — track signup → first-match → first-message funnel.
- ⏳ Specifically instrument: ready toggled, connection sent, run created, run accepted.

### ⏳ P2-D · Push-token model cleanup

- ⏳ Decide: single column on `users` (current), or full `push_tokens` multi-device table (already in schema, unused).
- ⏳ Migrate to the chosen model; drop the loser.
- ⏳ Update `lib/notifications.ts` and `send-emergency-alert` accordingly.

### ⏳ P2-E · Remove debug logging

- ⏳ `lib/hooks/useSupabase.ts:13` logs token prefixes — remove or gate behind `__DEV__`.
- ⏳ Audit `console.log` usage repo-wide.

### ⏳ P2-F · CI

- ⏳ GitHub Actions workflow: `npm install`, `npm run lint`, `tsc --noEmit`, then test once tests exist.
- ⏳ On PR to `main`: run lint + types.
- ⏳ On merge: trigger `eas update` for preview channel.

### ⏳ P2-G · Database migration discipline

- ⏳ Add a `supabase/seed.sql` for a deterministic dev seed (3 leaders, 1 club each, 10 runners).
- ⏳ Document `npx supabase db reset` workflow in `HANDOFF.md`.

---

## ⏳ Phase P3 — Growth & v1.1

### ⏳ P3-A · Group chat and per-club channels

Today messaging is 1:1. Clubs would benefit from a member-wide thread.

### ⏳ P3-B · Race-day mode

- ⏳ Pre-race: lookup nearby runners doing the same race.
- ⏳ Day-of: live location share between accepted partners.

### ⏳ P3-C · Streaks & weekly mileage

- ⏳ Profile shows last-7-day mileage (Strava import? manual?).
- ⏳ Leaderboard within a club.

### ⏳ P3-D · Strava / Garmin OAuth import

- ⏳ Auto-populate pace + recent distances from connected service.
- ⏳ Use as a verification badge ("Verified runner").

### ⏳ P3-E · Web companion

- ⏳ `expo-router` already supports web — ship a marketing landing + lightweight discover page.
- ⏳ Push deep links via Universal Links / App Links.

### ⏳ P3-F · Localization

- ⏳ Wrap strings with `expo-localization` + `i18n-js`.
- ⏳ Start with EN/ES/FR.

### ⏳ P3-G · App Store / Play Store launch

- ⏳ Production EAS build profile (already configured).
- ⏳ App Store screenshots at all required sizes.
- ⏳ Privacy policy URL + Apple App Privacy nutrition labels (Clerk + Supabase + Expo Push collect identifiers).
- ⏳ Submit + monitor review.

---

## Quick reference — what blocks beta vs. launch vs. growth

| Milestone        | Phases that must be done                                     | Status |
|------------------|--------------------------------------------------------------|--------|
| Internal beta    | P0-A · P0-B · P0-C · P0-D                                    | ✅     |
| External beta    | + P0-E · P0-F · P1-A · P1-B · P1-C · P1-F                    | ⏳     |
| Public launch    | + P1-D · P1-E · P2-A · P2-B · P2-F · P3-G                    | ⏳     |
| Growth phase     | P3-A through P3-F                                            | ⏳     |

---

## How to update this file

- Flip emoji status as work moves: `⏳` → `🚧` → `✅`.
- When a phase is fully ✅, also update the **At-a-glance status** table at the top.
- Don't move items between phases without leaving a note.
- New work → add under the right phase with the same `Pn-x` style ID.

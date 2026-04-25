# PaceMatch — Status Ledger

_Last updated 2026-04-24 (branch `discover-runner`, post-P0)._

## Legend
- ✅ **Done** — wired end-to-end, tested in dev
- 🟡 **Partial** — UI exists, data layer missing or stubbed
- ⚠️ **Stubbed** — using `mockData.ts` or hardcoded values
- ❌ **Not started**

## At-a-glance roll-up

| Area                      | Status | Where to look          |
|---------------------------|--------|------------------------|
| Auth & onboarding         | ✅     | §1                     |
| Database & RLS            | ✅     | §2                     |
| Edge Functions            | 🟡     | §3 (no match→invite fn) |
| Runner-side screens       | ✅     | §4                     |
| Run-invite flow           | ✅     | §5 (in-run chat is 🟡) |
| Connection-request flow   | ✅     | §6 (push on new req ❌) |
| Leader-side screens       | 🟡     | §7 (edit/delete + RSVP) |
| Cross-cutting / infra     | 🟡     | §8 (tests/CI/Sentry ❌) |

---

## 1 · ✅ Auth & onboarding

| Area                            | Status | Notes                                                        |
|---------------------------------|--------|--------------------------------------------------------------|
| Welcome / landing (`index.tsx`) | ✅     | Two CTAs to login / signup                                   |
| Email + password sign-in        | ✅     | `app/login.tsx` via `useSignIn`                              |
| Email + password sign-up        | ✅     | `app/signup.tsx` with email verification code flow           |
| OAuth (Google / Apple)          | ✅     | `OAuthButton` on both screens                                |
| MFA via email code              | ✅     | Login flow handles `needs_second_factor`                     |
| Role selection                  | ✅     | `app/role-select.tsx` writes role + name to `users` row       |
| Clerk → Supabase JWT bridge     | ✅     | `useGetSupabase` reads `template: "supabase"`                |
| Push token registration         | ✅     | Auto-registers on first `dbUser` load (`AppContext` effect)  |

---

## 2 · ✅ Database & RLS

| Migration                      | Status | Notes                                            |
|--------------------------------|--------|--------------------------------------------------|
| `20260319000001_schema.sql`    | ✅     | Core tables                                      |
| `20260319000002_rls.sql`       | ✅     | RLS + `current_user_id()` + `shares_club()`      |
| `20260319000003_cron.sql`      | ✅     | pg_cron expires `ready_status` every 5 min       |
| `20260402000001_runs.sql`      | ✅     | Adds runs / run_invites / run_messages + RLS    |
| Realtime publications          | ✅     | `run_invites`, `run_messages` enabled            |
| Database type definitions      | ✅     | Hand-written in `lib/database.types.ts`          |

**Tech debt:**
- `users.expo_push_token` (single column) coexists with the `push_tokens` table — pick one, see ROADMAP P2-D.
- No DB seed script for local dev — would need to manually create users to test.

---

## 3 · 🟡 Edge Functions

| Function                | Status | Notes                                                                 |
|-------------------------|--------|-----------------------------------------------------------------------|
| `match-runners`         | ✅     | Scoring: pace 40 + club 30 + ready 20 + goals 15 + training 10 + dist 5 |
| `send-emergency-alert`  | ✅     | Verifies leader, fans push to all members, also creates pinned announcement |
| Match → invite pipeline | ❌     | No function for "create run + invite the top N matches" yet           |

---

## 4 · ✅ Runner-side screens

| Screen                       | Status | Data source           | Notes                                                                                            |
|------------------------------|--------|-----------------------|--------------------------------------------------------------------------------------------------|
| `(runner)/discover`          | ✅     | `useRunners` + `useClubs` | Calls `match-runners` Edge fn; supports search + goal/pace/distance filters; sends connection requests; "Message" button only renders for accepted connections |
| `(runner)/ready`             | ✅     | `useReadyStatus` + `useReadyRunners` | Toggle + time window + visibility; live feed of others ready |
| `(runner)/messages`          | ✅     | `useConnections` + `useUsersById` | Inbound requests with real names, accept/decline, "Send Message" navigates to DM thread |
| `messages/[connection_id]`   | ✅     | `useMessages` (realtime) | Chat-bubble DM screen, composer, auto-scroll, blocked-state banner if connection not accepted |
| `(runner)/profile`           | ✅     | `useCurrentUser`      | Edit pace, goals, distance, training type, location (location is free-text)                      |
| `(runner)/filter`            | ✅     | `AsyncStorage`        | Filter chips + persistence; navigates to `runners`                                               |
| `(runner)/runners` (hidden)  | ✅     | `useGetSupabase` + `expo-location` | Live GPS via `getCurrentPositionAsync`, haversine to each `users.latitude/longitude`, sortable + radius filter |
| `(runner)/start-run` (hidden)| ✅     | `useRuns` + `expo-location` + `expo-notifications` | Reverse-geocoded meet point, creates `runs` + `run_invites`, fans out push to each invitee's `expo_push_token` |

---

## 5 · 🟡 Run invite flow (cross-cutting)

| Step                                | Status | Notes                                                       |
|-------------------------------------|--------|-------------------------------------------------------------|
| Host creates `runs` row             | ✅     | `useRuns.createRun`                                         |
| Host inserts `run_invites` rows     | ✅     | `useRuns.inviteRunners`                                     |
| Push notification to each invitee   | ✅     | `start-run.tsx:96-117` fans out `sendRunInviteNotification` per invitee |
| Notification deep-link → `/invite/[run_id]` | ✅ | `setupNotificationListener` routes correctly             |
| Invite screen accept/decline        | ✅     | `useRunInvite.respondToInvite`                              |
| Host realtime view of acceptances   | ✅     | `useAcceptedRunners` subscribes to `run_invites` channel    |
| In-run broadcast/DM messaging       | 🟡     | `useAcceptedRunners.sendMessage` exists; **no UI** to read messages |

---

## 6 · 🟡 Connection-request flow (Discover → Messages)

| Step                                | Status | Notes                                                       |
|-------------------------------------|--------|-------------------------------------------------------------|
| Send connection request             | ✅     | `useConnections.sendRequest`                                |
| List inbound requests               | ✅     | Filters `to_user_id === dbUser.id`                          |
| Accept / decline                    | ✅     | `useConnections.updateStatus`                               |
| Render partner name + profile       | ✅     | `useUsersById` batched fetch + module cache                 |
| Open DM thread after accepted       | ✅     | "Send Message" button + Discover "Message" button both wired |
| Realtime DM via `useMessages`       | ✅     | `messages/[connection_id].tsx` consumes the hook            |
| Push notification on new request    | ❌     | Not implemented (P1-F)                                      |

---

## 7 · 🟡 Leader-side screens

| Screen                          | Status | Data source                  | Notes                                                                              |
|---------------------------------|--------|------------------------------|------------------------------------------------------------------------------------|
| `(leader)/dashboard`            | ✅     | `useLeaderClub`              | Next-event card + member count + quick actions; create-club modal; weather-alert wired to `send-emergency-alert` |
| `(leader)/schedule`             | 🟡     | `useLeaderClub` + hardcoded `TRAINING_PLANS` | Events grouped This Week / Coming Up come from `run_events`; the 4-week training plan is a hardcoded constant array (not mock data, but not editable) |
| `(leader)/events`               | 🟡     | `useLeaderClub.createEvent`  | Create event UI works; **edit / delete event** missing (P1-C); map placeholder only |
| `(leader)/announcements`        | 🟡     | `useLeaderClub`              | Create + pin works; no edit / delete (P1-C)                                        |
| `(leader)/safety`               | 🟡     | calls `send-emergency-alert` | Weather templates + emergency button work; **emergency-contacts list is hardcoded** (P1-D) |
| `(leader)/members` (hidden)     | 🟡     | `useLeaderClub`              | Lists members; no remove/kick UI                                                   |
| RSVP from runner side           | ❌     | —                            | Runners have **no UI** to RSVP to club events; data model + RLS exist (P0-E)        |

---

## 8 · 🟡 Cross-cutting / infra

| Area                            | Status | Notes                                                                  |
|---------------------------------|--------|------------------------------------------------------------------------|
| Theme + dark mode               | ✅     | `useTheme` + `theme.ts`                                                |
| Reusable cards (`RunnerCard`, `ClubCard`, `RunEventCard`, `StatusBadge`) | ✅ | All themed |
| Expo Router typed routes        | ✅     | Enabled in `app.json`                                                  |
| React Compiler                  | ✅     | Enabled in `app.json`                                                  |
| Push notifications: register    | ✅     | `lib/notifications.ts`                                                 |
| Push notifications: send        | ✅     | `start-run.tsx` fans out per invitee; `send-emergency-alert` fans out per club. New-connection push is still ❌ (P1-F) |
| `expo-location` permissions     | 🟡     | Live GPS in `start-run.tsx` (host) + `runners.tsx` (discovery distance). Profile `users.location` is still hand-typed text — see HANDOFF gotcha 5 (P1-A) |
| `react-native-maps`             | 🟡     | Rendered in `start-run.tsx`; **no Google Maps API key** in `app.json` plugin config (P1-B) |
| ESLint                          | ✅     | `eslint-config-expo`, `npm run lint`                                   |
| Tests                           | ❌     | None yet                                                               |
| CI                              | ❌     | None yet                                                               |
| Sentry / error reporting        | ❌     | None yet                                                               |
| Analytics                       | ❌     | None yet                                                               |
| App icons / splash              | ✅     | `assets/images/*` referenced in `app.json`                             |
| EAS build profiles              | ✅     | dev / preview / production in `eas.json`                               |
| App Store / Play Store submitted | ❌    | —                                                                      |

---

## 9 · ✅ Files still importing `mockData.ts`

None. `app/data/mockData.ts` deleted on 2026-04-24; `grep -rn "mockData" app/ lib/ types/` returns nothing.

---

## 10 · 🟡 Component-size hot-spots (>250 lines)

These exceed the 150-line guideline in `CLAUDE.md` / `PROMPT.md`. Splitting is
optional but worthwhile for the largest. Counts as of 2026-04-24 — refresh
with `wc -l 'app/(leader)/'*.tsx 'app/(runner)/'*.tsx app/messages/*.tsx`:

| File                              | Lines |
|-----------------------------------|-------|
| `app/(leader)/dashboard.tsx`      | 563   |
| `app/(leader)/safety.tsx`         | 494   |
| `app/(runner)/ready.tsx`          | 452   |
| `app/(leader)/events.tsx`         | 353   |
| `app/(runner)/discover.tsx`       | 345   |
| `app/(runner)/messages.tsx`       | 339   |
| `app/(runner)/profile.tsx`        | 334   |
| `app/(leader)/members.tsx`        | 288   |
| `app/(runner)/start-run.tsx`      | 287   |
| `app/(runner)/runners.tsx`        | 276   |
| `app/(leader)/announcements.tsx`  | 245   |
| `app/messages/[connection_id].tsx`| 229   |

Tracked as ROADMAP P1-G — top three (`dashboard`, `safety`, `ready`) are the
highest-leverage splits.

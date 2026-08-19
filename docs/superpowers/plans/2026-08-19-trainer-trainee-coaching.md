# Trainer ↔ Trainee Coaching — Implementation Plan

> **For agentic workers:** Execute slice-by-slice. Each slice is shippable, ends
> in a typecheck + build + commit. Spec: `docs/superpowers/specs/2026-08-19-trainer-trainee-coaching-design.md`.

**Goal:** A trainer invites a trainee by email; the trainee accepts and picks what
to share; the trainer sees a rich, per-category dashboard and assigns plans the
trainee can start.

**Architecture:** RLS-direct scope-gated cross-user reads (helper `coach_can_see`);
new tables `coach_links`, `assigned_plans`, `assigned_plan_exercises`; trainer flag
on `profiles`. React SPA + Supabase, existing dark theme.

**UX bar (applies to every UI task):** Large readable type (titles ≥ 20px, body
≥ 16px), minimal words, one clear action per surface, generous but not sparse
spacing, skeleton loaders, empty states, optimistic accept, instant revoke. No
dense tables where a card or a single big stat will do.

**Tech Stack:** TypeScript, React 18, Vite, Tailwind + CSS vars, Supabase (Postgres
+ RLS), Recharts, framer-motion, `AppIcon` registry.

---

## Slice 0: Migration — tables, helper, RLS

**Files:**
- Create: `supabase/migrations/20260819000000_trainer_trainee.sql`
- Apply via Supabase Management API (MCP disconnected); verify with a query.

- [ ] **Step 1: Write the migration** — `profiles` columns; `coach_links`,
  `assigned_plans`, `assigned_plan_exercises` tables + indexes; `coach_can_see`
  helper; trainer-SELECT policies on workouts, exercises, personal_records, runs,
  body_weight_logs, whoop_cache (recovery:/sleep:/cycles:), whoop_activities,
  food_scans, profiles; owner policies on the three new tables (trainer CRUD own,
  trainee accept/select). Full SQL is in the design spec's Data model + Security
  sections — copy verbatim, adding the owner/trainee policies for the new tables.

- [ ] **Step 2: Apply** via `POST https://api.supabase.com/v1/projects/mrntwydykqsdawpklumf/database/query`
  (Bearer from keychain `security find-generic-password -s "Supabase CLI" -w`,
  browser User-Agent to bypass Cloudflare). Never print the token.

- [ ] **Step 3: Verify** — query `information_schema` for the 3 tables + columns,
  `pg_policies` for the coach_view_* policies, and that `coach_can_see` exists.
  Expected: all present, RLS enabled.

- [ ] **Step 4: Commit** the migration file.

## Slice 1: Link lifecycle (invite → accept/decline)

**Files:**
- Create: `src/lib/coachLinks.ts`
- Modify: `src/pages/Settings.tsx` (Coaches panel), `src/config/icons.tsx` (add icons)

Interfaces:
```ts
export type ScopeKey = 'workouts'|'prs'|'runs'|'recovery'|'sleep'|'strain'|'body_weight'|'food'|'profile';
export interface CoachLink { id:string; trainer_id:string; trainee_id:string|null; invited_email:string;
  status:'pending'|'accepted'|'declined'|'revoked'; shared_scopes:Partial<Record<ScopeKey,boolean>>;
  created_at:string; responded_at:string|null; trainer_name?:string; trainee_name?:string; }
```
Functions: `inviteTrainee(email)`, `getSentLinks()`, `getIncomingInvites()`,
`getMyCoaches()`, `respondToInvite(id, accept, scopes)`, `updateShareScopes(id, scopes)`,
`disconnect(id)`. All via `supabase` client; RLS enforces authority.

- [ ] Settings **Coaches** panel (trainee side): incoming invites card ("**\<Trainer\>
  invited you to coach you**", big text, Accept/Decline); on Accept open scope sheet;
  list of connected coaches with Disconnect.
- [ ] Typecheck + build + commit.

## Slice 2: Share scopes UI

**Files:** Create `src/components/coach/ShareScopeSheet.tsx`; modify Settings panel.

- [ ] Scope sheet: one big labeled toggle per category (Workouts, PRs, Runs,
  Recovery, Sleep, Strain, Body weight, Food) with plain-language subtitles.
  Used on accept and for editing a live connection.
- [ ] Verify RLS: as trainer, read a trainee's workouts with `workouts` on vs off.
- [ ] Typecheck + build + commit.

## Slice 3: Trainer roster (`/coach`)

**Files:** Create `src/pages/CoachDashboard.tsx`, `src/components/coach/InviteTraineeSheet.tsx`,
`src/components/coach/TraineeCard.tsx`; modify `App.tsx` (route), `components/layout/Layout.tsx`
(conditional "Coach" nav for `is_trainer`).

- [ ] Roster: big trainee cards (name, readiness dot, last active, adherence),
  pending-invite chips, single-field **Invite** (email → Send). Guard route by `is_trainer`.
- [ ] Typecheck + build + commit.

## Slice 4: Trainee detail dashboard (`/coach/trainee/:id`)

**Files:** Create `src/lib/coachData.ts`, `src/pages/TraineeDetail.tsx`,
`src/components/coach/NotShared.tsx`; modify `App.tsx`.

`coachData.ts` returns `{ shared:boolean, data }` per section so "not shared"
renders cleanly. Reuse `ThreeRingHero`, `MuscleMap`, `MuscleRadar`, `WeeklyRing`,
`LoadInsights`, recharts + existing chart builders, fed trainee data.

- [ ] Sections (each big + scannable, degrade to `NotShared`): readiness rings,
  training-volume trend, muscle map + radar, session frequency, PR progression,
  recovery-vs-strain, sleep bars, runs, body-weight, ACWR gauge, adherence donut.
- [ ] Typecheck + build + commit.

## Slice 5: Assigned plans

**Files:** Create `src/lib/assignedPlans.ts`, `src/components/coach/AssignPlanSheet.tsx`,
`src/pages/MyCoach.tsx`; modify `TraineeDetail.tsx` (Assign button), `App.tsx`,
Home (badge), Log (start from assigned plan).

- [ ] Trainer: build/assign a plan (reuse template builder patterns). Trainee:
  `/my-coach` shows plan + Start (reuses `buildEntriesFromPlan`).
- [ ] Typecheck + build + commit.

## Slice 6: Polish

- [ ] Empty/loading/error states everywhere, invite/plan badges, mobile nav check,
  a11y (labels, focus, 44px), reduced-motion. Typecheck + build + commit.

---

## Self-review notes
- Every trainer read path is gated by `coach_can_see` — single audited chokepoint.
- New tables get owner + trainee policies (not only the cross-user read policies).
- `is_trainer` admin-granted for v1 (documented non-goal: self-serve trainer signup).

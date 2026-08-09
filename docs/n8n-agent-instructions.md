# Athlix — n8n AI Agent Instructions

Paste the **System Message** below into your n8n **AI Agent** node (Gemini chat
model). It turns the agent into the Athlix fitness coach that can read and log
a user's training data in Supabase.

> Fill the two placeholders before use:
> - `{{USER_ID}}` — the authenticated Athlix user's `auth.uid()` (UUID). Every
>   query and write MUST be scoped to this id. Pass it in from your workflow
>   (e.g. a webhook field or a Set node), never let the model invent it.
> - `{{TODAY}}` — today's date as `YYYY-MM-DD` (from an n8n `$now` expression).

---

## SYSTEM MESSAGE (copy everything below)

You are **Athlix Coach**, an expert strength & conditioning coach embedded in the Athlix fitness app. You help ONE athlete (user_id `{{USER_ID}}`) train smarter by reading and logging their data. Today is `{{TODAY}}`.

### Mission
- Answer training, nutrition, recovery and progress questions using ONLY this user's logged data.
- Log what they tell you (a set, body weight, a check-in) into Supabase.
- Give evidence-based, specific, motivating guidance — like a real trainer.

### Hard rules
1. **Never fabricate numbers.** If the data isn't there, say so briefly or ask.
2. **Scope everything to `{{USER_ID}}`.** Every read and write filters/sets `user_id = {{USER_ID}}`. Never touch another user's rows.
3. **Confirm before destructive writes** (deletes). Logging new data does not need confirmation.
4. **Respect the user's unit preference** (`profiles.unit_preference`, `kg`/`lbs`). Don't convert silently.
5. **Dates**: default any date to `{{TODAY}}` unless the user says otherwise. Format `YYYY-MM-DD`.
6. Be concise: 2–4 short sentences. Lead with the answer. Use the numbers.

### Data model (Supabase, Postgres — all rows are per-user via `user_id`)
- `profiles` — `user_id, full_name, unit_preference (kg|lbs), body_weight, body_weight_unit, height_feet, height_inches, theme`
- `workouts` — a session. `id, user_id, title, date (YYYY-MM-DD), duration_minutes, muscle_groups (text[])`
- `exercises` — sets inside a workout. `id, workout_id, name, muscle_group, sets, reps, weight, unit (kg|lbs), order_index`
- `body_weight_logs` — `id, user_id, date, weight, unit`
- `personal_records` — `id, user_id, exercise_name, best_weight, best_reps, achieved_date`
- `templates` / `template_exercises` — reusable plans. Template exercise: `name, muscle_group, default_sets, default_reps, default_weight, order_index`
- `exercise_library` — the user's custom exercises. `name, muscle_group`
- `exercise_goals` — `exercise_name, target_weight, target_reps` (met when a logged set reaches it)
- `food_scans` — nutrition. `scan_date, total_calories, total_protein, total_carbs, total_fat`
- `runs` — cardio. `timestamp, distance, duration, pace` (distance in km)
- `dopamine_entries` — daily check-in. `date, status (success|relapse), urge (1-5), note`
- `whoop_cache` — cached WHOOP recovery/sleep/strain when connected

### How to act (tools)
You have tools wired in n8n (Supabase nodes or HTTP requests to the Supabase REST/RPC API). Use them like this:

**Read** (to answer questions): query the relevant table filtered by `user_id = {{USER_ID}}`, ordered by date/timestamp desc, limited to what you need (e.g. last 20 workouts, last 30 PRs, last 7 days of food).

**Log a set** — when the user gives an exercise WITH sets AND reps (e.g. "bench 3x10 80kg"):
1. Match the exercise name against `exercise_library` (correct typos, proper case). If no match, still log it with the cleaned name.
2. Call the `logWorkout` tool. It creates one `workouts` row (title auto-set) plus the `exercises` rows atomically. Pass one entry per exercise, each with a `completed_sets` array (one item per set).
3. Confirm: e.g. "Logged **Bench Press** 3×10 @ 80kg for today."

**Log body weight** — "I weigh 78kg": call `logBodyWeight` with `date`, `weight`, `unit`.

**Log a check-in** — "stayed clean today" / "relapsed": insert `dopamine_entries` with `status`, `urge` (default 3), `date`.

**Plan / "what should I train?"** — this is a TEXT answer, not a write. Build it from: this week's volume by muscle group (from `workouts.muscle_groups` + `exercises.sets` over the last 7 days), which muscle group is most rested (max days since last trained), and their PRs. Skip anything trained today/yesterday. Give real exercises with sets×reps.

### When to search the data store (tool description)
Paste this into the "When should this agent search this store / use this tool" field:

> Search this store whenever answering the user needs their own logged Athlix data — workouts, sets, personal records, body weight, nutrition, runs, goals, or WHOOP recovery. Always query it BEFORE making any claim about their progress, trend, volume, consistency, or PRs (e.g. "how's my bench", "am I improving", "what should I train today", "how's my week"), and BEFORE logging a set (to match the exercise name and avoid duplicates). Do NOT search it for general fitness/nutrition knowledge, definitions, or small talk that doesn't reference the user's own history — answer those directly. If a store returns nothing, say so briefly instead of inventing data.

If you expose several narrower read tools instead of one store, give each its own trigger, e.g.:
- `getWorkouts` — "when the user asks about recent training, sessions, volume, or what to train next."
- `getPRs` — "when the user asks about records, maxes, or whether they hit a PR."
- `getFood` — "when the user asks about calories, macros, protein, or diet."
- `getRuns` — "when the user asks about running, pace, distance, or cardio."

### Coaching logic
- Weekly sets below the muscle group's MEV (~10 for small, ~12 for large muscles) → flag it, suggest extra sets.
- Plateau on a lift (same top set for 2+ sessions) → suggest a rep-scheme change or drop set, not just "keep going."
- PR opportunity → name the exact weight/reps to beat.
- If WHOOP recovery is low, steer toward lighter work; if high, green-light a hard session.

### Response format
- Open with the answer/action. No "Based on your data" preamble.
- Prescriptions: one line per exercise → `Exercise: sets×reps @ weight+unit`.
- Bold exercise names and key numbers.
- No motivational sign-off.

---

## ✅ Simplest fix — ONE tool that returns everything (recommended)

There's a database function `athlix_agent_context(p_user_id)` that returns the
athlete's whole training context as ready-to-read text (this week's sessions +
sets by muscle, recent sessions, recent sets, PRs, body weight). Give the agent
**one HTTP Request tool** for it and it can answer "how's my week", "how's my
bench", "what should I train", etc. — no vector store, no joins.

**Remove/disable the `documents` vector store tool** (it's empty and makes the
agent say "no data"). Add this instead:

- **Method:** POST
- **URL:** `https://mrntwydykqsdawpklumf.supabase.co/rest/v1/rpc/athlix_agent_context`
- **Headers:**
  ```
  apikey:        <SUPABASE_SERVICE_ROLE_KEY>
  Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
  Content-Type:  application/json
  ```
- **Body (JSON):** `{ "p_user_id": "{{USER_ID}}" }`
- **Tool description:** "Get the athlete's full training context — this week's sessions and sets by muscle, recent sessions, recent sets, personal records and body weight. Call this FIRST for ANY question about the user's training, progress, week, volume, PRs, or what to train. It returns everything as text — read it and answer. Do not call it for general knowledge or small talk."

That's it — the agent calls it once and answers from real logs. The per-table
tools below are optional if you want finer-grained reads.

---

## Structured read tools (use these, NOT the vector store)

The vector store (`documents`) only knows what you embed into it — it can't see
your `workouts`/`exercises` tables. To answer from real logs, give the agent
**HTTP Request tools** that hit Supabase's REST API (PostgREST). Base URL for
this project:

```
https://mrntwydykqsdawpklumf.supabase.co/rest/v1
```

Every tool sends these **headers** (service-role pattern — server-side in n8n):
```
apikey:        <SUPABASE_SERVICE_ROLE_KEY>
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
```
> Service role bypasses RLS, so you MUST include `user_id=eq.{{USER_ID}}` in every
> query. (Alternatively use the user's JWT instead of the service role and drop
> the `user_id` filter — RLS scopes it automatically.)

### Tool: `getWorkouts` (HTTP Request tool)
- **Method:** GET
- **URL:** `https://mrntwydykqsdawpklumf.supabase.co/rest/v1/workouts`
- **Query parameters:**
  - `select` = `date,title,duration_minutes,muscle_groups,exercises(name,muscle_group,sets,reps,weight,unit,order_index)`
  - `user_id` = `eq.{{USER_ID}}`
  - `order` = `date.desc`
  - `limit` = `50`
- **Tool description:** "Fetch the user's last 50 workout sessions with their sets. Call this for ANY question about training, recent sessions, volume, muscle groups, progress, plateaus, or 'what should I train'. Each exercise row is ONE set (so 3 rows of the same exercise on a date = 3 sets). Compute 'this week' / date ranges yourself from the returned `date` values."

### Tool: `getPRs`
- GET `…/rest/v1/personal_records`
- Params: `select=exercise_name,best_weight,best_reps,achieved_date` · `user_id=eq.{{USER_ID}}` · `order=achieved_date.desc` · `limit=50`
- Description: "The user's personal records. Call when they ask about maxes, PRs, or bests."

### Tool: `getBodyWeight`
- GET `…/rest/v1/body_weight_logs`
- Params: `select=date,weight,unit` · `user_id=eq.{{USER_ID}}` · `order=date.desc` · `limit=30`
- Description: "Body-weight history. Call for weight-trend / cutting / bulking questions."

### Tool: `getFood`
- GET `…/rest/v1/food_scans`
- Params: `select=scan_date,total_calories,total_protein,total_carbs,total_fat` · `user_id=eq.{{USER_ID}}` · `order=scan_date.desc` · `limit=30`
- Description: "Logged nutrition. Call for calorie / macro / protein / diet questions."

> Because these fetch the recent rows and let the model do the date math, the
> agent never has to compute dates for the query — it just filters what it needs
> from `date`/`scan_date`.

## n8n setup notes

1. **AI Agent node** → Chat Model: **Google Gemini** (`gemini-2.5-flash-lite` — biggest free quota; older Flash models are restricted on new API projects).
2. **System Message**: the block above, with `{{USER_ID}}` and `{{TODAY}}` filled from earlier nodes (Webhook / Set / `$now`).
3. **Tools** (give the agent at least these; each is a Supabase or HTTP Request node the agent can call):
   - `getWorkouts` — select from `workouts` (+ join `exercises`) where `user_id = {{USER_ID}}` order by `date` desc.
   - `getPRs`, `getBodyWeight`, `getFood`, `getRuns` — analogous reads.
   - `logWorkout` — call RPC `save_workout_with_sets` (or insert `workouts` then `exercises`).
   - `logBodyWeight` — RPC `log_body_weight`.
   - `logCheckin` — insert `dopamine_entries`.
4. **Auth — pick ONE pattern (this matters, or writes fail):**
   - **Pattern A · user JWT (recommended).** Call Supabase with the *user's* access token (`Authorization: Bearer <user_jwt>`, plus the `apikey: <anon_key>` header). RLS and `auth.uid()` then work automatically — you do NOT pass `user_id` anywhere, and the RPCs below work as-is. This is the cleanest and safest. Get the user's JWT into n8n via your login/webhook flow.
   - **Pattern B · service role + direct inserts.** If you only have the service-role key, you CANNOT use the RPCs below — they are `SECURITY INVOKER` and rely on `auth.uid()`, so with the service role they raise `Authentication required`. Instead insert directly into tables and set `user_id = {{USER_ID}}` explicitly on every row: insert one `workouts` row, then the `exercises` rows with its `workout_id`; insert `body_weight_logs` / `dopamine_entries` directly. The service role bypasses RLS, so `{{USER_ID}}` is your only security boundary — never omit it.
5. **Memory**: enable the agent's conversation memory (Window Buffer) keyed by `{{USER_ID}}` so it remembers the thread.

### Exact signatures & payloads

**RPC `save_workout_with_sets`** (Pattern A / user JWT) — params: `p_title TEXT, p_workout_date DATE, p_duration_minutes INTEGER, p_notes TEXT, p_exercises JSONB`. No user_id — it uses `auth.uid()`.
```json
{
  "p_title": "Evening Workout",
  "p_workout_date": "{{TODAY}}",
  "p_duration_minutes": 0,
  "p_notes": null,
  "p_exercises": [
    { "name": "Bench Press", "muscle_group": "Chest",
      "completed_sets": [
        { "reps": 10, "weight": 80, "unit": "kg" },
        { "reps": 10, "weight": 80, "unit": "kg" },
        { "reps": 10, "weight": 80, "unit": "kg" }
      ] }
  ]
}
```

**RPC `log_body_weight`** (Pattern A) — params: `p_date DATE, p_weight DOUBLE PRECISION, p_unit TEXT, p_notes TEXT`:
```json
{ "p_date": "{{TODAY}}", "p_weight": 78, "p_unit": "kg", "p_notes": null }
```

**Read last workouts (REST):** `GET /rest/v1/workouts?order=date.desc&limit=20&select=*,exercises(*)`
- Pattern A: RLS filters to the user automatically.
- Pattern B: add `&user_id=eq.{{USER_ID}}`.

**Direct insert (Pattern B only):**
- `POST /rest/v1/workouts` → `{ "user_id": "{{USER_ID}}", "title": "Evening Workout", "date": "{{TODAY}}", "duration_minutes": 0, "muscle_groups": ["Chest"] }` (returns the new `id`). The `exercises` table has NO `user_id` — it's owned via `workout_id`.
- `POST /rest/v1/exercises` — **one row per set** (this is how Athlix stores sets; each row has `sets: 1` and an incrementing `order_index`). For 3×10 @ 80kg, insert 3 rows:
  ```json
  [
    { "workout_id": "<id>", "name": "Bench Press", "muscle_group": "Chest", "sets": 1, "reps": 10, "weight": 80, "unit": "kg", "order_index": 0 },
    { "workout_id": "<id>", "name": "Bench Press", "muscle_group": "Chest", "sets": 1, "reps": 10, "weight": 80, "unit": "kg", "order_index": 1 },
    { "workout_id": "<id>", "name": "Bench Press", "muscle_group": "Chest", "sets": 1, "reps": 10, "weight": 80, "unit": "kg", "order_index": 2 }
  ]
  ```
- `POST /rest/v1/body_weight_logs` → `{ "user_id": "{{USER_ID}}", "date": "{{TODAY}}", "weight": 78, "unit": "kg" }`

> Prefer Pattern A (RPC + user JWT) — `save_workout_with_sets` handles per-set rows, the title guard, muscle-group aggregation and PR updates for you. Pattern B's manual inserts skip the PR/auto-title logic.

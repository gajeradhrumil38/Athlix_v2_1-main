# WHOOP API — Available Data Reference

This document covers every data field that Athlix fetches from the WHOOP Developer API v2, how it flows through the system, and what you can build with it.

---

## Architecture Overview

```
User taps "Connect WHOOP" in Settings
  → popup opens OAuth URL (WHOOP auth server)
  → WHOOP redirects to Edge Function /whoop-oauth
  → Edge Function exchanges code for tokens, saves to whoop_tokens table
  → WhoopCallback.tsx receives postMessage, Settings updates state
  → WhoopDashboard loads data via whoopService.fetchAll()
  → fetchAll() calls Edge Function /whoop-oauth (POST, action: fetch_all)
  → Edge Function checks whoop_cache table (15–60 min server TTL)
  → If stale, fetches from WHOOP API, writes back to whoop_cache
  → Client also caches parsed result in localStorage (10 min)
```

---

## Data Categories & Fields

### 1. Recovery (`/v2/recovery`)

Returned as `WhoopRecovery[]` in `src/features/whoop/types/index.ts`.

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `date` | `string` | `yyyy-MM-dd` | Calendar date of the recovery score |
| `recovery_score` | `number` | `0–100` | Overall readiness percentage. < 33 = red, 33–66 = yellow, > 66 = green |
| `hrv_rmssd_milli` | `number` | milliseconds | Heart rate variability (RMSSD). Higher = more recovered. Typical range 20–80 ms |
| `resting_heart_rate` | `number` | bpm | Resting heart rate measured during sleep. Lower is generally better |
| `spo2_percentage` | `number \| undefined` | `%` | Blood oxygen saturation. Normal is 95–100%. Available on supported hardware only |
| `skin_temp_celsius` | `number \| undefined` | °C | Skin temperature during sleep. Deviations from baseline can indicate illness |

**WHOOP API endpoint:** `GET /v2/recovery?limit=10` (day tab) or `?start=&end=&limit=25` (range tabs)

**Filter applied:** Only records where `score_state === 'SCORED'` are returned (excludes calibrating / insufficient data states).

---

### 2. Sleep (`/v2/activity/sleep`)

Returned as `WhoopSleep[]`.

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `date` | `string` | `yyyy-MM-dd` | Date the sleep session started |
| `sleep_performance_percentage` | `number` | `0–100` | How well the user slept vs. their sleep need |
| `sleep_efficiency_percentage` | `number` | `0–100` | Time asleep / time in bed × 100 |
| `total_in_bed_time_milli` | `number` | milliseconds | Total time in bed (use `/ 3_600_000` for hours) |
| `total_slow_wave_sleep_time_milli` | `number \| undefined` | milliseconds | Deep/SWS sleep duration — critical for physical recovery |
| `total_rem_sleep_time_milli` | `number \| undefined` | milliseconds | REM sleep duration — critical for cognitive recovery |

**WHOOP API endpoint:** `GET /v2/activity/sleep`

**Filter applied:** Naps (`nap === true`) are excluded. Only `SCORED` and `PENDING_SCORE` sessions included.

**Additional fields available from WHOOP (not currently parsed):**
- `total_awake_time_milli` — time awake after sleep onset
- `total_light_sleep_time_milli` — N1 + N2 sleep stages
- `respiratory_rate` — breaths per minute during sleep
- `sleep_cycle_count` — number of complete 90-min cycles
- `disturbance_count` — number of wakeups

---

### 3. Strain / Cycles (`/v2/cycle`)

Returned as `WhoopCycle[]`. A "cycle" is a 24-hour physiological day (resets at the lowest HRV point, not midnight).

| Field | Type | Unit | Description |
|-------|------|------|-------------|
| `date` | `string` | `yyyy-MM-dd` | Start date of the cycle |
| `estimated_steps` | `number` | steps | Derived from kilojoules burned: `kj × 23.9` (approximate) |
| `raw_kilojoules` | `number` | kJ | Total energy expenditure for the cycle |
| `strain_score` | `number \| undefined` | `0–21` | Cardiovascular load index. > 18 = overreaching, 14–17 = strenuous, 10–13 = moderate |
| `average_heart_rate` | `number \| undefined` | bpm | Average HR across the entire cycle |
| `max_heart_rate` | `number \| undefined` | bpm | Peak HR reached during the cycle |

**WHOOP API endpoint:** `GET /v2/cycle`

**Additional fields available from WHOOP (not currently parsed):**
- `score.kilojoule` — same as `raw_kilojoules` (already used for step estimation)
- Workout-level strain: available via `GET /v2/activity/workout` — individual workout strain scores, sport names, HR zone data
- `score.zone_duration` — time in each HR zone (0–5)

---

## Workout Activity (Available but not fetched)

`GET /v2/activity/workout` returns individual workout sessions logged in the WHOOP app.

| Field | Description |
|-------|-------------|
| `sport_id` | Sport type (running, cycling, weight training, etc.) |
| `score.strain` | Workout-level strain (0–21) |
| `score.average_heart_rate` | Average HR during workout |
| `score.max_heart_rate` | Peak HR during workout |
| `score.kilojoule` | Calories burned |
| `score.zone_duration` | Milliseconds in each of 6 HR zones |
| `score.distance_meter` | Distance for cardio activities |
| `start` / `end` | ISO timestamps |

**To add this:** Call `GET /v2/activity/workout?limit=25` in the edge function's `paths` map inside the `fetch_all` handler.

---

## Body Measurements (Available but not fetched)

`GET /v2/user/measurement/body` returns:
- `height_meter`
- `weight_kilogram`
- `max_heart_rate` (measured baseline)

---

## Caching Layers

| Layer | TTL | Location |
|-------|-----|----------|
| Supabase `whoop_cache` table | 15 min (day tab) / 60 min (range tabs) | Server-side, shared across devices |
| `localStorage` | 10 min | Client-side, per-browser |

---

## Token Scopes Requested

```
offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement
```

The `offline` scope enables refresh tokens so the connection stays active without re-auth.

---

## Required Supabase Setup

### Environment variables (set in Supabase Dashboard → Edge Functions → Secrets)
```
WHOOP_CLIENT_ID      = your app's client ID from the WHOOP Developer Portal
WHOOP_CLIENT_SECRET  = your app's client secret
SUPABASE_URL         = auto-set by Supabase runtime
SUPABASE_SERVICE_ROLE_KEY = auto-set by Supabase runtime
```

### Database tables
- `whoop_tokens` — stores OAuth tokens per user (INSERT/UPDATE via service role, SELECT/DELETE via RLS)
- `whoop_cache` — stores API response cache per user+key (INSERT/UPDATE via service role, SELECT via RLS)

### WHOOP Developer Portal settings
- Redirect URI must be set to: `https://<your-supabase-project>.supabase.co/functions/v1/whoop-oauth`
- App must be approved for the required scopes

---

## Display Colour Guide (WHOOP conventions)

| Metric | Red | Yellow | Green |
|--------|-----|--------|-------|
| Recovery | < 33% | 33–66% | > 66% |
| Strain | < 10 | 10–17 | n/a (higher = more load) |
| Sleep performance | < 70% | 70–84% | ≥ 85% |
| SpO₂ | < 95% | 95–97% | ≥ 97% |

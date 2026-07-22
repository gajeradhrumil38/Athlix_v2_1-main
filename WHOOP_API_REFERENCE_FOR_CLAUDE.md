# WHOOP API — Technical Reference for Claude Code
# Use this as context when building WHOOP integration

---

## PLATFORM BASICS

- **API Version:** v2 (v1 is deprecated — use v2 for all endpoints)
- **Base URL:** `https://api.prod.whoop.com/developer`
- **Auth Type:** OAuth 2.0 — Authorization Code Flow
- **All requests:** Must include `Authorization: Bearer <access_token>` header
- **Content-Type:** `application/json`
- **Data format:** All dates/times are ISO 8601 (e.g. `2026-04-01T00:00:00.000Z`)

---

## OAUTH 2.0 SETUP (do this first in WHOOP Developer Dashboard)

**Where to create your app:**
→ https://developer-dashboard.whoop.com

**Steps:**
1. Sign in with your WHOOP account at `id.whoop.com`
2. Create a Team → Create an App
3. Copy your **Client ID** and **Client Secret**
4. Register your **Redirect URI** (e.g. `http://localhost:3000/callback`)
5. Select the scopes you need (see below)

**OAuth Endpoints:**
```
Authorization URL:  https://api.prod.whoop.com/oauth/oauth2/auth
Token URL:          https://api.prod.whoop.com/oauth/oauth2/token
```

**Authorization URL — full example:**
```
https://api.prod.whoop.com/oauth/oauth2/auth
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=http://localhost:3000/callback
  &response_type=code
  &scope=read:recovery read:cycles read:sleep read:profile read:body_measurement
  &state=RANDOM_CSRF_STRING
```

**Token Exchange (POST):**
```http
POST https://api.prod.whoop.com/oauth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTH_CODE_FROM_REDIRECT
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
&redirect_uri=http://localhost:3000/callback
```

**Token Refresh (POST):**
```http
POST https://api.prod.whoop.com/oauth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=YOUR_REFRESH_TOKEN
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
```

**Token Response:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

---

## REQUIRED SCOPES (request all of these)

| Scope                   | Grants access to                                      |
|------------------------|-------------------------------------------------------|
| `read:recovery`        | Recovery score, HRV, resting heart rate               |
| `read:cycles`          | Physiological cycle data, strain, avg heart rate      |
| `read:sleep`           | Sleep stages, efficiency %, duration                  |
| `read:profile`         | Name, email                                           |
| `read:body_measurement`| Height, weight, max heart rate                        |
| `read:workout`         | Workout strain, HR zones (optional)                   |

> Add `offline` scope if you want refresh tokens (long-lived sessions)

---

## API ENDPOINTS — WITH REAL RESPONSE SHAPES

### ✅ Validate Token / Get Profile
```
GET /v2/user/profile/basic
Scope: read:profile

Response:
{
  "user_id": 10129,
  "email": "you@example.com",
  "first_name": "John",
  "last_name": "Smith"
}
```
→ Use this to validate a token on save in Settings.

---

### 📊 Recovery Data
```
GET /v2/recovery
Scope: read:recovery

Query params:
  limit    integer (max 25, default 10)
  start    ISO 8601 datetime (inclusive)
  end      ISO 8601 datetime (exclusive, defaults to now)
  nextToken string (for pagination)

Response:
{
  "records": [
    {
      "cycle_id": 93845,
      "sleep_id": "123e4567-e89b-12d3-a456-426614174000",
      "user_id": 10129,
      "created_at": "2022-04-24T11:25:44.774Z",
      "updated_at": "2022-04-24T14:25:44.774Z",
      "score_state": "SCORED",
      "score": {
        "recovery_score": 44,         ← 0–100, main metric
        "resting_heart_rate": 64,     ← BPM
        "hrv_rmssd_milli": 31.813562, ← HRV in milliseconds
        "spo2_percentage": 95.6875,   ← Blood oxygen %
        "skin_temp_celsius": 33.7     ← Skin temperature
      }
    }
  ],
  "next_token": "MTIzOjEyMzEyMw"  ← null if no more pages
}
```
> score_state can be "SCORED", "PENDING_SCORE", "UNSCORABLE" — only use "SCORED" records.

---

### 😴 Sleep Data
```
GET /v2/activity/sleep
Scope: read:sleep

Query params: same as recovery (limit, start, end, nextToken)

Response:
{
  "records": [
    {
      "id": "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
      "cycle_id": 93845,
      "start": "2022-04-24T02:25:44.774Z",
      "end": "2022-04-24T10:25:44.774Z",
      "nap": false,
      "score_state": "SCORED",
      "score": {
        "stage_summary": {
          "total_in_bed_time_milli": 30272735,    ← convert to hours: / 3600000
          "total_awake_time_milli": 1403507,
          "total_light_sleep_time_milli": 14905851,
          "total_slow_wave_sleep_time_milli": 6630370,  ← Deep sleep
          "total_rem_sleep_time_milli": 5879573,
          "sleep_cycle_count": 3,
          "disturbance_count": 12
        },
        "sleep_needed": {
          "baseline_milli": 27395716
        },
        "respiratory_rate": 16.11,
        "sleep_performance_percentage": 98,       ← overall sleep score
        "sleep_consistency_percentage": 90,
        "sleep_efficiency_percentage": 91.69      ← KEY METRIC for display
      }
    }
  ],
  "next_token": null
}
```
> Filter out records where `nap: true` for nightly sleep data only.

---

### 🔄 Cycle / Strain Data (use for step count proxy)
```
GET /v2/cycle
Scope: read:cycles

Query params: same as recovery (limit, start, end, nextToken)

Response:
{
  "records": [
    {
      "id": 93845,
      "start": "2022-04-24T02:25:44.774Z",
      "end": "2022-04-24T10:25:44.774Z",
      "score_state": "SCORED",
      "score": {
        "strain": 5.2951527,          ← Day strain 0–21
        "kilojoule": 8288.297,        ← Energy burned (use for step estimate)
        "average_heart_rate": 68,     ← Avg HR for the day
        "max_heart_rate": 141         ← Max HR for the day
      }
    }
  ],
  "next_token": null
}
```
> ⚠️ WHOOP does NOT expose step count natively.
> Estimation formula: `estimated_steps = Math.round(kilojoule * 23.9)`
> Always label this as "Est. Steps (WHOOP Strain)" in the UI with an info tooltip.

---

### ❤️ Heart Rate Data
```
NOTE: Continuous/live heart rate is NOT available via REST API.
WHOOP devices can broadcast HR over Bluetooth (BLE) only.

For historical heart rate use the cycle average_heart_rate and
resting_heart_rate from recovery — these are your best REST API options.

For a heart rate trend chart, use:
  - recovery.score.resting_heart_rate → per day resting HR
  - cycle.score.average_heart_rate    → per day average HR
  - cycle.score.max_heart_rate        → per day peak HR

Plot these 3 values as a grouped line chart over the date range.
```

---

### 👤 Body Measurements
```
GET /v2/user/measurement/body
Scope: read:body_measurement

Response:
{
  "height_meter": 1.8288,
  "weight_kilogram": 90.7185,
  "max_heart_rate": 200         ← User's calibrated max HR
}
```

---

## PAGINATION PATTERN (implement this for all collection endpoints)

```javascript
async function fetchAllPages(endpoint, token, params) {
  const results = [];
  let nextToken = null;

  do {
    const url = new URL(`https://api.prod.whoop.com/developer${endpoint}`);
    Object.entries({ ...params, limit: 25, ...(nextToken && { nextToken }) })
      .forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`WHOOP API ${res.status}: ${await res.text()}`);

    const data = await res.json();
    results.push(...data.records);
    nextToken = data.next_token ?? null;

  } while (nextToken);

  return results;
}
```

---

## ERROR CODES

| Code | Meaning                          | Action                              |
|------|----------------------------------|-------------------------------------|
| 401  | Token expired or invalid         | Redirect to Settings to reconnect   |
| 404  | Resource not found               | Show "No data" state                |
| 429  | Rate limited                     | Wait and retry (use in-memory cache)|
| 500  | WHOOP server error               | Show retry button                   |

---

## DATA CALIBRATION NOTES

| Metric                     | Raw field                       | Unit        | Display label                     |
|----------------------------|---------------------------------|-------------|-----------------------------------|
| Recovery Score             | `recovery_score`                | 0–100       | "Recovery Score"                  |
| HRV                        | `hrv_rmssd_milli`               | milliseconds| "HRV (ms)"                        |
| Resting Heart Rate         | `resting_heart_rate`            | BPM         | "Resting HR (BPM)"                |
| Sleep Efficiency           | `sleep_efficiency_percentage`   | 0–100 %     | "Sleep Efficiency %"              |
| Time in Bed                | `total_in_bed_time_milli / 3600000` | hours   | "Time in Bed (hrs)"               |
| Deep Sleep                 | `total_slow_wave_sleep_time_milli / 3600000` | hours | "Deep Sleep (hrs)"      |
| Day Strain                 | `strain`                        | 0–21        | "Day Strain"                      |
| Avg HR (day)               | `average_heart_rate`            | BPM         | "Avg HR (BPM)"                    |
| Est. Steps                 | `Math.round(kilojoule * 23.9)`  | integer     | "Est. Steps (from Strain) ⓘ"      |
| SpO2                       | `spo2_percentage`               | %           | "Blood Oxygen %"                  |

---

## TOKEN STORAGE RECOMMENDATION

```javascript
// Store in localStorage (or your app's existing storage pattern)
localStorage.setItem('whoop_access_token', accessToken);
localStorage.setItem('whoop_refresh_token', refreshToken);
localStorage.setItem('whoop_token_expiry', Date.now() + (expires_in * 1000));

// Check before each request
function getValidToken() {
  const expiry = parseInt(localStorage.getItem('whoop_token_expiry'));
  if (Date.now() > expiry - 60000) {
    return refreshAccessToken(); // call token refresh endpoint
  }
  return localStorage.getItem('whoop_access_token');
}
```

---

## WHAT TO BUILD — SUMMARY FOR CLAUDE CODE

1. **Settings page** — OAuth connect button, shows connection status + last synced, Disconnect button
2. **whoopService.js** — fetchRecovery, fetchSleep, fetchCycles (use pagination helper above)
3. **whoopCalibration.js** — unit conversions from table above
4. **4 dashboard cards:**
   - Recovery card (score + HRV + resting HR trend, 7-day line chart)
   - Sleep Efficiency card (% + time in bed, 7-day bar chart)
   - Heart Rate card (resting + avg + max per day, grouped line chart)
   - Step Count card (estimated from kilojoule, 7-day bar chart, with tooltip)
5. **Date range selector** — 7 / 14 / 30 days, shared across all 4 cards
6. **Error/empty states** — 401 → reconnect prompt, no data → empty state

---

## OFFICIAL REFERENCES

- API Docs: https://developer.whoop.com/api
- OAuth Guide: https://developer.whoop.com/docs/developing/oauth/
- Getting Started: https://developer.whoop.com/docs/developing/getting-started/
- Developer Dashboard: https://developer-dashboard.whoop.com
- OpenAPI Spec: https://api.prod.whoop.com/developer/doc/openapi.json

# AI Coach Expansion — Design Spec
**Date:** 2026-06-04  
**Scope:** Option A — Expanded system prompt + new tool declarations + API key onboarding  
**File:** `src/components/ai/AiChat.tsx`

---

## Goal

Make the AI coach a whole-life health assistant that understands all user data (workouts, food, runs, WHOOP recovery, skincare) and can navigate to any feature on request. Keep the user-provided Gemini API key model; improve the key setup UX.

---

## 1. New Data Sources in System Prompt

`buildSystemPrompt()` in `AiChat.tsx` currently pulls workouts, PRs, and profile. Extend it to accept and include four new feeds, each capped to keep prompt size reasonable.

### 1a. Food Scans
- Source: `getFoodScans(userId)` from `src/lib/foodData.ts`
- Scope: last 7 days of scans
- Cap: 14 entries max
- Format per entry: `  YYYY-MM-DD — FoodName: Xcal | P:Xg C:Xg F:Xg`
- Section header: `=== NUTRITION (last 7 days) ===`
- If no data: `  No food scans logged in the last 7 days`

### 1b. GPS Runs
- Source: `getRuns()` from `src/features/running/utils/storage.ts`
- Scope: last 5 runs
- Cap: 5 entries
- Format per entry: `  YYYY-MM-DD — X.Xkm in HH:MM:SS (X:XX/km avg pace)`
- Section header: `=== RUNNING (last 5 runs) ===`
- If no data: `  No runs logged yet`

### 1c. WHOOP Recovery
- Source: `whoop_cache` table via `src/features/whoop/services/whoopService.ts`
- Scope: latest entry only
- Format: `  Recovery: X% | HRV: Xms | Sleep: X.Xh | Strain: X.X`
- Section header: `=== WHOOP RECOVERY (latest) ===`
- Only included if WHOOP cache data was successfully fetched (non-empty result from `getLatestRecovery()`) — if the fetch returns null/empty, omit the section silently
- If not connected: omit section entirely (don't mention WHOOP at all)

### 1d. Skincare Adherence
- Source: `localStorage` key `athlix_skincare_v1`
- Parse current ISO week's completion rate: (done products / total scheduled products) × 100
- Calculate streak: consecutive days where all scheduled products were completed
- Format: `  Skincare this week: X% complete | Streak: X days`
- Section header: `=== SKINCARE ===`
- If no skincare data: omit section

### System Prompt Structure (updated)
```
[existing: athlete profile, training pattern, detailed workouts, older workouts, muscle recovery, weekly volume, progression, personal records]

=== NUTRITION (last 7 days) ===
  ...

=== RUNNING (last 5 runs) ===
  ...

=== WHOOP RECOVERY (latest) ===    [only if connected]
  ...

=== SKINCARE ===    [only if data exists]
  ...
```

### Data fetching
`buildSystemPrompt()` becomes async. All four new fetches run in parallel via `Promise.allSettled()` — a single failing source never blocks the others or breaks the chat.

---

## 2. New Tool Declarations

Add 5 new entries to `FUNCTION_DECLARATIONS` in `AiChat.tsx`.

### Navigation tools (3)
These call `useNavigate()` inside `executeTool()` — no data writes.

```ts
{
  name: 'navigate_to_log',
  description: "Navigate to the workout logger. Use when user says 'start a workout', 'let's train', 'open the log', 'I want to log a session'.",
  parameters: { type: 'object', properties: {}, required: [] },
}
{
  name: 'navigate_to_food',
  description: "Navigate to the food scanner. Use when user says 'log my meal', 'scan food', 'I want to track what I ate', 'food log'.",
  parameters: { type: 'object', properties: {}, required: [] },
}
{
  name: 'navigate_to_run',
  description: "Navigate to the run tracker. Use when user says 'start a run', 'let's go running', 'open the run tracker'.",
  parameters: { type: 'object', properties: {}, required: [] },
}
```

### Summary tools (2)
These cause the AI to synthesize the data already in its context — no extra fetches needed.

```ts
{
  name: 'show_nutrition_summary',
  description: "Triggered when user asks about diet, macros, calories, or food. The AI reads the NUTRITION section already in context and responds with a data-driven summary. Do NOT call this if no food data is in context.",
  parameters: { type: 'object', properties: {}, required: [] },
}
{
  name: 'show_run_summary',
  description: "Triggered when user asks about running, pace, distance, or cardio performance. The AI reads the RUNNING section already in context. Do NOT call if no run data is in context.",
  parameters: { type: 'object', properties: {}, required: [] },
}
```

The summary tools render a `ToolResult` card with `success: true` and the AI's synthesized text in `message` — same pattern as existing `log_exercise` confirmations.

### `executeTool()` additions
```ts
case 'navigate_to_log':    navigate('/log'); return { success: true, message: 'Opening workout logger…' };
case 'navigate_to_food':   navigate('/food/scan'); return { success: true, message: 'Opening food scanner…' };
case 'navigate_to_run':    navigate('/run'); return { success: true, message: 'Starting run tracker…' };
case 'show_nutrition_summary': return { success: true, message: '' }; // AI text carries the answer
case 'show_run_summary':       return { success: true, message: '' };
```

---

## 3. API Key Onboarding Modal

Replace the current flow (settings buried in a drawer) with a first-launch modal.

### Trigger
When the user taps the AI chat button and `localStorage.getItem(GEMINI_KEY_STORAGE)` is null or empty, show the onboarding modal instead of the chat.

### Modal content
1. **Header:** "Set up your AI Coach"
2. **Step 1:** "Get your free Gemini key" — tappable link that opens `https://aistudio.google.com/app/apikey` in a new tab. Bullet: "It's free, no credit card needed."
3. **Step 2:** Paste field with live validation — on blur, make a minimal test call (`generateContent` with a single token prompt). Show spinner → green check or red error.
4. **Step 3:** On valid key → save to localStorage → close modal → open chat automatically.
5. **"Why do I need this?"** — collapsed accordion explaining: key stored locally on device only, never sent to Athlix servers.

### Visual
- Same dark surface as the existing chat drawer (`var(--bg-elevated)`)
- Uses existing accent color (`var(--accent)` = `#C8FF00`) for the CTA button
- No new design tokens needed

---

## 4. Component Changes Summary

| File | Change |
|---|---|
| `src/components/ai/AiChat.tsx` | `buildSystemPrompt()` → async, adds 4 data sections; 5 new `FUNCTION_DECLARATIONS`; 5 new `executeTool()` cases; onboarding modal replaces key-missing state |
| `src/lib/foodData.ts` | No change — `getFoodScans()` already exists |
| `src/features/running/utils/storage.ts` | No change — `getRuns()` already exists |
| `src/features/whoop/services/whoopService.ts` | Read latest cache entry — may need a `getLatestRecovery(userId)` helper if not already exported |
| No new files | All changes in existing files |

---

## 5. Out of Scope

- Writing food/run data from the AI (those features have complex dedicated flows)
- Changing the Gemini model or token limits
- Per-feature AI overlay panels (future iteration)
- Server-side API key proxy (decided against)
- Auth changes (separate future spec)

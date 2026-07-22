# AI Coach Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the AI coach to understand food scans, GPS runs, WHOOP recovery, and skincare adherence, add 5 new tool declarations (3 navigation + 2 summary), and replace the buried API key setup with a first-launch onboarding modal.

**Architecture:** All new data (food, runs, WHOOP, skincare) is fetched once when the chat opens — in parallel alongside existing workout/PR fetches — and stored in component state. `buildSystemPrompt()` stays synchronous since it reads from pre-loaded state. `executeTool()` gains a `navigate` parameter to support navigation tools. The onboarding modal is rendered in-place of the chat panel when no API key is set.

**Tech Stack:** React 18, TypeScript, Gemini API (direct fetch), Supabase, localStorage, `date-fns`, React Router `useNavigate`

---

## File Map

| File | What changes |
|---|---|
| `src/components/ai/AiChat.tsx` | All changes — new state, new data fetching, extended system prompt, 5 new tools, navigation support, onboarding modal |
| `src/lib/foodData.ts` | No change — `getFoodScans(userId)` already exists |
| `src/features/running/utils/storage.ts` | No change — `getRuns()` already exists |
| `src/features/whoop/services/whoopService.ts` | No change — `whoopService.fetchAll('day')` already exists with localStorage caching |

---

## Task 1: Add imports and new state

**Files:**
- Modify: `src/components/ai/AiChat.tsx:1-21` (imports) and `~L488-494` (state declarations)

- [ ] **Step 1: Add new imports at the top of AiChat.tsx**

Find this block (lines 1–20):
```ts
import React, { useState, useRef, useEffect, useCallback } from 'react';
...
import {
  getWorkouts,
  getPersonalRecords,
  logBodyWeight,
  upsertDopamineEntry,
  saveWorkout,
  searchExerciseLibrary,
  type LocalWorkout,
  type LocalExercise,
  type LocalPersonalRecord,
  type LocalExerciseLibraryItem,
} from '../../lib/supabaseData';
```

Replace with:
```ts
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Loader2, Settings as SettingsIcon, RotateCcw, Copy, Check, Plus, Minus, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format, subDays, differenceInCalendarDays } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { DialPicker } from '../log/DialPicker';
import {
  getWorkouts,
  getPersonalRecords,
  logBodyWeight,
  upsertDopamineEntry,
  saveWorkout,
  searchExerciseLibrary,
  type LocalWorkout,
  type LocalExercise,
  type LocalPersonalRecord,
  type LocalExerciseLibraryItem,
} from '../../lib/supabaseData';
import { getFoodScans } from '../../lib/foodData';
import type { FoodScan } from '../../features/food/types';
import { getRuns } from '../../features/running/utils/storage';
import type { SavedRun } from '../../features/running/utils/storage';
import { whoopService } from '../../features/whoop/services/whoopService';
import type { WhoopAllData } from '../../features/whoop/services/whoopService';
```

- [ ] **Step 2: Add new state variables inside `AiChat` component**

Find this block inside `export const AiChat: React.FC = () => {` (around line 488):
```ts
  const [workouts, setWorkouts] = useState<WorkoutWithExercises[]>([]);
  const [prs, setPrs] = useState<LocalPersonalRecord[]>([]);
```

Replace with:
```ts
  const [workouts, setWorkouts] = useState<WorkoutWithExercises[]>([]);
  const [prs, setPrs] = useState<LocalPersonalRecord[]>([]);
  const [foodScans, setFoodScans] = useState<FoodScan[]>([]);
  const [recentRuns, setRecentRuns] = useState<SavedRun[]>([]);
  const [whoopData, setWhoopData] = useState<WhoopAllData | null>(null);
  const [skincareStats, setSkincareStats] = useState<{ weekPercent: number; streak: number } | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit 2>&1 | head -30
```

Expected: only pre-existing errors (if any), no new ones about missing imports.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): add imports and state for food/run/whoop/skincare data"
```

---

## Task 2: Add skincare parser helper

**Files:**
- Modify: `src/components/ai/AiChat.tsx` — add helper function before `buildSystemPrompt`

The skincare localStorage key is `athlix_skincare_v1`. Data shape:
```ts
// AppState from SkincareRoutinePage.tsx
// weeks[weekId].days[dayName].subcats[subcatName].products = ProductEntry[]
// ProductEntry = { productId, status: 'pending'|'done'|'skipped', scheduledDate: string }
```

- [ ] **Step 1: Add `parseSkincareStats` helper**

Add this function immediately before `function buildSystemPrompt(` (around line 290):

```ts
/* ── Parse skincare adherence from localStorage ─────────────────── */
function parseSkincareStats(): { weekPercent: number; streak: number } | null {
  try {
    const raw = localStorage.getItem('athlix_skincare_v1');
    if (!raw) return null;
    const state = JSON.parse(raw) as {
      weeks: Record<string, { days: Record<string, { subcats: Record<string, { products: Array<{ status: string }> }> }> }>;
    };
    if (!state?.weeks) return null;

    // Current ISO week ID
    const now = new Date();
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    const weekId = `${d.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;

    const weekData = state.weeks[weekId];
    if (!weekData?.days) return null;

    let done = 0;
    let total = 0;
    for (const dayData of Object.values(weekData.days)) {
      for (const subcat of Object.values(dayData?.subcats ?? {})) {
        for (const p of subcat.products ?? []) {
          total++;
          if (p.status === 'done') done++;
        }
      }
    }

    const weekPercent = total > 0 ? Math.round((done / total) * 100) : 0;

    // Streak: consecutive past days (including today) where all scheduled products are done
    const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayName = DAY_NAMES[(new Date().getDay() + 6) % 7];
    const todayIndex = DAY_NAMES.indexOf(todayName);
    let streak = 0;
    for (let i = todayIndex; i >= 0; i--) {
      const dayData = weekData.days[DAY_NAMES[i]];
      if (!dayData?.subcats) break;
      const allDone = Object.values(dayData.subcats).every((s) =>
        (s.products ?? []).filter((p) => p.status !== 'skipped').every((p) => p.status === 'done'),
      );
      if (allDone) streak++;
      else break;
    }

    return { weekPercent, streak };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): add skincare stats parser helper"
```

---

## Task 3: Extend buildSystemPrompt with new data sections

**Files:**
- Modify: `src/components/ai/AiChat.tsx` — `buildSystemPrompt` function signature and body (~L290–379)

- [ ] **Step 1: Update `buildSystemPrompt` signature and add new sections**

Find the function signature:
```ts
function buildSystemPrompt(
  profile: any,
  workouts: WorkoutWithExercises[],
  prs: LocalPersonalRecord[],
): string {
```

Replace with:
```ts
function buildSystemPrompt(
  profile: any,
  workouts: WorkoutWithExercises[],
  prs: LocalPersonalRecord[],
  foodScans: FoodScan[],
  recentRuns: SavedRun[],
  whoopData: WhoopAllData | null,
  skincareStats: { weekPercent: number; streak: number } | null,
): string {
```

- [ ] **Step 2: Add helper formatters and append new sections to the return string**

Find the end of `buildSystemPrompt` — the closing of the template literal (the line with just a backtick before the closing brace). It currently ends with:

```ts
4. PR opportunity → call it out explicitly with the weight to hit
5. For nutrition/science questions use Google Search for current evidence`;
}
```

Replace that closing with:

```ts
4. PR opportunity → call it out explicitly with the weight to hit
5. For nutrition/science questions use Google Search for current evidence

${buildFoodSection(foodScans)}${buildRunSection(recentRuns)}${buildWhoopSection(whoopData)}${buildSkincareSection(skincareStats)}`;
}

/* ── Section builders for new data sources ───────────────────────── */
function buildFoodSection(scans: FoodScan[]): string {
  if (!scans.length) return '';
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const recent = scans
    .filter((s) => new Date(s.scan_date) >= cutoff)
    .slice(0, 14);
  if (!recent.length) return '';
  const lines = recent.map(
    (s) => `  ${s.scan_date} — ${s.food_name}: ${s.total_calories}cal | P:${s.total_protein}g C:${s.total_carbs}g F:${s.total_fat}g`,
  );
  return `\n\n━━ NUTRITION (last 7 days) ━━\n${lines.join('\n')}`;
}

function buildRunSection(runs: SavedRun[]): string {
  if (!runs.length) return '';
  const recent = [...runs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const lines = recent.map((r) => {
    const date = new Date(r.timestamp).toISOString().slice(0, 10);
    const km = r.distance.toFixed(2); // distance is already in km
    const totalSecs = Math.floor(r.duration / 1000); // duration is in ms
    const dur = `${Math.floor(totalSecs / 60)}:${(totalSecs % 60).toString().padStart(2, '0')}`;
    const paceMin = Math.floor(r.pace); // pace is in min/km
    const paceSec = Math.round((r.pace % 1) * 60).toString().padStart(2, '0');
    return `  ${date} — ${km}km in ${dur} (${paceMin}:${paceSec}/km avg)`;
  });
  return `\n\n━━ RUNNING (last ${recent.length} runs) ━━\n${lines.join('\n')}`;
}

function buildWhoopSection(data: WhoopAllData | null): string {
  if (!data?.recovery?.length) return '';
  const r = data.recovery[0];
  const s = data.sleep?.[0];
  const sleepH = s ? (s.total_in_bed_time_milli / 3_600_000).toFixed(1) : '?';
  const strain = data.cycles?.[0]?.strain_score?.toFixed(1) ?? '?';
  return `\n\n━━ WHOOP RECOVERY (latest: ${r.date}) ━━\n  Recovery: ${r.recovery_score}% | HRV: ${Math.round(r.hrv_rmssd_milli)}ms | RHR: ${r.resting_heart_rate}bpm | Sleep: ${sleepH}h | Strain: ${strain}`;
}

function buildSkincareSection(stats: { weekPercent: number; streak: number } | null): string {
  if (!stats) return '';
  return `\n\n━━ SKINCARE ━━\n  This week: ${stats.weekPercent}% complete | Streak: ${stats.streak} day${stats.streak !== 1 ? 's' : ''}`;
}
```

- [ ] **Step 3: Update `send()` callback to pass new args to `buildSystemPrompt`**

Find inside `send`:
```ts
        const systemPrompt = buildSystemPrompt(profile, workouts, prs);
```

Replace with:
```ts
        const systemPrompt = buildSystemPrompt(profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats);
```

Also add the new state variables to the dependency array of `send`. Find:
```ts
    [input, loading, apiKey, model, profile, workouts, prs, messages],
```

Replace with:
```ts
    [input, loading, apiKey, model, profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats, messages],
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): extend system prompt with food/run/WHOOP/skincare sections"
```

---

## Task 4: Extended data loading (food, runs, WHOOP, skincare)

**Files:**
- Modify: `src/components/ai/AiChat.tsx` — data loading `useEffect` (~L496–514)

- [ ] **Step 1: Replace the data loading `useEffect`**

Find:
```ts
  /* ── Load workout data once chat opens ────────────────────────────── */
  useEffect(() => {
    if (!open || dataReady || !user?.id) return;
    const load = async () => {
      try {
        const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd');
        const [ws, ps] = await Promise.all([
          getWorkouts(user.id, { startDate, limit: 20, includeExercises: true }),
          getPersonalRecords(user.id),
        ]);
        setWorkouts(ws || []);
        setPrs(ps || []);
      } catch {
        // non-fatal — AI still works without context
      } finally {
        setDataReady(true);
      }
    };
    load();
  }, [open, user?.id, dataReady]);
```

Replace with:
```ts
  /* ── Load all data sources once chat opens ───────────────────────── */
  useEffect(() => {
    if (!open || dataReady || !user?.id) return;
    const load = async () => {
      const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd');
      const [workoutRes, prRes, foodRes, whoopRes] = await Promise.allSettled([
        getWorkouts(user.id, { startDate, limit: 20, includeExercises: true }),
        getPersonalRecords(user.id),
        getFoodScans(user.id, 0, 14),
        whoopService.fetchAll('day').catch(() => null),
      ]);

      if (workoutRes.status === 'fulfilled') setWorkouts((workoutRes.value as WorkoutWithExercises[]) || []);
      if (prRes.status === 'fulfilled') setPrs((prRes.value as LocalPersonalRecord[]) || []);
      if (foodRes.status === 'fulfilled') setFoodScans((foodRes.value as { scans: FoodScan[] }).scans || []);
      if (whoopRes.status === 'fulfilled' && whoopRes.value) setWhoopData(whoopRes.value as WhoopAllData);

      // Runs and skincare are synchronous (localStorage) — always safe
      setRecentRuns(getRuns());
      setSkincareStats(parseSkincareStats());

      setDataReady(true);
    };
    load();
  }, [open, user?.id, dataReady]);
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): load food/run/WHOOP/skincare data when chat opens"
```

---

## Task 5: Add 5 new FUNCTION_DECLARATIONS and update executeTool

**Files:**
- Modify: `src/components/ai/AiChat.tsx` — `FUNCTION_DECLARATIONS` array (~L83) and `executeTool` (~L409)

- [ ] **Step 1: Append 5 new tool declarations to `FUNCTION_DECLARATIONS`**

Find the closing of `FUNCTION_DECLARATIONS`:
```ts
  {
    name: 'show_exercise_form',
    description: "Show the user a fillable exercise log form. Use when: (1) user names an exercise but does NOT give sets and reps, (2) the exercise intent is clear but details are missing. Pass exercise_name if you know which exercise. Do NOT use for weight or dopamine logging.",
    parameters: {
      type: 'object',
      properties: {
        exercise_name: { type: 'string', description: 'Exercise name to pre-fill, with typos corrected. Leave empty if unknown.' },
      },
      required: [],
    },
  },
];
```

Replace with:
```ts
  {
    name: 'show_exercise_form',
    description: "Show the user a fillable exercise log form. Use when: (1) user names an exercise but does NOT give sets and reps, (2) the exercise intent is clear but details are missing. Pass exercise_name if you know which exercise. Do NOT use for weight or dopamine logging.",
    parameters: {
      type: 'object',
      properties: {
        exercise_name: { type: 'string', description: 'Exercise name to pre-fill, with typos corrected. Leave empty if unknown.' },
      },
      required: [],
    },
  },
  {
    name: 'navigate_to_log',
    description: "Open the workout logger page. Use when user says 'start a workout', 'let\\'s train', 'open the log', 'I want to log a session', 'take me to the workout page'.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'navigate_to_food',
    description: "Open the food scanner page. Use when user says 'log my meal', 'scan food', 'I want to track what I ate', 'food log', 'open food scanner'.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'navigate_to_run',
    description: "Open the GPS run tracker. Use when user says 'start a run', 'let\\'s go running', 'open the run tracker', 'I want to track my run'.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'show_nutrition_summary',
    description: "Triggered when user asks about their diet, macros, calories, or food intake. Read the NUTRITION section already in your context and provide a data-driven response. Do NOT call this if no NUTRITION section exists in context.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'show_run_summary',
    description: "Triggered when user asks about their running, pace, distance, mileage, or cardio performance. Read the RUNNING section already in your context. Do NOT call this if no RUNNING section exists in context.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
];
```

- [ ] **Step 2: Update `executeTool` signature to accept `navigate`**

Find:
```ts
async function executeTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
```

Replace with:
```ts
async function executeTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
  navigate: ReturnType<typeof useNavigate>,
): Promise<ToolResult> {
```

- [ ] **Step 3: Add 5 new cases before the final `return` in `executeTool`**

Find:
```ts
  return { success: false, message: `Unknown tool: ${name}` };
}
```

Replace with:
```ts
  if (name === 'navigate_to_log') {
    navigate('/log');
    return { success: true, message: 'Opening workout logger…' };
  }

  if (name === 'navigate_to_food') {
    navigate('/food/scan');
    return { success: true, message: 'Opening food scanner…' };
  }

  if (name === 'navigate_to_run') {
    navigate('/run');
    return { success: true, message: 'Starting run tracker…' };
  }

  if (name === 'show_nutrition_summary') {
    return { success: true, message: '' };
  }

  if (name === 'show_run_summary') {
    return { success: true, message: '' };
  }

  return { success: false, message: `Unknown tool: ${name}` };
}
```

- [ ] **Step 4: Update `executeTool` call site inside `send` to pass `navigate`**

Find inside `send`:
```ts
            toolResult = await executeTool(user.id, toolName, toolArgs);
```

Replace with:
```ts
            toolResult = await executeTool(user.id, toolName, toolArgs, navigate);
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): add 5 new tool declarations (navigation + summary tools)"
```

---

## Task 6: Update getSuggestions to be data-aware

**Files:**
- Modify: `src/components/ai/AiChat.tsx` — `getSuggestions` function (~L382)

- [ ] **Step 1: Update `getSuggestions` signature and add food/run suggestions**

Find:
```ts
function getSuggestions(workouts: WorkoutWithExercises[]): string[] {
  const trainedToday = workouts.some((w) => calDaysSince(w.date) === 0);
  const hasData = workouts.length > 3;
  if (trainedToday) {
    return [
      'My weight today is 78 kg',
      'I stayed clean today',
      'Any recovery tips for what I trained?',
      'What should I focus on next session?',
    ];
  }
  if (hasData) {
    return [
      'Log my weight as 75 kg',
      'I stayed strong today',
      'Which exercises am I plateauing on?',
      "How's my weekly volume looking?",
    ];
  }
  return [
    'My weight today is 80 kg',
    'I stayed clean today',
    'What should I train today?',
    'Give me a beginner plan.',
  ];
}
```

Replace with:
```ts
function getSuggestions(
  workouts: WorkoutWithExercises[],
  foodScans: FoodScan[],
  recentRuns: SavedRun[],
): string[] {
  const trainedToday = workouts.some((w) => calDaysSince(w.date) === 0);
  const hasFood = foodScans.length > 0;
  const hasRuns = recentRuns.length > 0;

  if (trainedToday) {
    return [
      hasFood ? "How are my macros looking today?" : 'My weight today is 78 kg',
      'I stayed clean today',
      'Any recovery tips for what I trained?',
      hasRuns ? 'How is my running pace improving?' : 'What should I focus on next session?',
    ];
  }
  if (workouts.length > 3) {
    return [
      'Log my weight as 75 kg',
      hasFood ? "Am I hitting my protein goals?" : 'I stayed strong today',
      'Which exercises am I plateauing on?',
      hasRuns ? "How's my weekly mileage?" : "How's my weekly volume looking?",
    ];
  }
  return [
    'My weight today is 80 kg',
    'I stayed clean today',
    'What should I train today?',
    hasRuns ? 'Analyse my recent runs' : 'Give me a beginner plan.',
  ];
}
```

- [ ] **Step 2: Update both `getSuggestions` call sites in the JSX**

Find (appears twice — in mobile sheet and desktop modal):
```ts
              suggestions={getSuggestions(workouts)}
```

Replace both occurrences with:
```ts
              suggestions={getSuggestions(workouts, foodScans, recentRuns)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): data-aware suggestion chips for food and runs"
```

---

## Task 7: API key onboarding modal

**Files:**
- Modify: `src/components/ai/AiChat.tsx` — add `ApiKeySetupModal` component and wire it into `AiChat`

- [ ] **Step 1: Add `ApiKeySetupModal` component**

Add this new component immediately before `export const AiChat: React.FC = () => {`:

```tsx
/* ── API Key first-launch setup modal ───────────────────────────── */
const GEMINI_DOCS_URL = 'https://aistudio.google.com/app/apikey';

const ApiKeySetupModal: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [key, setKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showWhy, setShowWhy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 2) setTimeout(() => inputRef.current?.focus(), 80);
  }, [step]);

  const validate = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('Paste your API key first.'); return; }
    setValidating(true);
    setError('');
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${trimmed}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg: string = body?.error?.message || `Error ${res.status}`;
        setError(msg.includes('API_KEY') || res.status === 400 ? 'Invalid key — check and try again.' : msg);
        return;
      }
      localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
      setStep(3);
      setTimeout(onDone, 1200);
    } catch {
      setError('Could not reach Gemini. Check your connection.');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div
      className="flex flex-col h-full p-6 gap-5"
      style={{ fontFamily: 'var(--font-body, Inter, sans-serif)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="ai-aurora-static flex items-center justify-center rounded-lg"
          style={{ width: 36, height: 36, border: '1.5px solid transparent' }}>
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-[15px] font-bold text-white">Set up AI Coach</p>
          <p className="text-[12px] text-white/40">Free · 1 min setup</p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 flex flex-col gap-4">

        {/* Step 1 */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: step === 1 ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)' }}
        >
          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: step > 1 ? 'var(--accent)' : 'var(--bg-surface)', color: step > 1 ? '#000' : 'var(--text-secondary)' }}>
            {step > 1 ? <Check className="w-3 h-3" /> : '1'}
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-white/90">Get your free Gemini key</p>
            <p className="text-[12px] text-white/40 mt-0.5">No credit card · Free tier: 1,500 req/day</p>
            {step === 1 && (
              <a
                href={GEMINI_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors"
                style={{ background: 'var(--accent)', color: '#000' }}
                onClick={() => setStep(2)}
              >
                Open Google AI Studio <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Step 2 */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: step === 2 ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${step === 2 ? 'rgba(200,255,0,0.25)' : 'var(--border)'}`,
            opacity: step < 2 ? 0.4 : 1,
          }}
        >
          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: step > 2 ? 'var(--accent)' : 'var(--bg-surface)', color: step > 2 ? '#000' : 'var(--text-secondary)' }}>
            {step > 2 ? <Check className="w-3 h-3" /> : '2'}
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-white/90">Paste your key</p>
            {step >= 2 && (
              <>
                <input
                  ref={inputRef}
                  type="password"
                  value={key}
                  onChange={(e) => { setKey(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && validate()}
                  placeholder="AIza…"
                  className="mt-2 w-full h-9 rounded-lg px-3 text-[13px] text-white/90 outline-none placeholder:text-white/20"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
                />
                {error && <p className="mt-1.5 text-[12px] text-red-400">{error}</p>}
                <button
                  onClick={validate}
                  disabled={validating}
                  className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  {validating ? <><Loader2 className="w-3 h-3 animate-spin" /> Validating…</> : 'Confirm key'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Step 3 */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: step === 3 ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${step === 3 ? 'rgba(200,255,0,0.4)' : 'var(--border)'}`,
            opacity: step < 3 ? 0.4 : 1,
          }}
        >
          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: step === 3 ? 'var(--accent)' : 'var(--bg-surface)', color: step === 3 ? '#000' : 'var(--text-secondary)' }}>
            {step === 3 ? <Check className="w-3 h-3" /> : '3'}
          </span>
          <div>
            <p className="text-[13px] font-semibold text-white/90">
              {step === 3 ? '🎉 Ready! Opening coach…' : 'Done — chat opens automatically'}
            </p>
          </div>
        </div>
      </div>

      {/* Why accordion */}
      <div>
        <button
          onClick={() => setShowWhy((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/50 transition-colors"
        >
          {showWhy ? '▾' : '▸'} Why do I need this?
        </button>
        {showWhy && (
          <p className="mt-2 text-[12px] text-white/40 leading-relaxed">
            Your key is stored only on this device — never sent to Athlix servers. All AI requests go
            directly from your browser to Google's Gemini API. You can revoke it anytime at aistudio.google.com.
          </p>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire `showKeySetup` state and render `ApiKeySetupModal` in `AiChat`**

Find the `open` state setter and the event handler that opens the chat:
```ts
  const close = () => setOpen(false);
```

Add immediately after:
```ts
  const openChat = () => {
    const key = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
    if (!key) { setShowKeySetup(true); setOpen(true); }
    else { setShowKeySetup(false); setOpen(true); }
  };
```

- [ ] **Step 3: Replace `setOpen(true)` calls with `openChat()`**

Find (FAB button onClick):
```ts
      onClick={() => setOpen(true)}
```

Replace with:
```ts
      onClick={openChat}
```

Find (event listener):
```ts
    const handler = () => setOpen(true);
```

Replace with:
```ts
    const handler = () => openChat();
```

- [ ] **Step 4: Render `ApiKeySetupModal` inside the chat panel when `showKeySetup` is true**

In `ChatContent` props rendering (both mobile sheet and desktop modal), find the `ChatContent` component inside the mobile `<motion.div>`:
```tsx
            <ChatContent
              apiKey={apiKey}
              ...
            />
```

Add a conditional above it (do this for BOTH the mobile and desktop panel):
```tsx
            {showKeySetup ? (
              <ApiKeySetupModal onDone={() => { setShowKeySetup(false); }} />
            ) : (
              <ChatContent
                apiKey={apiKey}
                ...
              />
            )}
```

- [ ] **Step 5: TypeScript check**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): add first-launch API key onboarding modal"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full TypeScript check**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npx tsc --noEmit 2>&1
```

Expected: 0 new errors introduced by this feature.

- [ ] **Step 2: Run dev server and verify manually**

```bash
cd /Users/dhrumilgajera/Desktop/AthlixV2.1-1 && npm run dev
```

Open the app and verify:
1. Tap AI button with no key set → onboarding modal appears with 3-step flow
2. Paste a valid Gemini key → step 2 validates → step 3 "Ready!" → chat opens
3. Chat opens with food/run suggestion chips if data exists
4. Say "how's my diet?" → AI references NUTRITION section
5. Say "let's go running" → AI calls `navigate_to_run` → routes to `/run`
6. Say "start a workout" → AI calls `navigate_to_log` → routes to `/log`

- [ ] **Step 3: Final commit**

```bash
git add src/components/ai/AiChat.tsx
git commit -m "feat(ai): AI coach expansion — food/run/WHOOP/skincare context + navigation tools + onboarding"
```

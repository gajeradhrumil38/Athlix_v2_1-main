# Post-Workout AI Coach Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After finishing a workout, show a WHOOP-style floating pill that analyzes the session (real PR count, comparison to the last similar workout, progress toward per-exercise strength goals, WHOOP recovery if connected) and delivers a short AI-written take, expandable into a drawer that hands off into the existing AI Coach chat.

**Architecture:** New `exercise_goals` Supabase table + dual-path CRUD (mirrors the `exercise_type_overrides` pattern already in the codebase). `Log.tsx`'s `handleSave()` computes real PR deltas, goal progress, and a comparison to the last similar workout — all from data already fetched when the Finish sheet opens, so the save path itself adds no extra latency — then dispatches a `athlix:workout-finished` window event. A new globally-mounted `PostWorkoutCoachPill` listens for that event and renders three states (analyzing → teaser → drawer), calling Gemini with the same rich context `AiChat`'s system prompt already builds (workout history, MEV volume, progressive-overload trend, WHOOP recovery), extracted into a shared `src/lib/aiCoach.ts` so it isn't duplicated.

**Tech Stack:** React 18 + TypeScript, Supabase (Postgres + RLS), Google Gemini REST API (client-side, user-supplied key — same as existing `AiChat`). **This repo has no automated test framework** (`npm run lint`, `npx tsc --noEmit`, and manual dev-server verification are the only checks — see `CLAUDE.md` Dev Commands). Every task below substitutes "write a failing test" with "make the change, then verify with `tsc --noEmit` and a concrete manual check" — there is no test suite to run instead.

---

## Task 1: `exercise_goals` table

**Files:**
- Create: `supabase/migrations/20260722120000_exercise_goals.sql`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE public.exercise_goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  exercise_name TEXT NOT NULL,
  target_weight NUMERIC NOT NULL CHECK (target_weight > 0),
  target_reps INTEGER NOT NULL CHECK (target_reps > 0),
  unit TEXT NOT NULL CHECK (unit IN ('kg','lbs')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved')),
  achieved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.exercise_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own exercise goals" ON public.exercise_goals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own exercise goals" ON public.exercise_goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own exercise goals" ON public.exercise_goals
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own exercise goals" ON public.exercise_goals
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX exercise_goals_user_status_idx ON public.exercise_goals (user_id, status);

COMMENT ON TABLE public.exercise_goals IS
  'Per-user strength target for a specific exercise, e.g. "Bench Press -> 100kg x 5". Met when a logged set reaches target_weight for target_reps or more.';
```

- [ ] **Step 2: Mirror it into `supabase/schema.sql`**

Add the `CREATE TABLE public.exercise_goals` block (identical to Step 1, minus the standalone `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` line — schema.sql groups all `ENABLE ROW LEVEL SECURITY` statements together, following the existing convention) right after the `exercise_type_overrides` table block. Then add `ALTER TABLE public.exercise_goals ENABLE ROW LEVEL SECURITY;` to the existing "Enable RLS" group, and the four `CREATE POLICY ... exercise_goals` statements to the existing policies section (same placement pattern used for `exercise_type_overrides` — search for that table name in the file to find both insertion points).

- [ ] **Step 3: Apply to the live Supabase project**

Use the `mcp__claude_ai_Supabase__apply_migration` tool with `project_id: "mrntwydykqsdawpklumf"`, `name: "exercise_goals"`, and the SQL from Step 1 as `query`.

- [ ] **Step 4: Verify**

Use `mcp__claude_ai_Supabase__list_tables` with the same `project_id` — confirm `public.exercise_goals` appears with `rls_enabled: true`. Then use `mcp__claude_ai_Supabase__get_advisors` with `type: "security"` — confirm no new warnings reference `exercise_goals`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260722120000_exercise_goals.sql supabase/schema.sql
git commit -m "Add exercise_goals table for per-exercise strength targets"
```

---

## Task 2: Goal CRUD — `localData.ts`

**Files:**
- Modify: `src/lib/localData.ts`

- [ ] **Step 1: Add the type and extend `LocalDatabase`**

Find the `interface LocalDatabase` block (has `exerciseTypeOverrides: LocalExerciseTypeOverride[];` as its last field) and add a new field + new interface right after `LocalExerciseTypeOverride`:

```ts
  exerciseTypeOverrides: LocalExerciseTypeOverride[];
  exerciseGoals: LocalExerciseGoal[];
}

interface LocalExerciseTypeOverride {
  user_id: string;
  exercise_name: string;
  input_type: ExerciseInputType;
  updated_at: string;
}

export interface LocalExerciseGoal {
  id: string;
  user_id: string;
  exercise_name: string;
  target_weight: number;
  target_reps: number;
  unit: 'kg' | 'lbs';
  status: 'active' | 'achieved';
  achieved_at: string | null;
  created_at: string;
}
```

(Only add the new `exerciseGoals` field and the new `LocalExerciseGoal` interface — `LocalExerciseTypeOverride` already exists, shown here only for anchoring.)

- [ ] **Step 2: Add the default field in `createInitialDb()`**

Find:
```ts
  dashboardLayouts: [],
  exerciseTypeOverrides: [],
});
```
Change to:
```ts
  dashboardLayouts: [],
  exerciseTypeOverrides: [],
  exerciseGoals: [],
});
```

- [ ] **Step 3: Add the CRUD functions**

Find `export const addCustomExercise = async (` (the function right after the `exerciseTypeOverrides` CRUD block) and insert before it:

```ts
export const getGoals = async (userId: string): Promise<LocalExerciseGoal[]> => {
  const db = readDb();
  return db.exerciseGoals
    .filter((g) => g.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
};

export const addGoal = async (
  userId: string,
  input: { exerciseName: string; targetWeight: number; targetReps: number; unit: 'kg' | 'lbs' },
): Promise<LocalExerciseGoal> => {
  const db = readDb();
  const goal: LocalExerciseGoal = {
    id: createId(),
    user_id: userId,
    exercise_name: input.exerciseName.trim(),
    target_weight: input.targetWeight,
    target_reps: input.targetReps,
    unit: input.unit,
    status: 'active',
    achieved_at: null,
    created_at: new Date().toISOString(),
  };
  db.exerciseGoals.push(goal);
  writeDb(db);
  return goal;
};

export const updateGoal = async (
  userId: string,
  goalId: string,
  updates: Partial<Pick<LocalExerciseGoal, 'target_weight' | 'target_reps' | 'unit' | 'status' | 'achieved_at'>>,
): Promise<void> => {
  const db = readDb();
  const goal = db.exerciseGoals.find((g) => g.id === goalId && g.user_id === userId);
  if (!goal) return;
  Object.assign(goal, updates);
  writeDb(db);
};

export const deleteGoal = async (userId: string, goalId: string): Promise<void> => {
  const db = readDb();
  db.exerciseGoals = db.exerciseGoals.filter((g) => !(g.id === goalId && g.user_id === userId));
  writeDb(db);
};
```

`createId` is already imported/used elsewhere in this file (used by `addCustomExercise`) — no new import needed.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors mentioning `localData.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/localData.ts
git commit -m "Add local (offline) CRUD for exercise strength goals"
```

---

## Task 3: Goal CRUD — `supabaseData.ts`

**Files:**
- Modify: `src/lib/supabaseData.ts`

- [ ] **Step 1: Add the type re-export**

Near the top of the file, find:
```ts
export type LocalPersonalRecord = localData.LocalPersonalRecord;
```
Add right after it:
```ts
export type LocalExerciseGoal = localData.LocalExerciseGoal;
```

- [ ] **Step 2: Add the CRUD functions**

Find the `// ── Exercise type overrides ──` section (it ends with the `renameExerciseTypeOverride` function, right before `export const addCustomExercise = async (`). Insert a new block after `renameExerciseTypeOverride`'s closing brace and before `addCustomExercise`:

```ts
// ── Exercise goals ──────────────────────────────────────────────────────────

export const getGoals = async (userId: string): Promise<LocalExerciseGoal[]> => {
  if (!hasSupabaseConfig) return localData.getGoals(userId);

  const { data, error } = await supabase
    .from('exercise_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw normalizeError(error, 'Failed to load goals.');
  return (data || []) as LocalExerciseGoal[];
};

export const addGoal = async (
  userId: string,
  input: { exerciseName: string; targetWeight: number; targetReps: number; unit: 'kg' | 'lbs' },
): Promise<LocalExerciseGoal> => {
  if (!hasSupabaseConfig) return localData.addGoal(userId, input);

  const { data, error } = await supabase
    .from('exercise_goals')
    .insert({
      user_id: userId,
      exercise_name: input.exerciseName.trim(),
      target_weight: input.targetWeight,
      target_reps: input.targetReps,
      unit: input.unit,
      status: 'active',
    })
    .select()
    .single();
  if (error) throw normalizeError(error, 'Failed to save goal.');
  return data as LocalExerciseGoal;
};

export const updateGoal = async (
  userId: string,
  goalId: string,
  updates: Partial<Pick<LocalExerciseGoal, 'target_weight' | 'target_reps' | 'unit' | 'status' | 'achieved_at'>>,
): Promise<void> => {
  if (!hasSupabaseConfig) return localData.updateGoal(userId, goalId, updates);

  const { error } = await supabase
    .from('exercise_goals')
    .update(updates)
    .eq('id', goalId)
    .eq('user_id', userId);
  if (error) throw normalizeError(error, 'Failed to update goal.');
};

export const deleteGoal = async (userId: string, goalId: string): Promise<void> => {
  if (!hasSupabaseConfig) return localData.deleteGoal(userId, goalId);

  const { error } = await supabase
    .from('exercise_goals')
    .delete()
    .eq('id', goalId)
    .eq('user_id', userId);
  if (error) throw normalizeError(error, 'Failed to delete goal.');
};
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabaseData.ts
git commit -m "Add Supabase CRUD for exercise strength goals"
```

---

## Task 4: Last-workout comparison helper

**Files:**
- Modify: `src/lib/supabaseData.ts`

This is a **pure function** (no DB call of its own) — it's fed the workout list that `Log.tsx` will already have fetched (Task 6), so finishing a workout doesn't need an extra round trip.

- [ ] **Step 1: Add the type and function**

Insert right after the `getWorkouts` function definition (after its closing `};`):

```ts
export interface WorkoutComparison {
  previousDate: string;
  previousTitle: string;
  volumeDelta: number;
  setsDelta: number;
  durationDeltaMinutes: number;
}

// Pure — takes the already-finished workout's own totals plus a list of prior
// workouts (fetched once, before save) and finds the best match to compare against.
// Matches by title first (case-insensitive), falling back to >50% muscle-group overlap.
export const findLastSimilarWorkout = (
  finished: { title: string; muscleGroups: string[]; totalVolume: number; totalSets: number; durationMinutes: number },
  priorWorkouts: (LocalWorkout & { exercises?: LocalExercise[] })[],
): WorkoutComparison | null => {
  const finishedTitle = finished.title.trim().toLowerCase();
  const finishedGroups = new Set(finished.muscleGroups.map((g) => g.toLowerCase()));

  const titleMatch = priorWorkouts.find((w) => w.title.trim().toLowerCase() === finishedTitle);

  const overlapMatch = !titleMatch
    ? priorWorkouts.find((w) => {
        const groups = new Set((w.muscle_groups || []).map((g) => g.toLowerCase()));
        if (groups.size === 0 || finishedGroups.size === 0) return false;
        const shared = [...groups].filter((g) => finishedGroups.has(g)).length;
        const union = new Set([...groups, ...finishedGroups]).size;
        return shared / union > 0.5;
      })
    : undefined;

  const match = titleMatch || overlapMatch;
  if (!match) return null;

  const prevVolume = (match.exercises || []).reduce((sum, ex) => sum + ex.weight * ex.reps * ex.sets, 0);
  const prevSets = (match.exercises || []).reduce((sum, ex) => sum + ex.sets, 0);

  return {
    previousDate: match.date,
    previousTitle: match.title,
    volumeDelta: finished.totalVolume - prevVolume,
    setsDelta: finished.totalSets - prevSets,
    durationDeltaMinutes: finished.durationMinutes - match.duration_minutes,
  };
};
```

`LocalWorkout` and `LocalExercise` are already imported/defined in this file (used throughout).

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabaseData.ts
git commit -m "Add pure last-similar-workout comparison helper"
```

---

## Task 5: Real PR count (fixes the dead `isPR` bug)

**Files:**
- Modify: `src/components/log/FinishSheet.tsx`
- Modify: `src/pages/Log.tsx`

**Background:** `FinishSheet.tsx`'s `prCount` currently counts `Set.isPR === true`, a field that's only ever set as transient local UI state during logging (`ExerciseBlock.tsx`) and never actually written onto the sets `FinishSheet` reads — so this always shows 0 for real workouts. The fix: pass in the user's existing `personal_records` (fetched once when the Finish sheet opens) and compute PRs by comparing each exercise's best completed set against the stored record.

- [ ] **Step 1: Add a `personalRecords` prop to `FinishSheet` and compute real PRs**

In `src/components/log/FinishSheet.tsx`, change the import line:
```ts
import { convertWeight, type WeightUnit } from '../../lib/units';
```
to:
```ts
import { convertWeight, type WeightUnit } from '../../lib/units';
import type { LocalPersonalRecord } from '../../lib/supabaseData';
```

Change the props interface:
```ts
interface FinishSheetProps {
  workout: WorkoutState;
  weightUnit?: 'kg' | 'lbs';
  bodyWeight?: number | null;
  bodyWeightUnit?: WeightUnit;
  onConfirm: (title: string, notes: string) => void;
  onCancel: () => void;
  onAddMore?: () => void;
  saving?: boolean;
}
```
to:
```ts
interface FinishSheetProps {
  workout: WorkoutState;
  weightUnit?: 'kg' | 'lbs';
  bodyWeight?: number | null;
  bodyWeightUnit?: WeightUnit;
  personalRecords?: LocalPersonalRecord[];
  onConfirm: (title: string, notes: string) => void;
  onCancel: () => void;
  onAddMore?: () => void;
  saving?: boolean;
}
```

Destructure it in the component signature — change:
```ts
export const FinishSheet: React.FC<FinishSheetProps> = ({
  workout,
  weightUnit = 'lbs',
  bodyWeight,
  bodyWeightUnit = 'lbs',
  onConfirm,
  onCancel,
  onAddMore,
  saving = false,
}) => {
```
to:
```ts
export const FinishSheet: React.FC<FinishSheetProps> = ({
  workout,
  weightUnit = 'lbs',
  bodyWeight,
  bodyWeightUnit = 'lbs',
  personalRecords = [],
  onConfirm,
  onCancel,
  onAddMore,
  saving = false,
}) => {
```

Replace the `prCount` computation — change:
```ts
  const prCount = useMemo(
    () =>
      (workout.exercises || []).reduce(
        (count, ex) => count + (ex.sets || []).filter((s) => s.done && Boolean(s.isPR)).length,
        0,
      ),
    [workout.exercises],
  );
```
to:
```ts
  const prCount = useMemo(() => {
    const prByName = new Map(personalRecords.map((pr) => [pr.exercise_name.toLowerCase(), pr]));
    let count = 0;
    for (const ex of workout.exercises || []) {
      const exerciseType = resolveEffectiveInputType(ex.name, typeOverrides);
      if (!isWeightExerciseType(exerciseType)) continue;
      const doneSets = (ex.sets || []).filter((s) => s.done);
      if (!doneSets.length) continue;
      const bestWeight = Math.max(...doneSets.map((s) => Number(s.weight || 0)));
      if (bestWeight <= 0) continue;
      const existing = prByName.get(ex.name.toLowerCase());
      if (!existing || bestWeight > existing.best_weight) count++;
    }
    return count;
  }, [workout.exercises, personalRecords, typeOverrides]);
```

- [ ] **Step 2: Fetch PRs when the Finish sheet opens, in `Log.tsx`**

In `src/pages/Log.tsx`, add a new import right after the `FinishSheet` import:
```ts
import { FinishSheet } from '../components/log/FinishSheet';
```
becomes:
```ts
import { FinishSheet } from '../components/log/FinishSheet';
import { getPersonalRecords, type LocalPersonalRecord } from '../lib/supabaseData';
```
(`getPersonalRecords` may already be imported elsewhere in this file from a different `import { ... } from '../lib/supabaseData'` block — if so, add `getPersonalRecords, type LocalPersonalRecord` into that existing named-import list instead of creating a second import line for the same module.)

Add new state right after `const [showFinish, setShowFinish] = useState(false);`:
```ts
  const [showFinish, setShowFinish] = useState(false);
  const [finishPersonalRecords, setFinishPersonalRecords] = useState<LocalPersonalRecord[]>([]);
```

Update `handleFinish` — change:
```ts
  const handleFinish = () => {
    setShowFinish(true);
  };
```
to:
```ts
  const handleFinish = () => {
    setShowFinish(true);
    if (user) {
      getPersonalRecords(user.id).then(setFinishPersonalRecords).catch(() => setFinishPersonalRecords([]));
    }
  };
```

Pass the prop at the `<FinishSheet>` call site — change:
```ts
          <FinishSheet 
            workout={workout}
            weightUnit={weightUnit}
            bodyWeight={profile?.body_weight ?? null}
            bodyWeightUnit={(profile?.body_weight_unit || 'lbs') as 'kg' | 'lbs'}
            onConfirm={handleSave}
```
to:
```ts
          <FinishSheet 
            workout={workout}
            weightUnit={weightUnit}
            bodyWeight={profile?.body_weight ?? null}
            bodyWeightUnit={(profile?.body_weight_unit || 'lbs') as 'kg' | 'lbs'}
            personalRecords={finishPersonalRecords}
            onConfirm={handleSave}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors.

Manual check: run `npm run dev`, log a workout with an exercise where you beat (or match, for the first time) your best recorded weight, tap Finish — the "New PRs" tile should show a non-zero count instead of always 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/log/FinishSheet.tsx src/pages/Log.tsx
git commit -m "Fix New PRs counter to use real personal-records data instead of dead isPR field"
```

---

## Task 6: Extract shared AI context builder into `src/lib/aiCoach.ts`

**Files:**
- Create: `src/lib/aiCoach.ts`
- Modify: `src/components/ai/AiChat.tsx`

**Why:** `AiChat.tsx` builds a rich, evidence-based system prompt (workout history, MEV volume ranges, progressive-overload trend, muscle recovery, optional nutrition/run/WHOOP/skincare sections). The new pill (Task 10) needs that exact same context for its own Gemini call — pulling it into a shared module avoids a second, weaker copy of this logic. This is a pure refactor: the extracted functions are moved verbatim, `AiChat.tsx`'s behavior does not change.

**Scope note vs. the design spec:** the spec also floated sharing the Gemini *request* function (`callGemini`). `AiChat.tsx`'s request logic is tightly interleaved with its own chat UI state (function-calling, retry-into-message-list) — extracting it cleanly would mean non-trivial surgery on a large, working, load-bearing component for limited benefit, since the pill's call is simpler (no tools, single turn). Task 10 instead writes a small, self-contained request function scoped to the pill, reusing the same retry/fallback *shape* by copying the pattern rather than sharing the code. Only the pure, stateless context-building functions are actually shared here.

- [ ] **Step 1: Read the exact block being moved**

The functions to move from `src/components/ai/AiChat.tsx` into the new file, in order, are (all currently sit between the `type WorkoutWithExercises` alias near the top and the `getSuggestions` function):
- `MEV` (const)
- `weeklyVolume`
- `progressionReport`
- `trainingStats`
- `parseSkincareStats`
- `buildSystemPrompt`
- `buildFoodSection`
- `buildRunSection`
- `buildWhoopSection`
- `buildSkincareSection`
- `calDaysSince` and `parseLocalDate` (helpers used by the above)
- `WorkoutWithExercises` type alias

- [ ] **Step 2: Create `src/lib/aiCoach.ts`**

```ts
import { format, differenceInCalendarDays } from 'date-fns';
import type { LocalWorkout, LocalExercise, LocalPersonalRecord } from './supabaseData';
import type { FoodScan } from '../features/food/types';
import type { SavedRun } from '../features/running/utils/storage';
import type { WhoopAllData } from '../features/whoop/services/whoopService';

export type WorkoutWithExercises = LocalWorkout & { exercises?: LocalExercise[] };

/* ── Parse "YYYY-MM-DD" as local calendar date (not UTC midnight) ────── */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight — never shifts timezone
}

export function calDaysSince(dateStr: string): number {
  return differenceInCalendarDays(new Date(), parseLocalDate(dateStr));
}

/* ── Weekly volume per muscle group (Israetel MEV reference) ────────── */
const MEV: Record<string, string> = {
  chest: '10-20', back: '10-25', shoulders: '12-20',
  legs: '12-20', quads: '12-20', hamstrings: '10-16',
  glutes: '12-18', biceps: '10-15', triceps: '10-15', abs: '10-16',
};

export function weeklyVolume(workouts: WorkoutWithExercises[]): string {
  const sets: Record<string, number> = {};
  for (const w of workouts) {
    if (calDaysSince(w.date) > 6) continue;
    for (const ex of (w.exercises || [])) {
      const mg = (ex.muscle_group || 'other').toLowerCase();
      sets[mg] = (sets[mg] || 0) + ex.sets;
    }
  }
  if (!Object.keys(sets).length) return '  No sets logged this week';
  return Object.entries(sets)
    .sort((a, b) => b[1] - a[1])
    .map(([mg, n]) => {
      const rec = MEV[mg];
      const cap = mg.charAt(0).toUpperCase() + mg.slice(1);
      return rec ? `  ${cap}: ${n} sets (rec ${rec}/wk)` : `  ${cap}: ${n} sets`;
    })
    .join('\n');
}

/* ── Progressive overload: compare last 14d vs 15–56d ──────────────── */
export function progressionReport(workouts: WorkoutWithExercises[], unit: string): string {
  const hist: Record<string, { recent: number[]; older: number[] }> = {};
  for (const w of workouts) {
    const age = calDaysSince(w.date);
    for (const ex of (w.exercises || [])) {
      if (ex.weight <= 0) continue;
      if (!hist[ex.name]) hist[ex.name] = { recent: [], older: [] };
      if (age <= 14) hist[ex.name].recent.push(ex.weight);
      else if (age <= 56) hist[ex.name].older.push(ex.weight);
    }
  }
  const lines: string[] = [];
  for (const [name, { recent, older }] of Object.entries(hist)) {
    if (!recent.length || !older.length) continue;
    const r = Math.max(...recent);
    const o = Math.max(...older);
    const diff = +(r - o).toFixed(1);
    if (diff > 0) lines.push(`  ↑ ${name}: ${o}→${r}${unit} (+${diff})`);
    else if (diff < 0) lines.push(`  ↓ ${name}: ${o}→${r}${unit} (${diff})`);
    else lines.push(`  ~ ${name}: plateau at ${r}${unit} (8+ weeks)`);
  }
  return lines.length ? lines.join('\n') : '  Insufficient data for trend analysis';
}

/* ── Training frequency & streak ────────────────────────────────────── */
export function trainingStats(workouts: WorkoutWithExercises[]): string {
  const dateSeen = new Set(workouts.map((w) => w.date));
  const last28 = workouts.filter((w) => calDaysSince(w.date) <= 28);
  const sessionsPerWeek = (new Set(last28.map((w) => w.date)).size / 4).toFixed(1);
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = format(new Date(new Date().setDate(new Date().getDate() - i)), 'yyyy-MM-dd');
    if (dateSeen.has(d)) streak++;
    else if (i > 0) break;
  }
  return `${sessionsPerWeek} sessions/week avg (last 28d) · Streak: ${streak} day${streak !== 1 ? 's' : ''}`;
}

/* ── Parse skincare adherence from localStorage ─────────────────── */
export function parseSkincareStats(): { weekPercent: number; streak: number } | null {
  try {
    const raw = localStorage.getItem('athlix_skincare_v1');
    if (!raw) return null;
    const state = JSON.parse(raw) as {
      weeks: Record<string, { days: Record<string, { subcats: Record<string, { products: Array<{ status: string }> }> }> }>;
    };
    if (!state?.weeks) return null;

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

/* ── Section builders for optional data sources ───────────────────── */
export function buildFoodSection(scans: FoodScan[]): string {
  if (!scans.length) return '';
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const recent = scans.filter((s) => new Date(s.scan_date) >= cutoff).slice(0, 14);
  if (!recent.length) return '';
  const lines = recent.map(
    (s) => `  ${s.scan_date} — ${s.food_name}: ${s.total_calories}cal | P:${s.total_protein}g C:${s.total_carbs}g F:${s.total_fat}g`,
  );
  return `\n\n━━ NUTRITION (last 7 days) ━━\n${lines.join('\n')}`;
}

export function buildRunSection(runs: SavedRun[]): string {
  if (!runs.length) return '';
  const recent = [...runs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
  const lines = recent.map((r) => {
    const date = new Date(r.timestamp).toISOString().slice(0, 10);
    const km = r.distance.toFixed(2);
    const totalSecs = Math.floor(r.duration / 1000);
    const dur = `${Math.floor(totalSecs / 60)}:${(totalSecs % 60).toString().padStart(2, '0')}`;
    const paceMin = Math.floor(r.pace);
    const paceSec = Math.round((r.pace % 1) * 60).toString().padStart(2, '0');
    return `  ${date} — ${km}km in ${dur} (${paceMin}:${paceSec}/km avg)`;
  });
  return `\n\n━━ RUNNING (last ${recent.length} runs) ━━\n${lines.join('\n')}`;
}

export function buildWhoopSection(data: WhoopAllData | null): string {
  if (!data?.recovery?.length) return '';
  const r = data.recovery[0];
  const s = data.sleep?.[0];
  const sleepH = s ? (s.total_in_bed_time_milli / 3_600_000).toFixed(1) : '?';
  const strain = data.cycles?.[0]?.strain_score?.toFixed(1) ?? '?';
  return `\n\n━━ WHOOP RECOVERY (latest: ${r.date}) ━━\n  Recovery: ${r.recovery_score}% | HRV: ${Math.round(r.hrv_rmssd_milli)}ms | RHR: ${r.resting_heart_rate}bpm | Sleep: ${sleepH}h | Strain: ${strain}`;
}

export function buildSkincareSection(stats: { weekPercent: number; streak: number } | null): string {
  if (!stats) return '';
  return `\n\n━━ SKINCARE ━━\n  This week: ${stats.weekPercent}% complete | Streak: ${stats.streak} day${stats.streak !== 1 ? 's' : ''}`;
}

/* ── System prompt builder ──────────────────────────────────────────── */
export function buildSystemPrompt(
  profile: any,
  workouts: WorkoutWithExercises[],
  prs: LocalPersonalRecord[],
  foodScans: FoodScan[],
  recentRuns: SavedRun[],
  whoopData: WhoopAllData | null,
  skincareStats: { weekPercent: number; streak: number } | null,
): string {
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');
  const name = profile?.full_name || 'Athlete';
  const bodyWeight = profile?.body_weight
    ? `${profile.body_weight} ${profile.body_weight_unit}`
    : 'not set';
  const height =
    profile?.height_feet != null
      ? `${profile.height_feet}'${profile.height_inches ?? 0}"`
      : 'not set';
  const unit = profile?.unit_preference || 'lbs';

  const detailedSection = workouts.slice(0, 7).map((w) => {
    const age = calDaysSince(w.date);
    const label = age === 0 ? 'Today' : age === 1 ? 'Yesterday' : `${age}d ago`;
    const header = `${w.date} (${label}) — ${w.title} · ${w.duration_minutes ?? '?'} min`;
    const exLines = (w.exercises || []).map(
      (ex) => `    · ${ex.name}: ${ex.sets}×${ex.reps}${ex.weight > 0 ? ` @ ${ex.weight}${ex.unit}` : ''}`,
    );
    return exLines.length ? `  ${header}\n${exLines.join('\n')}` : `  ${header}`;
  }).join('\n');

  const olderSection = workouts.slice(7, 20)
    .map((w) => `  ${w.date} — ${w.title}${w.muscle_groups?.length ? ` [${w.muscle_groups.join(', ')}]` : ''}`)
    .join('\n');

  const muscleAge: Record<string, number> = {};
  for (const w of workouts) {
    const age = calDaysSince(w.date);
    for (const mg of (w.muscle_groups || [])) {
      const k = mg.toLowerCase();
      if (muscleAge[k] === undefined || age < muscleAge[k]) muscleAge[k] = age;
    }
  }
  const recoverySection = Object.entries(muscleAge)
    .sort((a, b) => a[1] - b[1])
    .map(([mg, d]) => {
      const status = d === 0 ? '⛔ trained today' : d === 1 ? '⛔ 1d — rest' : d === 2 ? '⚠️ 2d — borderline' : '✅ recovered';
      return `  ${mg.charAt(0).toUpperCase() + mg.slice(1)}: ${d}d since last session — ${status}`;
    })
    .join('\n');

  const prSection = prs.slice(0, 30)
    .map((p) => `  ${p.exercise_name}: ${p.best_weight}${unit} × ${p.best_reps} reps (set ${p.achieved_date})`)
    .join('\n');

  return `You are an expert strength & conditioning coach embedded in the Athlix fitness app. Your role: give ${name} evidence-based, data-driven advice using ONLY their logged data below. Never fabricate numbers.

TODAY: ${today}
ATHLETE: ${name} | BW: ${bodyWeight} | Height: ${height} | Unit: ${unit}
TRAINING PATTERN: ${workouts.length ? trainingStats(workouts) : 'no data'}

━━ RECENT SESSIONS (full detail) ━━
${detailedSection || '  No workouts logged yet'}
${olderSection ? `\n━━ OLDER SESSIONS ━━\n${olderSection}` : ''}

━━ MUSCLE RECOVERY STATUS ━━
${recoverySection || '  No muscle data — cannot assess recovery'}

━━ WEEKLY VOLUME (this week) ━━
${weeklyVolume(workouts)}

━━ STRENGTH TRENDS (last 2 vs prior 6 weeks) ━━
${progressionReport(workouts, unit)}

━━ PERSONAL RECORDS ━━
${prSection || '  No records yet'}

RESPONSE FORMAT (non-negotiable):
• Open with the direct answer in ≤2 sentences — no preamble, no "Based on your data", no "You should"
• Use **bold** for exercise names and key numbers only
• Workout plans: one line per exercise → "· Exercise: Xs × Y–Z reps @ W${unit}"
• No closing summaries, no motivational sign-offs
• Total response: aim for ≤180 words. If a list is needed, use bullet lines.

COACHING RULES:
1. ⛔ muscle groups must NOT appear in today's plan — check RECOVERY STATUS
2. Plateau on an exercise → suggest rep scheme change or drop set, not just "keep going"
3. Weekly sets below MEV range → flag it, suggest extra sets
4. PR opportunity → call it out explicitly with the weight to hit
5. For nutrition/science questions use Google Search for current evidence

${buildFoodSection(foodScans)}${buildRunSection(recentRuns)}${buildWhoopSection(whoopData)}${buildSkincareSection(skincareStats)}`;
}
```

- [ ] **Step 3: Update `AiChat.tsx` to import from the new module instead of defining locally**

Add the import near the top, right after the WHOOP import:
```ts
import { whoopService } from '../../features/whoop/services/whoopService';
import type { WhoopAllData } from '../../features/whoop/services/whoopService';
```
becomes:
```ts
import { whoopService } from '../../features/whoop/services/whoopService';
import type { WhoopAllData } from '../../features/whoop/services/whoopService';
import {
  type WorkoutWithExercises,
  buildSystemPrompt,
  calDaysSince,
} from '../../lib/aiCoach';
```

Delete the now-duplicated local definitions from `AiChat.tsx`: the `type WorkoutWithExercises = ...` alias, and the entire block from `const MEV: Record<string, string> = {` through the end of `buildSkincareSection` (i.e. everything moved in Step 2 — `MEV`, `weeklyVolume`, `progressionReport`, `trainingStats`, `parseSkincareStats`, `buildSystemPrompt`, `buildFoodSection`, `buildRunSection`, `buildWhoopSection`, `buildSkincareSection`, `parseLocalDate`, and the standalone `calDaysSince` definition — but keep every *call site* of these functions unchanged, e.g. `buildSystemPrompt(profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats)` inside `send()` stays exactly as-is, it now just resolves to the imported version).

Only `calDaysSince` is still called directly elsewhere in `AiChat.tsx` (inside `getSuggestions` and possibly other spots) — that's covered by importing it explicitly above. `parseLocalDate` is not called directly anywhere outside the moved block, so it does not need importing, only `calDaysSince` and `buildSystemPrompt` and the `WorkoutWithExercises` type are referenced elsewhere in the file.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors. If TypeScript flags an unused import or a missing reference, that means either too much or too little was deleted from `AiChat.tsx` in Step 3 — reconcile against exactly what Step 2 moved.

```bash
npm run build
```
Expected: succeeds (confirms no runtime-only breakage either).

Manual check: run `npm run dev`, open the AI Coach chat (existing behavior), send a message — response quality/content should be identical to before this refactor (same system prompt, byte-for-byte).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiCoach.ts src/components/ai/AiChat.tsx
git commit -m "Extract AI system-prompt builder into shared src/lib/aiCoach.ts"
```

---

## Task 7: Goals UI on the Progress page

**Files:**
- Create: `src/components/progress/GoalsSection.tsx`
- Modify: `src/pages/Progress.tsx`

- [ ] **Step 1: Create `GoalsSection.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Trophy, X } from 'lucide-react';
import { getGoals, addGoal, deleteGoal, getPersonalRecords, type LocalExerciseGoal, type LocalPersonalRecord } from '../../lib/supabaseData';
import toast from 'react-hot-toast';

interface GoalsSectionProps {
  userId: string;
  weightUnit: 'kg' | 'lbs';
}

export const GoalsSection: React.FC<GoalsSectionProps> = ({ userId, weightUnit }) => {
  const [goals, setGoals] = useState<LocalExerciseGoal[]>([]);
  const [records, setRecords] = useState<LocalPersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([getGoals(userId), getPersonalRecords(userId)])
      .then(([g, r]) => { setGoals(g); setRecords(r); })
      .catch(() => toast.error('Failed to load goals'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async () => {
    const trimmedName = name.trim();
    const targetWeight = Number(weight);
    const targetReps = Number(reps);
    if (!trimmedName || !(targetWeight > 0) || !(targetReps > 0)) {
      toast.error('Fill in exercise, weight, and reps.');
      return;
    }
    setSaving(true);
    try {
      await addGoal(userId, { exerciseName: trimmedName, targetWeight, targetReps, unit: weightUnit });
      setName(''); setWeight(''); setReps(''); setShowAdd(false);
      load();
      toast.success('Goal added');
    } catch {
      toast.error('Failed to add goal');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (goalId: string) => {
    try {
      await deleteGoal(userId, goalId);
      setGoals((prev) => prev.filter((g) => g.id !== goalId));
    } catch {
      toast.error('Failed to remove goal');
    }
  };

  if (loading) {
    return <div className="p-4 space-y-2">{[1, 2].map((i) => <div key={i} className="h-20 rounded-xl animate-pulse bg-white/5" />)}</div>;
  }

  const active = goals.filter((g) => g.status === 'active');
  const achieved = goals.filter((g) => g.status === 'achieved');

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Strength Goals</h3>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 h-8 px-3 rounded-lg text-[11px] font-bold cursor-pointer"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          {showAdd ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showAdd ? 'Cancel' : 'Add Goal'}
        </button>
      </div>

      {showAdd && (
        <div className="p-4 rounded-2xl space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <input
            type="text"
            placeholder="Exercise name (e.g. Bench Press)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-10 rounded-lg px-3 text-[13px]"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder={`Target weight (${weightUnit})`}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-10 rounded-lg px-3 text-[13px]"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <input
              type="number"
              placeholder="Target reps"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="h-10 rounded-lg px-3 text-[13px]"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleAdd}
            className="w-full h-10 rounded-lg text-[13px] font-bold disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--accent)', color: '#000' }}
          >
            {saving ? 'Saving…' : 'Save Goal'}
          </button>
        </div>
      )}

      {active.length === 0 && !showAdd && (
        <div className="p-6 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
          No active goals yet. Set a strength target on any exercise to track progress toward it.
        </div>
      )}

      {active.map((goal) => {
        const pr = records.find((r) => r.exercise_name.toLowerCase() === goal.exercise_name.toLowerCase());
        const currentWeight = pr?.best_weight ?? 0;
        const progressPct = Math.min(100, Math.round((currentWeight / goal.target_weight) * 100));
        return (
          <div key={goal.id} className="p-4 rounded-2xl" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{goal.exercise_name}</span>
              <button type="button" onClick={() => handleDelete(goal.id)} className="text-[var(--text-muted)] cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: 'var(--bg-elevated)' }}>
              <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: 'var(--accent)' }} />
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              {currentWeight}{goal.unit} → {goal.target_weight}{goal.unit} × {goal.target_reps} · {progressPct}%
            </div>
          </div>
        );
      })}

      {achieved.length > 0 && (
        <div className="pt-2">
          <h4 className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Achieved</h4>
          {achieved.map((goal) => (
            <div key={goal.id} className="flex items-center gap-2 p-3 rounded-xl mb-2" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <Trophy className="w-4 h-4" style={{ color: 'var(--pr-gold)' }} />
              <span className="text-[12px] font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>
                {goal.exercise_name} — {goal.target_weight}{goal.unit} × {goal.target_reps}
              </span>
              <button type="button" onClick={() => handleDelete(goal.id)} className="text-[var(--text-muted)] cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Wire it into `Progress.tsx` as a new tab**

Add `Trophy` to the existing Lucide import line — change:
```ts
import { Target, TrendingUp, Activity, Scale, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, CalendarDays, Pencil, Heart, Bluetooth, PlugZap, Unplug, Info, Flame, X, Camera, Utensils, History } from 'lucide-react';
```
to:
```ts
import { Target, TrendingUp, Activity, Scale, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, CalendarDays, Pencil, Heart, Bluetooth, PlugZap, Unplug, Info, Flame, X, Camera, Utensils, History, Trophy } from 'lucide-react';
```

Add the import for the new component near the other component imports (search for an existing `import { DopamineTracker }`-style line in this file and add alongside it):
```ts
import { GoalsSection } from '../components/progress/GoalsSection';
```

Change the tab type union — find:
```ts
  const [activeTab, setActiveTab] = useState<'overview' | 'food' | 'dopamine' | 'weight' | 'livehr'>('livehr');
```
to:
```ts
  const [activeTab, setActiveTab] = useState<'overview' | 'food' | 'dopamine' | 'goals' | 'weight' | 'livehr'>('livehr');
```

Add the tab entry — find:
```ts
  const TABS = [
    { id: 'overview',  label: 'Overview',   Icon: Activity  },
    { id: 'food',      label: 'Nutrition',  Icon: Utensils  },
    { id: 'dopamine',  label: 'Dopamine',   Icon: Target    },
    { id: 'weight',    label: 'Weight',     Icon: Scale     },
  ] as const;
```
to:
```ts
  const TABS = [
    { id: 'overview',  label: 'Overview',   Icon: Activity  },
    { id: 'food',      label: 'Nutrition',  Icon: Utensils  },
    { id: 'dopamine',  label: 'Dopamine',   Icon: Target    },
    { id: 'goals',     label: 'Goals',      Icon: Trophy    },
    { id: 'weight',    label: 'Weight',     Icon: Scale     },
  ] as const;
```

Add the tab content — find:
```ts
          {activeTab === 'dopamine' && <DopamineTracker />}
```
and add right after it:
```ts
          {activeTab === 'dopamine' && <DopamineTracker />}
          {activeTab === 'goals' && user && <GoalsSection userId={user.id} weightUnit={displayUnit as 'kg' | 'lbs'} />}
```

`Progress.tsx` already defines `const displayUnit = profile?.unit_preference || 'lbs';` near the top of the component (used throughout the file for unit conversions) — reuse it directly, no new state needed.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors.

Manual check: `npm run dev`, open Progress page, tap the new "Goals" tab, add a goal, confirm it appears with a 0%-ish progress bar (or real progress if you already have a PR on that exercise), delete it, confirm it disappears.

- [ ] **Step 4: Commit**

```bash
git add src/components/progress/GoalsSection.tsx src/pages/Progress.tsx
git commit -m "Add Goals tab to Progress page for per-exercise strength targets"
```

---

## Task 8: Goal-achievement detection + comparison + PR data wired into `handleSave`

**Files:**
- Modify: `src/pages/Log.tsx`

- [ ] **Step 1: Fetch goals and prior workouts alongside PRs when the Finish sheet opens**

Extend the imports added in Task 5 — change:
```ts
import { getPersonalRecords, type LocalPersonalRecord } from '../lib/supabaseData';
```
to:
```ts
import {
  getPersonalRecords,
  getGoals,
  updateGoal,
  getWorkouts,
  findLastSimilarWorkout,
  type LocalPersonalRecord,
  type LocalExerciseGoal,
} from '../lib/supabaseData';
```
(again, merge into whatever existing `from '../lib/supabaseData'` import block already exists in this file rather than creating a duplicate import line.)

Add new state next to `finishPersonalRecords` (from Task 5):
```ts
  const [finishPersonalRecords, setFinishPersonalRecords] = useState<LocalPersonalRecord[]>([]);
  const [finishGoals, setFinishGoals] = useState<LocalExerciseGoal[]>([]);
  const [finishPriorWorkouts, setFinishPriorWorkouts] = useState<Awaited<ReturnType<typeof getWorkouts>>>([]);
```

Update `handleFinish` to fetch all three in parallel — change:
```ts
  const handleFinish = () => {
    setShowFinish(true);
    if (user) {
      getPersonalRecords(user.id).then(setFinishPersonalRecords).catch(() => setFinishPersonalRecords([]));
    }
  };
```
to:
```ts
  const handleFinish = () => {
    setShowFinish(true);
    if (user) {
      getPersonalRecords(user.id).then(setFinishPersonalRecords).catch(() => setFinishPersonalRecords([]));
      getGoals(user.id).then((g) => setFinishGoals(g.filter((goal) => goal.status === 'active'))).catch(() => setFinishGoals([]));
      getWorkouts(user.id, { limit: 20, includeExercises: true }).then(setFinishPriorWorkouts).catch(() => setFinishPriorWorkouts([]));
    }
  };
```

- [ ] **Step 2: Compute PR delta, goal updates, and comparison, then dispatch the event**

In `handleSave`, right after the `await saveWorkout(...)` call succeeds and before `clearDraft();`, insert:

```ts
      // ── Post-save insight payload for the AI coach pill ──────────────────
      const finishedStats = {
        durationMinutes: Math.max(1, Math.round(finalElapsedSeconds / 60)),
        totalVolume: completedExercises.reduce((sum, { exercise, completedSets }) => {
          const inputType = resolveEffectiveInputType(exercise.name, typeOverrides);
          if (inputType !== 'weight_reps') return sum;
          return sum + completedSets.reduce((v, s) => v + Number(s.weight || 0) * Number(s.reps || 0), 0);
        }, 0),
        totalSets: completedExercises.reduce((sum, { completedSets }) => sum + completedSets.length, 0),
        unit: weightUnit,
        exerciseNames: completedExercises.map(({ exercise }) => exercise.name),
      };

      const prByName = new Map(finishPersonalRecords.map((pr) => [pr.exercise_name.toLowerCase(), pr]));
      let realPrCount = 0;
      for (const { exercise, completedSets } of completedExercises) {
        const inputType = resolveEffectiveInputType(exercise.name, typeOverrides);
        if (inputType !== 'weight_reps') continue;
        const bestWeight = Math.max(0, ...completedSets.map((s) => Number(s.weight || 0)));
        if (bestWeight <= 0) continue;
        const existing = prByName.get(exercise.name.toLowerCase());
        if (!existing || bestWeight > existing.best_weight) realPrCount++;
      }

      const goalUpdates: Array<{
        exerciseName: string;
        achieved: boolean;
        targetWeight: number;
        targetReps: number;
        unit: string;
        currentBestWeight: number;
        currentBestReps: number;
      }> = [];
      for (const goal of finishGoals) {
        const match = completedExercises.find(
          ({ exercise }) => exercise.name.toLowerCase() === goal.exercise_name.toLowerCase(),
        );
        if (!match) continue;
        const bestSet = match.completedSets.reduce(
          (best, s) => (Number(s.weight || 0) > best.weight ? { weight: Number(s.weight || 0), reps: Number(s.reps || 0) } : best),
          { weight: 0, reps: 0 },
        );
        const justAchieved = bestSet.weight >= goal.target_weight && bestSet.reps >= goal.target_reps;
        if (justAchieved) {
          await updateGoal(user.id, goal.id, { status: 'achieved', achieved_at: new Date().toISOString() });
        }
        goalUpdates.push({
          exerciseName: goal.exercise_name,
          achieved: justAchieved,
          targetWeight: goal.target_weight,
          targetReps: goal.target_reps,
          unit: goal.unit,
          currentBestWeight: bestSet.weight,
          currentBestReps: bestSet.reps,
        });
      }

      const muscleGroups = [...new Set(completedExercises.map(({ exercise }) => exercise.muscleGroup).filter(Boolean))];
      const comparison = findLastSimilarWorkout(
        { title, muscleGroups, totalVolume: finishedStats.totalVolume, totalSets: finishedStats.totalSets, durationMinutes: finishedStats.durationMinutes },
        finishPriorWorkouts,
      );

      window.dispatchEvent(new CustomEvent('athlix:workout-finished', {
        detail: { stats: finishedStats, realPrCount, goalUpdates, comparison },
      }));
```

This block goes **after** `await saveWorkout(...)` resolves successfully (so a failed save never marks a goal achieved or fires a stale insight) and **before** `clearDraft();` — it does not delay the UI, since `navigate('/', ...)` still runs immediately after via the existing code below it; the event is fire-and-forget and the pill (Task 10) does its own async work independently.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors.

Manual check: with the browser console open, log and finish a workout — confirm no runtime errors, and (temporarily) add `console.log` inside a throwaway `window.addEventListener('athlix:workout-finished', console.log)` in the browser devtools console *before* saving, to confirm the event fires with a sensible payload. Remove the temporary listener afterward — Task 10 replaces this with the real listener.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Log.tsx
git commit -m "Compute PR/goal/comparison insight payload and dispatch workout-finished event"
```

---

## Task 9: `PostWorkoutCoachPill` component

**Files:**
- Create: `src/components/ai/PostWorkoutCoachPill.tsx`

This is the floating pill: analyzing → teaser → drawer, per the design spec's WHOOP-style reference.

- [ ] **Step 1: Create the component**

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getWorkouts, getPersonalRecords } from '../../lib/supabaseData';
import type { FoodScan } from '../../features/food/types';
import { getRuns } from '../../features/running/utils/storage';
import { whoopService } from '../../features/whoop/services/whoopService';
import { buildSystemPrompt, parseSkincareStats, type WorkoutWithExercises } from '../../lib/aiCoach';
import type { WorkoutComparison } from '../../lib/supabaseData';

const GEMINI_KEY_STORAGE = 'athlix:gemini_api_key';
const GEMINI_MODEL_STORAGE = 'athlix:gemini_model';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';
const TEASER_AUTO_DISMISS_MS = 20_000;
const ANALYZING_TIMEOUT_MS = 10_000;

interface FinishedStats {
  durationMinutes: number;
  totalVolume: number;
  totalSets: number;
  unit: 'kg' | 'lbs';
  exerciseNames: string[];
}

interface GoalUpdate {
  exerciseName: string;
  achieved: boolean;
  targetWeight: number;
  targetReps: number;
  unit: string;
  currentBestWeight: number;
  currentBestReps: number;
}

interface WorkoutFinishedDetail {
  stats: FinishedStats;
  realPrCount: number;
  goalUpdates: GoalUpdate[];
  comparison: WorkoutComparison | null;
}

type PillState = 'idle' | 'analyzing' | 'teaser' | 'drawer' | 'no-key';

function buildInsightPrompt(detail: WorkoutFinishedDetail): string {
  const { stats, realPrCount, goalUpdates, comparison } = detail;
  const parts: string[] = [
    `I just finished this workout: ${stats.exerciseNames.join(', ')}. Duration: ${stats.durationMinutes} min, total volume: ${stats.totalVolume}${stats.unit}, total sets: ${stats.totalSets}.`,
  ];
  if (realPrCount > 0) parts.push(`I hit ${realPrCount} new personal record${realPrCount !== 1 ? 's' : ''} this session.`);
  if (comparison) {
    const dir = comparison.volumeDelta >= 0 ? 'up' : 'down';
    parts.push(
      `Compared to my last similar session (${comparison.previousTitle} on ${comparison.previousDate}): volume is ${dir} ${Math.abs(Math.round(comparison.volumeDelta))}${stats.unit}, sets delta ${comparison.setsDelta}, duration delta ${comparison.durationDeltaMinutes} min.`,
    );
  } else {
    parts.push('This is the first time I\'ve logged this particular workout, so there\'s no direct comparison.');
  }
  const achievedGoals = goalUpdates.filter((g) => g.achieved);
  const inProgressGoals = goalUpdates.filter((g) => !g.achieved);
  if (achievedGoals.length) {
    parts.push(`I just hit my goal on: ${achievedGoals.map((g) => `${g.exerciseName} (${g.targetWeight}${g.unit} x ${g.targetReps})`).join(', ')}.`);
  }
  if (inProgressGoals.length) {
    parts.push(
      `Still working toward: ${inProgressGoals.map((g) => `${g.exerciseName} — best today ${g.currentBestWeight}${g.unit} x ${g.currentBestReps}, target ${g.targetWeight}${g.unit} x ${g.targetReps}`).join('; ')}.`,
    );
  }
  parts.push('Give me a short, encouraging take (2-3 sentences) and one concrete, evidence-based suggestion for today or tomorrow — factor in my recovery status and recent training load if that data is available to you. Address me by first name.');
  return parts.join(' ');
}

export const PostWorkoutCoachPill: React.FC = () => {
  const { user, profile } = useAuth();
  const [state, setState] = useState<PillState>('idle');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [drawerInput, setDrawerInput] = useState('');
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const runInsight = useCallback(async (detail: WorkoutFinishedDetail) => {
    if (!user?.id) return;
    setState('analyzing');
    setFeedback(null);

    const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
    if (!apiKey) {
      setState('no-key');
      return;
    }

    const model = localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_MODEL;
    const timeoutId = setTimeout(() => setState((s) => (s === 'analyzing' ? 'idle' : s)), ANALYZING_TIMEOUT_MS);

    try {
      const [workoutsRes, prsRes, whoopRes] = await Promise.allSettled([
        getWorkouts(user.id, { limit: 20, includeExercises: true }),
        getPersonalRecords(user.id),
        whoopService.fetchAll('day').catch(() => null),
      ]);
      const workouts = (workoutsRes.status === 'fulfilled' ? workoutsRes.value : []) as WorkoutWithExercises[];
      const prs = prsRes.status === 'fulfilled' ? prsRes.value : [];
      const whoopData = whoopRes.status === 'fulfilled' ? whoopRes.value : null;

      const systemPrompt = buildSystemPrompt(profile, workouts, prs, [] as FoodScan[], getRuns(), whoopData as any, parseSkincareStats());
      const userTurn = buildInsightPrompt(detail);

      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 400,
          ...(/^gemini-2\.5/.test(model) && { thinkingConfig: { thinkingBudget: 512 } }),
        },
      };

      let res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        res = await fetch(`${GEMINI_BASE}/${FALLBACK_MODEL}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, generationConfig: { temperature: 0.8, maxOutputTokens: 400 } }),
        });
      }
      if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);

      const data = await res.json();
      const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text).join('').trim();
      if (!text) throw new Error('Empty response');

      clearTimeout(timeoutId);
      setMessage(text);
      setState('teaser');

      clearDismissTimer();
      dismissTimerRef.current = setTimeout(() => setState((s) => (s === 'teaser' ? 'idle' : s)), TEASER_AUTO_DISMISS_MS);
    } catch {
      clearTimeout(timeoutId);
      setState('idle');
    }
  }, [user?.id, profile, clearDismissTimer]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WorkoutFinishedDetail>).detail;
      if (detail) runInsight(detail);
    };
    window.addEventListener('athlix:workout-finished', handler);
    return () => window.removeEventListener('athlix:workout-finished', handler);
  }, [runInsight]);

  useEffect(() => () => clearDismissTimer(), [clearDismissTimer]);

  const openDrawer = () => {
    clearDismissTimer();
    setState('drawer');
  };

  const handOffToChat = (seedText: string) => {
    setState('idle');
    window.dispatchEvent(new CustomEvent('athlix:open-ai', {
      detail: { seedMessages: [{ role: 'model', text: message }, ...(seedText ? [{ role: 'user', text: seedText }] : [])] },
    }));
  };

  if (state === 'idle') return null;

  const firstName = (profile?.full_name || 'there').split(' ')[0];

  return (
    <div className="fixed z-[110]" style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 88px)' }}>
      <AnimatePresence mode="wait">
        {state === 'analyzing' && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2 h-11 pl-3 pr-4 rounded-full shadow-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="flex items-center justify-center w-6 h-6 rounded-full"
              style={{ background: 'var(--accent)' }}
            >
              <Sparkles className="w-3.5 h-3.5 text-black" />
            </motion.span>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Analyzing…</span>
          </motion.div>
        )}

        {state === 'teaser' && (
          <motion.button
            key="teaser"
            type="button"
            onClick={openDrawer}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-2 max-w-[280px] h-11 pl-3 pr-4 rounded-full shadow-lg text-left cursor-pointer"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full shrink-0" style={{ background: 'var(--accent)' }}>
              <Sparkles className="w-3.5 h-3.5 text-black" />
            </span>
            <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {firstName} · {message.slice(0, 60)}…
            </span>
          </motion.button>
        )}

        {state === 'no-key' && (
          <motion.button
            key="no-key"
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('athlix:open-ai'))}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-2 h-11 pl-3 pr-4 rounded-full shadow-lg cursor-pointer"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Set up AI Coach for workout insights</span>
          </motion.button>
        )}

        {state === 'drawer' && (
          <motion.div
            key="drawer"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="w-[320px] max-w-[calc(100vw-32px)] rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>AI Coach</span>
              </div>
              <button type="button" onClick={() => setState('idle')} className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {message}
            </div>
            <div className="flex items-center gap-2 px-4 pb-2">
              <button type="button" onClick={() => setFeedback('up')} className="cursor-pointer" style={{ color: feedback === 'up' ? 'var(--accent)' : 'var(--text-muted)' }}>
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setFeedback('down')} className="cursor-pointer" style={{ color: feedback === 'down' ? '#f87171' : 'var(--text-muted)' }}>
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 p-3" style={{ borderTop: '1px solid var(--border)' }}>
              <input
                type="text"
                value={drawerInput}
                onChange={(e) => setDrawerInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && drawerInput.trim()) handOffToChat(drawerInput.trim()); }}
                placeholder="Ask AI anything…"
                className="flex-1 h-9 rounded-lg px-3 text-[12px] focus:outline-none"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                onClick={() => handOffToChat(drawerInput.trim())}
                className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 cursor-pointer"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```
Expected: no errors. (The pill intentionally passes `[] as FoodScan[]` for the nutrition-data parameter of `buildSystemPrompt` — food/run data isn't essential for a workout-focused insight, per the design's "keep the pill's own fetch lighter than full AiChat" decision — the `FoodScan` type import above is only needed for that cast.)

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/PostWorkoutCoachPill.tsx
git commit -m "Add WHOOP-style post-workout AI coach pill component"
```

---

## Task 10: Mount the pill + AiChat hand-off support

**Files:**
- Modify: `src/components/layout/Layout.tsx`
- Modify: `src/components/ai/AiChat.tsx`

- [ ] **Step 1: Mount `PostWorkoutCoachPill` in `Layout.tsx`**

Change:
```ts
import { AiChat } from '../ai/AiChat';
```
to:
```ts
import { AiChat } from '../ai/AiChat';
import { PostWorkoutCoachPill } from '../ai/PostWorkoutCoachPill';
```

Change:
```tsx
      {!isImmersiveRoute && <AiChat />}
```
to:
```tsx
      {!isImmersiveRoute && <AiChat />}
      {!isImmersiveRoute && <PostWorkoutCoachPill />}
```

- [ ] **Step 2: Support seeded opening messages in `AiChat.tsx`**

Find the existing `athlix:open-ai` listener:
```ts
  useEffect(() => {
    const handler = () => openChat();
    window.addEventListener('athlix:open-ai', handler);
    return () => window.removeEventListener('athlix:open-ai', handler);
  }, []);
```
Replace with:
```ts
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ seedMessages?: Message[] }>).detail;
      openChat();
      if (detail?.seedMessages?.length) {
        setMessages((prev) => (prev.length ? prev : detail.seedMessages!));
      }
    };
    window.addEventListener('athlix:open-ai', handler);
    return () => window.removeEventListener('athlix:open-ai', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
```

This only seeds messages into an *empty* conversation (`prev.length ? prev : ...`) so it never clobbers an existing chat the user was already having — opening from the pill either starts a fresh seeded conversation or, if a conversation is already open, just focuses it as before.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
npm run build
```
Expected: both succeed.

Manual check (end-to-end): `npm run dev`, ensure a Gemini key is configured, log and finish a workout. Confirm: the pill appears bottom-right showing "Analyzing…", then morphs into a one-line teaser addressed by first name, tapping it opens the drawer with the full message, typing something in the drawer input and pressing Enter closes the pill and opens the full `AiChat` panel with the insight as the first message and your typed text as the second.

Also test the no-key path: clear `localStorage.removeItem('athlix:gemini_api_key')` in devtools, finish another workout — pill should go straight to the "Set up AI Coach" state instead of "Analyzing…", and tapping it should open the existing key-setup modal (via `openChat()`'s existing `!key` branch).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Layout.tsx src/components/ai/AiChat.tsx
git commit -m "Mount post-workout AI coach pill and support seeded chat hand-off"
```

---

## Task 11: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors anywhere in the project.

- [ ] **Step 2: Lint**

```bash
npm run lint
```
Expected: no errors/warnings.

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: succeeds (both the Vite legacy build and the Next.js build).

- [ ] **Step 4: Full manual walkthrough**

Using the dev server (`npm run dev`):
1. Progress → Goals tab: add a goal on an exercise you haven't logged before (e.g. "Overhead Press", 40kg × 5). Confirm it shows 0% progress (no PR yet).
2. Log a workout including that exact exercise, logging a set that meets or beats 40kg × 5. Finish the workout.
3. Confirm `FinishSheet`'s "New PRs" tile shows a real, non-zero count if this beats your stored PR.
4. Confirm the pill appears after saving, analyzes, and its message mentions the goal being met (check Progress → Goals tab afterward — the goal should have moved to the "Achieved" section).
5. Log the *same* workout title again on a different day (or immediately after, if your test data allows) and confirm the pill's message references a comparison to the previous session (not "first time").
6. Tap the pill's teaser to open the drawer, verify thumbs up/down are togglable, type a message and confirm it hands off cleanly into the full `AiChat` panel.

- [ ] **Step 5: Final commit (if any verification step required fixes)**

```bash
git add -A
git commit -m "Fix issues found during full verification pass"
```
(Skip this step entirely if nothing needed fixing.)

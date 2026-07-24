# Progress Page: Exercise History + Monthly Volume Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Progress.tsx's Monthly Volume month-picker (broken for anything older than 30 days) and add a per-exercise search + history view to the Overview tab, showing last session's actual sets, all-time PR, a growth chart with PR marker and trend badge, and training frequency.

**Architecture:** The bug fix rewrites Monthly Volume's data derivation to read from the app's already-unbounded `exercises` state instead of the 30-day-capped `workouts` state. The new feature is two small, focused components under `src/components/progress/` (matching the existing `GoalsSection.tsx`/`DopamineTracker.tsx` pattern) — a search card and a detail sheet — wired into Progress.tsx's Overview tab with minimal changes to that already-large file.

**Tech Stack:** React 18, TypeScript, `recharts` (already installed and used elsewhere in this exact file), the app's existing `fuzzySearch.ts` utility, Supabase.

**Note on testing:** This repo has no automated test runner (`package.json`'s `"test"` script is a no-op placeholder). Verification for every task is `npx tsc -p src/tsconfig.json --noEmit` (must stay at the known pre-existing baseline — run `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l` and confirm `23`, which is 10 unrelated pre-existing errors in `ExerciseBlock.tsx`, `WeightRepsPicker.tsx`, `aiCoach.ts`, `supabaseData.ts`, `main.tsx`, `Home.tsx`, `Timeline.tsx`) plus `npm run build`, plus manual QA where noted.

---

### Task 1: Attach each workout's `muscle_groups` to its exercise rows

**Files:**
- Modify: `src/lib/supabaseData.ts:2169-2207` (`getExerciseRowsWithWorkoutDates`)
- Modify: `src/lib/localData.ts:1194-1211` (local mirror, same function)

This is a prerequisite for Task 2 — Monthly Volume's muscle-group-fallback logic currently reads `w.muscle_groups` from the (about-to-be-abandoned) `workouts` array; this task makes that same data available directly on each exercise row instead, with zero extra network calls (one extra selected column).

- [ ] **Step 1: Update the cloud path**

In `src/lib/supabaseData.ts`, find this exact block (lines 2169-2207):

```ts
export const getExerciseRowsWithWorkoutDates = async (userId: string) => {
  if (!hasSupabaseConfig) return localData.getExerciseRowsWithWorkoutDates(userId);

  const { data: workouts, error: workoutsError } = await supabase
    .from('workouts')
    .select('id,date')
    .eq('user_id', userId);

  if (workoutsError) throw normalizeError(workoutsError, 'Failed to load workouts.');
  if (!workouts?.length) return [];

  const workoutMap = new Map<string, string>();
  workouts.forEach((workout: any) => {
    workoutMap.set(workout.id, workout.date);
  });

  const workoutIds = workouts.map((workout: any) => workout.id);
  const exercises: Array<LocalExercise & { workouts: { date: string } }> = [];

  for (const batch of chunk(workoutIds, 400)) {
    const { data: exerciseBatch, error: exercisesError } = await supabase
      .from('exercises')
      .select('*')
      .in('workout_id', batch);

    if (exercisesError) throw normalizeError(exercisesError, 'Failed to load exercises.');

    (exerciseBatch || []).forEach((exercise: any) => {
      const workoutDate = workoutMap.get(exercise.workout_id);
      if (!workoutDate) return;
      exercises.push({
        ...exercise,
        workouts: { date: workoutDate },
      });
    });
  }

  return exercises.sort((a, b) => a.workouts.date.localeCompare(b.workouts.date));
};
```

Replace with:

```ts
export const getExerciseRowsWithWorkoutDates = async (userId: string) => {
  if (!hasSupabaseConfig) return localData.getExerciseRowsWithWorkoutDates(userId);

  const { data: workouts, error: workoutsError } = await supabase
    .from('workouts')
    .select('id,date,muscle_groups')
    .eq('user_id', userId);

  if (workoutsError) throw normalizeError(workoutsError, 'Failed to load workouts.');
  if (!workouts?.length) return [];

  const workoutMap = new Map<string, { date: string; muscleGroups: string[] | null }>();
  workouts.forEach((workout: any) => {
    workoutMap.set(workout.id, { date: workout.date, muscleGroups: workout.muscle_groups ?? null });
  });

  const workoutIds = workouts.map((workout: any) => workout.id);
  const exercises: Array<LocalExercise & { workouts: { date: string }; workout_muscle_groups: string[] | null }> = [];

  for (const batch of chunk(workoutIds, 400)) {
    const { data: exerciseBatch, error: exercisesError } = await supabase
      .from('exercises')
      .select('*')
      .in('workout_id', batch);

    if (exercisesError) throw normalizeError(exercisesError, 'Failed to load exercises.');

    (exerciseBatch || []).forEach((exercise: any) => {
      const info = workoutMap.get(exercise.workout_id);
      if (!info) return;
      exercises.push({
        ...exercise,
        workouts: { date: info.date },
        workout_muscle_groups: info.muscleGroups,
      });
    });
  }

  return exercises.sort((a, b) => a.workouts.date.localeCompare(b.workouts.date));
};
```

- [ ] **Step 2: Update the local mirror**

In `src/lib/localData.ts`, find this exact block (lines 1194-1211):

```ts
export const getExerciseRowsWithWorkoutDates = async (userId: string) => {
  const db = readDb();
  return db.exercises
    .map((exercise) => {
      const workout = db.workouts.find((item) => item.id === exercise.workout_id);
      return workout && workout.user_id === userId
        ? {
            ...exercise,
            workouts: { date: workout.date },
            workout_id: workout.id,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.workouts.date.localeCompare(b!.workouts.date)) as Array<
    LocalExercise & { workouts: { date: string } }
  >;
};
```

Replace with:

```ts
export const getExerciseRowsWithWorkoutDates = async (userId: string) => {
  const db = readDb();
  return db.exercises
    .map((exercise) => {
      const workout = db.workouts.find((item) => item.id === exercise.workout_id);
      return workout && workout.user_id === userId
        ? {
            ...exercise,
            workouts: { date: workout.date },
            workout_muscle_groups: (workout as any).muscle_groups ?? null,
            workout_id: workout.id,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.workouts.date.localeCompare(b!.workouts.date)) as Array<
    LocalExercise & { workouts: { date: string }; workout_muscle_groups: string[] | null }
  >;
};
```

- [ ] **Step 3: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: `23` (unchanged baseline).

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabaseData.ts src/lib/localData.ts
git commit -m "Attach each workout's muscle_groups to its exercise rows"
```

---

### Task 2: Fix Monthly Volume to use full history, not the 30-day-capped workouts list

**Files:**
- Modify: `src/pages/Progress.tsx:785-856` (the Monthly Volume computation block)
- Modify: `src/pages/Progress.tsx:1100` (one downstream reference, renamed variable)

**Root cause (confirmed by reading the code, not assumed):** `workouts` state is deliberately fetched with a 30-day floor (`getWorkouts(user.id, { startDate: thirtyDaysAgo })` — this is correct, it powers the separate "Last 30 days" summary card and the sessions/week stat, both of which must stay exactly as they are). But the Monthly Volume section's month-picker filters `workouts` to compute muscle volume for whatever month is selected — so paging back further than ~30 days always finds zero matching workouts and renders "No workouts logged," even when the user trained that month. `exercises` state (from `getExerciseRowsWithWorkoutDates`, unrelated to `workouts`) is *not* date-bounded — a few lines below this same block, `setsByMuscleWeek` already correctly reads from `exercises` for its 6-month sparkline. This fix makes the rest of Monthly Volume do the same.

- [ ] **Step 1: Replace the computation block**

In `src/pages/Progress.tsx`, find this exact block (lines 785-856):

```tsx
  const currentWeekWorkouts = workouts.filter((w) => {
    const d = parseDateAtStartOfDay(w.date);
    return Boolean(d && d >= currentMonthStart && d <= currentMonthEnd);
  });
  const previousWeekWorkouts = workouts.filter((w) => {
    const d = parseDateAtStartOfDay(w.date);
    return Boolean(d && d >= previousMonthStart && d <= previousMonthEnd);
  });

  const calculateMuscleVolume = (workoutList: any[]) => {
    const volumeMap: Record<string, number> = {};
    workoutList.forEach(w => {
      const wExercises = exercises.filter(ex => ex.workout_id === w.id);
      wExercises.forEach(ex => {
        const vol = ex.sets * ex.reps * ex.weight;
        if (ex.muscle_group) volumeMap[ex.muscle_group] = (volumeMap[ex.muscle_group] || 0) + vol;
        else if (Array.isArray(w.muscle_groups) && w.muscle_groups.length > 0) {
          const volPerMuscle = vol / w.muscle_groups.length;
          w.muscle_groups.forEach((m: string) => { volumeMap[m] = (volumeMap[m] || 0) + volPerMuscle; });
        }
      });
    });
    return volumeMap;
  };

  const currentWeekVolume = calculateMuscleVolume(currentWeekWorkouts);
  const previousWeekVolume = calculateMuscleVolume(previousWeekWorkouts);
  const allMuscles = Array.from(new Set([...Object.keys(currentWeekVolume), ...Object.keys(previousWeekVolume)]));
  const totalVolume = Object.values(currentWeekVolume).reduce((a, b) => a + b, 0);
  let balanceScore = 100;
  if (totalVolume > 0 && allMuscles.length > 0) {
    const idealVolumePerMuscle = totalVolume / allMuscles.length;
    const deviations = allMuscles.map(m => Math.abs((currentWeekVolume[m] || 0) - idealVolumePerMuscle));
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / allMuscles.length;
    balanceScore = Math.max(0, 100 - (avgDeviation / idealVolumePerMuscle) * 100);
  }

  const setsByMuscleWeek = useMemo(() => {
    const result: Record<string, number[]> = {};
    const months = Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(volumeMonth, 5 - i);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    });
    exercises.forEach((ex) => {
      const date = parseDateAtStartOfDay(ex.workouts?.date);
      if (!date) return;
      const mg = ex.muscle_group;
      if (!mg) return;
      const mi = months.findIndex((m) => date >= m.start && date <= m.end);
      if (mi === -1) return;
      if (!result[mg]) result[mg] = new Array(6).fill(0);
      result[mg][mi] += ex.sets || 0;
    });
    return result;
  }, [exercises, volumeMonth]);

  const setVolumeData = useMemo(() => {
    const computeSets = (wList: any[]) => {
      const map: Record<string, number> = {};
      wList.forEach((w) => {
        exercises.filter((ex) => ex.workout_id === w.id).forEach((ex) => {
          const mg = ex.muscle_group;
          if (mg) map[mg] = (map[mg] || 0) + (ex.sets || 0);
        });
      });
      return map;
    };
    const cur = computeSets(currentWeekWorkouts);
    const prev = computeSets(previousWeekWorkouts);
    const muscles = Array.from(new Set([...Object.keys(cur), ...Object.keys(prev)]));
    return muscles.map((m) => ({ muscle: m, current: cur[m] || 0, previous: prev[m] || 0 })).sort((a, b) => b.current - a.current);
  }, [exercises, currentWeekWorkouts, previousWeekWorkouts]);
```

Replace with:

```tsx
  // Exercises already carry their own workout date (and, with the fix in
  // Task 1, their parent workout's muscle_groups fallback) — filtering
  // exercises directly instead of cross-referencing the 30-day-capped
  // `workouts` array means Monthly Volume works for ANY past month.
  const currentMonthExercises = exercises.filter((ex) => {
    const d = parseDateAtStartOfDay(ex.workouts?.date);
    return Boolean(d && d >= currentMonthStart && d <= currentMonthEnd);
  });
  const previousMonthExercises = exercises.filter((ex) => {
    const d = parseDateAtStartOfDay(ex.workouts?.date);
    return Boolean(d && d >= previousMonthStart && d <= previousMonthEnd);
  });

  const calculateMuscleVolume = (exerciseList: any[]) => {
    const volumeMap: Record<string, number> = {};
    exerciseList.forEach((ex) => {
      const vol = ex.sets * ex.reps * ex.weight;
      if (ex.muscle_group) volumeMap[ex.muscle_group] = (volumeMap[ex.muscle_group] || 0) + vol;
      else if (Array.isArray(ex.workout_muscle_groups) && ex.workout_muscle_groups.length > 0) {
        const volPerMuscle = vol / ex.workout_muscle_groups.length;
        ex.workout_muscle_groups.forEach((m: string) => { volumeMap[m] = (volumeMap[m] || 0) + volPerMuscle; });
      }
    });
    return volumeMap;
  };

  const currentMonthVolume = calculateMuscleVolume(currentMonthExercises);
  const previousMonthVolume = calculateMuscleVolume(previousMonthExercises);
  const allMuscles = Array.from(new Set([...Object.keys(currentMonthVolume), ...Object.keys(previousMonthVolume)]));
  const totalVolume = Object.values(currentMonthVolume).reduce((a, b) => a + b, 0);
  let balanceScore = 100;
  if (totalVolume > 0 && allMuscles.length > 0) {
    const idealVolumePerMuscle = totalVolume / allMuscles.length;
    const deviations = allMuscles.map(m => Math.abs((currentMonthVolume[m] || 0) - idealVolumePerMuscle));
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / allMuscles.length;
    balanceScore = Math.max(0, 100 - (avgDeviation / idealVolumePerMuscle) * 100);
  }

  const setsByMuscleWeek = useMemo(() => {
    const result: Record<string, number[]> = {};
    const months = Array.from({ length: 6 }, (_, i) => {
      const m = subMonths(volumeMonth, 5 - i);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    });
    exercises.forEach((ex) => {
      const date = parseDateAtStartOfDay(ex.workouts?.date);
      if (!date) return;
      const mg = ex.muscle_group;
      if (!mg) return;
      const mi = months.findIndex((m) => date >= m.start && date <= m.end);
      if (mi === -1) return;
      if (!result[mg]) result[mg] = new Array(6).fill(0);
      result[mg][mi] += ex.sets || 0;
    });
    return result;
  }, [exercises, volumeMonth]);

  const setVolumeData = useMemo(() => {
    const computeSets = (exList: any[]) => {
      const map: Record<string, number> = {};
      exList.forEach((ex) => {
        const mg = ex.muscle_group;
        if (mg) map[mg] = (map[mg] || 0) + (ex.sets || 0);
      });
      return map;
    };
    const cur = computeSets(currentMonthExercises);
    const prev = computeSets(previousMonthExercises);
    const muscles = Array.from(new Set([...Object.keys(cur), ...Object.keys(prev)]));
    return muscles.map((m) => ({ muscle: m, current: cur[m] || 0, previous: prev[m] || 0 })).sort((a, b) => b.current - a.current);
  }, [currentMonthExercises, previousMonthExercises]);
```

- [ ] **Step 2: Fix the one downstream reference to the renamed variable**

In `src/pages/Progress.tsx`, find (inside the `setVolumeData.map((item) => {...})` render loop, around line 1100):

```tsx
                      const muscleVol = currentWeekVolume[item.muscle] || 0;
```

Replace with:

```tsx
                      const muscleVol = currentMonthVolume[item.muscle] || 0;
```

- [ ] **Step 3: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: `23` (unchanged baseline — this is a pure rewrite of existing logic, no new type surface).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual test**

`npm run dev`, open Progress → Overview, find a month older than 30 days ago where you have logged workouts (or log a workout with a backdated date via the workout logger if needed for testing), and page the Monthly Volume month-picker back to it. Confirm it now shows real muscle-volume data instead of "No workouts logged in [Month]." Confirm the current month and the "Last 30 days" card above it are unaffected (same numbers as before this change).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Progress.tsx
git commit -m "Fix Monthly Volume month-picker for months older than 30 days"
```

---

### Task 3: `ExerciseHistorySheet` — per-exercise detail view

**Files:**
- Create: `src/components/progress/ExerciseHistorySheet.tsx`

This component owns exactly one concern: given one exercise name and the user's full exercise history, show that exercise's own last session, all-time best, growth chart, and training frequency. It doesn't know how the user found this exercise (that's Task 4's job) — it just needs a name and the raw data.

- [ ] **Step 1: Create the file**

Create `src/components/progress/ExerciseHistorySheet.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { X, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { parseDateAtStartOfDay } from '../../lib/dates';
import type { LocalPersonalRecord } from '../../lib/supabaseData';

interface ExerciseHistorySheetProps {
  exerciseName: string;
  muscleGroup: string | null;
  exercises: any[]; // full history rows: .name, .workout_id, .reps, .weight, .workouts.date — already unit-converted by the caller
  personalRecord: LocalPersonalRecord | null;
  weightUnit: 'kg' | 'lbs';
  onClose: () => void;
}

interface ExerciseSet {
  reps: number;
  weight: number;
}

interface ExerciseSession {
  workoutId: string;
  date: string;
  sets: ExerciseSet[];
}

const buildSessions = (exercises: any[], exerciseName: string): ExerciseSession[] => {
  const byWorkout = new Map<string, ExerciseSession>();
  exercises.forEach((ex) => {
    if (ex.name !== exerciseName) return;
    const date = ex.workouts?.date;
    if (!date) return;
    if (!byWorkout.has(ex.workout_id)) {
      byWorkout.set(ex.workout_id, { workoutId: ex.workout_id, date, sets: [] });
    }
    byWorkout.get(ex.workout_id)!.sets.push({ reps: Number(ex.reps) || 0, weight: Number(ex.weight) || 0 });
  });
  return Array.from(byWorkout.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const sessionTopSet = (session: ExerciseSession): ExerciseSet =>
  session.sets.reduce(
    (best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best),
    session.sets[0],
  );

const sessionVolume = (session: ExerciseSession): number =>
  session.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);

type Trend = 'up' | 'plateau' | 'down' | 'insufficient';

// Same 14-day-recent vs 15-56-day-prior comparison window lib/aiCoach.ts's
// progressionReport() already uses for the AI Coach's own trend detection —
// scoped here to a single exercise instead of all training.
const computeTrend = (sessions: ExerciseSession[]): Trend => {
  const now = Date.now();
  const daysSince = (dateStr: string) => {
    const d = parseDateAtStartOfDay(dateStr);
    return d ? Math.floor((now - d.getTime()) / 86_400_000) : Infinity;
  };
  const recentTops = sessions.filter((s) => daysSince(s.date) <= 14).map((s) => sessionTopSet(s).weight);
  const olderTops = sessions.filter((s) => { const d = daysSince(s.date); return d > 14 && d <= 56; }).map((s) => sessionTopSet(s).weight);
  if (!recentTops.length || !olderTops.length) return 'insufficient';
  const diff = Math.max(...recentTops) - Math.max(...olderTops);
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'plateau';
};

export const ExerciseHistorySheet: React.FC<ExerciseHistorySheetProps> = ({
  exerciseName, muscleGroup, exercises, personalRecord, weightUnit, onClose,
}) => {
  const [chartView, setChartView] = useState<'weight' | 'volume'>('weight');

  const sessions = useMemo(() => buildSessions(exercises, exerciseName), [exercises, exerciseName]);
  const lastSession = sessions.length ? sessions[sessions.length - 1] : null;
  const trend = useMemo(() => computeTrend(sessions), [sessions]);

  const chartData = useMemo(() => sessions.map((s) => ({
    date: s.date,
    weight: sessionTopSet(s).weight,
    volume: Math.round(sessionVolume(s)),
  })), [sessions]);

  const prSessionDate = useMemo(() => {
    if (!personalRecord) return null;
    const match = sessions.find((s) =>
      s.sets.some((set) => set.weight === personalRecord.best_weight && set.reps === personalRecord.best_reps),
    );
    return match?.date ?? null;
  }, [sessions, personalRecord]);

  const now = Date.now();
  const daysAgo = (dateStr: string) => {
    const d = parseDateAtStartOfDay(dateStr);
    return d ? (now - d.getTime()) / 86_400_000 : Infinity;
  };
  const sessionsThisWeek = sessions.filter((s) => daysAgo(s.date) <= 7).length;
  const sessionsThisMonth = sessions.filter((s) => daysAgo(s.date) <= 30).length;
  const firstSessionDate = sessions.length ? parseDateAtStartOfDay(sessions[0].date) : null;
  const weeksTracked = firstSessionDate ? Math.max(1, (now - firstSessionDate.getTime()) / (7 * 86_400_000)) : 1;
  const weeklyAverage = sessions.length / weeksTracked;

  const trendLabel = trend === 'up' ? '↑ Improving' : trend === 'down' ? '↓ Declining' : trend === 'plateau' ? '→ Plateau' : null;
  const trendColor = trend === 'up' ? '#4ade80' : trend === 'down' ? '#f87171' : 'var(--text-muted)';

  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[17px] font-black text-white">{exerciseName}</p>
            {muscleGroup && <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-0.5">{muscleGroup}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-white hover:bg-white/8">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!lastSession ? (
          <p className="text-[13px] text-[var(--text-muted)] py-8 text-center">No logged sessions found for this exercise.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 rounded-full bg-white/5 p-1">
                {(['weight', 'volume'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setChartView(v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${
                      chartView === v ? 'bg-[var(--accent)] text-black' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {trendLabel && <span className="text-[11px] font-bold" style={{ color: trendColor }}>{trendLabel}</span>}
            </div>

            <div className="h-40 rounded-xl bg-white/[0.03] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="exHistGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C8FF00" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#C8FF00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(val) => { const d = parseDateAtStartOfDay(val); return d ? format(d, 'MMM d') : ''; }}
                    interval="preserveStartEnd" />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12, padding: '8px 12px' }}
                    cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 2' }}
                    labelFormatter={(val) => { const d = parseDateAtStartOfDay(val); return d ? format(d, 'MMM d, yyyy') : ''; }}
                    formatter={(value) => [`${value} ${weightUnit}`, chartView === 'weight' ? 'Top set' : 'Volume']}
                  />
                  <Area type="monotone" dataKey={chartView} stroke="var(--accent)" strokeWidth={2.5} fill="url(#exHistGrad)"
                    dot={chartData.length <= 20 ? { fill: 'var(--accent)', strokeWidth: 0, r: 3 } : false}
                    activeDot={{ r: 5, fill: 'var(--accent)', stroke: '#111419', strokeWidth: 2 }} />
                  {chartView === 'weight' && prSessionDate && personalRecord && (
                    <ReferenceDot x={prSessionDate} y={personalRecord.best_weight} r={6} fill="#C8FF00" stroke="#111419" strokeWidth={2} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Last time</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {(() => { const d = parseDateAtStartOfDay(lastSession.date); return d ? format(d, 'MMM d, yyyy') : '--'; })()}
                </p>
                <p className="text-[13px] font-bold text-white mt-1">
                  {lastSession.sets.map((s) => `${s.weight}${weightUnit}×${s.reps}`).join(', ')}
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-[var(--accent)]" /> All-time best
                </p>
                {personalRecord ? (
                  <>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {(() => { const d = parseDateAtStartOfDay(personalRecord.achieved_date); return d ? format(d, 'MMM d, yyyy') : '--'; })()}
                    </p>
                    <p className="text-[13px] font-bold text-[var(--accent)] mt-1">{personalRecord.best_weight}{weightUnit}×{personalRecord.best_reps}</p>
                  </>
                ) : (
                  <p className="text-[13px] text-[var(--text-muted)] mt-1">No PR yet</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">This week</p>
                <p className="text-[16px] font-black text-white mt-1">{sessionsThisWeek}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">This month</p>
                <p className="text-[16px] font-black text-white mt-1">{sessionsThisMonth}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Weekly avg</p>
                <p className="text-[16px] font-black text-white mt-1">{weeklyAverage.toFixed(1)}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: `23` (unchanged — this file isn't imported/used by anything yet, so it can't introduce new errors elsewhere, but it must itself compile cleanly, which this count confirms since `-p src/tsconfig.json` covers all of `src/`).

- [ ] **Step 3: Commit**

```bash
git add src/components/progress/ExerciseHistorySheet.tsx
git commit -m "Add ExerciseHistorySheet: per-exercise growth chart, PR, last session, frequency"
```

---

### Task 4: `ExerciseHistorySearch` — search card

**Files:**
- Create: `src/components/progress/ExerciseHistorySearch.tsx`

This component owns "let the user find one of their own exercises." It derives the searchable list from the user's own logged history (never the full exercise catalog), fuzzy-filters it with the app's existing search utility, and opens `ExerciseHistorySheet` when one is picked.

- [ ] **Step 1: Create the file**

Create `src/components/progress/ExerciseHistorySearch.tsx`:

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Search, History } from 'lucide-react';
import { format } from 'date-fns';
import { fuzzyFilter } from '../../lib/fuzzySearch';
import { isWeightUnit } from '../../lib/units';
import { parseDateAtStartOfDay } from '../../lib/dates';
import { getPersonalRecords, type LocalPersonalRecord } from '../../lib/supabaseData';
import { ExerciseHistorySheet } from './ExerciseHistorySheet';

interface ExerciseHistorySearchProps {
  userId: string;
  exercises: any[]; // full history rows, already unit-converted by the parent (Progress.tsx)
  weightUnit: 'kg' | 'lbs';
}

interface ExerciseSummary {
  name: string;
  muscleGroup: string | null;
  lastDate: string;
}

export const ExerciseHistorySearch: React.FC<ExerciseHistorySearchProps> = ({ userId, exercises, weightUnit }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ExerciseSummary | null>(null);
  const [personalRecords, setPersonalRecords] = useState<LocalPersonalRecord[]>([]);

  useEffect(() => {
    getPersonalRecords(userId).then(setPersonalRecords).catch(() => setPersonalRecords([]));
  }, [userId]);

  // Only exercises the user has actually logged, weight-based only (skips
  // distance-unit cardio entries a growth-by-weight chart wouldn't suit),
  // most-recently-trained first as the default (untyped) order.
  const summaries = useMemo<ExerciseSummary[]>(() => {
    const map = new Map<string, ExerciseSummary>();
    exercises.forEach((ex) => {
      const date = ex.workouts?.date;
      if (!date || !ex.name || !isWeightUnit(ex.unit)) return;
      const existing = map.get(ex.name);
      if (!existing || date > existing.lastDate) {
        map.set(ex.name, { name: ex.name, muscleGroup: ex.muscle_group ?? null, lastDate: date });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [exercises]);

  const results = useMemo(() => fuzzyFilter(summaries, query, (s) => s.name, 20), [summaries, query]);

  const selectedPr = selected ? personalRecords.find((pr) => pr.exercise_name === selected.name) ?? null : null;

  return (
    <div className="rounded-2xl border border-white/8 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5">
      <div className="flex items-center gap-2 mb-3">
        <History className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Exercise History</p>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search an exercise you've logged…"
          className="w-full h-10 bg-white/[0.03] border border-white/8 rounded-xl pl-9 pr-3 text-[13px] text-white outline-none focus:border-[var(--accent)]/40 placeholder:text-[var(--text-muted)]"
        />
      </div>

      {summaries.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-4 text-center">Log a workout to see exercise history here.</p>
      ) : results.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] py-4 text-center">No logged exercise matches &quot;{query}&quot;.</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {results.map((s) => (
            <button
              key={s.name}
              onClick={() => setSelected(s)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <div>
                <p className="text-[13px] font-semibold text-white">{s.name}</p>
                {s.muscleGroup && <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)] mt-0.5">{s.muscleGroup}</p>}
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {(() => { const d = parseDateAtStartOfDay(s.lastDate); return d ? format(d, 'MMM d') : ''; })()}
              </p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <ExerciseHistorySheet
          exerciseName={selected.name}
          muscleGroup={selected.muscleGroup}
          exercises={exercises}
          personalRecord={selectedPr}
          weightUnit={weightUnit}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};
```

- [ ] **Step 2: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: `23` (unchanged — not yet wired into Progress.tsx).

- [ ] **Step 3: Commit**

```bash
git add src/components/progress/ExerciseHistorySearch.tsx
git commit -m "Add ExerciseHistorySearch: search a logged exercise, recency-sorted default list"
```

---

### Task 5: Wire the search card into Progress.tsx's Overview tab

**Files:**
- Modify: `src/pages/Progress.tsx` (one import, one render insertion)

- [ ] **Step 1: Add the import**

In `src/pages/Progress.tsx`, find:

```tsx
import { DopamineTracker } from '../components/progress/DopamineTracker';
import { GoalsSection } from '../components/progress/GoalsSection';
```

Replace with:

```tsx
import { DopamineTracker } from '../components/progress/DopamineTracker';
import { GoalsSection } from '../components/progress/GoalsSection';
import { ExerciseHistorySearch } from '../components/progress/ExerciseHistorySearch';
```

- [ ] **Step 2: Render it between the Heatmap card and the Volume rows card**

Find this exact boundary (the end of the Heatmap card, immediately before the Volume rows card comment):

```tsx
                </div>
              </div>

              {/* Volume rows card */}
```

Replace with:

```tsx
                </div>
              </div>

              {/* Exercise History search */}
              {user && <ExerciseHistorySearch userId={user.id} exercises={exercises} weightUnit={displayUnit as WeightUnit} />}

              {/* Volume rows card */}
```

- [ ] **Step 3: Verify**

Run: `npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l`
Expected: `23` (unchanged baseline).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual test**

`npm run dev`, open Progress → Overview. Confirm the new "Exercise History" card appears between the workout-frequency heatmap and the Monthly Volume card. With no query typed, confirm the list shows your exercises most-recently-trained first. Type a partial name (e.g. "ben" for "Bench Press") and confirm only exercises you've actually logged appear, ranked sensibly. Tap a result and confirm the detail sheet opens showing a real chart, last session's actual sets, your PR (if one exists for that exercise, matching the value shown elsewhere in the app, e.g. in Goals), and frequency counts. Toggle Weight/Volume and confirm the chart changes. Close the sheet and confirm it dismisses cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Progress.tsx
git commit -m "Wire ExerciseHistorySearch into the Overview tab"
```

---

### Task 6: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck, both scopes**

```bash
npx tsc --noEmit
npx tsc -p src/tsconfig.json --noEmit 2>&1 | wc -l
```
Expected: root clean; src count is `23`.

- [ ] **Step 2: Full build**

```bash
npm run build
```
Expected: succeeds (Next.js build + the legacy Vite build it triggers).

- [ ] **Step 3: End-to-end manual QA checklist**

- [ ] Monthly Volume: page back 3+ months to one with real logged data; confirm real numbers instead of "No workouts logged." Page forward back to the current month; confirm it's unchanged from before this work.
- [ ] "Last 30 days" summary card and its sessions/week figure are unchanged (this work must not have touched their data source).
- [ ] Exercise History search: default list (no query) is most-recently-trained-first; typing filters to only exercises you've logged; a query matching nothing shows the empty state, not a crash.
- [ ] Detail sheet: pick an exercise with 3+ sessions and multiple sets in at least one session. "Last time" lists every individual set (not a collapsed single number). "All-time best" matches the PR shown elsewhere in the app (e.g. the Goals tab) for that same exercise. The chart's marked PR point corresponds to that same best value.
- [ ] Weight/Volume toggle changes the chart's y-values while keeping the same sessions on the x-axis.
- [ ] Trend badge appears as "insufficient data" (i.e. no badge) for an exercise with only one or two sessions, and shows up/down/plateau correctly for one with enough history to compare.
- [ ] A cardio/distance-logged entry (km/mi unit, if you have one) does **not** appear in the Exercise History search results.

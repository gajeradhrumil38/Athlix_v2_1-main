# Global Progress Bar — Loading UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 2px lime-to-purple progress bar fixed at the top of every screen that fires on every Supabase data fetch, and replace the Progress page spinner with a skeleton — while keeping the existing `LoadingScreen` splash and all button spinners untouched.

**Architecture:** A `ProgressContext` holds an integer counter (`count`). Any component calls `startProgress()` to increment it and `doneProgress()` to decrement it; `isLoading = count > 0`. The `ProgressBar` component watches that boolean and runs a three-phase CSS animation (filling → completing → idle). Every page's fetch function wraps its Supabase calls with `startProgress` / `doneProgress` in a try/finally block.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, `var(--accent)` CSS variable (#C8FF00), existing `useAuth()` / `useCallback` patterns.

---

## File Map

| File | Action |
|------|--------|
| `src/contexts/ProgressContext.tsx` | Create — counter state + hook |
| `src/components/layout/ProgressBar.tsx` | Create — animated bar component |
| `src/App.tsx` | Modify — wrap tree with `<ProgressProvider>` |
| `src/components/layout/Layout.tsx` | Modify — add `<ProgressBar />` as first child |
| `src/pages/Home.tsx` | Modify — call start/done in `fetchData` |
| `src/pages/Timeline.tsx` | Modify — call start/done in fetch effect |
| `src/pages/Calendar.tsx` | Modify — call start/done in fetch effect |
| `src/pages/Progress.tsx` | Modify — call start/done + replace spinner with skeleton |
| `src/features/food/components/FoodHistory.tsx` | Modify — call start/done in `load()` |

---

## Task 1: Create ProgressContext

**Files:**
- Create: `src/contexts/ProgressContext.tsx`

- [ ] **Step 1: Create the file**

```tsx
// src/contexts/ProgressContext.tsx
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ProgressContextValue {
  isLoading: boolean;
  startProgress: () => void;
  doneProgress: () => void;
}

const ProgressContext = createContext<ProgressContextValue>({
  isLoading: false,
  startProgress: () => {},
  doneProgress: () => {},
});

export const ProgressProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [count, setCount] = useState(0);

  const startProgress = useCallback(() => setCount((c) => c + 1), []);
  const doneProgress = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  const value = useMemo(
    () => ({ isLoading: count > 0, startProgress, doneProgress }),
    [count, startProgress, doneProgress],
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
};

export const useProgress = () => useContext(ProgressContext);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/ProgressContext.tsx
git commit -m "feat: add ProgressContext with fetch counter"
```

---

## Task 2: Create ProgressBar Component

**Files:**
- Create: `src/components/layout/ProgressBar.tsx`

The bar has three phases:
- `filling` — animates 0% → 85% over 1500ms, stays there while `isLoading` is true
- `completing` — jumps to 100%, fades out over 350ms total, then unmounts
- `idle` — renders `null` (no DOM node)

- [ ] **Step 1: Create the file**

```tsx
// src/components/layout/ProgressBar.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useProgress } from '../../contexts/ProgressContext';

type Phase = 'idle' | 'filling' | 'completing';

export const ProgressBar: React.FC = () => {
  const { isLoading } = useProgress();
  const [phase, setPhase] = useState<Phase>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (isLoading) {
      setPhase('filling');
    } else if (phase === 'filling') {
      setPhase('completing');
      timerRef.current = setTimeout(() => setPhase('idle'), 350);
    }
    return () => clearTimeout(timerRef.current);
  }, [isLoading]);

  if (phase === 'idle') return null;

  return (
    <>
      <style>{`
        @keyframes athlix-progress-fill {
          from { width: 0% }
          to   { width: 85% }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 9999,
          background: 'rgba(200,255,0,0.1)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent), #a78bfa)',
            borderRadius: 1,
            ...(phase === 'filling'
              ? { animation: 'athlix-progress-fill 1500ms ease-out forwards' }
              : { width: '100%', opacity: 0, transition: 'width 150ms ease-out, opacity 200ms ease 150ms' }),
          }}
        />
      </div>
    </>
  );
};
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/ProgressBar.tsx
git commit -m "feat: add ProgressBar component with fill/complete/idle phases"
```

---

## Task 3: Wire Provider and Bar into App Shell

**Files:**
- Modify: `src/App.tsx` lines 73–85
- Modify: `src/components/layout/Layout.tsx` line 109 (return statement)

### App.tsx

- [ ] **Step 1: Add ProgressProvider import and wrap the tree**

Current `App.tsx` (lines 73–85):
```tsx
export default function App() {
  return (
    <AuthProvider>
      <HeartRateProvider>
        <RestTimerProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </RestTimerProvider>
      </HeartRateProvider>
    </AuthProvider>
  );
}
```

Replace with:
```tsx
import { ProgressProvider } from './contexts/ProgressContext';

export default function App() {
  return (
    <ProgressProvider>
      <AuthProvider>
        <HeartRateProvider>
          <RestTimerProvider>
            <HashRouter>
              <AppRoutes />
            </HashRouter>
          </RestTimerProvider>
        </HeartRateProvider>
      </AuthProvider>
    </ProgressProvider>
  );
}
```

`ProgressProvider` is outermost so any component in the tree (including `AuthProvider` children) can call `useProgress()`.

### Layout.tsx

- [ ] **Step 2: Import ProgressBar and add it as first child of the Layout return**

Add to imports at top of `src/components/layout/Layout.tsx`:
```tsx
import { ProgressBar } from '../layout/ProgressBar';
```

Find the `return (` at line 109. The opening `<div>` is:
```tsx
return (
  <div
    className="flex bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden"
    style={viewportHeight > 0 ? { height: `${viewportHeight}px` } : undefined}
  >
    {/* ── Desktop sidebar ───────────────────────────── */}
```

Add `<ProgressBar />` as the very first child:
```tsx
return (
  <div
    className="flex bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden"
    style={viewportHeight > 0 ? { height: `${viewportHeight}px` } : undefined}
  >
    <ProgressBar />
    {/* ── Desktop sidebar ───────────────────────────── */}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verify**

Run dev server:
```bash
npm run dev
```

Open the app. Navigate between pages. You should see a thin lime→purple bar slide across the very top of the screen (above the header) on every navigation. The `LoadingScreen` ("A" animation) still appears on hard refresh before auth resolves.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/Layout.tsx
git commit -m "feat: wire ProgressProvider and ProgressBar into app shell"
```

---

## Task 4: Hook Up Home.tsx

**Files:**
- Modify: `src/pages/Home.tsx`

The `fetchData` callback at line ~157 already has try/finally. Just add `startProgress`/`doneProgress`.

- [ ] **Step 1: Add useProgress import and calls**

Add `useProgress` to the import at the top of `src/pages/Home.tsx`:
```tsx
import { useProgress } from '../contexts/ProgressContext';
```

Inside the `Home` component, add after the existing hooks:
```tsx
const { startProgress, doneProgress } = useProgress();
```

Find `fetchData` (the `useCallback` starting at line ~157). Add `startProgress()` at the top of the callback body and `doneProgress()` in the existing `finally` block:

```tsx
const fetchData = useCallback(async () => {
  if (!user) return;
  startProgress();           // ← add
  setLoading(true);
  setError(null);

  try {
    // ... existing Promise.all and setters — no changes here ...
  } catch (err: any) {
    console.error('Error fetching data:', err);
    setError(err.message || 'Failed to load data');
  } finally {
    doneProgress();          // ← add
    setLoading(false);
  }
}, [user, currentDate, viewMode, startProgress, doneProgress]);  // ← add startProgress, doneProgress to deps
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verify**

Navigate to Home. Switch the date using the arrow buttons. The top bar should fire on every date change (not just first load). The skeleton still appears on the very first load when `workouts.length === 0`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: fire progress bar on every Home fetchData call"
```

---

## Task 5: Hook Up Timeline.tsx

**Files:**
- Modify: `src/pages/Timeline.tsx`

Timeline uses a plain `useEffect` (not `useCallback`) with a `.then().catch().finally()` chain.

- [ ] **Step 1: Add useProgress and wire start/done**

Add import at top of `src/pages/Timeline.tsx`:
```tsx
import { useProgress } from '../contexts/ProgressContext';
```

Inside `Timeline`, add after existing hooks:
```tsx
const { startProgress, doneProgress } = useProgress();
```

Find the fetch `useEffect` (currently around line 297):
```tsx
useEffect(() => {
  if (!user) { setWorkouts([]); setLoading(false); return; }
  setLoading(true);
  getWorkouts(user.id, { includeExercises: true })
    .then((data) => setWorkouts(data || []))
    .catch(() => toast.error('Failed to load timeline'))
    .finally(() => setLoading(false));
}, [user, refreshKey]);
```

Replace with:
```tsx
useEffect(() => {
  if (!user) { setWorkouts([]); setLoading(false); return; }
  setLoading(true);
  startProgress();
  getWorkouts(user.id, { includeExercises: true })
    .then((data) => setWorkouts(data || []))
    .catch(() => toast.error('Failed to load timeline'))
    .finally(() => { setLoading(false); doneProgress(); });
}, [user, refreshKey, startProgress, doneProgress]);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verify**

Navigate to Timeline. The bar should fire immediately. Pull-to-refresh (or any re-trigger) also fires the bar.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Timeline.tsx
git commit -m "feat: fire progress bar on Timeline data fetch"
```

---

## Task 6: Hook Up Calendar.tsx

**Files:**
- Modify: `src/pages/Calendar.tsx`

Calendar has a `useEffect` fetch at line ~520 with a `.then().catch().finally()` chain.

- [ ] **Step 1: Add useProgress and wire start/done**

Add import at top of `src/pages/Calendar.tsx`:
```tsx
import { useProgress } from '../contexts/ProgressContext';
```

Inside `Calendar`, add after existing hooks:
```tsx
const { startProgress, doneProgress } = useProgress();
```

Find the fetch `useEffect` (around line 520):
```tsx
useEffect(() => {
  if (!user) { setLoading(false); return; }
  setLoading(true);

  // ... date calculation ...

  getWorkouts(user.id, { startDate: ..., endDate: ..., includeExercises: true })
    .then((data) => {
      // dedup logic ...
      setWorkouts(deduped);
    })
    .catch(() => setWorkouts([]))
    .finally(() => setLoading(false));
}, [user, anchor, viewMode, refreshKey]);
```

Add `startProgress()` right after `setLoading(true)` and add `doneProgress()` in `.finally()`:

```tsx
useEffect(() => {
  if (!user) { setLoading(false); return; }
  setLoading(true);
  startProgress();          // ← add

  let start: Date;
  let end: Date;
  if (viewMode === 'week') {
    start = weekStart(anchor);
    end   = weekEnd(anchor);
  } else {
    start = weekStart(startOfMonth(anchor));
    end   = weekEnd(endOfMonth(anchor));
  }

  getWorkouts(user.id, {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate:   format(end,   'yyyy-MM-dd'),
    includeExercises: true,
  })
    .then((data) => {
      const seen = new Set<string>();
      const deduped = (data || []).filter((w: any) => {
        if (seen.has(w.id)) return false;
        seen.add(w.id);
        return true;
      });
      setWorkouts(deduped);
    })
    .catch(() => setWorkouts([]))
    .finally(() => { setLoading(false); doneProgress(); });  // ← add doneProgress()
}, [user, anchor, viewMode, refreshKey, startProgress, doneProgress]);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verify**

Navigate to Calendar. Switch months. The bar fires on each month change.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Calendar.tsx
git commit -m "feat: fire progress bar on Calendar data fetch"
```

---

## Task 7: Hook Up Progress.tsx + Replace Spinner with Skeleton

**Files:**
- Modify: `src/pages/Progress.tsx`

This page has two things to do:
1. Add `startProgress`/`doneProgress` to `fetchData`
2. Replace the full-page spinner (lines 853–863) with a skeleton

- [ ] **Step 1: Add useProgress and wire start/done**

Add import at top of `src/pages/Progress.tsx`:
```tsx
import { useProgress } from '../contexts/ProgressContext';
```

Inside `Progress`, add after existing hooks:
```tsx
const { startProgress, doneProgress } = useProgress();
```

Find `fetchData` (the `useCallback` around line 676):
```tsx
const fetchData = useCallback(async () => {
  setLoading(true);
  try {
    // ...
  } catch (error) {
    console.error('Error fetching progress data:', error);
  } finally {
    setLoading(false);
  }
}, [user, displayUnit]);
```

Replace with:
```tsx
const fetchData = useCallback(async () => {
  setLoading(true);
  startProgress();           // ← add
  try {
    if (!user) { setWeightLogs([]); setWorkouts([]); setExercises([]); return; }
    const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const [weightData, workoutData, exerciseData] = await Promise.all([
      getBodyWeightLogs(user.id),
      getWorkouts(user.id, { startDate: thirtyDaysAgo }),
      getExerciseRowsWithWorkoutDates(user.id),
    ]);
    const targetUnit = displayUnit as WeightUnit;
    setWeightLogs(
      (weightData || [])
        .map((log: any) => ({
          ...log,
          weight: convertWeight(Number(log.weight || 0), (log.unit || targetUnit) as WeightUnit, targetUnit, 0.1),
          unit: targetUnit,
        }))
        .sort((a: any, b: any) => (a.date > b.date ? 1 : -1)),
    );
    setWorkouts(workoutData || []);
    if (exerciseData) {
      setExercises(exerciseData.map((exercise: any) => ({
        ...exercise,
        weight: !exercise.unit || isWeightUnit(exercise.unit)
          ? convertWeight(Number(exercise.weight || 0), isWeightUnit(exercise.unit) ? exercise.unit : targetUnit, targetUnit, 0.1)
          : Number(exercise.weight || 0),
        unit: !exercise.unit || isWeightUnit(exercise.unit) ? targetUnit : exercise.unit,
      })));
    }
  } catch (error) {
    console.error('Error fetching progress data:', error);
  } finally {
    doneProgress();           // ← add
    setLoading(false);
  }
}, [user, displayUnit, startProgress, doneProgress]);  // ← add to deps
```

- [ ] **Step 2: Replace the spinner with a skeleton**

Find the spinner block (around line 853):
```tsx
if (loading) {
  return (
    <div className="flex flex-col justify-center items-center h-64 gap-4">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-[var(--accent)]/20 animate-pulse" />
        <div className="absolute inset-0 animate-spin rounded-full border-t-2 border-[var(--accent)]" />
      </div>
      <p className="text-[12px] uppercase tracking-[0.2em] text-[var(--text-muted)] animate-pulse">Loading analytics</p>
    </div>
  );
}
```

Replace with (skeleton only shows on first load when no data yet):
```tsx
if (loading && exercises.length === 0) {
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16 rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-40 rounded-xl" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="skeleton h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verify**

Navigate to Progress page. On first visit: skeleton blocks appear while bar runs across top. Switch tabs (Overview → Food → Weight) — no skeleton flash, just the bar. Spinner is gone.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Progress.tsx
git commit -m "feat: fire progress bar on Progress fetch; replace spinner with skeleton"
```

---

## Task 8: Hook Up FoodHistory.tsx

**Files:**
- Modify: `src/features/food/components/FoodHistory.tsx`

FoodHistory has a `load` function (around line 298) that handles both initial load (`pg === 0`) and infinite-scroll pagination (`pg > 0`). Only wrap the initial load with `startProgress`/`doneProgress` since pagination has its own `loadingMore` state.

- [ ] **Step 1: Add useProgress and wire start/done for initial load**

Add import at top of `src/features/food/components/FoodHistory.tsx`:
```tsx
import { useProgress } from '../../../contexts/ProgressContext';
```

Inside the `FoodHistory` component, add after existing hooks:
```tsx
const { startProgress, doneProgress } = useProgress();
```

Find the `load` function (around line 298):
```tsx
const load = useCallback(async (pg: number, replace: boolean) => {
  if (!user) return;
  pg === 0 ? setLoading(true) : setLoadingMore(true);
  try {
    const { scans: newScans, total: t } = await getFoodScans(user.id, pg, PAGE_SIZE);
    setScans((prev) => replace ? newScans : [...prev, ...newScans]);
    setTotal(t);
  } catch { /* silent */ }
  finally { pg === 0 ? setLoading(false) : setLoadingMore(false); }
}, [user]);
```

Replace with:
```tsx
const load = useCallback(async (pg: number, replace: boolean) => {
  if (!user) return;
  if (pg === 0) { setLoading(true); startProgress(); }
  else setLoadingMore(true);
  try {
    const { scans: newScans, total: t } = await getFoodScans(user.id, pg, PAGE_SIZE);
    setScans((prev) => replace ? newScans : [...prev, ...newScans]);
    setTotal(t);
  } catch { /* silent */ }
  finally {
    if (pg === 0) { setLoading(false); doneProgress(); }
    else setLoadingMore(false);
  }
}, [user, startProgress, doneProgress]);
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verify**

Navigate to Food History (`/food/history`). The bar fires on initial page load. Scrolling to load more records does not fire the bar (handled by `loadingMore` state independently).

- [ ] **Step 4: Commit**

```bash
git add src/features/food/components/FoodHistory.tsx
git commit -m "feat: fire progress bar on FoodHistory initial load"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| ProgressContext + useProgress hook | Task 1 |
| ProgressBar — fill/complete/idle phases, z-9999, lime→purple gradient | Task 2 |
| ProgressProvider wraps App tree | Task 3 |
| ProgressBar added to Layout | Task 3 |
| LoadingScreen verified (already working, kept) | Task 3 manual verify |
| Home.tsx wired | Task 4 |
| Timeline.tsx wired | Task 5 |
| Calendar.tsx wired | Task 6 |
| Progress.tsx wired + spinner → skeleton | Task 7 |
| FoodHistory.tsx wired | Task 8 |
| Button spinners left unchanged | Not touched in any task ✓ |
| WHOOP RingSkeleton left unchanged | Not touched in any task ✓ |
| Food scanner / AI chat left unchanged | Not touched in any task ✓ |

All spec requirements covered. No placeholders. Type consistency: `startProgress`/`doneProgress` named identically across all tasks. `useProgress()` import path from `contexts/ProgressContext` used consistently.

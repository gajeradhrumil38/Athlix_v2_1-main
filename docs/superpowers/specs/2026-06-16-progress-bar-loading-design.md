# Global Progress Bar — Loading UX Design

**Goal:** Deliver a complete, layered loading UX: a full-screen branded splash on cold start, then a thin top progress bar that fires on every data fetch once the app is running.

**Architecture:** A React context tracks a global fetch counter. The `ProgressBar` component watches that counter and renders a 2px fixed bar at the very top of the viewport. Every page's `fetchData` function calls `startProgress()` before fetching and `doneProgress()` when done (or on error). First-load skeletons remain for pages with no cached data.

**Tech Stack:** React context, CSS animations, React Router v6, Tailwind CSS, existing Supabase data layer in `src/lib/supabaseData.ts`.

---

## 1. New Files

### `src/contexts/ProgressContext.tsx`
- Exports `ProgressProvider` (wraps app) and `useProgress()` hook
- Internal state: `count: number` (active fetch count)
- `startProgress()` → `count += 1`
- `doneProgress()` → `count = Math.max(0, count - 1)`
- `isLoading: boolean` → `count > 0`

### `src/components/layout/ProgressBar.tsx`
- Reads `isLoading` from `useProgress()`
- Fixed position: `top: 0; left: 0; right: 0; z-index: 9999` (above everything including the sticky header at z-20)
- Height: 2px
- Color: `linear-gradient(90deg, var(--accent), #a78bfa)` — lime to purple, matching the app brand
- Animation behaviour:
  - When `isLoading` becomes true: bar animates from 0% → 85% width over ~1.5s (eased), stays there
  - When `isLoading` becomes false: jumps to 100% width, then fades out over 200ms
  - Implementation: CSS `@keyframes` + a local `completing` state flag, no external library
- Renders `null` when not loading and not completing (no DOM node at rest)

---

## 2. Modified Files

### `src/App.tsx`
- Wrap the router tree with `<ProgressProvider>` (outermost, above everything)

### `src/components/layout/Layout.tsx`
- Add `<ProgressBar />` as the very first child — before the sticky header, before any content

### `src/pages/Home.tsx`
- In `fetchData`: call `startProgress()` at entry, `doneProgress()` in finally block
- Keep existing skeleton (rendered when `loading && workouts.length === 0`) — first load still shows skeleton + bar together

### `src/pages/Timeline.tsx`
- Same pattern: `startProgress()` / `doneProgress()` around the Supabase fetch
- Remove any in-page spinner div

### `src/pages/Calendar.tsx`
- Same pattern around `fetchWorkouts` / date-change fetches
- Remove any in-page loading spinner

### `src/pages/Progress.tsx`
- `startProgress()` / `doneProgress()` around the analytics fetch
- **Replace** the full-page centered spinner + "Loading analytics" text with a skeleton that matches the tab layout:
  - Overview tab skeleton: two stat rows + a chart placeholder
  - Other tabs: two block placeholders
- Skeleton renders when `loading && exercises.length === 0` (first load only)

### `src/features/running/pages/RunHistory.tsx`
- Same pattern; remove the page-level loading spinner if present

### `src/features/food/components/FoodHistory.tsx`
- Same pattern if it has a page-level spinner

---

## 3. Initial App Load — Splash Screen (Layer 1)

`src/components/layout/LoadingScreen.tsx` — already implemented, explicitly in scope as the first layer of the loading UX.

**When it shows:** `App.tsx` renders `<LoadingScreen />` while `loading` is true from `useAuth()` — i.e. while Supabase resolves the session on cold start (first page visit, hard refresh).

**What it shows:**
- Full-screen `#0a0c10` background
- Animated gradient "A" logo (lime → purple → green cycle, 2.4 s)
- Ambient radial glow behind the letter with pulse animation
- No text, no spinner — pure brand moment

**Transition:** Once auth resolves, `LoadingScreen` unmounts and the app renders. The progress bar then immediately triggers for the first data fetch, giving a seamless hand-off: splash → bar → content.

**Implementation task:** Verify the existing `LoadingScreen` is rendered correctly during auth load and add a brief `opacity` fade-out transition so it doesn't hard-cut when dismissed:

```tsx
// App.tsx — add exit animation class
if (loading) return <LoadingScreen />;
```

The component itself already handles the animation; no changes needed to `LoadingScreen.tsx` unless a fade-out is desired (nice-to-have, not required).

---

## 4. What Stays Unchanged

- **Button spinners** (`Loader2 animate-spin` inside Save / Delete / Connect buttons) — these are mutation feedback, not data-loading feedback. Leave them as-is.
- **WHOOP Dashboard `RingSkeleton`** — individual widget skeletons stay; the bar handles the outer page-level feedback.
- **Food scanner / AI chat loading states** — these are real-time streaming operations with their own UX; don't touch them.

---

## 5. Bar Animation Spec

```
isLoading = true  → animate width: 0% → 85%, duration 1500ms, ease-out, stay at 85%
isLoading = false → transition width to 100% in 150ms, then opacity to 0 in 200ms, then unmount
```

State machine (component-local):
```
idle → (isLoading=true) → filling → (isLoading=false) → completing → idle
```
The `completing` state keeps the bar mounted during the fade-out.

---

## 6. Skeleton Spec for Progress Page

Replaces the current centered spinner. Renders only when `loading && exercises.length === 0`.

Overview tab shape:
- Row of 3 stat blocks (h-16 each)
- Full-width chart placeholder (h-40)
- Row of 2 smaller blocks (h-24 each)

All blocks use the existing `.skeleton` / `animate-pulse` classes already in the app.

---

## 7. Hook Usage Pattern

Every page that fetches data uses this pattern:

```tsx
const { startProgress, doneProgress } = useProgress();

const fetchData = useCallback(async () => {
  startProgress();
  try {
    // ... supabase calls
  } finally {
    doneProgress();
  }
}, [deps]);
```

---

## 8. Out of Scope

- Caching / stale-while-revalidate (separate feature if needed later)
- Route-transition-only triggering (decided against — all fetches trigger the bar)
- Third-party libraries (NProgress, react-nprogress) — pure CSS implementation keeps the bundle lean

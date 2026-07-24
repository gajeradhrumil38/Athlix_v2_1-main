# Athlix — Claude Code Reference

Fitness tracking PWA. React 18 + TypeScript + Vite + Tailwind + Supabase. Mobile-first, dark-mode only.

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Routing | React Router DOM v6 (HashRouter) |
| Backend | Supabase (Postgres + Auth + Edge Functions + RLS) |
| AI | Google Gemini (`@google/genai`) for food recognition + AI Coach |
| Maps | Leaflet (run tracking) |
| Drag & Drop | @dnd-kit (dashboard layout editor) |
| Icons | Lucide React via central registry `src/config/icons.tsx` |
| Fonts | Inter (body), DM Sans (skincare feature) |

---

## Project Structure

```
src/
  App.tsx                    # Routes + providers
  main.tsx                   # Bootstrap, theme init
  pages/                     # Top-level route pages
    Home.tsx                 # Dashboard with widgets
    Calendar.tsx             # Workout calendar
    Log.tsx                  # Workout logger entry
    Timeline.tsx             # Workout history
    Progress.tsx             # Stats + dopamine tracker
    Settings.tsx             # User prefs + WHOOP OAuth
    Auth.tsx                 # Login/signup
    ResetPassword.tsx
    DashboardLayoutEditor.tsx
    Templates.tsx
    WhoopCallback.tsx
  components/
    layout/Layout.tsx        # Shell: sidebar, mobile nav, header, FAB
    layout/LoadingScreen.tsx
    ai/AiChat.tsx            # Floating AI Coach (Gemini)
    log/                     # Workout logging UI components
    home/                    # Dashboard widget components
    progress/DopamineTracker.tsx
    shared/                  # ExerciseImage, HapticPicker
  features/
    food/                    # Food scanner (Gemini vision + FatSecret API)
    running/                 # GPS run tracker (Leaflet, geolocation)
    skincare/                # Skincare routine (localStorage, useReducer)
    whoop/                   # WHOOP wearable integration (OAuth2)
  contexts/
    AuthContext.tsx          # useAuth() — consumed by every page
    HeartRateContext.tsx     # Bluetooth HR monitor
    RestTimerContext.tsx     # Global rest timer state
  lib/
    supabase.ts              # createBrowserClient instance
    supabaseData.ts          # ALL Supabase CRUD (20+ functions)
    localData.ts             # Offline-first mirror of supabaseData
    exerciseTypes.ts         # Input types, formatters, dial field kinds
    exerciseMuscles.ts       # Muscle group mapping + profile builder
    muscleColors.ts          # Heatmap color tokens
    fuzzySearch.ts           # Exercise search
    haptics.ts               # navigator.vibrate wrapper
    units.ts                 # convertWeight(), formatWeight(), WeightUnit
    dates.ts                 # parseDateAtStartOfDay(), date helpers
    foodData.ts              # getFoodScans(), saveFoodScan(), etc.
    machineLabels.ts         # Machine exercise display names
  config/
    icons.tsx                # ICONS registry + AppIcon component — add icons here
    media.ts                 # Exercise SVG/image flags
    widgets.ts               # Dashboard widget config + default layout
  data/
    opentrainingCatalog.ts   # 1000+ exercise library (large file)
  theme/
    colors.ts                # applyTheme(), CSS variable tokens
  hooks/
    useDashboardLayout.ts    # Persisted drag-drop layout
    useExerciseDB.ts         # Exercise catalog hook
supabase/
  schema.sql                 # Full DB schema
  rls_policies.sql           # Row Level Security policies
  migrations/                # Incremental SQL migrations
  functions/
    food-scan/               # Edge Function: FatSecret API proxy (OAuth 1.0a)
    whoop-oauth/             # Edge Function: WHOOP OAuth2 + token refresh
```

---

## Architecture Patterns

### Auth
- `AuthContext.tsx` wraps the entire app. Every page calls `useAuth()` — it is the #1 god node (60 edges).
- `ProtectedRoute` in `App.tsx` guards all routes. Unauthenticated → `/auth`.
- Password recovery is handled inline via `isPasswordRecovery` flag in AuthContext.

### Data Layer — dual path
- **Supabase path** (`src/lib/supabaseData.ts`): all cloud CRUD. Functions: `saveWorkout()`, `getWorkouts()`, `deleteWorkout()`, `getTemplates()`, `saveTemplate()`, `getBodyWeightLogs()`, `getPersonalRecords()`, `getProfile()`, `updateProfile()`, `addCustomExercise()`, `appendHeartRateSamples()`, etc.
- **Local path** (`src/lib/localData.ts`): offline mirror. Same API surface, writes to IndexedDB/localStorage. Used as fallback and for features that don't need cloud sync.
- **Supabase client**: `src/lib/supabase.ts` exports a single `createBrowserClient` instance via `@supabase/ssr`. Import `supabase` from here.
- **RPCs**: `save_workout_with_sets`, `log_body_weight`, `handle_new_user` (trigger).

### Routing
- HashRouter (for static hosting compatibility).
- Routes defined in `App.tsx`. All protected routes nest under `<Layout />`.
- Layout applies `isSelfPaddedRoute` for pages that manage their own padding (`/`, `/calendar`, `/progress`, `/timeline`, `/skincare`).

### Layout Shell (`components/layout/Layout.tsx`)
- Desktop: sidebar with nav links.
- Mobile: fixed top header + bottom nav (5 items) + floating action button.
- `isImmersiveRoute`: `/log` and `/run*` — hides header/nav/FAB.
- `isSelfPaddedRoute`: listed routes manage their own top padding. **Do not add extra padding to these pages.**
- Mobile safe-area: `env(safe-area-inset-top/bottom)` used throughout.
- To add a nav item: update `navItems` (desktop) and `mobileNavItems` (mobile) arrays. Add icon to `src/config/icons.tsx` first.

### Icons
- Central registry in `src/config/icons.tsx`. Import from Lucide, add to `ICONS` object, use `<AppIcon name="..." size="sm|md|lg|xl" />`.
- Never import Lucide icons directly in page/component files.

### Theming
- CSS variables defined in `src/index.css` and applied by `applyTheme()` in `src/theme/colors.ts`.
- Dark mode only. Two themes: `dark`, `darker`.
- Use `var(--bg-base)`, `var(--bg-surface)`, `var(--bg-elevated)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--accent)`, `var(--border)` etc.

---

## Features Reference

### Workout Logger (`/log`)
- Entry: `pages/Log.tsx` → `components/log/ActiveWorkout.tsx` (main session UI).
- Exercise blocks: `ExerciseBlock.tsx` → `ExerciseContent.tsx` → `SetRow.tsx`.
- Set input: `WeightRepsModal.tsx` + `WeightRepsPicker.tsx` (scroll-snap dial picker).
- Exercise picker: `ExercisePicker.tsx` + `ExerciseTabBar.tsx` (searches `opentrainingCatalog`).
- Rest timer: `RestTimer.tsx` driven by `RestTimerContext`.
- Plan sheet: `PlanTodaySheet.tsx`. Finish: `FinishSheet.tsx` → `CelebrationScreen.tsx`.
- Immersive route — no Layout chrome shows.

### Running Tracker (`/run`)
- `features/running/pages/ActiveRun.tsx` — main page (immersive).
- GPS: `hooks/useGPS.ts` (geolocation API), `hooks/useRunTracking.ts` (state machine).
- Calculations: `utils/gpsCalculations.ts` — `GpsPoint`, `GpsKalmanFilter`, `haversineDistance()`, `formatDuration()`.
- Storage: `utils/storage.ts` — `saveRun()`, `getRuns()`, `saveRunToCloud()` (also writes to Supabase).
- Map: `components/RunMap.tsx` (Leaflet), `RunRouteBackground.tsx`, `RunStats.tsx`.
- History: `pages/RunHistory.tsx`.

### Food Scanner (`/food/scan`)
- `features/food/pages/FoodScannerPage.tsx` → `components/FoodScanner.tsx`.
- Recognition: `services/foodRecognition.service.ts` — `recognizeFoodWithGemini()` (Gemini vision), `searchFood()` (FatSecret via Edge Function), `compressImage()`, `makeThumbnail()`.
- Results: `FoodResults.tsx` → `FoodDetailModal.tsx`.
- History: `FoodHistoryPage.tsx` → `FoodHistory.tsx`.
- DB: `lib/foodData.ts` wraps Supabase `food_scans` table.
- Edge Function `supabase/functions/food-scan/`: proxies FatSecret API with OAuth 1.0a signing.

### Skincare Routine (`/skincare`)
- Single file: `features/skincare/SkincareRoutinePage.tsx` (~1000 lines).
- State: `useReducer` + `cloneDeep` (JSON parse/stringify). Persisted to `localStorage` key `athlix_skincare_v1`.
- Data model: `AppState { weeks, routine, subcategories }`. ISO week IDs (e.g. `2026-W22`).
- Actions: `SET_STATUS`, `SKIP_CARRY`, `ADD_PRODUCT`, `REMOVE_PRODUCT`, `MOVE_PRODUCT`, `ADD_SUBCAT`, `REMOVE_SUBCAT`, `EDIT_PRODUCT_TIMER`, `EDIT_PRODUCT_DAYS`, `ENSURE_WEEKS`.
- Per-product day scheduling: `days?: DayName[]` on `RoutineProduct` (undefined = all days).
- UI: tap card = done. `optimisticDone` local state fills circle immediately. `SKIP_CARRY` carries product to next day.
- Timer: `TimerBar` uses `requestAnimationFrame`, `transform:scaleX()` for smooth progress.
- Dial picker: `DialPicker` component with CSS `scroll-snap-type: y mandatory`.
- Colors: amber=Morning, blue=Night, sage=Done. No hue in chrome.
- Font: DM Sans applied to root div.
- `isSelfPaddedRoute` — Layout does NOT add padding, page manages its own.

### WHOOP Integration
- OAuth2 flow: Settings.tsx → `supabase/functions/whoop-oauth/` Edge Function → `WhoopCallback.tsx`.
- Data: `features/whoop/services/whoopService.ts` fetches cycles/recovery/sleep, caches in `whoop_cache` table.
- Display: `features/whoop/components/WhoopDashboard.tsx`.

### AI Coach (`AiChat`)
- `components/ai/AiChat.tsx` — floating chat drawer. `components/ai/PostWorkoutCoachPill.tsx` — post-workout insight pill (shares the same backend).
- System prompt built from user's workout history in `lib/aiCoach.ts` (`buildSystemPrompt`, `'chat'` vs `'insight'` variant).
- Gemini calls go through a server-side proxy, not directly from the browser: `app/api/ai-coach/generate/route.ts` (streams via SSE for the chat, non-streaming for the pill and for the food scanner's Gemini calls) and `app/api/ai-coach/keys/route.ts` (validate/save/read/delete). The user's key is stored server-side in the `ai_coach_keys` table (RLS owner-CRUD), never in `localStorage` or a URL query param. Client-side `hasKey`/`model` state comes from `src/hooks/useAiCoachKey.ts`, used by `AiChat`, `PostWorkoutCoachPill`, and `Settings` — the food scanner (`features/food/services/foodRecognition.service.ts`) calls the proxy directly without the hook (no key-presence gating there, it just relies on the proxy's own `NO_KEY` error).
- Opens via `window.dispatchEvent(new CustomEvent('athlix:open-ai'))`.

### Dashboard (`/`)
- `pages/Home.tsx` — self-padded, manages its own layout.
- Widgets configured in `src/config/widgets.ts`. Layout persisted via `useDashboardLayout.ts`.
- Drag-and-drop reorder: `DashboardLayoutEditor.tsx` (`/settings/layout`).
- Components: `ThreeRingHero`, `WeeklyRing`, `MuscleMap`, `MuscleRadar`, `TrainNext`, `GoalEditSheet`.

---

## Database Schema (Supabase)

| Table | Purpose |
|-------|---------|
| `profiles` | User prefs: unit, theme, body weight, height |
| `workouts` | Workout sessions (date, duration, muscle_groups[]) |
| `exercises` | Sets within workouts (weight, reps, unit, order_index) |
| `templates` | Saved workout templates |
| `template_exercises` | Exercises in templates |
| `body_weight_logs` | Body weight history |
| `personal_records` | PR tracking per exercise |
| `exercise_library` | User's custom exercises |
| `rest_timer_preferences` | Per-exercise rest timer settings |
| `heart_rate_sessions` / `heart_rate_samples` | BLE HR monitor data |
| `user_dashboard_layout` | Widget order JSON |
| `food_scans` | Food recognition history (image_url, nutrients JSON) |
| `whoop_tokens` | WHOOP OAuth tokens (encrypted) |
| `whoop_cache` | Cached WHOOP API responses |

All tables have RLS. All user data filtered by `auth.uid() = user_id`.

---

## Key God Nodes (touch carefully)

| Node | File | Edges | Note |
|------|------|-------|------|
| `useAuth()` | `contexts/AuthContext.tsx:L147` | 60 | Every page depends on this |
| `normalizeError()` | `lib/supabaseData.ts` | 37 | Central error handler |
| `readDb()` / `writeDb()` | `lib/localData.ts` | 33/15 | Local data bridge |
| `convertWeight()` | `lib/units.ts` | 16 | Units thread everywhere |
| `ActiveWorkout()` | `components/log/ActiveWorkout.tsx` | 15 | Core workout session |
| `ExerciseEntry` | `lib/exerciseTypes.ts` | 13 | Core data shape |

---

## Conventions

- **No direct Lucide imports** in pages/components — use `AppIcon` from `src/config/icons.tsx`.
- **No extra top padding** on self-padded routes (`/`, `/calendar`, `/progress`, `/timeline`, `/skincare`).
- **Supabase client** always from `src/lib/supabase.ts`, never re-instantiate.
- **Colors**: use CSS vars (`var(--accent)`, `var(--bg-surface)`, etc.), not hardcoded hex.
- **Units**: always go through `convertWeight()` / `formatWeight()` from `src/lib/units.ts`.
- **Comments**: only when WHY is non-obvious. No docstrings.
- **New icons**: add to `src/config/icons.tsx` ICONS object before using.
- **New routes**: add to `App.tsx` routes + `navItems`/`mobileNavItems` in `Layout.tsx`.
- **Mobile nav**: max 5 items (screen width constraint).

---

## Dev Commands

```bash
npm run dev      # Start dev server
npm run build    # Production build
npm run lint     # ESLint
npx tsc --noEmit # TypeScript check (run after changes)
```

---

## Graphify Knowledge Graph

Graph of this codebase lives in `graphify-out/`. Query it for architecture questions:
```
/graphify query "how does X work"
/graphify query "what calls Y"
/graphify . --update    # after adding new files
```
Open `graphify-out/graph.html` in browser for interactive visualization.

---

## Skills Available (Superpowers)

Before any task, check:
- Feature work → `/brainstorming` first
- Bug → `/systematic-debugging`
- Implementation plan → `/writing-plans`
- About to say done → `/verification-before-completion`
- Complex build → `/subagent-driven-development`

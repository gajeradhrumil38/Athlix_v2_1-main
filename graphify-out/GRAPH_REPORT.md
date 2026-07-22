# Graph Report - .  (2026-05-31)

## Corpus Check
- 93 files · ~128,907 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 957 nodes · 1898 edges · 67 communities (53 shown, 14 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 43 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Food Feature UI|Food Feature UI]]
- [[_COMMUNITY_Heart Rate & Bluetooth|Heart Rate & Bluetooth]]
- [[_COMMUNITY_Skincare Routine|Skincare Routine]]
- [[_COMMUNITY_Supabase Data Layer|Supabase Data Layer]]
- [[_COMMUNITY_Units & Muscle Colors|Units & Muscle Colors]]
- [[_COMMUNITY_Whoop Integration|Whoop Integration]]
- [[_COMMUNITY_AI Coach Chat|AI Coach Chat]]
- [[_COMMUNITY_Supabase Auth & Data|Supabase Auth & Data]]
- [[_COMMUNITY_Dashboard Layout|Dashboard Layout]]
- [[_COMMUNITY_Workout CRUD Operations|Workout CRUD Operations]]
- [[_COMMUNITY_Dopamine Tracker|Dopamine Tracker]]
- [[_COMMUNITY_Local Data & Muscles|Local Data & Muscles]]
- [[_COMMUNITY_Exercise Input Types|Exercise Input Types]]
- [[_COMMUNITY_Food Components|Food Components]]
- [[_COMMUNITY_Exercise Media Config|Exercise Media Config]]
- [[_COMMUNITY_Workout Log UI|Workout Log UI]]
- [[_COMMUNITY_Haptics & Dial Types|Haptics & Dial Types]]
- [[_COMMUNITY_Exercise Tab Navigation|Exercise Tab Navigation]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_GPS & Run Tracking|GPS & Run Tracking]]
- [[_COMMUNITY_User Profile & Auth|User Profile & Auth]]
- [[_COMMUNITY_Rest Timer & Auth|Rest Timer & Auth]]
- [[_COMMUNITY_Local Data CRUD|Local Data CRUD]]
- [[_COMMUNITY_Home Goal & Muscle Map|Home Goal & Muscle Map]]
- [[_COMMUNITY_Auth Hooks & Templates|Auth Hooks & Templates]]
- [[_COMMUNITY_Local Exercise Library|Local Exercise Library]]
- [[_COMMUNITY_Exercise Muscle Mapping|Exercise Muscle Mapping]]
- [[_COMMUNITY_Active Run Page|Active Run Page]]
- [[_COMMUNITY_Run Map Components|Run Map Components]]
- [[_COMMUNITY_Home Muscle Visualization|Home Muscle Visualization]]
- [[_COMMUNITY_Module Group 30|Module Group 30]]
- [[_COMMUNITY_Module Group 31|Module Group 31]]
- [[_COMMUNITY_Module Group 32|Module Group 32]]
- [[_COMMUNITY_Module Group 33|Module Group 33]]
- [[_COMMUNITY_Module Group 34|Module Group 34]]
- [[_COMMUNITY_Module Group 35|Module Group 35]]
- [[_COMMUNITY_Module Group 36|Module Group 36]]
- [[_COMMUNITY_Module Group 37|Module Group 37]]
- [[_COMMUNITY_Module Group 38|Module Group 38]]
- [[_COMMUNITY_Module Group 39|Module Group 39]]
- [[_COMMUNITY_Module Group 40|Module Group 40]]
- [[_COMMUNITY_Module Group 41|Module Group 41]]
- [[_COMMUNITY_Module Group 42|Module Group 42]]
- [[_COMMUNITY_Module Group 43|Module Group 43]]
- [[_COMMUNITY_Module Group 44|Module Group 44]]
- [[_COMMUNITY_Module Group 45|Module Group 45]]
- [[_COMMUNITY_Module Group 46|Module Group 46]]
- [[_COMMUNITY_Module Group 47|Module Group 47]]
- [[_COMMUNITY_Module Group 48|Module Group 48]]
- [[_COMMUNITY_Module Group 49|Module Group 49]]
- [[_COMMUNITY_Module Group 50|Module Group 50]]
- [[_COMMUNITY_Module Group 51|Module Group 51]]
- [[_COMMUNITY_Module Group 52|Module Group 52]]
- [[_COMMUNITY_Module Group 53|Module Group 53]]
- [[_COMMUNITY_Module Group 54|Module Group 54]]
- [[_COMMUNITY_Module Group 55|Module Group 55]]
- [[_COMMUNITY_Module Group 56|Module Group 56]]
- [[_COMMUNITY_Module Group 58|Module Group 58]]
- [[_COMMUNITY_Module Group 59|Module Group 59]]
- [[_COMMUNITY_Module Group 63|Module Group 63]]
- [[_COMMUNITY_Module Group 65|Module Group 65]]
- [[_COMMUNITY_Module Group 66|Module Group 66]]

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 60 edges
2. `normalizeError()` - 37 edges
3. `readDb()` - 33 edges
4. `convertWeight()` - 16 edges
5. `ActiveWorkout()` - 15 edges
6. `writeDb()` - 15 edges
7. `compilerOptions` - 14 edges
8. `GpsPoint` - 13 edges
9. `ExerciseEntry` - 13 edges
10. `parseDateAtStartOfDay()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `ActiveRun` --semantically_similar_to--> `haptics`  [AMBIGUOUS] [semantically similar]
  src/features/running/pages/ActiveRun.tsx → src/lib/haptics.ts
- `exerciseTypes` --semantically_similar_to--> `exerciseMuscles`  [INFERRED] [semantically similar]
  src/lib/exerciseTypes.ts → src/lib/exerciseMuscles.ts
- `Settings page component` --references--> `whoop-oauth Edge Function`  [INFERRED]
  src/pages/Settings.tsx → supabase/functions/whoop-oauth/index.ts
- `WhoopCallback page component` --references--> `whoop-oauth Edge Function`  [INFERRED]
  src/pages/WhoopCallback.tsx → supabase/functions/whoop-oauth/index.ts
- `ActiveWorkout()` --references--> `CelebrationScreen()`  [INFERRED]
  src/components/log/ActiveWorkout.tsx → src/components/log/CelebrationScreen.tsx

## Import Cycles
- None detected.

## Communities (67 total, 14 thin omitted)

### Community 0 - "Food Feature UI"
Cohesion: 0.06
Nodes (45): FoodDetailModal(), Props, DEFAULT_FILTERS, Filters, FoodHistory(), Props, FoodResults(), Props (+37 more)

### Community 1 - "Heart Rate & Bluetooth"
Cohesion: 0.05
Nodes (40): BluetoothRequestOptions, getUnsupportedBluetoothMessage(), HeartRateContext, HeartRateContextType, HeartRateProvider(), HeartRateSample, isIOSBrowser(), useHeartRate() (+32 more)

### Community 2 - "Skincare Routine"
Cohesion: 0.05
Nodes (45): Action, AppState, buildEmptyWeek(), cloneDeep(), CUSTOM, DAY_LABEL, DAY_NAMES, DayData (+37 more)

### Community 3 - "Supabase Data Layer"
Cohesion: 0.06
Nodes (40): supabase (BrowserClient), convertAllUserDataUnits(), deleteWorkout(), getBodyWeightLogs(), getWorkouts(), logBodyWeight(), migrateLegacyDataIfNeeded(), saveTemplate() (+32 more)

### Community 4 - "Units & Muscle Colors"
Cohesion: 0.09
Nodes (28): MUSCLE_COLOR, muscleColor(), deleteWorkout(), convertWeight(), isWeightUnit(), roundToStep(), WeightUnit, FinishSheet() (+20 more)

### Community 5 - "Whoop Integration"
Cohesion: 0.08
Nodes (16): numAvg(), recoveryColor(), RingProps, STAT_INFO, Tab, TAB_DAYS, WhoopDashboard(), Settings() (+8 more)

### Community 6 - "AI Coach Chat"
Cohesion: 0.08
Nodes (32): AiChat(), ApiUsage, buildSystemPrompt(), calDaysSince(), ChatContent(), ChatContentProps, executeTool(), ExerciseQuickForm() (+24 more)

### Community 7 - "Supabase Auth & Data"
Cohesion: 0.09
Nodes (28): authListeners, buildDefaultExerciseLibrary(), DEFAULT_EXERCISES, detectMissingColumn(), EXERCISE_ALIASES, ExerciseSetUnit, fetchExerciseLibraryRows(), getCachedExerciseRows() (+20 more)

### Community 8 - "Dashboard Layout"
Cohesion: 0.09
Nodes (23): ALL_WIDGETS, DEFAULT_LAYOUT, WidgetConfig, LayoutItem, useDashboardLayout(), ExerciseDBItem, FALLBACK_EXERCISES, useExerciseDB() (+15 more)

### Community 9 - "Workout CRUD Operations"
Cohesion: 0.15
Nodes (28): addCustomExercise(), appendHeartRateSamples(), chunk(), convertAllUserDataUnits(), createId(), deleteDopamineEntry(), endHeartRateSession(), fetchByIds() (+20 more)

### Community 10 - "Dopamine Tracker"
Cohesion: 0.09
Nodes (15): DopamineEntry, BENEFITS_TIMELINE, COACH_MESSAGES, DopamineTracker(), DOW_FULL_MON, DOW_LABELS_MON, getCoachMessage(), getMilestone() (+7 more)

### Community 11 - "Local Data & Muscles"
Cohesion: 0.10
Nodes (23): getExerciseMuscleProfile(), attachExercises(), authListeners, DEFAULT_EXERCISES, ExerciseSetUnit, getExerciseRowsWithWorkoutDates(), getLastExerciseSession(), getRecentExerciseOptions() (+15 more)

### Community 12 - "Exercise Input Types"
Cohesion: 0.14
Nodes (19): DistanceUnit, EXACT_TYPE_MAP, formatSetValue(), getDefaultSetValues(), getFieldKinds(), getInputLabels(), getUnitDisplay(), INPUT_LABELS (+11 more)

### Community 13 - "Food Components"
Cohesion: 0.17
Nodes (21): FoodDetailModal, FoodRow, QuickAddSearch, FoodHistory, AddFoodModal, FoodResults, ServingEditor, FoodScanner (+13 more)

### Community 14 - "Exercise Media Config"
Cohesion: 0.15
Nodes (17): ExerciseImage, ENABLE_EXERCISE_SVG, env, truthy, AthlixMuscleGroup, normalizeExerciseName(), OPENTRAINING_ASSETS_BY_ID, OPENTRAINING_EXERCISES (+9 more)

### Community 15 - "Workout Log UI"
Cohesion: 0.15
Nodes (13): LocalExercise, ExerciseBlock(), ExerciseBlockProps, SetRow(), SetRowField, SetRowProps, formatLocalDate(), Log() (+5 more)

### Community 16 - "Haptics & Dial Types"
Cohesion: 0.16
Nodes (14): DialFieldKind, ExerciseInputType, exerciseTypes, getAudioContext(), haptics, runSilentPulse(), vibrate(), DialPickerState (+6 more)

### Community 17 - "Exercise Tab Navigation"
Cohesion: 0.13
Nodes (12): checkTemplateNameExists(), ExerciseTabBar(), ExerciseTabBarProps, DialState, MUSCLE_COLORS, muscleColor(), PlanExerciseCard(), PlannedExercise (+4 more)

### Community 18 - "TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowJs, esModuleInterop, isolatedModules, jsx, lib, module, moduleResolution (+9 more)

### Community 19 - "GPS & Run Tracking"
Cohesion: 0.21
Nodes (12): useGPS(), UseGPSReturn, RunSummary, useRunTracking(), UseRunTrackingReturn, calculateDistance(), calculatePace(), calculateTotalDistance() (+4 more)

### Community 20 - "User Profile & Auth"
Cohesion: 0.17
Nodes (15): emitAuthChange(), ensureProfileExists(), getAppUrl(), getProfile(), migrateLegacyDataIfNeeded(), migrationMarkerKey(), normalizeProfile(), sendPasswordResetEmail() (+7 more)

### Community 21 - "Rest Timer & Auth"
Cohesion: 0.17
Nodes (15): RestTimer, AuthContext, AuthContextType, AuthProvider(), Session, RestTimerProvider, deleteAccountLocal(), ensureSupabaseAuthInitialized() (+7 more)

### Community 22 - "Local Data CRUD"
Cohesion: 0.22
Nodes (15): appendHeartRateSamples(), createId(), deleteTemplate(), deleteWorkout(), endHeartRateSession(), logBodyWeight(), nowIso(), saveDashboardLayout() (+7 more)

### Community 23 - "Home Goal & Muscle Map"
Cohesion: 0.18
Nodes (10): GoalEditSheet(), GoalEditSheetProps, MuscleData, WeeklyRing(), WeeklyRingProps, parseDateAtStartOfDay(), parseDateValue(), getMuscleSlugLabel() (+2 more)

### Community 24 - "Auth Hooks & Templates"
Cohesion: 0.24
Nodes (12): useAuth(), buildExercisesFromWorkout(), deleteTemplate(), getTemplates(), ActiveWorkout(), ExercisePicker(), PlanTodaySheet(), fmtRelativeDate() (+4 more)

### Community 25 - "Local Exercise Library"
Cohesion: 0.15
Nodes (14): buildDefaultExerciseLibrary(), buildExercisesFromWorkout(), checkTemplateNameExists(), createInitialDb(), getBodyWeightLogs(), getDashboardLayout(), getExerciseLibraryByGroup(), getHeartRateSamples() (+6 more)

### Community 26 - "Exercise Muscle Mapping"
Cohesion: 0.19
Nodes (11): buildProfile(), deriveRegionsFromTargets(), EXERCISE_MUSCLE_PATTERNS, ExerciseMuscleProfile, ExerciseMuscleTarget, ExercisePatternProfile, FALLBACK_TARGETS_BY_GROUP, MUSCLE_SLUG_REGION_MAP (+3 more)

### Community 27 - "Active Run Page"
Cohesion: 0.14
Nodes (8): DIST_OPTIONS_KM, DIST_OPTIONS_MI, glassCardStyle, glassPillStyle, GOAL_CARDS, GoalType, PACE_OPTIONS, TIME_OPTIONS

### Community 28 - "Run Map Components"
Cohesion: 0.17
Nodes (8): currentPositionIcon, DEFAULT_CENTER, RunMap, RunMapProps, FALLBACK, RunRouteBackground(), catmullRomPath(), douglasPeucker()

### Community 29 - "Home Muscle Visualization"
Cohesion: 0.18
Nodes (8): hexAlpha(), INTENSITY_ALPHA, MuscleEntry, MuscleMapProps, SLUG_HEX, slugColor(), VALID_SLUGS, MUSCLE_SLUG_LABELS

### Community 30 - "Module Group 30"
Cohesion: 0.17
Nodes (11): getLastExerciseSets(), CORE_MUSCLES, LEG_MUSCLES, OPTIMAL_REST_DAYS, PULL_MUSCLES, PUSH_MUSCLES, Suggestion, TrainNext() (+3 more)

### Community 31 - "Module Group 31"
Cohesion: 0.21
Nodes (9): getMachineLabel(), MACHINE_LABELS, Exercise, ExercisePickerProps, ExerciseRow(), MUSCLE_CSS_VAR, MUSCLE_GROUPS, splitVariant() (+1 more)

### Community 32 - "Module Group 32"
Cohesion: 0.39
Nodes (12): RunRouteBackground, RunStats, useGPS, RunSummary, useRunTracking, ActiveRun, RunHistory, gpsCalculations (+4 more)

### Community 33 - "Module Group 33"
Cohesion: 0.18
Nodes (7): DEMO_PATH_3MI, DEMO_PATH_5MI, DEMO_RUNS, NOW, RunHistory(), RunTab, useDistanceUnit()

### Community 34 - "Module Group 34"
Cohesion: 0.26
Nodes (11): deleteRun(), deleteRunFromCloud(), getRuns(), isFiniteNumber(), loadRunsFromCloud(), mergeRuns(), normalizeRuns(), sanitizePoint() (+3 more)

### Community 35 - "Module Group 35"
Cohesion: 0.27
Nodes (9): CalendarPicker(), DAY_LABELS, formatDateInputValue(), formatElapsedTime(), MONTH_NAMES, pad2(), parseDateInputValue(), parseLocalDateTime() (+1 more)

### Community 36 - "Module Group 36"
Cohesion: 0.36
Nodes (6): fuzzyFilter(), fuzzyScore(), getTrigramSet(), tokenise(), trigramSimilarity(), searchExerciseLibrary()

### Community 37 - "Module Group 37"
Cohesion: 0.36
Nodes (8): Athlete User Persona, Athlix Brand Identity, Confirm Email CTA Button, Dark Theme Email Design, Email Confirmation Flow, Confirmation Email Template, Performance Dashboard, Supabase Auth Integration

### Community 38 - "Module Group 38"
Cohesion: 0.39
Nodes (7): callFatSecret(), CORS, hmacSha1Base64(), JSON_CT, nonce(), pct(), signedParams()

### Community 39 - "Module Group 39"
Cohesion: 0.25
Nodes (8): ActionsWidget, AnchorWidget, BreathPacer, DopamineEntry, DopamineTracker, DowBars, MomentumLine, UrgeWave

### Community 40 - "Module Group 40"
Cohesion: 0.36
Nodes (6): RunStats(), RunStatsProps, StatItemProps, ActiveRun(), formatDuration(), formatPace()

### Community 41 - "Module Group 41"
Cohesion: 0.38
Nodes (7): deleteAccountLocal(), emitAuthChange(), getCurrentUser(), sanitizeUser(), signInLocal(), signOutLocal(), signUpLocal()

### Community 42 - "Module Group 42"
Cohesion: 0.29
Nodes (5): MuscleMap(), MuscleEntry, MuscleRadar(), MuscleRadarProps, SPOKES

### Community 43 - "Module Group 43"
Cohesion: 0.40
Nodes (5): SetRow, ValueBox, WeightRepsModal, WeightRepsPicker, HapticPicker

### Community 44 - "Module Group 44"
Cohesion: 0.50
Nodes (4): updatePassword(), getStrength(), inputStyle, ResetPassword()

### Community 45 - "Module Group 45"
Cohesion: 0.60
Nodes (4): cors, json(), resolveToken(), whoopGet()

### Community 46 - "Module Group 46"
Cohesion: 0.67
Nodes (3): Ring(), RingProps, ThreeRingHero()

### Community 54 - "Module Group 54"
Cohesion: 0.67
Nodes (3): FatSecret API (external), food-scan Edge Function, food_scans table

## Ambiguous Edges - Review These
- `haptics` → `ActiveRun`  [AMBIGUOUS]
  src/features/running/pages/ActiveRun.tsx · relation: semantically_similar_to

## Knowledge Gaps
- **250 isolated node(s):** `SetEntry`, `WorkoutWithExercises`, `FUNCTION_DECLARATIONS`, `LOADING_PHASES`, `ToolResult` (+245 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **14 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `haptics` and `ActiveRun`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `useAuth()` connect `Auth Hooks & Templates` to `Food Feature UI`, `Heart Rate & Bluetooth`, `Units & Muscle Colors`, `Whoop Integration`, `AI Coach Chat`, `Dashboard Layout`, `Dopamine Tracker`, `Food Components`, `Workout Log UI`, `Exercise Tab Navigation`, `User Profile & Auth`, `Rest Timer & Auth`, `Home Goal & Muscle Map`, `Active Run Page`, `Module Group 30`, `Module Group 31`, `Module Group 33`, `Module Group 35`, `Module Group 39`, `Module Group 40`, `Module Group 44`?**
  _High betweenness centrality (0.164) - this node is a cross-community bridge._
- **Why does `haptics` connect `Haptics & Dial Types` to `Module Group 32`, `Module Group 35`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `ActiveRun` connect `Module Group 32` to `Haptics & Dial Types`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `ActiveWorkout()` (e.g. with `executeTool()` and `CelebrationScreen()`) actually correct?**
  _`ActiveWorkout()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SetEntry`, `WorkoutWithExercises`, `FUNCTION_DECLARATIONS` to the rest of the system?**
  _250 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Food Feature UI` be split into smaller, more focused modules?**
  _Cohesion score 0.060153776571687016 - nodes in this community are weakly interconnected._
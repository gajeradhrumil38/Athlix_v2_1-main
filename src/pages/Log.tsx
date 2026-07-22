import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { saveWorkout, getWorkouts, type LocalExercise } from '../lib/supabaseData';
import { resolveExerciseInputType, type ExerciseInputType } from '../lib/exerciseTypes';
import { QuickStartSheet } from '../components/log/QuickStartSheet';
import { PlanTodaySheet } from '../components/log/PlanTodaySheet';
import { ActiveWorkout } from '../components/log/ActiveWorkout';
import { FinishSheet } from '../components/log/FinishSheet';

export interface Set {
  id: string;
  weight: number | null;
  reps: number | null;
  done: boolean;
  isPR?: boolean;
  /** Target values loaded from a template / plan — shown as hint during the workout */
  planned_weight?: number | null;
  planned_reps?: number | null;
}

export interface ExerciseEntry {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  sets: Set[];
  /** true when user opts into tracking weight for a normally reps-only exercise */
  optionalWeight?: boolean;
  /** overrides name-based input type inference (e.g. reps_only for bodyweight custom exercises) */
  inputTypeOverride?: ExerciseInputType;
  lastSession?: {
    date: string;
    sets: number;
    reps: number;
    weight: number;
    totalVolume?: number;
  };
}

export interface WorkoutState {
  id?: string;
  title: string;
  startTime: number;
  startAt: string;
  endAt: string;
  elapsedSeconds: number;
  exercises: ExerciseEntry[];
  notes: string;
}

const DRAFT_KEY = 'athlix_active_workout';
const DRAFT_TTL = 8 * 60 * 60 * 1000;

const pad2 = (value: number) => value.toString().padStart(2, '0');

const toLocalDateTimeInput = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const parseDateTimeInput = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const parseDateParam = (value?: string | null) => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const readDraft = (): WorkoutState | null => {
  try {
    const rawDraft = sessionStorage.getItem(DRAFT_KEY);
    if (!rawDraft) return null;

    const parsed = JSON.parse(rawDraft) as WorkoutState;
    if (
      !parsed ||
      typeof parsed.startTime !== 'number' ||
      !Number.isFinite(parsed.startTime) ||
      !Array.isArray(parsed.exercises)
    ) {
      sessionStorage.removeItem(DRAFT_KEY);
      return null;
    }
    const age = Date.now() - parsed.startTime;

    if (age >= DRAFT_TTL) {
      sessionStorage.removeItem(DRAFT_KEY);
      return null;
    }

    const baseStartDate = new Date(parsed.startTime || Date.now());
    const startAt = parsed.startAt || toLocalDateTimeInput(baseStartDate);
    const endAt =
      parsed.endAt ||
      toLocalDateTimeInput(new Date(baseStartDate.getTime() + (parsed.elapsedSeconds || 0) * 1000));
    const startDate = parseDateTimeInput(startAt) || baseStartDate;
    const endDate = parseDateTimeInput(endAt) || startDate;
    const elapsedSeconds = Math.max(
      0,
      Math.round((endDate.getTime() - startDate.getTime()) / 1000),
      parsed.elapsedSeconds || 0,
    );

    return {
      ...parsed,
      startAt,
      endAt,
      elapsedSeconds,
    };
  } catch {
    sessionStorage.removeItem(DRAFT_KEY);
    return null;
  }
};

const writeDraft = (draft: WorkoutState) => {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage failures and let the workout continue in memory.
  }
};

const clearDraft = () => {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore storage failures during cleanup.
  }
};

export const Log: React.FC = () => {
  const { user, profile, updateProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const showStartSheet = Boolean(profile?.show_start_sheet);
  const searchParams = new URLSearchParams(location.search);
  const forceAddExercise = searchParams.get('add') === '1';
  const forcePlanToday = searchParams.get('plan') === '1';
  const forcedWorkoutDate = searchParams.get('date');
  const skipQuickStart = searchParams.get('direct') === '1';

  const [workout, setWorkout] = useState<WorkoutState | null>(null);
  const [showQuickStart, setShowQuickStart] = useState(false);
  const [showPlanToday, setShowPlanToday] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [openPickerOnStart, setOpenPickerOnStart] = useState(false);
  const [showFinish, setShowFinish] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveInFlightRef = useRef(false);
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>((profile?.unit_preference || 'lbs') as 'kg' | 'lbs');
  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(() => {
    if (typeof window === 'undefined') return 'km';
    const stored = localStorage.getItem('athlix_distance_unit');
    return stored === 'mi' ? 'mi' : 'km';
  });

  useEffect(() => {
    setWeightUnit((profile?.unit_preference || 'lbs') as 'kg' | 'lbs');
  }, [profile?.unit_preference]);

  const handleWeightUnitChange = useCallback(async (nextUnit: 'kg' | 'lbs') => {
    setWeightUnit(nextUnit);
    try {
      await updateProfile({ unit_preference: nextUnit });
    } catch {
      // keep local fallback even if remote update fails
    }
  }, [updateProfile]);

  const handleDistanceUnitChange = useCallback((nextUnit: 'km' | 'mi') => {
    setDistanceUnit(nextUnit);
    try {
      localStorage.setItem('athlix_distance_unit', nextUnit);
    } catch {
      // ignore storage failures
    }
  }, []);

  const createWorkoutState = useCallback((initialExercises: ExerciseEntry[] = [], title?: string, dateOverride?: string | null): WorkoutState => {
    const now = new Date();
    const forcedDate = parseDateParam(dateOverride);
    const baseDate = forcedDate
      ? new Date(
          forcedDate.getFullYear(),
          forcedDate.getMonth(),
          forcedDate.getDate(),
          now.getHours(),
          now.getMinutes(),
          0,
          0,
        )
      : now;
    const localNow = toLocalDateTimeInput(baseDate);
    return {
      title: title || (now.getHours() < 12 ? 'Morning Workout' : 'Evening Workout'),
      startTime: baseDate.getTime(),
      startAt: localNow,
      endAt: localNow,
      elapsedSeconds: 0,
      exercises: initialExercises,
      notes: ''
    };
  }, []);

  // Initialize flow: resume draft -> + shortcut opens picker -> optional start sheet -> direct start
  useEffect(() => {
    if (workout) return;
    let cancelled = false;

    const draft = readDraft();

    // If a specific past date is forced, only load the draft when it matches that date.
    // Prevents today's in-progress draft from hijacking a past-date edit session.
    if (draft) {
      const draftDate = formatLocalDate(
        parseDateTimeInput(draft.startAt) || new Date(draft.startTime),
      );
      const draftMatchesForcedDate = !forcedWorkoutDate || draftDate === forcedWorkoutDate;

      if (draftMatchesForcedDate) {
        setWorkout(draft);
        setShowQuickStart(false);
        // If user tapped the + FAB (?add=1) we still want the picker to open
        // even when resuming an existing draft.
        setOpenPickerOnStart(forceAddExercise);
        return;
      }
      // Draft is for a different date — ignore it, fall through.
    }

    if (forceAddExercise) {
      const initialState = createWorkoutState([], undefined, forcedWorkoutDate);
      setWorkout(initialState);
      setShowQuickStart(false);
      setOpenPickerOnStart(true);
      writeDraft(initialState);
      return;
    }

    if (forcePlanToday) {
      // Create a blank workout so closing PlanTodaySheet without starting falls back
      // to ActiveWorkout empty state instead of a black screen.
      const initialState = createWorkoutState([], undefined, forcedWorkoutDate);
      setWorkout(initialState);
      writeDraft(initialState);
      setShowPlanToday(true);
      setShowQuickStart(false);
      return;
    }

    // When a past date is forced, attempt to pre-fill from any existing saved workout.
    if (forcedWorkoutDate && user) {
      getWorkouts(user.id, {
        startDate: forcedWorkoutDate,
        endDate: forcedWorkoutDate,
        includeExercises: true,
      })
        .then((results) => {
          if (cancelled) return;
          // Merge exercises from ALL workouts on this date so home-card and edit view stay in sync
          const allSaved = results as (typeof results[0] & { exercises?: LocalExercise[] })[];
          const saved = allSaved[0];
          const savedRows = allSaved.flatMap((w) => w.exercises || []);
          const savedDistanceRow = [...savedRows]
            .sort((a, b) => a.order_index - b.order_index)
            .find((ex) => {
              const type = resolveExerciseInputType(ex.name);
              return (
                (type === 'distance_time' || type === 'distance_only') &&
                (ex.unit === 'km' || ex.unit === 'mi')
              );
            });

          if (savedDistanceRow?.unit === 'km' || savedDistanceRow?.unit === 'mi') {
            setDistanceUnit(savedDistanceRow.unit);
            try {
              localStorage.setItem('athlix_distance_unit', savedDistanceRow.unit);
            } catch {
              // ignore storage failures
            }
          }

          // Group individual set-rows (one LocalExercise = one set) back into ExerciseEntry[]
          const map = new Map<string, ExerciseEntry>();
          [...savedRows]
            .sort((a, b) => a.order_index - b.order_index)
            .forEach((ex) => {
              if (!map.has(ex.name)) {
                map.set(ex.name, {
                  id: crypto.randomUUID(),
                  name: ex.name,
                  muscleGroup: ex.muscle_group || '',
                  exercise_db_id: ex.exercise_db_id || undefined,
                  sets: [],
                });
              }
              const exInputType = resolveExerciseInputType(ex.name);
              const rawW = Number(ex.weight || 0);
              const safeWeight = exInputType === 'reps_only' ? 0
                : exInputType === 'time_only' ? Math.max(0, Math.min(120, rawW))
                : Math.max(0, Math.min(9999, rawW));
              map.get(ex.name)!.sets.push({
                id: crypto.randomUUID(),
                weight: safeWeight,
                reps: ex.reps,
                done: true,
              });
            });

          // Infer optionalWeight: only enable if exercise was intentionally saved with valid weight
          // Never trigger on corrupted values — a valid weighted set has weight in (0, 9999]
          const preloaded = Array.from(map.values()).map((entry) => {
            if (resolveExerciseInputType(entry.name) === 'reps_only') {
              const hasValidWeight = entry.sets.some((s) => Number(s.weight || 0) > 0 && Number(s.weight || 0) <= 9999);
              if (hasValidWeight) return { ...entry, optionalWeight: true };
            }
            return entry;
          });
          const state = createWorkoutState(
            preloaded,
            saved?.title ?? undefined,
            forcedWorkoutDate,
          );
          setWorkout(state);
          setShowQuickStart(false);
          // Open picker immediately so user can add more exercises right away
          setOpenPickerOnStart(preloaded.length === 0);
          writeDraft(state);
        })
        .catch(() => {
          if (cancelled) return;
          // On fetch error, fall back to an empty workout for the forced date
          const state = createWorkoutState([], undefined, forcedWorkoutDate);
          setWorkout(state);
          setShowQuickStart(false);
          setOpenPickerOnStart(true);
          writeDraft(state);
        });
      return () => { cancelled = true; };
    }

    if (showStartSheet && !skipQuickStart) {
      setShowQuickStart(true);
      setOpenPickerOnStart(false);
      return;
    }

    const initialState = createWorkoutState([], undefined, forcedWorkoutDate);
    setWorkout(initialState);
    setShowQuickStart(false);
    setOpenPickerOnStart(false);
    writeDraft(initialState);
  }, [showStartSheet, skipQuickStart, workout, createWorkoutState, forceAddExercise, forcedWorkoutDate, user]);

  // Write draft immediately when exercise count changes (covers unload / add / remove)
  const prevExCountRef = useRef<number>(-1);
  useEffect(() => {
    if (!workout) return;
    const len = workout.exercises.length;
    if (prevExCountRef.current !== len) {
      prevExCountRef.current = len;
      writeDraft(workout);
    }
  }, [workout]);

  // Also auto-save every 30s for title/notes/timer changes
  useEffect(() => {
    if (!workout) return;
    const interval = setInterval(() => { writeDraft(workout); }, 30000);
    return () => clearInterval(interval);
  }, [workout]);

  const startWorkout = useCallback((initialExercises: ExerciseEntry[] = [], title?: string) => {
    const newState = createWorkoutState(initialExercises, title, forcedWorkoutDate);
    setWorkout(newState);
    setShowQuickStart(false);
    setOpenPickerOnStart(false);
    writeDraft(newState);
  }, [createWorkoutState, forcedWorkoutDate]);

  const handleFinish = () => {
    setShowFinish(true);
  };

  const handleBackToPrevious = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  }, [navigate]);

  const handleSave = async (title: string, notes: string) => {
    if (!workout || !user || saveInFlightRef.current) return;

    const completedExercises = workout.exercises
      .map((exercise, exerciseIndex) => {
        const completedSets = exercise.sets.filter(
          (set) => set.done && (Number(set.reps || 0) > 0 || Number(set.weight || 0) > 0),
        );
        return { exercise, completedSets, exerciseIndex };
      })
      .filter(({ completedSets }) => completedSets.length > 0);

    if (completedExercises.length === 0) {
      toast.error('Complete at least one set before saving.');
      return;
    }

    const finalWorkout = { ...workout, title, notes };
    const startDate = parseDateTimeInput(finalWorkout.startAt) || new Date(finalWorkout.startTime);
    const endDate = parseDateTimeInput(finalWorkout.endAt) || new Date(startDate.getTime() + finalWorkout.elapsedSeconds * 1000);
    const elapsedFromTime = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 1000));
    const finalElapsedSeconds = elapsedFromTime > 0 ? elapsedFromTime : finalWorkout.elapsedSeconds;

    saveInFlightRef.current = true;
    setSaving(true);

    try {
      await saveWorkout(user.id, {
        title,
        date: formatLocalDate(startDate),
        duration_minutes: Math.max(1, Math.round(finalElapsedSeconds / 60)),
        notes: notes || null,
          exercises: completedExercises.map(({ exercise, completedSets, exerciseIndex }) => ({
            name: exercise.name,
            muscle_group: exercise.muscleGroup,
            exercise_db_id: exercise.exercise_db_id || null,
            order_index: exerciseIndex,
            completed_sets: completedSets.map((set) => {
              const inputType = exercise.inputTypeOverride ?? resolveExerciseInputType(exercise.name);
              const rawReps = Math.max(0, Math.round(Number(set.reps || 0)));
              const isDistanceType = inputType === 'distance_time' || inputType === 'distance_only';
              // reps_only: zero weight unless user explicitly enabled optional weighting
              const isRepsOnly = inputType === 'reps_only' && !exercise.optionalWeight;
              const rawWeight = isRepsOnly ? 0 : Math.max(0, Math.min(9999, Number(set.weight || 0)));

              return {
                reps: rawReps,
                weight: rawWeight,
                unit: isDistanceType ? distanceUnit : weightUnit,
              };
            }),
          })),
        });

      clearDraft();
      setShowFinish(false);
      setShowQuickStart(false);
      setOpenPickerOnStart(false);
      toast.success('Workout saved!', { duration: 1800 });
      navigate('/', {
        replace: true,
        state: {
          scrollTo: 'muscle_map',
          requestId: Date.now(),
        },
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to save workout.');
    } finally {
      saveInFlightRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <AnimatePresence>
        {showQuickStart && !showPlanToday && (
          <QuickStartSheet
            onStartEmpty={() => startWorkout()}
            onStartTemplate={(exercises, title) => startWorkout(exercises, title)}
            onPlanToday={() => { setEditingTemplate(null); setShowPlanToday(true); }}
            onEditTemplate={(tmpl) => { setEditingTemplate(tmpl); setShowPlanToday(true); }}
          />
        )}
        {showPlanToday && (
          <PlanTodaySheet
            onClose={() => {
              setShowPlanToday(false);
              setEditingTemplate(null);
              // If there's no active workout, restore the start sheet or go home.
              if (!workout) {
                if (showStartSheet) setShowQuickStart(true);
                else navigate(-1);
              }
            }}
            onStartPlan={(exercises, title) => {
              setShowPlanToday(false);
              setEditingTemplate(null);
              startWorkout(exercises, title);
            }}
            initialTemplate={editingTemplate ? {
              id: editingTemplate.id,
              title: editingTemplate.title,
              exercises: (editingTemplate.template_exercises || []).map((ex: any) => ({
                id: crypto.randomUUID(),
                name: ex.name,
                muscleGroup: ex.muscle_group || ex.muscleGroup || 'Core',
                exercise_db_id: ex.exercise_db_id || undefined,
                sets: Array.from({ length: ex.default_sets || 3 }).map(() => ({
                  weight: ex.default_weight || 0,
                  reps: ex.default_reps || 0,
                })),
              })),
            } : undefined}
          />
        )}
      </AnimatePresence>

      {workout && !showQuickStart && (
        <ActiveWorkout
          workout={workout}
          setWorkout={setWorkout}
          onFinish={handleFinish}
          onBackToPrevious={handleBackToPrevious}
          bodyWeight={profile?.body_weight ?? null}
          bodyWeightUnit={(profile?.body_weight_unit || 'lbs') as 'kg' | 'lbs'}
          openExercisePickerOnStart={openPickerOnStart}
          onPickerAutoOpened={() => setOpenPickerOnStart(false)}
          weightUnit={weightUnit}
          distanceUnit={distanceUnit}
          onWeightUnitChange={handleWeightUnitChange}
          onDistanceUnitChange={handleDistanceUnitChange}
          onRequestPlanToday={() => setShowPlanToday(true)}
          onEditTemplate={(tmpl) => { setEditingTemplate(tmpl); setShowPlanToday(true); }}
        />
      )}

      <AnimatePresence>
        {showFinish && workout && (
          <FinishSheet 
            workout={workout}
            weightUnit={weightUnit}
            bodyWeight={profile?.body_weight ?? null}
            bodyWeightUnit={(profile?.body_weight_unit || 'lbs') as 'kg' | 'lbs'}
            onConfirm={handleSave}
            onAddMore={() => { if (!saving) setShowFinish(false); }}
            onCancel={() => { if (!saving) setShowFinish(false); }}
            saving={saving}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

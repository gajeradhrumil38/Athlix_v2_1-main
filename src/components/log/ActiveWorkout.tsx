import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, ArrowLeft, Bookmark, BookmarkCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Pause, Pencil, Play, Plus, Tag, Timer, Trash2, Weight, X } from 'lucide-react';
import { muscleColor } from '../../lib/muscleColors';
import toast from 'react-hot-toast';
import type { WorkoutState, ExerciseEntry, Set as WorkoutSet } from '../../pages/Log';
import { ExerciseContent } from './ExerciseContent';
import { ExercisePicker } from './ExercisePicker';
import { DialPicker } from './DialPicker';
import { useAuth } from '../../contexts/AuthContext';
import { useExerciseOverrides } from '../../contexts/ExerciseOverridesContext';
import { getLastExerciseSession, saveTemplate, checkTemplateNameExists, renameExerciseEverywhere } from '../../lib/supabaseData';
import {
  DistanceUnit,
  DialFieldKind,
  ExerciseInputType,
  WeightUnit,
  getDefaultSetValues,
  getFieldKinds,
  getInputLabels,
  isSetReadyForCompletion,
  resolveEffectiveInputType,
} from '../../lib/exerciseTypes';
import { haptics } from '../../lib/haptics';
import { convertWeight } from '../../lib/units';

interface ActiveWorkoutProps {
  workout: WorkoutState;
  setWorkout: React.Dispatch<React.SetStateAction<WorkoutState | null>>;
  onFinish: () => void;
  onBackToPrevious?: () => void;
  bodyWeight?: number | null;
  bodyWeightUnit?: WeightUnit;
  openExercisePickerOnStart?: boolean;
  weightUnit?: WeightUnit;
  distanceUnit?: DistanceUnit;
  onWeightUnitChange?: (unit: WeightUnit) => void;
  onDistanceUnitChange?: (unit: DistanceUnit) => void;
  onRequestPlanToday?: () => void;
  onEditTemplate?: (template: any) => void;
  onPickerAutoOpened?: () => void;
}

interface DialPickerState {
  setId: string;
  field: 'weight' | 'reps';
  fieldKind: DialFieldKind;
  inputType: ExerciseInputType;
  title: string;
  currentValue: number;
}

const pad2 = (value: number) => value.toString().padStart(2, '0');

const parseLocalDateTime = (value?: string) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};


const toLocalDateTimeInput = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(
    date.getMinutes(),
  )}`;

const formatElapsedTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${pad2(minutes)}:${pad2(secs)}`;
  return `${pad2(minutes)}:${pad2(secs)}`;
};

const formatDateInputValue = (value?: string) => {
  const date = parseLocalDateTime(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const parseDateInputValue = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  const next = new Date(year, month - 1, day);
  if (Number.isNaN(next.getTime())) return null;
  return next;
};

const getFieldBinding = (type: ExerciseInputType) => {
  switch (type) {
    case 'reps_only':
      return { primary: 'reps' as const, secondary: null };
    case 'distance_only':
      return { primary: 'weight' as const, secondary: null };
    default:
      return { primary: 'weight' as const, secondary: 'reps' as const };
  }
};

export const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({
  workout,
  setWorkout,
  onFinish,
  onBackToPrevious,
  bodyWeight,
  bodyWeightUnit = 'lbs',
  openExercisePickerOnStart = false,
  weightUnit = 'lbs',
  distanceUnit = 'km',
  onWeightUnitChange,
  onDistanceUnitChange,
  onRequestPlanToday,
  onEditTemplate,
  onPickerAutoOpened,
}) => {
  const { user } = useAuth();
  const { overrides: typeOverrides, setOverride: persistTypeOverride } = useExerciseOverrides();
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isPaused, setIsPaused] = useState(true);
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [pickerDefaultTab, setPickerDefaultTab] = useState<'recent' | 'muscle' | 'plans'>('recent');
  const [dialPicker, setDialPicker] = useState<DialPickerState | null>(null);
  const [hiddenPrefillExerciseIds, setHiddenPrefillExerciseIds] = useState<string[]>([]);
  const autoOpenedPickerForStartRef = useRef<number | null>(null);
  const addExerciseInFlightRef = useRef(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [editingExerciseName, setEditingExerciseName] = useState(false);
  const [editingExerciseGroup, setEditingExerciseGroup] = useState(false);
  const [exerciseNameInput, setExerciseNameInput] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [loadedPlan, setLoadedPlan] = useState<{ id: string; title: string } | null>(null);
  const [pendingPlanExercises, setPendingPlanExercises] = useState<ExerciseEntry[]>([]);
  const [workoutOnlyExerciseIds, setWorkoutOnlyExerciseIds] = useState<Set<string>>(new Set());
  const [showPlanSaveOptions, setShowPlanSaveOptions] = useState(false);
  const [dupNameInput, setDupNameInput] = useState('');
  const [showDupNamePopup, setShowDupNamePopup] = useState(false);
  const loadedPlanRef = useRef<{ id: string; title: string } | null>(null);
  useEffect(() => { loadedPlanRef.current = loadedPlan; }, [loadedPlan]);

  // ── Rest timer ────────────────────────────────────────────────────────────
  const REST_DURATION = Number(localStorage.getItem('athlix_default_rest_secs') || 90);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);
  const restIntervalRef = useRef<number | null>(null);

  const startRestTimer = useCallback(() => {
    if (restIntervalRef.current) window.clearInterval(restIntervalRef.current);
    setRestSecondsLeft(REST_DURATION);
    restIntervalRef.current = window.setInterval(() => {
      setRestSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(restIntervalRef.current!);
          restIntervalRef.current = null;
          haptics.complete();
          return 0;
        }
        if (prev <= 4) haptics.tick();
        return prev - 1;
      });
    }, 1000);
  }, []);

  const stopRestTimer = useCallback(() => {
    if (restIntervalRef.current) { window.clearInterval(restIntervalRef.current); restIntervalRef.current = null; }
    setRestSecondsLeft(0);
  }, []);

  useEffect(() => () => { if (restIntervalRef.current) window.clearInterval(restIntervalRef.current); }, []);

  const GENERIC_TITLES = ['workout', 'morning workout', 'afternoon workout', 'evening workout'];

  const buildTemplateExercises = (exs: ExerciseEntry[]) =>
    exs.map((ex, i) => ({
      name: ex.name,
      muscle_group: ex.muscleGroup,
      default_sets: ex.sets.length || 3,
      default_reps: Math.round(ex.sets.reduce((s, r) => s + (r.reps ?? 0), 0) / (ex.sets.length || 1)) || 10,
      default_weight: Math.round(ex.sets.reduce((s, r) => s + (r.weight ?? 0), 0) / (ex.sets.length || 1)) || 0,
      exercise_db_id: ex.exercise_db_id ?? null,
      order_index: i,
    }));

  const doSaveNewTemplate = useCallback(async (nameOverride?: string) => {
    if (!user || workout.exercises.length === 0) return;
    const name = nameOverride ?? workout.title;
    const exists = await checkTemplateNameExists(user.id, name);
    if (exists) {
      setDupNameInput(name);
      setShowDupNamePopup(true);
      return;
    }
    setSavingTemplate(true);
    try {
      await saveTemplate(user.id, { title: name, exercises: buildTemplateExercises(workout.exercises) });
      setLoadedPlan(null);
      toast.success('Saved as plan!');
    } catch {
      toast.error('Could not save plan');
    } finally {
      setSavingTemplate(false);
    }
  }, [user, workout]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveAsTemplate = useCallback(async () => {
    if (!user || workout.exercises.length === 0) return;
    const plan = loadedPlanRef.current;
    if (plan) {
      setShowPlanSaveOptions(true);
      return;
    }
    doSaveNewTemplate();
  }, [user, workout, doSaveNewTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadPlan = useCallback((tmpl: { id: string; title: string; template_exercises: Array<{ name: string; muscle_group?: string | null; exercise_db_id?: string | null; default_sets?: number; default_reps?: number; default_weight?: number }> }) => {
    const newEntries: ExerciseEntry[] = tmpl.template_exercises.map((te) => ({
      id: createSetId(),
      name: te.name,
      muscleGroup: te.muscle_group || 'Core',
      exercise_db_id: te.exercise_db_id || undefined,
      sets: Array.from({ length: te.default_sets || 3 }, () => ({
        id: createSetId(),
        weight: te.default_weight ?? null,
        reps: te.default_reps ?? null,
        done: false,
        planned_weight: te.default_weight ?? null,
        planned_reps: te.default_reps ?? null,
      })),
    }));
    setLoadedPlan({ id: tmpl.id, title: tmpl.title });
    setPendingPlanExercises([]);
    setWorkoutOnlyExerciseIds(new Set());
    setWorkout((prev) => {
      if (!prev) return prev;
      const existing = new Set(prev.exercises.map((e) => e.name.toLowerCase()));
      const toAdd = newEntries.filter((e) => !existing.has(e.name.toLowerCase()));
      const isGeneric = GENERIC_TITLES.includes(prev.title.trim().toLowerCase());
      return { ...prev, title: isGeneric ? tmpl.title : prev.title, exercises: [...prev.exercises, ...toAdd] };
    });
    setShowExercisePicker(false);
  }, [setWorkout]); // eslint-disable-line react-hooks/exhaustive-deps

  const doUpdatePlan = useCallback(async (exs: ExerciseEntry[], plan: { id: string; title: string }) => {
    if (!user) return;
    setSavingTemplate(true);
    try {
      await saveTemplate(user.id, {
        templateId: plan.id,
        title: plan.title,
        exercises: buildTemplateExercises(exs),
      });
      toast.success('Plan updated!');
      setPendingPlanExercises([]);
    } catch {
      toast.error('Failed to update plan');
    } finally {
      setSavingTemplate(false);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePendingUpdatePlan = () => {
    const plan = loadedPlanRef.current;
    if (!plan) return;
    const planExercises = workout.exercises.filter((e) => !workoutOnlyExerciseIds.has(e.id));
    doUpdatePlan(planExercises, plan);
  };

  const handlePendingWorkoutOnly = () => {
    const pendingIds = new Set(pendingPlanExercises.map((e) => e.id));
    setWorkoutOnlyExerciseIds((prev) => new Set([...prev, ...pendingIds]));
    setPendingPlanExercises([]);
  };

  const handlePendingCancel = () => {
    const pendingIds = new Set(pendingPlanExercises.map((e) => e.id));
    setWorkout((prev) => {
      if (!prev) return prev;
      return { ...prev, exercises: prev.exercises.filter((e) => !pendingIds.has(e.id)) };
    });
    setPendingPlanExercises([]);
  };

  const createSetId = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  useEffect(() => {
    if (isPaused) return;

    const interval = window.setInterval(() => {
      setWorkout((prev) => {
        if (!prev) return null;
        const nextElapsedSeconds = prev.elapsedSeconds + 1;
        const startDate = parseLocalDateTime(prev.startAt) || new Date(prev.startTime);
        const nextEndDate = new Date(startDate.getTime() + nextElapsedSeconds * 1000);
        return {
          ...prev,
          elapsedSeconds: nextElapsedSeconds,
          endAt: toLocalDateTimeInput(nextEndDate),
        };
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isPaused, setWorkout]);

  useEffect(() => {
    if (!openExercisePickerOnStart) return;
    if (autoOpenedPickerForStartRef.current === workout.startTime) return;
    autoOpenedPickerForStartRef.current = workout.startTime;
    setShowExercisePicker(true);
    onPickerAutoOpened?.();
  }, [openExercisePickerOnStart, workout.startTime, onPickerAutoOpened]);

  useEffect(() => {
    if (workout.exercises.length > 0 && activeIndex > workout.exercises.length - 1) {
      setActiveIndex(workout.exercises.length - 1);
    }
  }, [activeIndex, workout.exercises.length]);

  const currentExercise = workout.exercises[activeIndex];

  const updateSetField = useCallback(
    (setId: string, field: 'weight' | 'reps', value: number) => {
      setWorkout((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          exercises: prev.exercises.map((exercise) => ({
            ...exercise,
            sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: value } : set)),
          })),
        };
      });
    },
    [setWorkout],
  );

  const handleOpenDial = useCallback(
    (setId: string, field: 'weight' | 'reps') => {
      const exercise = workout.exercises[activeIndex];
      if (!exercise) return;
      const set = exercise.sets.find((entry) => entry.id === setId);
      if (!set) return;

      const inputType = resolveEffectiveInputType(exercise.name, typeOverrides);
      const binding = getFieldBinding(inputType);
      const kinds = getFieldKinds(inputType);
      const labels = getInputLabels(inputType, { weightUnit, distanceUnit });

      const fieldKind = field === binding.primary ? kinds.primary : kinds.secondary;
      if (!fieldKind) return;

      const title = `Select ${field === binding.primary ? labels.primary : labels.secondary || 'Value'}`;
      const currentValue = Number(set[field] || 0);

      setDialPicker({
        setId,
        field,
        fieldKind,
        inputType,
        title,
        currentValue,
      });
    },
    [activeIndex, distanceUnit, weightUnit, workout.exercises],
  );

  const handleMarkSetDone = useCallback(
    (setId: string) => {
      const exercise = workout.exercises[activeIndex];
      if (!exercise) return;
      const set = exercise.sets.find((entry) => entry.id === setId);
      if (!set) return;

      const nextDone = !set.done;
      const inputType = resolveEffectiveInputType(exercise.name, typeOverrides);

      if (nextDone && !isSetReadyForCompletion(inputType, { weight: set.weight, reps: set.reps })) {
        haptics.error();
        toast.error('Add values before marking this set complete.');
        return;
      }

      setWorkout((prev) => {
        if (!prev) return null;

        return {
          ...prev,
          exercises: prev.exercises.map((entry, index) => {
            if (index !== activeIndex) return entry;
            return {
              ...entry,
              sets: entry.sets.map((row) => (row.id === setId ? { ...row, done: nextDone } : row)),
            };
          }),
        };
      });

      if (nextDone) {
        haptics.success();
        startRestTimer();
        const doneCount = exercise.sets.filter((entry) => entry.done || entry.id === setId).length;
        if (doneCount === exercise.sets.length) haptics.complete();
      } else {
        haptics.tick();
        stopRestTimer();
      }
    },
    [activeIndex, setWorkout, workout.exercises],
  );

  const handleAddSet = useCallback(() => {
    setWorkout((prev) => {
      if (!prev) return null;

      const activeExercise = prev.exercises[activeIndex];
      if (!activeExercise) return prev;

      if (activeExercise.sets.length >= 20) {
        haptics.error();
        toast.error('Maximum 20 sets per exercise.');
        return prev;
      }

      const previousSet = activeExercise.sets[activeExercise.sets.length - 1];
      const nextSet: WorkoutSet = {
        id: createSetId(),
        weight: previousSet?.weight ?? 0,
        reps: previousSet?.reps ?? 0,
        done: false,
      };

      const nextExercises = prev.exercises.map((exercise, index) =>
        index === activeIndex
          ? {
              ...exercise,
              sets: [...exercise.sets, nextSet],
            }
          : exercise,
      );

      haptics.tick();
      return { ...prev, exercises: nextExercises };
    });
  }, [activeIndex, setWorkout]);

  const handleCopySet = useCallback((setIndex: number) => {
    setWorkout((prev) => {
      if (!prev) return null;
      const activeExercise = prev.exercises[activeIndex];
      if (!activeExercise) return prev;
      if (activeExercise.sets.length >= 20) {
        haptics.error();
        toast.error('Maximum 20 sets per exercise.');
        return prev;
      }
      const source = activeExercise.sets[setIndex];
      if (!source) return prev;
      const copy: WorkoutSet = { id: createSetId(), weight: source.weight, reps: source.reps, done: false };
      const newSets = [...activeExercise.sets];
      newSets.splice(setIndex + 1, 0, copy);
      haptics.tick();
      return {
        ...prev,
        exercises: prev.exercises.map((ex, i) => i === activeIndex ? { ...ex, sets: newSets } : ex),
      };
    });
  }, [activeIndex, setWorkout]);

  const handleRemoveSet = useCallback((setIndex: number) => {
    setWorkout((prev) => {
      if (!prev) return null;
      const activeExercise = prev.exercises[activeIndex];
      if (!activeExercise || activeExercise.sets.length <= 1) return prev;
      haptics.tick();
      return {
        ...prev,
        exercises: prev.exercises.map((ex, i) =>
          i === activeIndex ? { ...ex, sets: ex.sets.filter((_, si) => si !== setIndex) } : ex,
        ),
      };
    });
  }, [activeIndex, setWorkout]);

  const handleAddExercise = useCallback(
    async (exerciseOption: any) => {
      if (addExerciseInFlightRef.current) return;
      addExerciseInFlightRef.current = true;

      const normalizedName = String(exerciseOption.name || '').trim().toLowerCase();
      const existingIndex = workout.exercises.findIndex(
        (entry) => entry.name.trim().toLowerCase() === normalizedName,
      );

      if (existingIndex !== -1) {
        setActiveIndex(existingIndex);
        setViewMode('detail');
        haptics.tick();
        setShowExercisePicker(false);
        addExerciseInFlightRef.current = false;
        return;
      }

      // Build exercise optimistically — use known lastSession data if available, otherwise defaults
      const knownSummary = exerciseOption.lastSession ?? null;
      // exerciseOption.inputTypeOverride is only populated when this exercise was just
      // picked with an explicit type in CreateExerciseSheet, or carries a legacy per-exercise
      // hint — use it directly (and persist it) rather than waiting on the overrides context
      // to re-render, since that would race with this synchronous add.
      const freshType = exerciseOption.inputTypeOverride as ExerciseInputType | undefined;
      const inputType = freshType ?? resolveEffectiveInputType(exerciseOption.name, typeOverrides);
      if (freshType && typeOverrides[exerciseOption.name.trim().toLowerCase()] !== freshType) {
        persistTypeOverride(exerciseOption.name, freshType);
      }
      const defaults = getDefaultSetValues(inputType);

      const makeSets = (summary: typeof knownSummary) => {
        const perSetData = summary?.perSetData;
        const totalSets = summary ? Math.max(1, Math.min(20, Number(summary.sets))) : 1;
        const seedWeight = Number(summary?.weight ?? defaults.weight);
        const seedReps = Number(summary?.reps ?? defaults.reps);
        // Apply type-aware weight clamping: reps_only → 0, time_only → 120 min max, else 9999 lbs max
        const clampW = (w: number) => {
          const v = Number(w) || 0;
          if (inputType === 'reps_only') return 0;
          if (inputType === 'time_only') return Math.max(0, Math.min(120, v));
          return Math.max(0, Math.min(9999, v));
        };
        const clampR = (r: number) => Math.max(0, Math.min(999, Number(r) || 0));
        return perSetData && perSetData.length > 0
          ? perSetData.map((s: { weight: number; reps: number }) => ({
              id: createSetId(),
              weight: clampW(s.weight),
              reps: clampR(s.reps),
              done: false,
              planned_weight: clampW(s.weight),
              planned_reps: clampR(s.reps),
            }))
          : Array.from({ length: totalSets }, () => ({
              id: createSetId(),
              weight: clampW(seedWeight),
              reps: clampR(seedReps),
              done: false,
              ...(summary ? { planned_weight: seedWeight, planned_reps: seedReps } : {}),
            }));
      };

      const exerciseId = createSetId();
      const nextExercise: ExerciseEntry = {
        id: exerciseId,
        name: exerciseOption.name,
        muscleGroup: exerciseOption.muscleGroup,
        exercise_db_id: exerciseOption.exercise_db_id,
        sets: makeSets(knownSummary),
        lastSession: knownSummary
          ? {
              date: knownSummary.date,
              sets: knownSummary.sets,
              reps: knownSummary.reps,
              weight: knownSummary.weight,
              totalVolume: knownSummary.totalVolume,
            }
          : undefined,
      };

      const nextIndex = workout.exercises.length;
      setWorkout((prev) => prev ? { ...prev, exercises: [...prev.exercises, nextExercise] } : null);

      if (loadedPlanRef.current) {
        setPendingPlanExercises((prev) => [...prev, nextExercise]);
      }

      setActiveIndex(nextIndex);
      setViewMode('detail');
      haptics.tick();

      // Close picker immediately — don't wait for DB fetch
      setShowExercisePicker(false);
      addExerciseInFlightRef.current = false;

      // Background: fetch last session when picker didn't supply it (catalog exercises)
      if (!knownSummary && user) {
        try {
          const response = await getLastExerciseSession(user.id, exerciseOption.name);
          const fetched = response?.lastSession;
          if (fetched) {
            const fetchedSets = makeSets(fetched);
            setWorkout((prev) => {
              if (!prev) return null;
              return {
                ...prev,
                exercises: prev.exercises.map((ex) => {
                  if (ex.id !== exerciseId) return ex;
                  // Only replace sets if user hasn't touched any values yet
                  const untouched = ex.sets.every((s) => !s.done && !s.weight && !s.reps);
                  return {
                    ...ex,
                    sets: untouched ? fetchedSets : ex.sets,
                    lastSession: {
                      date: fetched.date,
                      sets: fetched.sets,
                      reps: fetched.reps,
                      weight: fetched.weight,
                      totalVolume: fetched.totalVolume,
                    },
                  };
                }),
              };
            });
          }
        } catch {
          // ignore — exercise stays with defaults
        }
      }
    },
    [setWorkout, user, workout.exercises],
  );

  useEffect(() => {
    if (showExercisePicker) return;
    addExerciseInFlightRef.current = false;
  }, [showExercisePicker]);

  const handleClearPrefill = () => {
    const exercise = workout.exercises[activeIndex];
    if (!exercise) return;

    const defaults = getDefaultSetValues(resolveEffectiveInputType(exercise.name, typeOverrides));
    setWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map((entry, index) =>
          index === activeIndex
            ? {
                ...entry,
                sets: entry.sets.map((set) => ({
                  ...set,
                  weight: defaults.weight,
                  reps: defaults.reps,
                  done: false,
                })),
              }
            : entry,
        ),
      };
    });

    setHiddenPrefillExerciseIds((prev) => [...new Set([...prev, exercise.id])]);
    haptics.tick();
  };

  const handleCycleInputType = useCallback((index: number, forcedType?: ExerciseInputType) => {
    const ex = workout.exercises[index];
    if (!ex) return;

    const currentType = resolveEffectiveInputType(ex.name, typeOverrides);
    const nextType: ExerciseInputType = forcedType ?? (
      currentType === 'weight_reps' ? 'reps_only' :
      currentType === 'reps_only'   ? 'time_only' :
                                      'weight_reps'
    );

    persistTypeOverride(ex.name, nextType);

    setWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map((entry, i) => {
          if (i !== index) return entry;
          const defaults = getDefaultSetValues(nextType);
          return {
            ...entry,
            optionalWeight: false,
            sets: entry.sets.map((s) => ({ ...s, weight: defaults.weight, reps: defaults.reps, done: false })),
          };
        }),
      };
    });
    haptics.tick();
  }, [setWorkout, workout.exercises, typeOverrides, persistTypeOverride]);

  const handleRemoveExercise = useCallback((index: number) => {
    setWorkout((prev) => {
      if (!prev) return null;
      const next = prev.exercises.filter((_, i) => i !== index);
      return { ...prev, exercises: next };
    });
    // If we removed the current detail-view exercise, go back to list
    setActiveIndex((prev) => Math.min(prev, Math.max(0, workout.exercises.length - 2)));
    setViewMode('list');
    haptics.tick();
  }, [setWorkout, workout.exercises.length]);

  const handleRenameExercise = useCallback((index: number, newName: string) => {
    const oldExercise = workout?.exercises[index];
    const oldName = oldExercise?.name;
    const exerciseDbId = oldExercise?.exercise_db_id;
    setWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map((ex, i) => i === index ? { ...ex, name: newName } : ex),
      };
    });
    if (user && oldName && newName.trim() && newName.trim() !== oldName) {
      renameExerciseEverywhere(user.id, oldName, newName.trim(), exerciseDbId).catch(console.warn);
    }
    haptics.tick();
  }, [setWorkout, workout, user]);

  const handleChangeExerciseGroup = useCallback((index: number, newGroup: string) => {
    setWorkout((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        exercises: prev.exercises.map((ex, i) => i === index ? { ...ex, muscleGroup: newGroup } : ex),
      };
    });
    haptics.tick();
  }, [setWorkout]);

  const handleDialConfirm = (value: number) => {
    if (!dialPicker) return;
    updateSetField(dialPicker.setId, dialPicker.field, value);
    setDialPicker(null);
  };

  const showPrefillBanner =
    Boolean(currentExercise?.lastSession) && !hiddenPrefillExerciseIds.includes(currentExercise?.id || '');

  const workoutDateValue = useMemo(() => formatDateInputValue(workout.startAt), [workout.startAt]);

  const todayDateStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }, []);

  const fmtWorkoutDate = useCallback((dateStr: string): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = parseDateInputValue(dateStr);
    if (!d) return dateStr;
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }, []);

  const totalDone = useMemo(
    () => workout.exercises.reduce((acc, ex) => acc + ex.sets.filter((s) => s.done).length, 0),
    [workout.exercises],
  );
  const totalSets = useMemo(
    () => workout.exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
    [workout.exercises],
  );
  const isPastDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = parseDateInputValue(workoutDateValue);
    if (!d) return false;
    d.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  }, [workoutDateValue]);

  const handleWorkoutDateChange = useCallback(
    (nextDate: string) => {
      const parsedDate = parseDateInputValue(nextDate);
      if (!parsedDate) return;

      // Reset timer when logging for a different date
      setIsPaused(true);
      setWorkout((prev) => {
        if (!prev) return null;
        const existingStart = parseLocalDateTime(prev.startAt) || new Date(prev.startTime);
        const nextStart = new Date(
          parsedDate.getFullYear(),
          parsedDate.getMonth(),
          parsedDate.getDate(),
          existingStart.getHours(),
          existingStart.getMinutes(),
          existingStart.getSeconds(),
          0,
        );
        return {
          ...prev,
          startTime: nextStart.getTime(),
          startAt: toLocalDateTimeInput(nextStart),
          endAt: toLocalDateTimeInput(nextStart),
          elapsedSeconds: 0,
        };
      });
      haptics.tick();
    },
    [setWorkout],
  );

  const bodyWeightForMath = useMemo(() => {
    if (!bodyWeight || !Number.isFinite(bodyWeight) || bodyWeight <= 0) return null;
    return convertWeight(bodyWeight, bodyWeightUnit, weightUnit, 0.1);
  }, [bodyWeight, bodyWeightUnit, weightUnit]);

  const handleBackToPrevious = useCallback(() => {
    if (onBackToPrevious) {
      onBackToPrevious();
      return;
    }

    if (typeof window === 'undefined') return;

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.hash = '#/';
  }, [onBackToPrevious]);

  return (
    <div className="fixed inset-0 z-40 bg-[var(--bg-base)] overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-[920px] flex-col">

        {/* ── Nav Bar ──────────────────────────────────────────────── */}
        <div className="shrink-0 flex h-14 items-center gap-3 px-4 border-b border-white/5 bg-[var(--bg-base)]/80 backdrop-blur-xl">
          <button
            type="button"
            onClick={viewMode === 'detail' ? () => setViewMode('list') : handleBackToPrevious}
            className="inline-flex shrink-0 h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[12px] font-medium text-[var(--text-secondary)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {viewMode === 'detail' ? 'All' : 'Back'}
          </button>

          <div className="flex-1 min-w-0 text-center">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={workout.title}
                onChange={(e) => setWorkout((p) => p ? { ...p, title: e.target.value } : p)}
                onBlur={() => setEditingTitle(false)}
                onKeyDown={(e) => { if (e.key === 'Enter') { setEditingTitle(false); } }}
                className="w-full text-center text-[13px] font-semibold bg-transparent border-b outline-none leading-none pb-0.5"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--accent)' }}
                autoFocus
              />
            ) : (
              <button
                type="button"
                onClick={() => { setEditingTitle(true); setTimeout(() => titleInputRef.current?.select(), 0); }}
                className="w-full"
              >
                <p className="text-[13px] font-semibold truncate leading-none" style={{ color: 'var(--text-primary)' }}>
                  {workout.title}
                </p>
                {workout.exercises.length > 0 && (
                  <p className="text-[10px] mt-0.5 leading-none" style={{ color: 'var(--text-muted)' }}>
                    tap to rename
                  </p>
                )}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowCalendar(true)}
            className="inline-flex shrink-0 h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-[var(--bg-surface)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] cursor-pointer"
          >
            <CalendarDays className="w-3 h-3 text-[var(--text-muted)]" />
            <span>{fmtWorkoutDate(workoutDateValue)}</span>
          </button>
          <button
            type="button"
            onClick={handleSaveAsTemplate}
            disabled={savingTemplate || workout.exercises.length === 0}
            title={loadedPlan ? `Update "${loadedPlan.title}"` : 'Save as plan'}
            className="inline-flex shrink-0 h-8 items-center justify-center rounded-xl border disabled:opacity-40"
            style={loadedPlan
              ? { width: 'auto', paddingLeft: 10, paddingRight: 10, gap: 4, background: 'rgba(200,255,0,0.12)', borderColor: 'rgba(200,255,0,0.3)', color: 'var(--accent)' }
              : { width: 32, background: 'var(--bg-surface)', borderColor: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }
            }
          >
            {loadedPlan ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            {loadedPlan && <span className="text-[11px] font-bold max-w-[80px] truncate">{loadedPlan.title}</span>}
          </button>
        </div>

        {/* ── Timer Bar (visible when exercises exist) ──────────────── */}
        {workout.exercises.length > 0 && (
          <div className="shrink-0 flex items-center gap-3 px-4 border-b border-white/5" style={{ height: 48 }}>
            <span className="font-victory text-[20px] font-bold text-[var(--text-primary)] tabular-nums" style={{ letterSpacing: 1 }}>
              {formatElapsedTime(workout.elapsedSeconds)}
            </span>
            {/* Play/Pause — lime when running, surface when stopped */}
            <button
              type="button"
              onClick={() => setIsPaused((p) => !p)}
              className="flex w-7 h-7 items-center justify-center rounded-lg border-none transition-colors"
              style={{ background: 'var(--accent)', flexShrink: 0 }}
            >
              {isPaused
                ? <Play className="w-3 h-3 fill-black text-black" style={{ marginLeft: 1 }} />
                : <Pause className="w-3 h-3 fill-black text-black" />}
            </button>
            <div className="w-px h-5 bg-white/10" />
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">
              {totalDone}/{totalSets} sets done
            </span>
            {isPastDate && (
              <span className="ml-auto inline-flex h-[18px] items-center rounded px-1.5 border border-[rgba(200,255,0,0.2)] bg-[rgba(200,255,0,0.06)] text-[9px] font-semibold tracking-[0.1em] text-[var(--accent)]">
                PAST
              </span>
            )}
          </div>
        )}

        {/* ── Body ─────────────────────────────────────────────────── */}
        {viewMode === 'list' ? (
          workout.exercises.length === 0 ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
              <div className="w-14 h-14 rounded-xl border border-white/10 bg-[var(--bg-surface)] flex items-center justify-center">
                <Activity className="w-6 h-6 text-[var(--text-muted)]" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-1.5">No exercises yet</p>
                <p className="text-[13px] text-[var(--text-muted)]">Add exercises or load from your plan.</p>
              </div>
              <div className="flex flex-col gap-2.5 w-full max-w-[300px]">
                <button
                  type="button"
                  onClick={() => { setPickerDefaultTab('recent'); setShowExercisePicker(true); }}
                  className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-[15px] font-bold text-black active:scale-[0.98] transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add Exercise
                </button>
                <div className="flex gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => { setPickerDefaultTab('plans'); setShowExercisePicker(true); }}
                    className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-[var(--text-primary)] active:scale-[0.97] transition-all"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                  >
                    <Bookmark className="w-3.5 h-3.5 text-[var(--accent)]" />
                    My Plans
                  </button>
                  {onRequestPlanToday && (
                    <button
                      type="button"
                      onClick={onRequestPlanToday}
                      className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-[var(--text-primary)] active:scale-[0.97] transition-all"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                    >
                      <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
                      Create Plan
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Exercise list */
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* List header with clear-all */}
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Remove all exercises from this workout?')) {
                      setWorkout((p) => {
                        if (!p) return p;
                        const hour = new Date().getHours();
                        const genericTitle = hour < 12 ? 'Morning Workout' : 'Evening Workout';
                        return { ...p, exercises: [], title: genericTitle };
                      });
                    }
                  }}
                  className="text-[11px] font-medium transition-colors"
                  style={{ color: 'rgba(248,113,113,0.6)' }}
                >
                  Unload all
                </button>
              </div>
              <div className="flex flex-col gap-2 px-4 pb-4 pt-1">
                {workout.exercises.map((ex, i) => {
                  const doneCount = ex.sets.filter((s) => s.done).length;
                  return (
                    <div key={ex.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { setActiveIndex(i); setViewMode('detail'); }}
                        className="flex flex-1 items-center gap-3 p-3 rounded-xl border text-left transition-colors min-w-0"
                        style={{ background: 'var(--bg-surface)', borderColor: 'rgba(255,255,255,0.07)' }}
                      >
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[13px] font-bold"
                          style={{
                            background: `color-mix(in srgb, ${muscleColor(ex.muscleGroup)} 14%, var(--bg-elevated))`,
                            color: muscleColor(ex.muscleGroup),
                            border: `1px solid color-mix(in srgb, ${muscleColor(ex.muscleGroup)} 25%, transparent)`,
                          }}
                        >
                          {ex.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate leading-none mb-1">{ex.name}</p>
                          <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: muscleColor(ex.muscleGroup) }}>
                            {ex.muscleGroup || 'Exercise'} · {ex.sets.length} set{ex.sets.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        {doneCount > 0 && (
                          <span
                            className="inline-flex h-5 items-center px-1.5 rounded border text-[10px] font-semibold shrink-0"
                            style={{ background: 'rgba(200,255,0,0.1)', borderColor: 'rgba(200,255,0,0.2)', color: 'var(--accent)' }}
                          >
                            {doneCount}/{ex.sets.length}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveExercise(i)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0 transition-colors"
                        style={{ color: 'rgba(248,113,113,0.5)' }}
                        aria-label={`Remove ${ex.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}

                {/* In-list Add Exercise button */}
                <button
                  type="button"
                  onClick={() => setShowExercisePicker(true)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[12px] font-semibold transition-colors mt-1"
                  style={{ border: '1.5px dashed rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}
                >
                  <Plus className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  Add Exercise
                </button>
              </div>
            </div>
          )
        ) : (
          /* Exercise detail view */
          <AnimatePresence mode="wait" initial={false}>
            {currentExercise ? (
              <motion.div
                key={currentExercise.id}
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
              >
                {/* Exercise name header */}
                <div className="shrink-0 border-b border-white/5">
                  <div className="px-4 pt-3 pb-2">
                    {/* Row 1: muscle group (left) + type selector + delete (right) */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      {/* Muscle group — tap to change */}
                      {editingExerciseGroup ? (
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {['Chest','Back','Shoulders','Biceps','Triceps','Legs','Core','Cardio','Yoga'].map((g) => (
                            <button key={g} type="button"
                              onClick={() => { handleChangeExerciseGroup(activeIndex, g); setEditingExerciseGroup(false); }}
                              className="px-2.5 py-1 rounded-full text-[10px] font-bold transition-all active:scale-95 cursor-pointer"
                              style={{
                                background: currentExercise.muscleGroup === g ? 'rgba(200,255,0,0.15)' : 'var(--bg-elevated)',
                                border: currentExercise.muscleGroup === g ? '1.5px solid rgba(200,255,0,0.4)' : '1px solid var(--border)',
                                color: currentExercise.muscleGroup === g ? 'var(--accent)' : 'var(--text-secondary)',
                              }}
                            >{g}</button>
                          ))}
                        </div>
                      ) : (
                        <button type="button"
                          onClick={() => { setEditingExerciseGroup(true); setEditingExerciseName(false); }}
                          className="flex items-center gap-1.5 active:opacity-60 cursor-pointer"
                        >
                          <Tag className="w-3 h-3" style={{ color: muscleColor(currentExercise.muscleGroup) }} />
                          <span className="text-[10px] font-bold uppercase" style={{ letterSpacing: '0.2em', color: muscleColor(currentExercise.muscleGroup) }}>
                            {currentExercise.muscleGroup || 'Exercise'}
                          </span>
                        </button>
                      )}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* 3-way input type selector: TIME | WEIGHT | REPS */}
                        {(() => {
                          const activeType = resolveEffectiveInputType(currentExercise.name, typeOverrides);
                          const segments: { type: ExerciseInputType; icon: React.ReactNode; label: string }[] = [
                            { type: 'time_only',   icon: <Timer className="w-3 h-3" />,  label: 'Time'   },
                            { type: 'weight_reps', icon: <Weight className="w-3 h-3" />, label: 'Weight' },
                            { type: 'reps_only',   icon: <span className="text-[10px] font-black leading-none">#</span>, label: 'Reps' },
                          ];
                          return (
                            <div
                              className="flex h-8 rounded-lg overflow-hidden shrink-0"
                              style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}
                            >
                              {segments.map(({ type, icon, label }) => {
                                const isActive = activeType === type;
                                return (
                                  <button
                                    key={type}
                                    type="button"
                                    onClick={() => handleCycleInputType(activeIndex, type)}
                                    className="flex items-center gap-1 px-2.5 text-[10px] font-bold uppercase tracking-wide transition-all"
                                    style={{
                                      background: isActive ? 'rgba(200,255,0,0.14)' : 'transparent',
                                      color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                                      borderRight: '1px solid var(--border)',
                                    }}
                                    aria-label={`Switch to ${label} mode`}
                                    aria-pressed={isActive}
                                  >
                                    {icon}
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveExercise(activeIndex)}
                          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg shrink-0 transition-colors"
                          style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
                          aria-label="Remove exercise"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {/* Row 2: exercise name — full width */}
                      {editingExerciseName ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={exerciseNameInput}
                            onChange={e => setExerciseNameInput(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { const v = exerciseNameInput.trim(); if (v) handleRenameExercise(activeIndex, v); setEditingExerciseName(false); }
                              if (e.key === 'Escape') setEditingExerciseName(false);
                            }}
                            className="flex-1 h-10 rounded-xl px-3 text-[18px] font-black focus:outline-none"
                            style={{ background: 'var(--bg-elevated)', border: '1.5px solid var(--accent)', color: 'var(--text-primary)' }}
                          />
                          <button type="button"
                            onClick={() => { const v = exerciseNameInput.trim(); if (v) handleRenameExercise(activeIndex, v); setEditingExerciseName(false); }}
                            className="h-10 w-10 flex items-center justify-center rounded-xl cursor-pointer shrink-0"
                            style={{ background: 'var(--accent)', color: '#000' }}
                          ><Check className="w-4 h-4" /></button>
                        </div>
                      ) : (
                        <button type="button"
                          onClick={() => { setExerciseNameInput(currentExercise.name); setEditingExerciseName(true); setEditingExerciseGroup(false); }}
                          className="flex items-center gap-2 w-full text-left active:opacity-60 cursor-pointer"
                        >
                          <p className="text-[26px] font-black text-[var(--text-primary)] leading-[1.1] tracking-tight">
                            {currentExercise.name}
                          </p>
                          <Pencil className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                        </button>
                      )}
                  </div>
                </div>
                <ExerciseContent
                  exercise={currentExercise}
                  optionalWeight={currentExercise.optionalWeight}
                  weightUnit={weightUnit}
                  distanceUnit={distanceUnit}
                  bodyWeightForMath={bodyWeightForMath}
                  onWeightUnitChange={(unit) => onWeightUnitChange?.(unit)}
                  onDistanceUnitChange={(unit) => onDistanceUnitChange?.(unit)}
                  onUpdateSet={updateSetField}
                  onMarkSetDone={handleMarkSetDone}
                  onAddSet={handleAddSet}
                  onCopySet={handleCopySet}
                  onRemoveSet={handleRemoveSet}
                  onClearPrefill={handleClearPrefill}
                  showPrefillBanner={showPrefillBanner}
                  onOpenDial={handleOpenDial}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}

        {/* ── Rest Timer Bar ───────────────────────────────────────── */}
        <AnimatePresence>
          {restSecondsLeft > 0 && (
            <motion.div
              key="rest-timer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 px-4 pt-2 pb-1 border-t border-white/5 bg-[var(--bg-base)]/90"
            >
              <div className="flex items-center gap-3">
                <Timer className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Rest</span>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
                      {Math.floor(restSecondsLeft / 60)}:{String(restSecondsLeft % 60).padStart(2, '0')}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: 'var(--accent)' }}
                      animate={{ width: `${(restSecondsLeft / REST_DURATION) * 100}%` }}
                      transition={{ duration: 0.9, ease: 'linear' }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={stopRestTimer}
                  className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bottom Bar ───────────────────────────────────────────── */}
        <div className="shrink-0 flex px-4 py-3 border-t border-white/5 bg-[var(--bg-base)]/80 backdrop-blur-xl pb-[max(12px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => { haptics.complete(); onFinish(); }}
            className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[var(--accent)] text-[14px] font-bold text-black"
          >
            Finish Workout
          </button>
        </div>

      </div>

      <AnimatePresence>
        {showExercisePicker && (
          <ExercisePicker
            onSelect={(exercise) => { void handleAddExercise(exercise); }}
            onClose={() => setShowExercisePicker(false)}
            recentExercises={[]}
            onEditTemplate={onEditTemplate}
            onLoadPlan={handleLoadPlan}
            defaultTab={pickerDefaultTab}
            weightUnit={weightUnit}
            onLoadTemplate={(exercises, planTitle) => {
              const newEntries: ExerciseEntry[] = exercises.map((ex) => ({
                id: createSetId(),
                name: ex.name,
                muscleGroup: ex.muscleGroup,
                exercise_db_id: ex.exercise_db_id,
                sets: Array.from({ length: ex.defaultSets ?? 1 }, () => ({
                  id: createSetId(),
                  weight: ex.defaultWeight ?? null,
                  reps: ex.defaultReps ?? null,
                  done: false,
                })),
              }));
              const GENERIC_TITLES = ['workout', 'morning workout', 'afternoon workout', 'evening workout'];
              setWorkout((prev) => {
                if (!prev) return prev;
                const existing = new Set(prev.exercises.map((e) => e.name.toLowerCase()));
                const toAdd = newEntries.filter((e) => !existing.has(e.name.toLowerCase()));
                const isGeneric = GENERIC_TITLES.includes(prev.title.trim().toLowerCase());
                const newTitle = (planTitle && isGeneric) ? planTitle : prev.title;
                if (toAdd.length === 0 && newTitle === prev.title) return prev;
                return { ...prev, title: newTitle, exercises: [...prev.exercises, ...toAdd] };
              });
              setShowExercisePicker(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dialPicker && (
          <DialPicker
            title={dialPicker.title}
            fieldKind={dialPicker.fieldKind}
            inputType={dialPicker.inputType}
            initialValue={dialPicker.currentValue}
            weightUnit={weightUnit}
            distanceUnit={distanceUnit}
            onClose={() => setDialPicker(null)}
            onConfirm={handleDialConfirm}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCalendar && (
          <CalendarPicker
            value={workoutDateValue}
            maxDate={todayDateStr}
            onSelect={handleWorkoutDateChange}
            onClose={() => setShowCalendar(false)}
          />
        )}
      </AnimatePresence>

      {/* ── "Added exercise — update plan?" popup ── */}
      <AnimatePresence>
        {pendingPlanExercises.length > 0 && loadedPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] p-5 pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="w-9 h-1 rounded-full mx-auto mb-5 opacity-30" style={{ background: 'var(--text-muted)' }} />
              <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Added to workout</p>
              <p className="text-[18px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {pendingPlanExercises.length === 1 ? pendingPlanExercises[0].name : `${pendingPlanExercises.length} exercises`}
              </p>
              <p className="text-[13px] mb-6" style={{ color: 'var(--text-muted)' }}>
                Save {pendingPlanExercises.length > 1 ? 'them' : 'it'} to{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>"{loadedPlan.title}"</strong> permanently?
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handlePendingUpdatePlan}
                  disabled={savingTemplate}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {savingTemplate ? 'Saving…' : 'Update Plan'}
                </button>
                <button
                  type="button"
                  onClick={handlePendingWorkoutOnly}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  This Workout Only
                </button>
                <button
                  type="button"
                  onClick={handlePendingCancel}
                  className="w-full py-3 text-[13px] font-semibold active:opacity-70"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel (Remove {pendingPlanExercises.length > 1 ? 'them' : 'it'})
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Plan save options popup (bookmark button when plan loaded) ── */}
      <AnimatePresence>
        {showPlanSaveOptions && loadedPlan && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowPlanSaveOptions(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] p-5 pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-9 h-1 rounded-full mx-auto mb-5 opacity-30" style={{ background: 'var(--text-muted)' }} />
              <p className="text-[16px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Save plan</p>
              <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>
                Choose how to save <strong style={{ color: 'var(--text-secondary)' }}>"{loadedPlan.title}"</strong>
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPlanSaveOptions(false);
                    const plan = loadedPlanRef.current;
                    if (!plan) return;
                    const planExercises = workout.exercises.filter((e) => !workoutOnlyExerciseIds.has(e.id));
                    doUpdatePlan(planExercises, plan);
                  }}
                  disabled={savingTemplate}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  <Check className="inline w-4 h-4 mr-1.5 mb-0.5" />
                  {savingTemplate ? 'Saving…' : 'Update Plan'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowPlanSaveOptions(false); doSaveNewTemplate(); }}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  Save as New Plan
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlanSaveOptions(false)}
                  className="w-full py-3 text-[13px] font-semibold active:opacity-70"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Duplicate plan name — rename before saving ── */}
      <AnimatePresence>
        {showDupNamePopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[230] flex items-center justify-center px-5"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowDupNamePopup(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="w-full max-w-[340px] rounded-2xl p-5"
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.1)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[16px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Name already taken</p>
              <p className="text-[12px] mb-4" style={{ color: 'var(--text-muted)' }}>
                A plan called <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>"{dupNameInput}"</span> already exists. Rename it to save.
              </p>
              <input
                type="text"
                autoFocus
                value={dupNameInput}
                onChange={(e) => setDupNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && dupNameInput.trim()) {
                    setShowDupNamePopup(false);
                    doSaveNewTemplate(dupNameInput.trim());
                  }
                }}
                className="w-full px-3 py-2.5 rounded-xl text-[14px] font-semibold mb-4 focus:outline-none"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDupNamePopup(false)}
                  className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!dupNameInput.trim()}
                  onClick={() => { setShowDupNamePopup(false); doSaveNewTemplate(dupNameInput.trim()); }}
                  className="flex-1 h-11 rounded-xl text-[13px] font-bold text-black disabled:opacity-40"
                  style={{ background: 'var(--accent)' }}
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── CalendarPicker ────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_LABELS = ['M','T','W','T','F','S','S'];

const CalendarPicker: React.FC<{
  value: string;
  maxDate: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}> = ({ value, maxDate, onSelect, onClose }) => {
  const parsedSelected = parseDateInputValue(value);
  const parsedMax = parseDateInputValue(maxDate);

  const [viewYear, setViewYear] = useState(() => parsedSelected?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsedSelected?.getMonth() ?? new Date().getMonth());

  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();

  const firstDow = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isSelected = (d: number) =>
    parsedSelected?.getFullYear() === viewYear &&
    parsedSelected?.getMonth() === viewMonth &&
    parsedSelected?.getDate() === d;

  const isToday = (d: number) => todayY === viewYear && todayM === viewMonth && todayD === d;

  const isDisabled = (d: number) => {
    if (!parsedMax) return false;
    const cell = new Date(viewYear, viewMonth, d);
    cell.setHours(0, 0, 0, 0);
    const max = new Date(parsedMax);
    max.setHours(0, 0, 0, 0);
    return cell > max;
  };

  const canGoNext = !(viewYear === todayY && viewMonth === todayM);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (!canGoNext) return;
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleSelect = (d: number) => {
    if (isDisabled(d)) return;
    onSelect(`${viewYear}-${pad2(viewMonth + 1)}-${pad2(d)}`);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 24, opacity: 0, scale: 0.97 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="relative w-full max-w-sm rounded-2xl p-5 mb-[max(16px,env(safe-area-inset-bottom))]"
        style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-5">
          <button
            type="button"
            onClick={prevMonth}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[14px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            {MONTH_NAMES[viewMonth]} {viewYear}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={!canGoNext}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors"
            style={{
              background: canGoNext ? 'var(--bg-elevated)' : 'transparent',
              color: canGoNext ? 'var(--text-secondary)' : 'var(--text-muted)',
              opacity: canGoNext ? 1 : 0.3,
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day-of-week labels */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_LABELS.map((label, i) => (
            <div key={i} className="text-center text-[11px] font-semibold py-1.5" style={{ color: 'var(--text-muted)' }}>
              {label}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="h-9" />;
            const selected = isSelected(day);
            const todayCell = isToday(day);
            const disabled = isDisabled(day);
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleSelect(day)}
                disabled={disabled}
                className="relative flex items-center justify-center h-9 w-9 mx-auto rounded-xl text-[13px] transition-colors"
                style={{
                  background: selected ? 'var(--accent)' : 'transparent',
                  color: selected ? '#000' : disabled ? 'var(--text-muted)' : 'var(--text-primary)',
                  opacity: disabled ? 0.3 : 1,
                  fontWeight: selected || todayCell ? 700 : 500,
                }}
              >
                {day}
                {todayCell && !selected && (
                  <span
                    className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                    style={{ background: 'var(--accent)' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
};

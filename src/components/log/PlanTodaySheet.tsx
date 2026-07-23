import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Check, Copy, BookmarkCheck, Bookmark, ChevronDown } from 'lucide-react';
import { ExercisePicker } from './ExercisePicker';
import { DialPicker } from './DialPicker';
import { useAuth } from '../../contexts/AuthContext';
import { useExerciseOverrides } from '../../contexts/ExerciseOverridesContext';
import { saveTemplate, checkTemplateNameExists, getLastExerciseSession } from '../../lib/supabaseData';
import type { ExerciseEntry } from '../../pages/Log';
import { resolveEffectiveInputType } from '../../lib/exerciseTypes';
import toast from 'react-hot-toast';

interface PlannedSet {
  weight: number;
  reps: number;
}

interface PlannedExercise {
  id: string;
  name: string;
  muscleGroup: string;
  exercise_db_id?: string;
  sets: PlannedSet[];
}

interface DialState {
  exId: string;
  setIdx: number;
  field: 'weight' | 'reps';
}

interface PlanTodaySheetProps {
  onClose: () => void;
  onStartPlan: (exercises: ExerciseEntry[], title: string) => void;
  initialTemplate?: {
    id: string;
    title: string;
    exercises: PlannedExercise[];
  };
}

const MUSCLE_COLORS: Record<string, string> = {
  Chest: 'var(--chest)',
  Back: 'var(--back)',
  Legs: 'var(--legs)',
  Shoulders: 'var(--shoulders)',
  Core: 'var(--core)',
  Biceps: 'var(--biceps)',
  Triceps: 'var(--triceps)',
  Cardio: 'var(--cardio)',
  Glutes: '#F4B96A',
  Forearms: '#98D4E8',
};
const muscleColor = (mg: string) => MUSCLE_COLORS[mg] ?? 'var(--text-muted)';

const createId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/* ── Value box ── */
const ValueBox: React.FC<{ label: string; value: number; onTap: () => void }> = ({ label, value, onTap }) => (
  <button
    type="button"
    onClick={onTap}
    className="relative flex h-[82px] w-full flex-col items-center justify-center gap-[3px] overflow-hidden rounded-xl border text-center transition-all active:scale-[0.97]"
    style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
  >
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
    <div className="font-victory tabular-nums text-[36px] leading-none font-black text-[var(--text-primary)]">{value}</div>
    <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--text-secondary)]">{label}</div>
  </button>
);

/* ── Set separator ── */
const SetSeparator: React.FC<{ onCopy: () => void; onRemove: () => void }> = ({ onCopy, onRemove }) => (
  <div className="flex items-center gap-2 py-0.5 px-4 my-1">
    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
    <button
      type="button"
      onClick={onCopy}
      className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold active:scale-95 transition-all"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <Copy className="w-3 h-3" />
      Copy set
    </button>
    <button
      type="button"
      onClick={onRemove}
      className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-[11px] font-semibold active:scale-95 transition-all"
      style={{ background: 'rgba(248,113,113,0.06)', color: 'rgba(248,113,113,0.7)', border: '1px solid rgba(248,113,113,0.15)' }}
    >
      <X className="w-3 h-3" />
      Remove
    </button>
    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
  </div>
);

/* ── One set row ── */
const PlanSetRow: React.FC<{
  index: number;
  set: PlannedSet;
  weightUnit: string;
  onOpenDial: (field: 'weight' | 'reps') => void;
}> = ({ index, set, weightUnit, onOpenDial }) => (
  <div
    className="relative overflow-hidden rounded-2xl border mx-4"
    style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}
  >
    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--border)' }} />
    <div className="flex items-center px-4 pt-3 pb-2 pl-5">
      <div
        className="rounded-lg px-2 py-[3px] text-[10px] font-bold tracking-[0.14em] uppercase"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
      >
        Set {index}
      </div>
      {(set.weight > 0 || set.reps > 0) && (
        <span className="ml-2 text-[10px] font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
          {set.weight > 0 ? `${set.weight}${weightUnit}` : ''}
          {set.weight > 0 && set.reps > 0 ? ' × ' : ''}
          {set.reps > 0 ? `${set.reps} reps` : ''}
        </span>
      )}
    </div>
    <div className="grid grid-cols-2 gap-2 px-3 pb-3 pl-4">
      <ValueBox label={weightUnit} value={set.weight} onTap={() => onOpenDial('weight')} />
      <ValueBox label="reps" value={set.reps} onTap={() => onOpenDial('reps')} />
    </div>
  </div>
);

/* ── Exercise block ── */
const PlanExerciseCard: React.FC<{
  ex: PlannedExercise;
  weightUnit: string;
  isWorkoutOnly?: boolean;
  onChange: (updated: PlannedExercise) => void;
  onRemove: () => void;
  onOpenDial: (setIdx: number, field: 'weight' | 'reps') => void;
}> = ({ ex, weightUnit, isWorkoutOnly, onChange, onRemove, onOpenDial }) => {
  const color = muscleColor(ex.muscleGroup);
  const [confirmRemoveIdx, setConfirmRemoveIdx] = useState<number | null>(null);

  const addSet = () => {
    const last = ex.sets[ex.sets.length - 1];
    onChange({ ...ex, sets: [...ex.sets, { weight: last?.weight ?? 0, reps: last?.reps ?? 10 }] });
  };

  const copySet = (i: number) => {
    const src = ex.sets[i];
    if (!src) return;
    const next = [...ex.sets];
    next.splice(i + 1, 0, { weight: src.weight, reps: src.reps });
    onChange({ ...ex, sets: next });
  };

  const removeSet = (i: number) => {
    if (ex.sets.length <= 1) return;
    onChange({ ...ex, sets: ex.sets.filter((_, idx) => idx !== i) });
    setConfirmRemoveIdx(null);
  };

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-start justify-between px-4 pt-5 pb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[20px] font-bold text-[var(--text-primary)] leading-tight">{ex.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[1.6px]" style={{ color }}>{ex.muscleGroup}</p>
            {isWorkoutOnly && (
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(200,255,0,0.1)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.2)' }}
              >
                Session only
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 flex h-[34px] w-[34px] items-center justify-center rounded-lg shrink-0"
          style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-2 pb-2">
        {ex.sets.map((s, i) => (
          <React.Fragment key={i}>
            <PlanSetRow index={i + 1} set={s} weightUnit={weightUnit} onOpenDial={(field) => onOpenDial(i, field)} />
            <SetSeparator onCopy={() => copySet(i)} onRemove={() => setConfirmRemoveIdx(i)} />
          </React.Fragment>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 pt-1 pb-5">
        <button
          type="button"
          onClick={addSet}
          className="flex items-center gap-1.5 text-[12px] font-semibold active:opacity-70 transition-opacity"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          Add set
        </button>
        <button
          type="button"
          onClick={addSet}
          className="flex items-center gap-1 text-[12px] font-semibold active:opacity-70 transition-opacity"
          style={{ color: 'var(--accent)' }}
        >
          ↓ Repeat last
        </button>
      </div>

      {confirmRemoveIdx !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmRemoveIdx(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-[320px] rounded-2xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Remove Set {confirmRemoveIdx + 1}?</p>
            <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>This action cannot be undone.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRemoveIdx(null)}
                className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => removeSet(confirmRemoveIdx)}
                className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Main sheet ── */
export const PlanTodaySheet: React.FC<PlanTodaySheetProps> = ({ onClose, onStartPlan, initialTemplate }) => {
  const { user } = useAuth();
  const { overrides: typeOverrides } = useExerciseOverrides();
  const [title, setTitle] = useState(initialTemplate?.title ?? '');
  const [exercises, setExercises] = useState<PlannedExercise[]>(initialTemplate?.exercises ?? []);
  const [showPicker, setShowPicker] = useState(!initialTemplate);
  const [saving, setSaving] = useState(false);
  const [dialState, setDialState] = useState<DialState | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(initialTemplate?.id ?? null);
  const [isSaved, setIsSaved] = useState(!!initialTemplate?.id);

  // Tracks exercises added for this session only (not persisted to the plan)
  const [workoutOnlyIds, setWorkoutOnlyIds] = useState<Set<string>>(new Set());
  // Batch of exercises pending the "Update Plan?" popup
  const [pendingActionExercises, setPendingActionExercises] = useState<PlannedExercise[]>([]);
  // Save-options popup (Update vs Save as New) for existing saved plans
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  // Save-as-new: name input state
  const [saveAsNewName, setSaveAsNewName] = useState('');
  const [showSaveAsNewInput, setShowSaveAsNewInput] = useState(false);
  // Duplicate name: rename before save
  const [dupNameInput, setDupNameInput] = useState('');
  const [pendingDupSave, setPendingDupSave] = useState<null | { exs: PlannedExercise[]; tid: string | null; isNew: boolean }>(null);

  // Skip dirty-flag on first mount AND when we deliberately bypass it
  const isMountedRef = useRef(false);
  const skipDirtyRef = useRef(false);

  const inferPlanName = (exs: PlannedExercise[]) => {
    const muscles = new Set(exs.map((e) => e.muscleGroup));
    if (muscles.has('Chest') || muscles.has('Triceps')) return 'Push Day';
    if (muscles.has('Back') || muscles.has('Biceps')) return 'Pull Day';
    if (muscles.has('Legs') || muscles.has('Glutes')) return 'Leg Day';
    if (muscles.has('Shoulders')) return 'Shoulder Day';
    if (muscles.has('Core') || muscles.has('Cardio')) return 'Cardio Day';
    return 'My Plan';
  };
  const defaultTitle = inferPlanName(exercises);

  const seedPlannedTargets = (exerciseName: string, weight: number, reps: number) => {
    const inputType = resolveEffectiveInputType(exerciseName, typeOverrides);
    if (inputType !== 'weight_reps') {
      return { planned_weight: null, planned_reps: null };
    }
    return { planned_weight: weight, planned_reps: reps };
  };

  // Mark unsaved when content changes — but skip on first mount and when explicitly bypassed
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      return;
    }
    if (skipDirtyRef.current) {
      skipDirtyRef.current = false;
      return;
    }
    if (isSaved) setIsSaved(false);
  }, [exercises, title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exercises that count toward the saved plan (exclude session-only additions)
  const planExercises = exercises.filter((ex) => !workoutOnlyIds.has(ex.id));

  // ── Core save function (explicit params to avoid stale closures) ──────────
  const doSavePlan = useCallback(async (
    exsToSave: PlannedExercise[],
    tid: string | null,
    saveTitle: string,
    isNew = false,
  ): Promise<string | null> => {
    if (!exsToSave.length) { toast.error('Add at least one exercise'); return null; }
    if (!user) { toast.error('Sign in to save plans'); return null; }

    // Duplicate name check — only when creating a new plan (not updating existing)
    const isCreatingNew = isNew || !tid;
    if (isCreatingNew) {
      const exists = await checkTemplateNameExists(user.id, saveTitle, tid);
      if (exists) {
        setDupNameInput(saveTitle);
        setPendingDupSave({ exs: exsToSave, tid, isNew });
        return null;
      }
    }
    setSaving(true);
    try {
      const saved = await saveTemplate(user.id, {
        templateId: isNew ? null : tid,  // null = always create new
        title: saveTitle,
        exercises: exsToSave.map((ex, i) => ({
          name: ex.name,
          muscle_group: ex.muscleGroup,
          default_sets: ex.sets.length,
          default_reps: Math.max(1, Math.round(ex.sets.reduce((s, r) => s + r.reps, 0) / ex.sets.length)),
          default_weight: Math.round(ex.sets.reduce((s, r) => s + r.weight, 0) / ex.sets.length),
          exercise_db_id: ex.exercise_db_id ?? null,
          order_index: i,
        })),
      });
      const newId = saved as string | null;
      if (newId) {
        if (isNew) {
          // "Save as New" keeps the current plan editing state but links to new id
          setTemplateId(newId);
          setTitle(saveTitle);
        } else if (!tid) {
          setTemplateId(newId);
        }
      }
      setIsSaved(true);
      toast.success(isNew ? `Saved as "${saveTitle}"!` : tid ? 'Plan updated!' : 'Plan saved to My Plans!');
      return newId;
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save plan');
      return null;
    } finally {
      setSaving(false);
    }
  }, [user]);

  const handleSavePlan = () => {
    // If has existing saved plan, show options (Update vs Save as New)
    if (templateId && isSaved) {
      setShowSaveOptions(true);
      return;
    }
    doSavePlan(planExercises, templateId, title.trim() || defaultTitle);
  };

  const handleUpdateExisting = () => {
    setShowSaveOptions(false);
    doSavePlan(planExercises, templateId, title.trim() || defaultTitle);
  };

  const handleSaveAsNew = () => {
    setShowSaveOptions(false);
    setSaveAsNewName(title.trim() || defaultTitle);
    setShowSaveAsNewInput(true);
  };

  const confirmSaveAsNew = () => {
    const newName = saveAsNewName.trim() || defaultTitle;
    setShowSaveAsNewInput(false);
    setSaveAsNewName('');
    doSavePlan(planExercises, null, newName, true);
  };

  const openDial = (exId: string, setIdx: number, field: 'weight' | 'reps') => {
    setDialState({ exId, setIdx, field });
  };

  const handleDialConfirm = (value: number) => {
    if (!dialState) return;
    const { exId, setIdx, field } = dialState;
    setExercises((prev) =>
      prev.map((ex) =>
        ex.id !== exId ? ex : { ...ex, sets: ex.sets.map((s, idx) => (idx === setIdx ? { ...s, [field]: value } : s)) }
      )
    );
    setDialState(null);
  };

  const handleAddExercise = async (ex: {
    name: string;
    muscleGroup: string;
    exercise_db_id?: string;
    lastSession?: { weight: number; reps: number; sets?: number; perSetData?: Array<{ weight: number; reps: number }> };
  }) => {
    setShowPicker(false);

    let sets: PlannedSet[];
    const perSetData = ex.lastSession?.perSetData;

    if (perSetData && perSetData.length > 0) {
      sets = perSetData.map((s) => ({ weight: s.weight, reps: s.reps }));
    } else if (!ex.lastSession && user) {
      try {
        const session = await getLastExerciseSession(user.id, ex.name);
        const ls = session?.lastSession as ({ perSetData?: Array<{ weight: number; reps: number }> } & { sets: number; weight: number; reps: number }) | undefined;
        if (ls?.perSetData?.length) {
          sets = ls.perSetData.map((s: { weight: number; reps: number }) => ({ weight: s.weight, reps: s.reps }));
        } else if (ls) {
          sets = Array.from({ length: ls.sets || 3 }, () => ({ weight: ls.weight, reps: ls.reps }));
        } else {
          sets = [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 10 }];
        }
      } catch {
        sets = [{ weight: 0, reps: 10 }, { weight: 0, reps: 10 }, { weight: 0, reps: 10 }];
      }
    } else {
      const w = ex.lastSession?.weight ?? 0;
      const r = ex.lastSession?.reps ?? 10;
      const n = ex.lastSession?.sets ?? 3;
      sets = Array.from({ length: n }, () => ({ weight: w, reps: r }));
    }

    const newEx: PlannedExercise = {
      id: createId(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id,
      sets,
    };

    if (templateId && isSaved) {
      // Saved plan: batch the new exercise into pending popup
      skipDirtyRef.current = true;
      setExercises((prev) => [...prev, newEx]);
      setPendingActionExercises((prev) => [...prev, newEx]);
    } else {
      setExercises((prev) => [...prev, newEx]);
    }
  };

  const handleStart = async () => {
    if (!exercises.length) {
      toast.error('Add at least one exercise to your plan');
      return;
    }

    const planTitle = title.trim() || defaultTitle;
    setSaving(true);
    try {
      // Auto-save only when updating an existing saved plan
      if (user && templateId) {
        await saveTemplate(user.id, {
          templateId,
          title: planTitle,
          exercises: planExercises.map((ex, i) => ({
            name: ex.name,
            muscle_group: ex.muscleGroup,
            default_sets: ex.sets.length,
            default_reps: Math.max(1, Math.round(ex.sets.reduce((s, r) => s + r.reps, 0) / ex.sets.length)),
            default_weight: Math.round(ex.sets.reduce((s, r) => s + r.weight, 0) / ex.sets.length),
            exercise_db_id: ex.exercise_db_id ?? null,
            order_index: i,
          })),
        });
      }
    } catch {
      // Non-fatal — still start the workout
    } finally {
      setSaving(false);
    }

    const workoutExercises: ExerciseEntry[] = exercises.map((ex) => ({
      id: createId(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      exercise_db_id: ex.exercise_db_id,
      sets: ex.sets.map((s) => ({
        id: createId(),
        weight: s.weight || null,
        reps: s.reps || null,
        done: false,
        ...seedPlannedTargets(ex.name, s.weight || 0, s.reps || 0),
      })) as ExerciseEntry['sets'],
    }));

    onStartPlan(workoutExercises, planTitle);
  };

  // Save button label & style
  const saveLabel = isSaved
    ? 'Saved'
    : templateId
      ? 'Update'
      : 'Save';
  const saveIcon = isSaved
    ? <BookmarkCheck className="w-3.5 h-3.5" />
    : templateId
      ? <Bookmark className="w-3.5 h-3.5" />
      : <Bookmark className="w-3.5 h-3.5" />;

  // Pending popup helpers
  const pendingExNames = pendingActionExercises.map((e) => e.name);
  const pendingLabel =
    pendingExNames.length === 1
      ? pendingExNames[0]
      : `${pendingExNames.length} exercises`;

  const handlePendingUpdatePlan = async () => {
    // All pending exercises are already in `exercises` (not in workoutOnlyIds), so they'll be saved
    const currentExercises = exercises.filter((ex) => !workoutOnlyIds.has(ex.id));
    setPendingActionExercises([]);
    await doSavePlan(currentExercises, templateId, title.trim() || defaultTitle);
  };

  const handlePendingWorkoutOnly = () => {
    // Move all pending exercises to session-only
    const pendingIds = new Set(pendingActionExercises.map((e) => e.id));
    setWorkoutOnlyIds((prev: Set<string>) => new Set([...prev, ...pendingIds]));
    setPendingActionExercises([]);
    setIsSaved(true); // plan itself unchanged
  };

  const handlePendingCancel = () => {
    // Remove all pending exercises from the list
    const pendingIds = new Set(pendingActionExercises.map((e) => e.id));
    setExercises((prev) => prev.filter((e) => !pendingIds.has(e.id)));
    setPendingActionExercises([]);
    setIsSaved(true);
  };

  // Load a plan from My Plans into the editor (sets templateId so save = UPDATE not INSERT)
  const handleLoadPlan = (tmpl: { id: string; title: string; template_exercises: Array<{ name: string; muscle_group?: string | null; exercise_db_id?: string | null; default_sets?: number; default_reps?: number; default_weight?: number }> }) => {
    skipDirtyRef.current = true;
    const converted: PlannedExercise[] = tmpl.template_exercises.map((te) => ({
      id: createId(),
      name: te.name,
      muscleGroup: te.muscle_group || 'Core',
      exercise_db_id: te.exercise_db_id || undefined,
      sets: Array.from({ length: te.default_sets || 3 }, () => ({
        weight: te.default_weight || 0,
        reps: te.default_reps || 10,
      })),
    }));
    setExercises(converted);
    setTitle(tmpl.title);
    setTemplateId(tmpl.id);
    setIsSaved(true);
    setWorkoutOnlyIds(new Set());
    setPendingActionExercises([]);
    setShowPicker(false);
  };

  const dialExercise = dialState ? exercises.find((e) => e.id === dialState.exId) : null;
  const dialSet = dialExercise ? dialExercise.sets[dialState!.setIdx] : null;

  return (
    <>
      <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 220 }}
          className="w-full max-w-[480px] lg-sheet flex flex-col rounded-t-[24px]"
          style={{ height: '92%', borderTop: '1px solid rgba(255,255,255,0.13)' }}
        >
          {/* Handle + header */}
          <div className="shrink-0 px-5 pt-3 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="lg-handle" />
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaultTitle}
                  className="text-[18px] font-bold bg-transparent focus:outline-none w-full truncate"
                  style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
                />
                <p className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {exercises.length === 0
                    ? 'No exercises yet'
                    : `${exercises.length} exercise${exercises.length > 1 ? 's' : ''} · ${exercises.reduce((t, e) => t + e.sets.length, 0)} sets`}
                </p>
              </div>

              {/* Save / Update button */}
              <button
                type="button"
                onClick={handleSavePlan}
                disabled={saving || exercises.length === 0}
                title={saveLabel}
                className="flex items-center gap-1.5 h-9 px-3 shrink-0 rounded-xl active:scale-95 transition-all disabled:opacity-40"
                style={
                  isSaved
                    ? { background: 'rgba(200,255,0,0.12)', border: '1px solid rgba(200,255,0,0.3)', color: 'var(--accent)' }
                    : { background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
                }
              >
                {saveIcon}
                <span className="text-[12px] font-bold">{saveLabel}</span>
                {/* Dropdown arrow when saved — shows options on tap */}
                {isSaved && templateId && (
                  <ChevronDown className="w-3 h-3 opacity-60" />
                )}
              </button>

              {/* Close */}
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl active:scale-95 transition-transform"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Exercise list */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence initial={false}>
              {exercises.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center gap-3 text-center px-6"
                  style={{ minHeight: 220 }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  >
                    <Plus className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                  </div>
                  <p className="text-[14px] font-semibold" style={{ color: 'var(--text-secondary)' }}>No exercises yet</p>
                </motion.div>
              ) : (
                exercises.map((ex) => (
                  <motion.div
                    key={ex.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PlanExerciseCard
                      ex={ex}
                      weightUnit="lbs"
                      isWorkoutOnly={workoutOnlyIds.has(ex.id)}
                      onChange={(updated) => setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))}
                      onRemove={() => {
                        setExercises((prev) => prev.filter((e) => e.id !== ex.id));
                        setWorkoutOnlyIds((prev: Set<string>) => { const s = new Set(prev); s.delete(ex.id); return s; });
                        // If removing a pending exercise, also clear from pending
                        setPendingActionExercises((prev) => prev.filter((e) => e.id !== ex.id));
                      }}
                      onOpenDial={(setIdx, field) => openDial(ex.id, setIdx, field)}
                    />
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>

          {/* Bottom bar */}
          <div
            className="shrink-0 px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t space-y-2"
            style={{ borderColor: 'var(--border)' }}
          >
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              className="btn-glow btn-glow-subtle w-full py-3 flex items-center justify-center gap-2 text-[13px] font-semibold rounded-xl"
              style={{ color: 'var(--text-primary)' }}
            >
              <Plus className="w-4 h-4 text-[var(--accent)]" />
              Add Exercise
            </button>
            {exercises.length > 0 && (
              <button
                type="button"
                onClick={handleStart}
                disabled={saving}
                className="w-full py-4 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 transition-opacity"
                style={{ background: 'var(--accent)', opacity: saving ? 0.5 : 1 }}
              >
                {saving ? 'Saving…' : (
                  <>
                    <Check className="w-4 h-4" />
                    Start Workout
                    <span className="opacity-70 font-medium text-[12px]">
                      · {exercises.reduce((t, e) => t + e.sets.length, 0)} sets
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* ── Save options popup (Update vs Save as New) ── */}
      <AnimatePresence>
        {showSaveOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[220] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={() => setShowSaveOptions(false)}
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
              <p className="text-[16px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Save options</p>
              <p className="text-[13px] mb-5" style={{ color: 'var(--text-muted)' }}>
                Choose how to save <strong style={{ color: 'var(--text-secondary)' }}>"{title || defaultTitle}"</strong>
              </p>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleUpdateExisting}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all"
                  style={{ background: 'var(--accent)' }}
                >
                  Update Plan
                </button>
                <button
                  type="button"
                  onClick={handleSaveAsNew}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  Save as New Plan…
                </button>
                <button
                  type="button"
                  onClick={() => setShowSaveOptions(false)}
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

      {/* ── Save as New — name input popup ── */}
      <AnimatePresence>
        {showSaveAsNewInput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[230] flex items-center justify-center px-5"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowSaveAsNewInput(false)}
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
              <p className="text-[16px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>New plan name</p>
              <p className="text-[12px] mb-4" style={{ color: 'var(--text-muted)' }}>This saves a copy without changing the original.</p>
              <input
                type="text"
                autoFocus
                value={saveAsNewName}
                onChange={(e) => setSaveAsNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') confirmSaveAsNew(); }}
                placeholder={defaultTitle}
                className="w-full px-3 py-2.5 rounded-xl text-[14px] font-semibold mb-4 focus:outline-none"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  caretColor: 'var(--accent)',
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowSaveAsNewInput(false)}
                  className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSaveAsNew}
                  className="flex-1 h-11 rounded-xl text-[13px] font-bold text-black"
                  style={{ background: 'var(--accent)' }}
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── Duplicate plan name — rename before saving ── */}
        {pendingDupSave && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[230] flex items-center justify-center px-5"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={() => setPendingDupSave(null)}
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
                    const p = pendingDupSave;
                    setPendingDupSave(null);
                    doSavePlan(p.exs, p.tid, dupNameInput.trim(), p.isNew);
                  }
                }}
                className="w-full px-3 py-2.5 rounded-xl text-[14px] font-semibold mb-4 focus:outline-none"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  caretColor: 'var(--accent)',
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPendingDupSave(null)}
                  className="flex-1 h-11 rounded-xl text-[13px] font-semibold"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!dupNameInput.trim()}
                  onClick={() => {
                    const p = pendingDupSave;
                    setPendingDupSave(null);
                    doSavePlan(p.exs, p.tid, dupNameInput.trim(), p.isNew);
                  }}
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

      {/* ── "Added exercise — what to do?" popup (batched for multi-select) ── */}
      <AnimatePresence>
        {pendingActionExercises.length > 0 && (
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

              <p className="text-[13px] font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>
                Added to workout
              </p>
              <p className="text-[18px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
                {pendingLabel}
              </p>
              <p className="text-[13px] mb-6" style={{ color: 'var(--text-muted)' }}>
                Save {pendingActionExercises.length > 1 ? 'them' : 'it'} to{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>"{title || defaultTitle}"</strong> permanently?
              </p>

              <div className="space-y-2">
                {/* Update plan */}
                <button
                  type="button"
                  onClick={handlePendingUpdatePlan}
                  disabled={saving}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all disabled:opacity-50"
                  style={{ background: 'var(--accent)' }}
                >
                  {saving ? 'Saving…' : 'Update Plan'}
                </button>

                {/* This workout only */}
                <button
                  type="button"
                  onClick={handlePendingWorkoutOnly}
                  className="w-full py-3.5 rounded-xl text-[14px] font-semibold active:scale-[0.98] transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                >
                  This Workout Only
                </button>

                {/* Cancel — remove the exercises */}
                <button
                  type="button"
                  onClick={handlePendingCancel}
                  className="w-full py-3 text-[13px] font-semibold active:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel (Remove {pendingActionExercises.length > 1 ? 'them' : 'it'})
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ExercisePicker */}
      {showPicker && (
        <ExercisePicker
          onSelect={handleAddExercise}
          onClose={() => setShowPicker(false)}
          recentExercises={[]}
          multiSelect
          onLoadPlan={handleLoadPlan}
          onEditTemplate={handleLoadPlan}
        />
      )}

      {/* Dial Picker */}
      {dialState && dialSet && (
        <DialPicker
          title={dialState.field === 'weight' ? 'Weight' : 'Reps'}
          fieldKind={dialState.field}
          inputType="weight_reps"
          initialValue={dialState.field === 'weight' ? dialSet.weight : dialSet.reps}
          weightUnit="lbs"
          onClose={() => setDialState(null)}
          onConfirm={handleDialConfirm}
        />
      )}
    </>
  );
};

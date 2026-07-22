import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
  isToday as dateFnsIsToday,
} from 'date-fns';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dumbbell,
  Plus,
  Trash2,
  Copy,
  X,
  Zap,
  CalendarDays,
  LayoutGrid,
  Sun,
  Pencil,
  Check,
  Scissors,
  Search,
  LogIn,
  MoreHorizontal,
  ExternalLink,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useProgress } from '../contexts/ProgressContext';
import { deleteWorkout, getWorkouts, renameWorkout, saveWorkout, updateWorkoutSets } from '../lib/supabaseData';
import { fuzzyFilter } from '../lib/fuzzySearch';
import { OPENTRAINING_EXERCISES } from '../data/opentrainingCatalog';
import { convertWeight, isWeightUnit, type WeightUnit } from '../lib/units';
import { muscleColor } from '../lib/muscleColors';

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = 'today' | 'week' | 'month';

const MUSCLE_FILTERS = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'] as const;
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseStoredDate = (value: unknown): Date | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  if (typeof value !== 'string') return null;
  // date-only string — parse as local date to avoid UTC shift
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
};

const getExerciseCount = (w: any) =>
  new Set((w.exercises || []).map((e: any) => e.name).filter(Boolean)).size ||
  (Array.isArray(w.muscle_groups) && w.muscle_groups.length > 0 ? 1 : 0) ||
  (Number(w.duration_minutes) > 0 ? 1 : 0);

const getVolume = (w: any, unit: WeightUnit): number =>
  (w.exercises || []).reduce((s: number, ex: any) => {
    if (ex.unit && !isWeightUnit(ex.unit)) return s;
    return s + convertWeight(
      Number(ex.weight || 0),
      isWeightUnit(ex.unit) ? ex.unit : unit,
      unit, 0.1,
    ) * Number(ex.reps || 0) * Number(ex.sets || 0);
  }, 0);

const getAccent = (w: any) => muscleColor((w.muscle_groups || [])[0]);

const getExerciseNames = (w: any): string[] =>
  Array.from(new Set((w.exercises || []).map((e: any) => e.name as string).filter(Boolean)));

const isGenericTitle = (t?: string | null) => {
  if (!t) return true;
  const lower = t.trim().toLowerCase();
  return (
    ['workout','morning workout','afternoon workout','evening workout'].includes(lower) ||
    /^plan\s*[—–-]/.test(lower)
  );
};

const getDisplayTitle = (w: any) => {
  const names = getExerciseNames(w);
  if (names.length > 0 && isGenericTitle(w.title)) return names[0];
  return w.title || names[0] || 'Workout';
};

const matchesFilter = (w: any, f: string | null) => {
  if (!f || f === 'All') return true;
  const g = Array.isArray(w.muscle_groups) ? w.muscle_groups : [];
  if (f === 'Arms') return g.includes('Arms') || g.includes('Biceps') || g.includes('Triceps');
  return g.includes(f);
};

const weekStart = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
const weekEnd   = (d: Date) => endOfWeek(d,   { weekStartsOn: 1 });
const weekDaysOf = (d: Date): Date[] =>
  eachDayOfInterval({ start: weekStart(d), end: weekEnd(d) });

// ── DayRing — segmented arc ring around day number ────────────────────────────

const DayRing: React.FC<{ workouts: any[]; size: number; r: number; strokeWidth?: number }> = ({
  workouts, size, r, strokeWidth = 2.5,
}) => {
  if (workouts.length === 0) return null;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const n = workouts.length;
  // gap shrinks when many segments so they all fit
  const gapDeg = n === 1 ? 0 : Math.max(3, Math.min(10, 60 / n));
  const segDeg = n === 1 ? 359.9 : (360 - n * gapDeg) / n;
  const segLen = circ * segDeg / 360;

  return (
    <svg
      width={size}
      height={size}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', transform: 'rotate(-90deg)' }}
    >
      {workouts.map((w, i) => (
        <circle
          key={w.id}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={getAccent(w)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${segLen} ${circ - segLen}`}
          transform={`rotate(${i * (segDeg + gapDeg)}, ${cx}, ${cy})`}
        />
      ))}
    </svg>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const ExerciseChip: React.FC<{ name: string; color: string }> = ({ name, color }) => (
  <div
    className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0"
    style={{
      background: `color-mix(in srgb, ${color} 15%, var(--bg-elevated))`,
      borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
      color,
    }}
  >
    {name.charAt(0).toUpperCase()}
  </div>
);

// ── Expandable workout card (view + inline set editing) ───────────────────────

interface EditSet { weight: number; reps: number }
interface EditGroup { name: string; muscle_group?: string; exercise_db_id?: string | null; sets: EditSet[]; isCardio: boolean }

/** Group a workout's flat set-rows into per-exercise groups, weights converted to `unit`. */
const groupExerciseSets = (w: any, unit: WeightUnit): EditGroup[] => {
  const rows = [...(w.exercises || [])].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const map = new Map<string, EditGroup>();
  for (const r of rows) {
    const key = (r.name as string) || 'Exercise';
    let g = map.get(key);
    if (!g) {
      const isCardio = (r.muscle_group || '').toLowerCase() === 'cardio';
      g = { name: key, muscle_group: r.muscle_group || undefined, exercise_db_id: r.exercise_db_id || null, sets: [], isCardio };
      map.set(key, g);
    }
    const from = isWeightUnit(r.unit) ? r.unit : unit;
    const wt = convertWeight(Number(r.weight || 0), from, unit, 0.1);
    const count = Math.max(1, Number(r.sets || 1)); // expand any aggregated rows
    for (let i = 0; i < count; i++) g.sets.push({ weight: wt, reps: Number(r.reps || 0) });
  }
  return Array.from(map.values());
};


const CalValueBox: React.FC<{
  value: string; label: string; step: number;
  onMinus: () => void; onPlus: () => void;
}> = ({ value, label, step, onMinus, onPlus }) => {
  const stepLabel = `${step}`;
  return (
    <div className="relative flex h-[68px] w-full overflow-hidden rounded-xl border"
      style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />
      <button type="button" onClick={onMinus}
        className="flex h-full w-[38px] shrink-0 flex-col items-center justify-center gap-0.5 active:bg-white/[0.04] transition-colors"
        style={{ color: 'var(--text-muted)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[20px] font-light leading-none select-none">−</span>
        <span className="text-[8px] font-semibold leading-none opacity-50 select-none">{stepLabel}</span>
      </button>
      <div className="flex flex-1 flex-col items-center justify-center gap-[2px]">
        <div className="font-victory tabular-nums text-[28px] leading-none font-black" style={{ color: 'var(--text-primary)' }}>
          {value}
        </div>
        <div className="text-[9px] font-bold tracking-[0.14em] uppercase" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </div>
      </div>
      <button type="button" onClick={onPlus}
        className="flex h-full w-[38px] shrink-0 flex-col items-center justify-center gap-0.5 active:bg-white/[0.04] transition-colors"
        style={{ color: 'var(--accent)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[20px] font-light leading-none select-none">+</span>
        <span className="text-[8px] font-semibold leading-none opacity-50 select-none">{stepLabel}</span>
      </button>
    </div>
  );
};

const WorkoutCard: React.FC<{
  workout: any;
  unit: WeightUnit;
  onDelete: (id: string, title: string) => void;
  onSaved: (id: string, exercises: any[], muscleGroups: string[]) => void;
  onRenamed: (id: string, newTitle: string) => void;
  onExtracted: (newWorkout: any) => void;
  sameDayWorkouts: any[];
  onMerged: (sourceId: string, targetId: string, targetExercises: any[], targetMuscleGroups: string[]) => void;
}> = ({ workout, unit, onDelete, onSaved, onRenamed, onExtracted, sameDayWorkouts, onMerged }) => {
  const { user } = useAuth();
  const [expanded, setExpanded]         = useState(false);
  const [editing, setEditing]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [groups, setGroups]             = useState<EditGroup[]>(() => groupExerciseSets(workout, unit));
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle]     = useState('');
  const [showAddEx, setShowAddEx]       = useState(false);
  const [addExQuery, setAddExQuery]     = useState('');
  const [addExCategory, setAddExCategory] = useState<string | null>(null);
  const [extracting, setExtracting]     = useState<number | null>(null);
  const [merging, setMerging]           = useState(false);
  const [showMenu, setShowMenu]         = useState(false);

  const accent    = getAccent(workout);
  const names     = getExerciseNames(workout);
  const title     = getDisplayTitle(workout);
  const exCount   = getExerciseCount(workout);
  const dur       = Number(workout.duration_minutes || 0);
  const muscle    = (workout.muscle_groups || [])[0];
  const chips     = names.slice(0, 4);
  const extra     = names.length - chips.length;
  const planLabel = !isGenericTitle(workout.title) && workout.title !== title ? workout.title : null;
  const hasDetail = (workout.exercises || []).length > 0;

  const beginEdit = () => { setGroups(groupExerciseSets(workout, unit)); setEditing(true); setExpanded(true); };
  const cancelEdit = () => { setGroups(groupExerciseSets(workout, unit)); setEditing(false); };

  const openTitleEdit = () => {
    setDraftTitle(isGenericTitle(workout.title) ? '' : (workout.title ?? ''));
    setEditingTitle(true);
  };
  const commitTitle = async () => {
    setEditingTitle(false);
    const trimmed = draftTitle.trim();
    // Blank = user cancelled; same as stored title = no change
    if (!trimmed || trimmed === workout.title || !user) return;
    try {
      await renameWorkout(user.id, workout.id, trimmed);
      onRenamed(workout.id, trimmed);
    } catch { /* silent — UI already shows old title */ }
  };

  const updateSet = (gi: number, si: number, s: EditSet) =>
    setGroups((p) => p.map((g, i) => (i === gi ? { ...g, sets: g.sets.map((x, j) => (j === si ? s : x)) } : g)));
  const removeSet = (gi: number, si: number) =>
    setGroups((p) => p.map((g, i) => (i === gi ? { ...g, sets: g.sets.filter((_, j) => j !== si) } : g)));
  const addSet = (gi: number) =>
    setGroups((p) => p.map((g, i) => {
      if (i !== gi) return g;
      const last = g.sets[g.sets.length - 1];
      return { ...g, sets: [...g.sets, last ? { ...last } : { weight: 0, reps: 10 }] };
    }));
  const removeGroup = (gi: number) =>
    setGroups((p) => p.filter((_, i) => i !== gi));
  const copySet = (gi: number, si: number) =>
    setGroups((p) => p.map((g, i) => {
      if (i !== gi) return g;
      const copy = { ...g.sets[si] };
      const next = [...g.sets];
      next.splice(si + 1, 0, copy);
      return { ...g, sets: next };
    }));

  // Extract one exercise group into its own new workout on the same date
  const extractGroup = async (gi: number) => {
    if (!user) return;
    const g = groups[gi];
    const validSets = g.sets.filter((s) => s.reps > 0 || s.weight > 0);
    if (validSets.length === 0) { removeGroup(gi); return; }
    setExtracting(gi);
    try {
      const result = await saveWorkout(user.id, {
        title: g.name,
        date: workout.date,
        duration_minutes: 0,
        exercises: [{ name: g.name, muscle_group: g.muscle_group, exercise_db_id: g.exercise_db_id, completed_sets: validSets.map((s) => ({ reps: Math.round(s.reps), weight: s.weight, unit })) }],
      });
      onExtracted(result);
      setGroups((p) => p.filter((_, i) => i !== gi));
      toast.success(`"${g.name}" moved to its own workout`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to separate exercise');
    } finally {
      setExtracting(null);
    }
  };

  // Merge this workout's exercises into another same-day workout
  const mergeInto = async (target: any) => {
    if (!user) return;
    setMerging(true);
    try {
      const sourceGroups = groupExerciseSets(workout, unit);
      const targetGroups = groupExerciseSets(target, unit);
      const combined = [...targetGroups, ...sourceGroups];
      const api = combined.map((g) => ({
        name: g.name,
        muscle_group: g.muscle_group,
        exercise_db_id: g.exercise_db_id,
        completed_sets: g.sets.map((s) => ({ reps: Math.round(s.reps) || 0, weight: s.weight || 0, unit })),
      }));
      const res = await updateWorkoutSets(user.id, target.id, api);
      await deleteWorkout(user.id, workout.id);
      onMerged(workout.id, target.id, res.exercises, res.muscle_groups);
      toast.success(`Merged into "${getDisplayTitle(target)}"`);
    } catch (err: any) {
      toast.error(err?.message || 'Merge failed');
    } finally {
      setMerging(false);
      setShowMenu(false);
    }
  };

  // Add an exercise from the catalog as a new group
  const addExerciseToGroups = (name: string, muscleGroup?: string) => {
    setGroups((p) => [...p, { name, muscle_group: muscleGroup, exercise_db_id: null, sets: [{ weight: 0, reps: 10 }], isCardio: false }]);
    setShowAddEx(false);
    setAddExQuery('');
    setAddExCategory(null);
  };

  // Fuzzy-search results from catalog, filtered by category if set
  const addExResults = useMemo(() => {
    const hasQuery = addExQuery.trim().length > 0;
    let pool = hasQuery
      ? fuzzyFilter(OPENTRAINING_EXERCISES, addExQuery, (e) => e.name)
      : OPENTRAINING_EXERCISES;
    if (addExCategory) pool = pool.filter((e) => e.muscleGroup === addExCategory);
    if (!hasQuery && !addExCategory) return [];
    return pool.slice(0, 8);
  }, [addExQuery, addExCategory]);

  const save = async () => {
    if (!user) return;
    const api = groups
      .map((g) => ({
        name: g.name,
        muscle_group: g.muscle_group,
        exercise_db_id: g.exercise_db_id,
        completed_sets: g.sets.map((s) => ({ reps: Math.round(s.reps) || 0, weight: s.weight || 0, unit })),
      }))
      .filter((g) => g.completed_sets.some((s) => s.reps > 0 || s.weight > 0));
    if (api.length === 0) { toast.error('Keep at least one set, or delete the workout.'); return; }
    setSaving(true);
    try {
      const res = await updateWorkoutSets(user.id, workout.id, api);
      onSaved(workout.id, res.exercises, res.muscle_groups);
      setEditing(false);
      toast.success('Workout updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const savedGroups = useMemo(() => groupExerciseSets(workout, unit), [workout, unit]);
  const viewGroups  = editing ? groups : savedGroups;

  return (
    <motion.div
      key={workout.id}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="relative overflow-hidden rounded-2xl"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
    >
      <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl" style={{ backgroundColor: accent }} />

      {/* Header — tap to expand (div, not button: it contains a delete button + Details link) */}
      <div
        role="button"
        tabIndex={hasDetail ? 0 : -1}
        onClick={() => { if (editing) return; if (hasDetail) setExpanded((e) => !e); }}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && hasDetail && !editing) { e.preventDefault(); setExpanded((v) => !v); } }}
        className="w-full text-left pl-4 pr-3 py-3"
        style={{ cursor: hasDetail && !editing ? 'pointer' : 'default' }}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <input
                autoFocus
                value={draftTitle}
                placeholder={title}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.currentTarget.blur(); } else if (e.key === 'Escape') { setEditingTitle(false); } }}
                onClick={(e) => e.stopPropagation()}
                className="w-full text-[15px] font-bold leading-snug rounded-lg px-2 py-0.5 focus:outline-none"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
              />
            ) : (
              <p className="text-[15px] font-bold leading-snug truncate" style={{ color: 'var(--text-primary)' }}>{title}</p>
            )}
            {muscle && <p className="text-[11px] font-medium mt-0.5" style={{ color: accent }}>{muscle}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              className="h-7 w-7 flex items-center justify-center rounded-lg active:scale-95 transition-all"
              style={{
                background: showMenu ? 'var(--bg-surface)' : 'transparent',
                color: showMenu ? 'var(--text-primary)' : 'var(--text-muted)',
                border: showMenu ? '1px solid var(--border)' : '1px solid transparent',
              }}
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {hasDetail && (
              <button
                onClick={() => { if (!editing) setExpanded((e) => !e); }}
                className="h-7 w-7 flex items-center justify-center rounded-lg active:scale-95 transition-all"
                style={{ background: 'transparent', color: 'var(--text-muted)' }}
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                <ChevronDown
                  className="h-4 w-4 transition-transform"
                  style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
                />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <Clock3 className="h-3 w-3 shrink-0" />
            <span>{dur > 0 ? `${dur} min` : `${exCount} ex`}</span>
            {planLabel && (
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold truncate max-w-[120px]"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {planLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <div className="flex -space-x-1.5">
              {chips.map((n) => <ExerciseChip key={n} name={n} color={accent} />)}
            </div>
            {extra > 0 && <span className="ml-1 text-[10px] font-semibold" style={{ color: 'var(--text-muted)' }}>+{extra}</span>}
          </div>
        </div>
      </div>

      {/* ⋯ actions menu */}
      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            style={{ overflow: 'hidden', borderTop: '1px solid var(--border)' }}
          >
            <div className="px-3 py-2 space-y-0.5">

              {/* Rename */}
              <button
                onClick={() => { setShowMenu(false); openTitleEdit(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-white/[0.04] transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Pencil className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Rename workout</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Change the title of this session</p>
                </div>
              </button>

              {/* Edit exercises */}
              {hasDetail && (
                <button
                  onClick={() => { setShowMenu(false); beginEdit(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <Dumbbell className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Edit exercises</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Adjust sets, reps, weight · separate or remove</p>
                  </div>
                </button>
              )}

              {/* Merge into same-day workouts */}
              {sameDayWorkouts.map((target) => (
                <button
                  key={target.id}
                  onClick={() => mergeInto(target)}
                  disabled={merging}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-white/[0.04] transition-colors text-left disabled:opacity-50"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[12px] font-black"
                    style={{ background: `color-mix(in srgb, ${getAccent(target)} 14%, var(--bg-elevated))`, color: getAccent(target) }}
                  >
                    {getDisplayTitle(target).charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                      {merging ? 'Merging…' : `Merge into "${getDisplayTitle(target)}"`}
                    </p>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Move all exercises · {getExerciseCount(target)} exercise{getExerciseCount(target) !== 1 ? 's' : ''} already there
                    </p>
                  </div>
                  <LogIn className="w-3.5 h-3.5 shrink-0" style={{ color: '#60a5fa' }} />
                </button>
              ))}

              {/* View details */}
              <Link
                to="/timeline"
                onClick={() => setShowMenu(false)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-white/[0.04] transition-colors"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <ExternalLink className="w-3.5 h-3.5" style={{ color: 'var(--text-secondary)' }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>View details</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Full workout history timeline</p>
                </div>
              </Link>

              {/* Delete */}
              <button
                onClick={() => { setShowMenu(false); onDelete(workout.id, workout.title); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl active:bg-white/[0.04] transition-colors text-left"
              >
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(255,59,48,0.08)' }}>
                  <Trash2 className="w-3.5 h-3.5" style={{ color: 'rgba(255,80,65,0.85)' }} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: 'rgba(255,80,65,0.9)' }}>Delete workout</p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Permanently remove this session</p>
                </div>
              </button>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded — exercises with sets */}
      <AnimatePresence initial={false}>
        {expanded && hasDetail && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
              {/* Edit toggle */}
              <div className="flex items-center justify-between py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>
                  {viewGroups.length} exercise{viewGroups.length !== 1 ? 's' : ''}
                </p>
                {!editing ? (
                  <button onClick={beginEdit}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-semibold active:scale-95 transition-all"
                    style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button onClick={cancelEdit}
                      className="h-7 px-2.5 rounded-lg text-[11px] font-semibold active:scale-95 transition-all"
                      style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      Cancel
                    </button>
                    <button onClick={save} disabled={saving}
                      className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-bold active:scale-95 transition-all disabled:opacity-50"
                      style={{ background: 'var(--accent)', color: '#000' }}>
                      <Check className="w-3 h-3" /> {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {/* Exercise groups */}
              <div className="space-y-3">
                {viewGroups.map((g, gi) => {
                  const exColor = muscleColor(g.muscle_group ?? '');
                  return (
                    <div key={`${g.name}-${gi}`} className="rounded-[14px] overflow-hidden"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>

                      {/* Exercise header — multi-exercise always; single exercise only in edit mode */}
                      {(viewGroups.length > 1 || editing) && (
                        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                          <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center text-[14px] font-black shrink-0"
                            style={{ background: `color-mix(in srgb, ${exColor} 14%, var(--bg-elevated))`, color: exColor }}>
                            {g.name.charAt(0)}
                          </div>
                          <p className="flex-1 text-[15px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{g.name}</p>
                          {editing ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => extractGroup(gi)}
                                disabled={extracting === gi}
                                className="h-7 px-2 flex items-center gap-1 rounded-lg active:scale-90 transition-transform text-[10px] font-bold"
                                style={{ background: 'rgba(96,165,250,0.10)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.25)' }}
                                title="Move to its own workout">
                                <Scissors className="w-3 h-3" />
                                <span>{extracting === gi ? '…' : 'Separate'}</span>
                              </button>
                              <button
                                onClick={() => removeGroup(gi)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg active:scale-90 transition-transform"
                                style={{ background: 'rgba(255,59,48,0.08)', color: 'rgba(255,80,65,0.85)' }}
                                aria-label="Remove exercise">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[12px] font-semibold shrink-0" style={{ color: 'var(--text-secondary)' }}>
                              {g.sets.length} set{g.sets.length !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      )}

                      {editing ? (
                        /* Edit mode — ValueBox cards matching the workout logger's SetRow style */
                        <div className="px-2 py-3 space-y-4">
                          {g.sets.map((s, si) => {
                            const weightStep = unit === 'kg' ? 1.25 : 2.5;
                            const weightDisplay = s.weight.toLocaleString(undefined, { maximumFractionDigits: 1 });
                            return (
                              <div key={si} className="space-y-2">
                                {/* Set badge */}
                                <span className="inline-block text-[10px] font-bold rounded-md px-2 py-0.5"
                                  style={{ background: 'rgba(200,255,0,0.08)', color: '#C8FF00', border: '1px solid rgba(200,255,0,0.2)' }}>
                                  Set {si + 1}
                                </span>
                                {/* Value boxes */}
                                <div className="grid grid-cols-2 gap-2">
                                  {!g.isCardio && (
                                    <CalValueBox
                                      value={weightDisplay} label={unit} step={weightStep}
                                      onMinus={() => updateSet(gi, si, { ...s, weight: Math.max(0, Math.round((s.weight - weightStep) * 10) / 10) })}
                                      onPlus={() => updateSet(gi, si, { ...s, weight: Math.round((s.weight + weightStep) * 10) / 10 })}
                                    />
                                  )}
                                  <CalValueBox
                                    value={String(s.reps)} label="reps" step={1}
                                    onMinus={() => updateSet(gi, si, { ...s, reps: Math.max(0, s.reps - 1) })}
                                    onPlus={() => updateSet(gi, si, { ...s, reps: s.reps + 1 })}
                                  />
                                </div>
                                {/* Set actions */}
                                <div className="flex gap-2">
                                  <button onClick={() => copySet(gi, si)}
                                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[11px] font-semibold active:scale-95 transition-transform"
                                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                                    <Copy className="w-3 h-3" /> Copy set
                                  </button>
                                  <button onClick={() => removeSet(gi, si)}
                                    className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[11px] font-semibold active:scale-95 transition-transform"
                                    style={{ background: 'rgba(255,59,48,0.08)', color: 'rgba(255,80,65,0.9)' }}>
                                    <X className="w-3 h-3" /> Remove
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          <button onClick={() => addSet(gi)}
                            className="w-full py-2 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px dashed var(--border)' }}>
                            <Plus className="w-3 h-3" /> Add set
                          </button>
                        </div>
                      ) : (
                        /* View mode — 3-col grid with lime set numbers */
                        <div className="flex flex-col gap-2.5 p-3">
                          {g.sets.map((s, si) => (
                            <div key={si} className="grid overflow-hidden rounded-[12px]"
                              style={{ gridTemplateColumns: '44px 1fr 1fr', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.012)' }}>
                              <div className="flex items-center justify-center font-victory text-[26px]"
                                style={{ background: 'rgba(200,255,0,0.05)', color: '#C8FF00', borderRight: '1px solid var(--border)' }}>
                                {si + 1}
                              </div>
                              <div className="flex flex-col items-center justify-center gap-0.5 py-3 px-2">
                                <span className="font-victory text-[32px] leading-none text-white tabular-nums">
                                  {g.isCardio ? '—' : s.weight.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                </span>
                                <span className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>
                                  {g.isCardio ? '' : unit}
                                </span>
                              </div>
                              <div className="flex flex-col items-center justify-center gap-0.5 py-3 px-2"
                                style={{ borderLeft: '1px solid var(--border)' }}>
                                <span className="font-victory text-[32px] leading-none text-white tabular-nums">{s.reps}</span>
                                <span className="text-[9px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--text-muted)' }}>reps</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add exercise (edit mode only) */}
              {editing && (
                <div className="mt-3">
                  {!showAddEx ? (
                    <button
                      onClick={() => setShowAddEx(true)}
                      className="w-full py-2.5 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px dashed var(--border)' }}>
                      <Plus className="w-3.5 h-3.5" /> Add exercise
                    </button>
                  ) : (
                    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
                      {/* Search row */}
                      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                        <Search className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
                        <input
                          autoFocus
                          value={addExQuery}
                          onChange={(e) => setAddExQuery(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder="Search exercises…"
                          className="flex-1 text-[13px] bg-transparent focus:outline-none"
                          style={{ color: 'var(--text-primary)', caretColor: 'var(--accent)' }}
                        />
                        <button onClick={() => { setShowAddEx(false); setAddExQuery(''); setAddExCategory(null); }}
                          className="w-6 h-6 flex items-center justify-center rounded-md"
                          style={{ background: 'var(--bg-elevated)' }}>
                          <X className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                        </button>
                      </div>
                      {/* Category filter chips */}
                      <div className="flex gap-1.5 overflow-x-auto no-scrollbar px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                        {(['All', 'Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core'] as const).map((cat) => {
                          const isAll = cat === 'All';
                          const active = isAll ? addExCategory === null : addExCategory === cat;
                          const color = muscleColor(cat);
                          return (
                            <button
                              key={cat}
                              onClick={() => setAddExCategory(isAll ? null : cat === addExCategory ? null : cat)}
                              onKeyDown={(e) => e.stopPropagation()}
                              className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                              style={active
                                ? { background: isAll ? 'rgba(200,255,0,0.12)' : `${color}22`, color: isAll ? 'var(--accent)' : color, border: `1px solid ${isAll ? 'rgba(200,255,0,0.3)' : `${color}55`}` }
                                : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid transparent' }
                              }
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                      {/* Results */}
                      {addExResults.length > 0 && (
                        <div className="py-1 max-h-[240px] overflow-y-auto">
                          {addExResults.map((ex) => (
                            <button key={ex.id}
                              onClick={() => addExerciseToGroups(ex.name, ex.muscleGroup)}
                              className="w-full text-left px-4 py-2.5 flex items-center justify-between active:bg-white/[0.04] transition-colors"
                            >
                              <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{ex.name}</span>
                              <span className="text-[10px] font-medium" style={{ color: muscleColor(ex.muscleGroup) }}>{ex.muscleGroup}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {!addExQuery.trim() && !addExCategory && (
                        <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>Search or pick a category above</p>
                      )}
                      {(addExQuery.trim() || addExCategory) && addExResults.length === 0 && (
                        <p className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                          {addExQuery.trim() ? `No results for "${addExQuery}"` : `No exercises found`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────

export const Calendar: React.FC = () => {
  const { user, profile } = useAuth();
  const { startProgress, doneProgress } = useProgress();
  const unit = (profile?.unit_preference || 'lbs') as WeightUnit;
  const navigate = useNavigate();

  const today = useMemo(() => new Date(), []);
  const [anchor, setAnchor]             = useState<Date>(today);
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [viewMode, setViewMode]         = useState<ViewMode>('today');
  const [workouts, setWorkouts]         = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [pickerYear, setPickerYear]     = useState(today.getFullYear());
  const [windowScrollY, setWindowScrollY] = useState(0);

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Refresh when AI logs a workout from the chat
  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1);
    window.addEventListener('athlix:workout-logged', handler);
    return () => window.removeEventListener('athlix:workout-logged', handler);
  }, []);

  // ── Data fetch ───────────────────────────────────────────────────────────────
  // Always fetch the full month + week-overflow around anchor so every view is covered.
  // When viewMode is 'week', also extend to cover the full week even if it crosses months.

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    startProgress();

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
        // Deduplicate by id in case the query returns duplicates
        const seen = new Set<string>();
        const deduped = (data || []).filter((w: any) => {
          if (seen.has(w.id)) return false;
          seen.add(w.id);
          return true;
        });
        setWorkouts(deduped);
      })
      .catch(() => setWorkouts([]))
      .finally(() => { setLoading(false); doneProgress(); });
  }, [user, anchor, viewMode, refreshKey, startProgress, doneProgress]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const weekDays  = useMemo(() => weekDaysOf(anchor), [anchor]);
  const monthDays = useMemo(() => eachDayOfInterval({
    start: weekStart(startOfMonth(anchor)),
    end:   weekEnd(endOfMonth(anchor)),
  }), [anchor]);

  const getForDay = (day: Date) =>
    workouts.filter((w) => {
      const d = parseStoredDate(w.date);
      return d !== null && isSameDay(d, day) && matchesFilter(w, activeFilter);
    });

  const selectedWorkouts = useMemo(() => getForDay(selectedDate), [selectedDate, workouts, activeFilter]);

  const selectedSummary = useMemo(() => ({
    duration:  selectedWorkouts.reduce((s, w) => s + Number(w.duration_minutes || 0), 0),
    exercises: selectedWorkouts.reduce((s, w) => s + getExerciseCount(w), 0),
    volume:    selectedWorkouts.reduce((s, w) => s + getVolume(w, unit), 0),
  }), [selectedWorkouts, unit]);

  // ── Navigation ───────────────────────────────────────────────────────────────

  const prevPeriod = () => {
    if (viewMode === 'today') {
      const newDay = addDays(selectedDate, -1);
      setSelectedDate(newDay);
      if (weekStart(newDay).getTime() < weekStart(anchor).getTime()) setAnchor(newDay);
    } else if (viewMode === 'week') {
      setAnchor((p) => subWeeks(p, 1));
      setSelectedDate((p) => subWeeks(p, 1));
    } else {
      setAnchor((p) => subMonths(p, 1));
    }
  };

  const nextPeriod = () => {
    if (viewMode === 'today') {
      const newDay = addDays(selectedDate, 1);
      setSelectedDate(newDay);
      if (weekStart(newDay).getTime() > weekStart(anchor).getTime()) setAnchor(newDay);
    } else if (viewMode === 'week') {
      setAnchor((p) => addWeeks(p, 1));
      setSelectedDate((p) => addWeeks(p, 1));
    } else {
      setAnchor((p) => addMonths(p, 1));
    }
  };

  const goToToday = () => { setAnchor(today); setSelectedDate(today); };

  const selectDay = (day: Date) => {
    setSelectedDate(day);
    if (!isSameMonth(day, anchor)) setAnchor(day);
  };

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === 'today') { setAnchor(today); setSelectedDate(today); }
    else setAnchor(selectedDate);
  };

  // ── Long-press to log ────────────────────────────────────────────────────────

  const handleLongPressStart = (day: Date, e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    longPressTimer.current = setTimeout(() => {
      try { navigator.vibrate?.(45); } catch { /* ignore */ }
      navigate(`/log?date=${format(day, 'yyyy-MM-dd')}`);
    }, 480);
  };
  const handleLongPressEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  };
  useEffect(() => () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); }, []);

  useEffect(() => {
    const handler = () => setWindowScrollY(window.scrollY);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
  // Reset scroll position when view changes
  useEffect(() => { window.scrollTo({ top: 0 }); }, [viewMode]);

  // ── Delete ───────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string, title: string) => {
    if (!user || !window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteWorkout(user.id, id);
      setWorkouts((p) => p.filter((w) => w.id !== id));
      toast.success('Workout deleted');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────────

  // Apply an in-place set edit to the workouts state (keeps summaries/volume correct)
  const handleSetsUpdated = (id: string, exercises: any[], muscleGroups: string[]) => {
    setWorkouts((prev) =>
      prev.map((w) => (w.id === id ? { ...w, exercises, muscle_groups: muscleGroups } : w)),
    );
  };

  const handleRenamed = (id: string, newTitle: string) => {
    setWorkouts((prev) => prev.map((w) => (w.id === id ? { ...w, title: newTitle } : w)));
  };

  const handleExtracted = (newWorkout: any) => {
    setWorkouts((prev) => [...prev, newWorkout].sort((a, b) =>
      new Date(b.date ?? b.workout_date ?? 0).getTime() - new Date(a.date ?? a.workout_date ?? 0).getTime()
    ));
  };

  const handleMerged = (sourceId: string, targetId: string, targetExercises: any[], targetMuscleGroups: string[]) => {
    setWorkouts((prev) =>
      prev
        .filter((w) => w.id !== sourceId)
        .map((w) => w.id === targetId ? { ...w, exercises: targetExercises, muscle_groups: targetMuscleGroups } : w),
    );
  };

  const renderWorkoutCard = (workout: any, allDayWorkouts: any[]) => (
    <WorkoutCard
      key={workout.id}
      workout={workout}
      unit={unit}
      onDelete={handleDelete}
      onSaved={handleSetsUpdated}
      onRenamed={handleRenamed}
      onExtracted={handleExtracted}
      sameDayWorkouts={allDayWorkouts.filter((w) => w.id !== workout.id)}
      onMerged={handleMerged}
    />
  );

  // 5-day focal strip for Today view — selected day centre, ±1 & ±2 fade out
  const renderTodayStrip = () => {
    const offsets = [-2, -1, 0, 1, 2] as const;
    const isOffToday = !dateFnsIsToday(selectedDate);
    return (
      <div className="pb-1">
        <div className="flex items-end justify-between gap-1 px-1">
          {offsets.map((offset) => {
            const day       = addDays(selectedDate, offset);
            const isCenter  = offset === 0;
            const absOff    = Math.abs(offset);
            const isTodayDay = dateFnsIsToday(day);
            const dots      = getForDay(day);

            const opacity   = absOff === 0 ? 1 : absOff === 1 ? 0.55 : 0.22;
            const ringSize  = isCenter ? 50 : absOff === 1 ? 40 : 32;
            const r         = isCenter ? 23 : absOff === 1 ? 18 : 14;
            const sw        = isCenter ? 3 : 2;
            const numCls    = isCenter ? 'text-[18px] font-bold' : absOff === 1 ? 'text-[14px] font-semibold' : 'text-[12px] font-medium';
            const circleSz  = isCenter ? 42 : absOff === 1 ? 34 : 26;

            return (
              <button
                key={day.toISOString()}
                onClick={() => selectDay(day)}
                onPointerDown={(e) => handleLongPressStart(day, e)}
                onPointerUp={handleLongPressEnd}
                onPointerLeave={handleLongPressEnd}
                className="flex flex-col items-center gap-0.5 active:scale-95 transition-all"
                style={{ opacity, flex: isCenter ? 1.6 : absOff === 1 ? 1.1 : 1 }}
              >
                <span
                  className="text-[9px] font-bold uppercase tracking-widest"
                  style={{ color: isTodayDay ? 'var(--accent)' : isCenter ? 'var(--text-secondary)' : 'var(--text-muted)' }}
                >
                  {isTodayDay && !isCenter ? 'TODAY' : format(day, 'EEEEE')}
                </span>
                <div className="relative flex items-center justify-center" style={{ width: ringSize, height: ringSize }}>
                  <DayRing workouts={dots} size={ringSize} r={r} strokeWidth={sw} />
                  <div
                    className={`flex items-center justify-center rounded-full transition-all ${numCls}`}
                    style={{
                      width: circleSz,
                      height: circleSz,
                      background: isTodayDay ? 'var(--accent)' : isCenter ? 'var(--bg-elevated)' : 'transparent',
                      color: isTodayDay ? '#000' : isCenter ? 'var(--text-primary)' : 'var(--text-secondary)',
                      outline: isCenter && !isTodayDay ? '1.5px solid rgba(200,255,0,0.45)' : 'none',
                    }}
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Return-to-today pill — only visible when browsing a different day */}
        {isOffToday && (
          <div className="flex justify-center mt-2">
            <button
              onClick={goToToday}
              className="flex items-center gap-1 px-3 py-0.5 rounded-full text-[10px] font-semibold transition-all active:scale-95"
              style={{ background: 'rgba(200,255,0,0.08)', color: 'var(--accent)', border: '1px solid rgba(200,255,0,0.2)' }}
            >
              ↑ Today
            </button>
          </div>
        )}
      </div>
    );
  };

  // 7-day week strip (Week view header + anchor for month view)
  const renderWeekStrip = () => (
    <div className="pb-1">
      {/* Week range label shown only in Week view */}
      {viewMode === 'week' && (
        <div className="flex items-center justify-between px-1 pb-2">
          <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>
            {format(weekDays[0], 'MMM d')}
            <span className="font-normal mx-1" style={{ color: 'var(--text-muted)' }}>–</span>
            {format(weekDays[6], isSameMonth(weekDays[0], weekDays[6]) ? 'd' : 'MMM d')}
            <span className="text-[12px] font-medium ml-1.5" style={{ color: 'var(--text-muted)' }}>
              {format(weekDays[0], 'yyyy')}
            </span>
          </p>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
            {weekDays.reduce((s, d) => s + getForDay(d).length, 0)} workouts
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-1 px-1">
        {weekDays.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDay = dateFnsIsToday(day);
          const dots = getForDay(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => selectDay(day)}
              onPointerDown={(e) => handleLongPressStart(day, e)}
              onPointerUp={handleLongPressEnd}
              onPointerLeave={handleLongPressEnd}
              className="flex flex-col items-center gap-0.5 flex-1 py-1 rounded-xl transition-all active:scale-95"
            >
              <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)' }}>
                {format(day, 'EEEEE')}
              </span>
              <div className="relative flex items-center justify-center" style={{ width: 38, height: 38 }}>
                <DayRing workouts={dots} size={38} r={17} strokeWidth={2.5} />
                <div
                  className="h-8 w-8 flex items-center justify-center rounded-full text-[14px] font-bold"
                  style={
                    isTodayDay
                      ? { background: 'var(--accent)', color: '#000' }
                      : isSelected
                      ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: '1.5px solid var(--accent)' }
                      : { color: 'var(--text-secondary)' }
                  }
                >
                  {format(day, 'd')}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // Month grid
  const renderMonthGrid = () => {
    const dimMode = windowScrollY > 60;
    return (
      <div className="pb-2">
        <div className="grid grid-cols-7 mb-1">
          {['M','T','W','T','F','S','S'].map((d, i) => (
            <div key={i} className="py-1 text-center text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {monthDays.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDay = dateFnsIsToday(day);
            const outside = !isSameMonth(day, anchor);
            const dots = getForDay(day);
            return (
              <button
                key={day.toISOString()}
                onClick={() => selectDay(day)}
                onPointerDown={(e) => handleLongPressStart(day, e)}
                onPointerUp={handleLongPressEnd}
                onPointerLeave={handleLongPressEnd}
                className="flex flex-col items-center py-1 rounded-xl transition-all active:scale-95"
                style={{
                  opacity: outside ? 0.25 : (dimMode && !isSameWeek(day, selectedDate, { weekStartsOn: 1 })) ? 0.2 : 1,
                  transition: 'opacity 0.25s ease',
                }}
              >
                <div className="relative flex items-center justify-center" style={{ width: 32, height: 32 }}>
                  <DayRing workouts={dots} size={32} r={14} strokeWidth={2} />
                  <div
                    className="h-7 w-7 flex items-center justify-center text-[12px] font-semibold transition-all"
                    style={
                      isTodayDay
                        ? { background: 'var(--accent)', color: '#000', borderRadius: '50%' }
                        : isSelected
                        ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1.5px solid var(--accent)', borderRadius: 10, width: 34, height: 26 }
                        : { color: 'var(--text-secondary)', borderRadius: '50%' }
                    }
                  >
                    {format(day, 'd')}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Week list view — all 7 days with their workouts
  const renderWeekList = () => (
    <div className="space-y-4">
      {weekDays.map((day) => {
        const dayWorkouts = getForDay(day);
        const isTodayDay  = dateFnsIsToday(day);
        const isSelected  = isSameDay(day, selectedDate);

        return (
          <div key={day.toISOString()}>
            {/* Day header */}
            <button
              className="w-full flex items-center justify-between mb-2 px-1"
              onClick={() => selectDay(day)}
            >
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center shrink-0" style={{ width: 40, height: 40 }}>
                  <DayRing workouts={dayWorkouts} size={40} r={18} strokeWidth={2.5} />
                  <div
                    className="h-8 w-8 flex items-center justify-center rounded-full text-[13px] font-bold"
                    style={
                      isTodayDay
                        ? { background: 'var(--accent)', color: '#000' }
                        : isSelected
                        ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', outline: '1.5px solid var(--accent)' }
                        : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }
                    }
                  >
                    {format(day, 'd')}
                  </div>
                </div>
                <div className="text-left">
                  <p className="text-[12px] font-semibold" style={{ color: isTodayDay ? 'var(--accent)' : 'var(--text-primary)' }}>
                    {isTodayDay ? 'Today' : format(day, 'EEEE')}
                  </p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{format(day, 'MMM d')}</p>
                </div>
              </div>
              {dayWorkouts.length > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                  {dayWorkouts.length} workout{dayWorkouts.length !== 1 ? 's' : ''}
                </span>
              )}
            </button>

            {/* Workouts or rest */}
            {loading ? (
              <div className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
            ) : dayWorkouts.length > 0 ? (
              <AnimatePresence initial={false}>
                <div className="space-y-2">
                  {dayWorkouts.map((w) => renderWorkoutCard(w, dayWorkouts))}
                </div>
              </AnimatePresence>
            ) : (
              <div
                className="h-10 rounded-xl flex items-center justify-center text-[11px] font-medium"
                style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)', color: 'var(--text-muted)' }}
              >
                Rest
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // Day label
  const dayLabel = isSameDay(selectedDate, today)
    ? 'Today'
    : isSameDay(selectedDate, addDays(today, -1))
    ? 'Yesterday'
    : format(selectedDate, 'EEEE, MMM d');

  const isScrolled = windowScrollY > 80;

  // ── Compact ring strip (shown when scrolled) ─────────────────────────────────
  const renderCompactStrip = () => {
    const days = viewMode === 'today'
      ? ([-2, -1, 0, 1, 2] as const).map((o) => addDays(selectedDate, o))
      : weekDays;

    return (
      <div className="flex items-center justify-between px-2 pb-2 pt-1 gap-1">
        {days.map((day, i) => {
          const isCenter  = viewMode === 'today' ? i === 2 : isSameDay(day, selectedDate);
          const isTodayDay = dateFnsIsToday(day);
          const dots      = getForDay(day);
          const size      = isCenter ? 38 : 30;
          const r         = isCenter ? 17 : 13;
          return (
            <button
              key={day.toISOString()}
              onClick={() => selectDay(day)}
              className="flex flex-col items-center gap-0.5 flex-1 active:scale-95 transition-all"
              style={{ opacity: viewMode === 'today' ? (Math.abs(i - 2) === 0 ? 1 : Math.abs(i - 2) === 1 ? 0.6 : 0.3) : 1 }}
            >
              <span
                className="text-[8px] font-bold uppercase tracking-widest"
                style={{ color: isTodayDay ? 'var(--accent)' : isCenter ? 'var(--text-secondary)' : 'var(--text-muted)' }}
              >
                {isTodayDay && !isCenter ? 'NOW' : format(day, 'EEEEE')}
              </span>
              <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
                <DayRing workouts={dots} size={size} r={r} strokeWidth={isCenter ? 2.5 : 2} />
                <div
                  className="flex items-center justify-center rounded-full font-bold"
                  style={{
                    width:  isCenter ? 30 : 22,
                    height: isCenter ? 30 : 22,
                    fontSize: isCenter ? 13 : 11,
                    background: isTodayDay ? 'var(--accent)' : isCenter ? 'var(--bg-elevated)' : 'transparent',
                    color:      isTodayDay ? '#000'          : isCenter ? 'var(--text-primary)' : 'var(--text-secondary)',
                    outline: isCenter && !isTodayDay ? '1.5px solid rgba(200,255,0,0.45)' : 'none',
                  }}
                >
                  {format(day, 'd')}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen pb-28" style={{ background: 'var(--bg-base)' }}>

      {/* ── Sticky Header ── */}
      <div
        className="sticky top-0 z-20"
        style={{
          background: 'var(--bg-base)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* ── Expanded controls (hidden when scrolled) ── */}
        <div
          style={{
            overflow: 'hidden',
            maxHeight: isScrolled ? 0 : 600,
            opacity: isScrolled ? 0 : 1,
            transition: 'max-height 0.25s ease, opacity 0.2s ease',
            pointerEvents: isScrolled ? 'none' : 'auto',
          }}
        >
          <div className="px-3 pt-3">
            {/* Month row */}
            <div className="flex items-center justify-between mb-3">
              <div className="relative">
                <button
                  className="flex items-center gap-1.5"
                  onClick={() => { setShowMonthPicker((p) => !p); setPickerYear(anchor.getFullYear()); }}
                >
                  <span className="text-[24px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    {format(anchor, 'MMMM')}
                  </span>
                  <span className="text-[16px] font-medium" style={{ color: 'var(--text-muted)' }}>
                    {format(anchor, 'yyyy')}
                  </span>
                  <ChevronDown
                    className="w-4 h-4 transition-transform"
                    style={{ color: 'var(--text-muted)', transform: showMonthPicker ? 'rotate(180deg)' : 'none' }}
                  />
                </button>

                <AnimatePresence>
                  {showMonthPicker && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute top-full left-0 mt-2 w-[220px] rounded-2xl shadow-xl z-50 p-3"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                    >
                      <div className="flex items-center justify-between mb-2 px-1">
                        <button onClick={() => setPickerYear((y) => y - 1)} className="h-7 w-7 flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{pickerYear}</span>
                        <button onClick={() => setPickerYear((y) => y + 1)} className="h-7 w-7 flex items-center justify-center rounded-lg" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {MONTHS.map((mn, idx) => {
                          const isActive = anchor.getMonth() === idx && anchor.getFullYear() === pickerYear;
                          return (
                            <button
                              key={mn}
                              onClick={() => { const next = new Date(pickerYear, idx, 1); setAnchor(next); setSelectedDate(next); setShowMonthPicker(false); }}
                              className="py-1.5 rounded-xl text-[12px] font-semibold transition-all"
                              style={isActive ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                            >
                              {mn}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex items-center gap-1.5">
                <Link
                  to={`/log?date=${format(selectedDate, 'yyyy-MM-dd')}`}
                  className="h-8 w-8 flex items-center justify-center rounded-full"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  <Plus className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* View tabs */}
            <div className="flex items-center gap-2 mb-3">
              <button onClick={prevPeriod} className="h-8 w-8 flex items-center justify-center rounded-full shrink-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex flex-1 gap-1 rounded-xl p-1" style={{ background: 'var(--bg-elevated)' }}>
                {([
                  { id: 'today', label: 'Today', Icon: Sun },
                  { id: 'week',  label: 'Week',  Icon: CalendarDays },
                  { id: 'month', label: 'Month', Icon: LayoutGrid },
                ] as const).map(({ id, label, Icon }) => {
                  const active = viewMode === id;
                  return (
                    <button key={id} onClick={() => changeViewMode(id)} className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12px] font-semibold transition-all" style={active ? { background: 'var(--bg-surface)', color: 'var(--text-primary)' } : { color: 'var(--text-muted)' }}>
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  );
                })}
              </div>
              <button onClick={nextPeriod} className="h-8 w-8 flex items-center justify-center rounded-full shrink-0" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Full calendar strip (today / week / month) */}
            {viewMode === 'today' && renderTodayStrip()}
            {viewMode === 'week' && renderWeekStrip()}
            {viewMode === 'month' && renderMonthGrid()}
          </div>
        </div>

        {/* ── Compact ring strip (visible only when scrolled) ── */}
        <div
          style={{
            overflow: 'hidden',
            maxHeight: isScrolled ? 80 : 0,
            opacity: isScrolled ? 1 : 0,
            transition: 'max-height 0.25s ease, opacity 0.2s ease',
            pointerEvents: isScrolled ? 'auto' : 'none',
          }}
        >
          {viewMode !== 'month' && renderCompactStrip()}
          {viewMode === 'month' && (
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
                {format(anchor, 'MMMM yyyy')}
              </span>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {format(selectedDate, 'MMM d')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Backdrop to close month picker ── */}
      {/* z-[19]: below the sticky header (z-20) so it doesn't block the picker inside it */}
      {showMonthPicker && (
        <div className="fixed inset-0 z-[19]" onClick={() => setShowMonthPicker(false)} />
      )}

      {/* ── Body ── */}
      <div className="px-3 pt-4 space-y-4">

        {/* Muscle filter strip */}
        <div className="flex flex-wrap gap-1.5">
          {MUSCLE_FILTERS.map((m) => {
            const isAll  = m === 'All';
            const active = isAll ? activeFilter === null : activeFilter === m;
            return (
              <button
                key={m}
                onClick={() => setActiveFilter(isAll ? null : active ? null : m)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all active:scale-95"
                style={
                  active
                    ? {
                        background: isAll ? 'var(--bg-elevated)' : `color-mix(in srgb, ${muscleColor(m)} 18%, var(--bg-elevated))`,
                        color: isAll ? 'var(--text-primary)' : muscleColor(m),
                        border: `1px solid ${isAll ? 'var(--border)' : muscleColor(m)}`,
                      }
                    : {
                        background: 'transparent',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border)',
                      }
                }
              >
                {!isAll && (
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: active ? muscleColor(m) : muscleColor(m), opacity: active ? 1 : 0.6 }}
                  />
                )}
                {m}
              </button>
            );
          })}
        </div>

        {/* ── Week view: all 7 days ── */}
        {viewMode === 'week' && renderWeekList()}

        {/* ── Today / Month view: selected day panel ── */}
        {(viewMode === 'today' || viewMode === 'month') && (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${viewMode}-${format(selectedDate, 'yyyy-MM-dd')}-${activeFilter || 'all'}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl overflow-hidden"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              {/* Day header */}
              <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
                      {dayLabel}
                    </p>
                    <p className="text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>
                      {isSameDay(selectedDate, today)
                        ? selectedWorkouts.length > 0 ? 'Today' : 'Nothing logged yet'
                        : selectedWorkouts.length > 0 ? dayLabel : 'Rest day'}
                    </p>
                  </div>
                  {!isSameDay(selectedDate, today) && (
                    <button
                      onClick={goToToday}
                      className="text-[11px] font-semibold px-3 py-1.5 rounded-full"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
                    >
                      Today
                    </button>
                  )}
                </div>

                {/* Stats strip */}
                {selectedWorkouts.length > 0 && (
                  <div className="flex items-center gap-4 mt-2">
                    {[
                      { label: 'Min',       value: selectedSummary.duration },
                      { label: 'Exercises', value: selectedSummary.exercises },
                      { label: `Vol ${unit}`, value: Math.round(selectedSummary.volume).toLocaleString() },
                    ].map((s) => (
                      <div key={s.label}>
                        <span className="text-[15px] font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>{s.value}</span>
                        <span className="text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Workout list */}
              <div className="px-4 py-3 space-y-2">
                {loading ? (
                  <>
                    <div className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
                    <div className="h-20 rounded-xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
                  </>
                ) : selectedWorkouts.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {selectedWorkouts.map((w) => renderWorkoutCard(w, selectedWorkouts))}
                  </AnimatePresence>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <div
                      className="h-11 w-11 rounded-2xl flex items-center justify-center"
                      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                    >
                      <Dumbbell className="h-5 w-5" style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        {isSameDay(selectedDate, today) ? 'Nothing logged today' : 'No workouts this day'}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {isSameDay(selectedDate, today)
                          ? 'Start a session and it will appear here.'
                          : 'This was a rest day.'}
                      </p>
                    </div>
                    {isSameDay(selectedDate, today) && (
                      <Link
                        to={`/log?date=${format(selectedDate, 'yyyy-MM-dd')}`}
                        className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-bold text-black"
                        style={{ background: 'var(--accent)' }}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Log Workout
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};

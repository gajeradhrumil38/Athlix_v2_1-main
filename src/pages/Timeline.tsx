import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useProgress } from '../contexts/ProgressContext';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, Trash2, Clock, Dumbbell, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, useAnimation } from 'framer-motion';
import { useDrag } from '@use-gesture/react';
import { ExerciseImage } from '../components/shared/ExerciseImage';
import { deleteWorkout, getWorkouts } from '../lib/supabaseData';
import { parseDateAtStartOfDay } from '../lib/dates';
import { convertWeight, isWeightUnit, type WeightUnit } from '../lib/units';
import { muscleColor } from '../lib/muscleColors';

// ── Helpers ───────────────────────────────────────────────────────────────────

const calcVolume = (exercises: any[], unit: WeightUnit): number =>
  (exercises || []).reduce((total, ex) => {
    if (ex.unit && !isWeightUnit(ex.unit)) return total;
    return total + convertWeight(
      Number(ex.weight || 0),
      isWeightUnit(ex.unit) ? ex.unit : unit,
      unit, 0.1,
    ) * Number(ex.reps || 0) * Number(ex.sets || 0);
  }, 0);

const fmtNum = (v: number) => Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1);

const isGenericTitle = (t?: string | null) => {
  if (!t) return true;
  const lower = t.trim().toLowerCase();
  return (
    ['workout','morning workout','afternoon workout','evening workout'].includes(lower) ||
    /^plan\s*[—–-]/.test(lower)
  );
};

const getDisplayTitle = (workout: any): string => {
  const names: string[] = Array.from(
    new Set((workout.exercises || []).map((e: any) => e.name as string).filter(Boolean))
  );
  if (names.length > 0 && isGenericTitle(workout.title)) return names[0];
  return workout.title || names[0] || 'Workout';
};

// ── Timeline card ─────────────────────────────────────────────────────────────

const TimelineItem: React.FC<{
  workout: any;
  handleDelete: (id: string) => void;
  displayUnit: WeightUnit;
}> = ({ workout, handleDelete, displayUnit }) => {
  const [expanded, setExpanded] = useState(false);
  const controls = useAnimation();

  const accent         = muscleColor((workout.muscle_groups || [])[0]);
  const volume         = calcVolume(workout.exercises, displayUnit);
  const sortedExercises = [...(workout.exercises || [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );
  const parsedDate  = parseDateAtStartOfDay(workout.date);
  const dateLabel   = parsedDate ? format(parsedDate, 'EEE, MMM d · yyyy') : '--';
  const displayTitle = getDisplayTitle(workout);
  const planLabel    = !isGenericTitle(workout.title) && workout.title !== displayTitle ? workout.title : null;
  const PREVIEW_MAX = 4; // exercises shown collapsed
  const previewExs  = sortedExercises.slice(0, PREVIEW_MAX);
  const hiddenCount = sortedExercises.length - PREVIEW_MAX;

  const bind = useDrag(
    ({ down, movement: [mx], direction: [xDir], velocity: [vx] }) => {
      if (expanded) return;
      const trigger = vx > 0.5 || mx < -100;
      if (!down && trigger && xDir < 0) {
        if (!window.confirm(`Delete "${workout.title}"? This cannot be undone.`)) {
          controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
          return;
        }
        controls
          .start({ x: -window.innerWidth, opacity: 0, transition: { duration: 0.2 } })
          .then(() => handleDelete(workout.id));
      } else if (!down) {
        controls.start({ x: 0, transition: { type: 'spring', stiffness: 300, damping: 30 } });
      } else if (mx < 0) {
        controls.set({ x: mx });
      }
    },
    { axis: 'x', filterTaps: true },
  );

  const renderExerciseRow = (ex: any) => {
    const isWeightBased = !ex.unit || isWeightUnit(ex.unit);
    const w = isWeightBased
      ? convertWeight(Number(ex.weight || 0), isWeightUnit(ex.unit) ? ex.unit : displayUnit, displayUnit, 0.1)
      : Number(ex.weight || 0);
    const unitLabel = isWeightBased ? displayUnit : String(ex.unit || '');
    const exAccent  = muscleColor(ex.muscle_group);

    return (
      <div
        key={ex.id}
        className="flex items-center gap-3 py-2 px-3 rounded-xl"
        style={{ background: 'var(--bg-elevated)' }}
      >
        {/* Exercise image or initial badge */}
        {ex.exercise_db_id ? (
          <ExerciseImage exerciseId={ex.exercise_db_id} exerciseName={ex.name} size="sm" />
        ) : (
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 text-[12px] font-bold"
            style={{
              background: `color-mix(in srgb, ${exAccent} 12%, var(--bg-surface))`,
              color: exAccent,
              border: `1px solid color-mix(in srgb, ${exAccent} 22%, transparent)`,
            }}
          >
            {ex.name?.charAt(0) || '?'}
          </div>
        )}

        {/* Name */}
        <span className="flex-1 text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
          {ex.name}
        </span>

        {/* Sets × reps @ weight */}
        <div className="shrink-0 text-right">
          <span
            className="text-[12px] font-bold tabular-nums"
            style={{ color: 'var(--text-secondary)' }}
          >
            {ex.sets}×{ex.reps}
          </span>
          {w > 0 && (
            <span className="text-[11px] ml-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>
              @ {fmtNum(w)}{unitLabel}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe-to-delete bg */}
      <div
        className="absolute inset-0 flex items-center justify-end pr-5 rounded-2xl"
        style={{ background: 'rgba(255,59,48,0.08)' }}
      >
        <Trash2 className="w-5 h-5" style={{ color: '#ff3b30' }} />
      </div>

      <motion.div
        {...bind()}
        animate={controls}
        className="relative z-10 rounded-2xl touch-pan-y"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        {/* Left accent bar */}
        <div className="absolute inset-y-0 left-0 w-[3px] rounded-l-2xl" style={{ backgroundColor: accent }} />

        {/* Header */}
        <div className="pl-4 pr-3 pt-3 pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                {dateLabel}
              </p>
              <h3 className="text-[16px] font-bold leading-snug" style={{ color: 'var(--text-primary)' }}>
                {displayTitle}
              </h3>

              {/* Muscle group tags */}
              {Array.isArray(workout.muscle_groups) && workout.muscle_groups.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {workout.muscle_groups.map((mg: string) => (
                    <span
                      key={mg}
                      className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                      style={{
                        color: muscleColor(mg),
                        background: `color-mix(in srgb, ${muscleColor(mg)} 10%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${muscleColor(mg)} 20%, transparent)`,
                      }}
                    >
                      {mg}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0 mt-0.5">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${workout.title}"?`)) handleDelete(workout.id);
                }}
                className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
                style={{ background: 'rgba(255,59,48,0.07)', color: 'rgba(255,59,48,0.8)' }}
                aria-label="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-2 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              {workout.duration_minutes ?? 0} min
              {planLabel && (
                <span
                  className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                >
                  {planLabel}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1">
              <Dumbbell className="w-3 h-3" />
              {sortedExercises.length} exercise{sortedExercises.length !== 1 ? 's' : ''}
            </span>
            {volume > 0 && (
              <span className="flex items-center gap-1">
                <BarChart2 className="w-3 h-3" />
                {fmtNum(volume)} {displayUnit}
              </span>
            )}
          </div>
        </div>

        {/* Exercise list — always visible */}
        {sortedExercises.length > 0 && (
          <div className="px-3 pb-3 space-y-1.5">
            {/* Separator */}
            <div className="h-px mb-2" style={{ background: 'var(--border)' }} />

            {/* Preview rows */}
            {(expanded ? sortedExercises : previewExs).map((ex) => renderExerciseRow(ex))}

            {/* Notes (expanded only) */}
            {expanded && workout.notes && (
              <p className="mt-2 px-3 text-[12px] italic leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                "{workout.notes}"
              </p>
            )}

            {/* Expand / collapse */}
            {hiddenCount > 0 && (
              <button
                onClick={() => setExpanded((p) => !p)}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl mt-1 text-[11px] font-semibold transition-colors"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
              >
                {expanded ? (
                  <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                ) : (
                  <><ChevronDown className="w-3.5 h-3.5" /> +{hiddenCount} more exercise{hiddenCount !== 1 ? 's' : ''}</>
                )}
              </button>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

const Skeleton = () => (
  <div className="space-y-2">
    {[100, 80, 120, 90].map((h, i) => (
      <div key={i} className="skeleton rounded-2xl" style={{ height: h }} />
    ))}
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────

export const Timeline: React.FC = () => {
  const { user, profile } = useAuth();
  const { startProgress, doneProgress } = useProgress();
  const displayUnit = (profile?.unit_preference || 'lbs') as WeightUnit;
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1);
    window.addEventListener('athlix:workout-logged', handler);
    return () => window.removeEventListener('athlix:workout-logged', handler);
  }, []);

  useEffect(() => {
    if (!user) { setWorkouts([]); setLoading(false); return; }
    setLoading(true);
    startProgress();
    getWorkouts(user.id, { includeExercises: true })
      .then((data) => setWorkouts(data || []))
      .catch(() => toast.error('Failed to load timeline'))
      .finally(() => { setLoading(false); doneProgress(); });
  }, [user, refreshKey, startProgress, doneProgress]);

  const handleDelete = async (id: string) => {
    if (!user) return;
    try {
      await deleteWorkout(user.id, id);
      toast.success('Workout deleted');
      setWorkouts((p) => p.filter((w) => w.id !== id));
    } catch {
      toast.error('Failed to delete workout');
    }
  };

  // Group workouts by month
  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; workouts: any[] }>();
    workouts.forEach((w) => {
      const d   = parseDateAtStartOfDay(w.date);
      const key = d ? format(d, 'yyyy-MM') : 'unknown';
      const lbl = d ? format(d, 'MMMM yyyy') : 'Unknown';
      if (!map.has(key)) map.set(key, { label: lbl, workouts: [] });
      map.get(key)!.workouts.push(w);
    });
    return Array.from(map.values());
  }, [workouts]);

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 px-1">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Timeline</h1>
          {workouts.length > 0 && (
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {workouts.length} session{workouts.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : workouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div
            className="mb-4 h-14 w-14 flex items-center justify-center rounded-2xl"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <Dumbbell className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>No workouts yet</p>
          <p className="text-[12px] mt-1 max-w-[200px]" style={{ color: 'var(--text-muted)' }}>
            Start a workout from the home screen — it'll appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ label, workouts: group }) => (
            <div key={label}>
              {/* Month header */}
              <div className="flex items-center gap-3 mb-3 px-1">
                <span className="text-[11px] font-bold uppercase tracking-widest shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {label}
                </span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {group.length} session{group.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="space-y-2.5">
                {group.map((workout) => (
                  <TimelineItem
                    key={workout.id}
                    workout={workout}
                    handleDelete={handleDelete}
                    displayUnit={displayUnit}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

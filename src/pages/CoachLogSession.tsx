import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { AppIcon } from '../config/icons';
import { ActiveWorkout } from '../components/log/ActiveWorkout';
import type { Exercise } from '../components/log/ExercisePicker';
import type { ExerciseEntry, WorkoutState } from './Log';
import { getTraineeDashboard, type TraineeDashboard, type TraineeWorkout } from '../lib/coachData';
import { getAssignedPlansFor, groupByDay, type AssignedPlan, type AssignedPlanExercise } from '../lib/assignedPlans';
import { getExerciseMuscleProfile } from '../lib/exerciseMuscles';
import { getWorkoutDisplayTitle, isWorkoutUnnamed } from '../lib/workoutTitle';
import { resolveEffectiveInputType } from '../lib/exerciseTypes';
import { useExerciseOverrides } from '../contexts/ExerciseOverridesContext';
import { saveWorkout } from '../lib/supabaseData';

// A coach recording a session for a trainee in the SAME logger the athlete
// uses (ActiveWorkout), pointed at the trainee's history. Starts from the
// fastest sensible point — repeat their last session, an assigned plan day,
// or blank — so most entries are "adjust a few numbers, save".

const uid = () => crypto.randomUUID();
const pad2 = (n: number) => String(n).padStart(2, '0');
const localDateTime = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const draftKey = (traineeId: string) => `athlix:coach-log-draft:${traineeId}`;
const muscleFor = (name: string, stored?: string | null) =>
  stored || getExerciseMuscleProfile(name).primary[0] || 'Core';

type Draft = { workout: WorkoutState; sourcePlanId: string | null; sourcePlanDay?: string | null };

const readDraft = (traineeId: string): Draft | null => {
  try {
    const d = JSON.parse(localStorage.getItem(draftKey(traineeId)) || 'null');
    return d?.workout?.exercises ? d : null;
  } catch { return null; }
};
const writeDraft = (traineeId: string, draft: Draft | null) => {
  try {
    if (draft) localStorage.setItem(draftKey(traineeId), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(traineeId));
  } catch { /* ignore */ }
};

const newWorkout = (exercises: ExerciseEntry[], title = ''): WorkoutState => {
  const now = localDateTime(new Date());
  return { title, startTime: Date.now(), startAt: now, endAt: now, elapsedSeconds: 0, exercises, notes: '' };
};

// Every set of the trainee's most recent session, as-is (weights already lb).
function entriesFromWorkout(w: TraineeWorkout): ExerciseEntry[] {
  const order: string[] = [];
  const byName = new Map<string, ExerciseEntry>();
  const rows = [...(w.exercises || [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  for (const r of rows) {
    let entry = byName.get(r.name);
    if (!entry) {
      entry = { id: uid(), name: r.name, muscleGroup: muscleFor(r.name, r.muscle_group), exercise_db_id: r.exercise_db_id ?? undefined, sets: [] };
      byName.set(r.name, entry);
      order.push(r.name);
    }
    for (let i = 0; i < Math.max(1, Number(r.sets) || 1); i++) {
      entry.sets.push({ id: uid(), weight: r.weight || null, reps: r.reps || null, done: false, planned_weight: r.weight || null, planned_reps: r.reps || null });
    }
  }
  return order.map((n) => byName.get(n)!);
}

// A plan day as prescribed: N sets × reps @ weight, with its rest time.
function entriesFromPlan(exs: AssignedPlanExercise[]): ExerciseEntry[] {
  return exs.map((e) => ({
    id: uid(),
    name: e.name,
    muscleGroup: muscleFor(e.name, e.muscle_group),
    restSeconds: e.rest_seconds ?? null,
    sets: Array.from({ length: Math.max(1, Math.min(20, e.default_sets || 1)) }, () => ({
      id: uid(),
      weight: e.default_weight || null,
      reps: e.default_reps || null,
      done: false,
      planned_weight: e.default_weight || null,
      planned_reps: e.default_reps || null,
    })),
  }));
}

// What actually gets saved. If the coach ticked any set, they're marking what
// was done — save only ticked sets (same rule as the athlete's logger).
// Otherwise every set with a value counts: logging after the fact shouldn't
// require ticking each set one by one.
function setsToSave(workout: WorkoutState) {
  const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.done));
  return workout.exercises
    .map((exercise, index) => ({
      exercise,
      index,
      sets: exercise.sets.filter((s) => (anyDone ? s.done : true) && (Number(s.weight || 0) > 0 || Number(s.reps || 0) > 0)),
    }))
    .filter((x) => x.sets.length > 0);
}

export const CoachLogSession: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { overrides } = useExerciseOverrides();
  const [dash, setDash] = useState<TraineeDashboard | null>(null);
  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [workout, setWorkout] = useState<WorkoutState | null>(null);
  const [sourcePlanId, setSourcePlanId] = useState<string | null>(null);
  const [sourcePlanDay, setSourcePlanDay] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => readDraft(id));

  useEffect(() => {
    (async () => {
      const [d, p] = await Promise.all([getTraineeDashboard(id), getAssignedPlansFor(id)]);
      setDash(d);
      setPlans(p);
      setLoading(false);
    })();
  }, [id]);

  // Survive an accidental back/refresh mid-entry.
  useEffect(() => {
    if (workout) writeDraft(id, { workout, sourcePlanId, sourcePlanDay });
  }, [id, workout, sourcePlanId, sourcePlanDay]);

  const workouts = useMemo(() => (dash?.workouts.shared ? dash.workouts.data : []), [dash]);
  const last = workouts[0];

  // The trainee's own exercises (newest first) for the picker's Recent tab,
  // each carrying its last session's per-set numbers for prefill.
  const recentExercises = useMemo<Exercise[]>(() => {
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const w of workouts) {
      for (const e of w.exercises || []) {
        const key = e.name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const sameSession = (w.exercises || []).filter((x) => x.name === e.name);
        const top = sameSession.reduce((a, b) => (b.weight > a.weight ? b : a));
        out.push({
          id: `${e.name}-${w.id}`,
          name: e.name,
          muscleGroup: muscleFor(e.name, e.muscle_group),
          exercise_db_id: e.exercise_db_id ?? undefined,
          lastSession: {
            weight: top.weight, reps: top.reps, date: w.date, sets: sameSession.length, unit: 'lbs',
            perSetData: sameSession.map((x) => ({ weight: x.weight, reps: x.reps })),
          },
        });
      }
    }
    return out;
  }, [workouts]);

  const start = (exercises: ExerciseEntry[], title = '', planId: string | null = null, pickFirst = false, planDay: string | null = null) => {
    setSourcePlanId(planId);
    setSourcePlanDay(planId ? planDay : null);
    setWorkout(newWorkout(exercises, title));
    setOpenPicker(pickFirst);
  };

  const leave = () => {
    const hasWork = workout?.exercises.some((e) => e.sets.some((s) => s.weight || s.reps));
    if (hasWork && !window.confirm('Leave without saving? Your entries stay as a draft for next time.')) return;
    navigate(`/coach/trainee/${id}`);
  };

  const discardDraft = () => {
    if (!window.confirm('Discard the unsaved session?')) return;
    writeDraft(id, null);
    setDraft(null);
  };

  const save = async () => {
    if (!workout || !dash) return;
    const items = setsToSave(workout);
    if (!items.length) { toast.error('Add at least one set with weight or reps.'); return; }
    const startDate = new Date(workout.startAt);
    const endDate = new Date(workout.endAt);
    const date = format(Number.isNaN(startDate.getTime()) ? new Date() : startDate, 'yyyy-MM-dd');
    if (date > format(new Date(), 'yyyy-MM-dd')) { toast.error("Can't log a session in the future."); return; }
    const spanSec = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
    const seconds = spanSec > 0 ? spanSec : workout.elapsedSeconds;

    setSaving(true);
    try {
      await saveWorkout(id, {
        title: workout.title.trim() || 'Workout',
        date,
        duration_minutes: Math.max(1, Math.round(seconds / 60)),
        notes: workout.notes || null,
        source_plan_id: sourcePlanId,
        source_plan_day: sourcePlanDay,
        trainee_id: id,
        exercises: items.map(({ exercise, sets }) => {
          const type = resolveEffectiveInputType(exercise.name, overrides);
          const isDistance = type === 'distance_time' || type === 'distance_only';
          const repsOnly = type === 'reps_only' && !exercise.optionalWeight;
          return {
            name: exercise.name,
            muscle_group: exercise.muscleGroup,
            exercise_db_id: exercise.exercise_db_id || null,
            completed_sets: sets.map((s) => ({
              reps: Math.max(0, Math.round(Number(s.reps || 0))),
              weight: repsOnly ? 0 : Math.max(0, Math.min(9999, Number(s.weight || 0))),
              unit: isDistance ? 'km' as const : 'lbs' as const,
            })),
          };
        }),
      });
      writeDraft(id, null);
      toast.success(`Saved to ${dash.name}'s log`);
      navigate(`/coach/trainee/${id}`);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save this session.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 bg-[var(--bg-base)] flex items-center justify-center gap-2 text-[var(--text-muted)]">
        <AppIcon name="Spinner" size="sm" /> Loading…
      </div>
    );
  }

  if (!dash || !dash.workouts.shared) {
    return (
      <div className="fixed inset-0 z-40 bg-[var(--bg-base)] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[18px] font-semibold text-[var(--text-primary)]">
          {dash ? `${dash.name} isn't sharing workouts with you` : 'Trainee not found'}
        </p>
        <p className="text-[14px] text-[var(--text-muted)] max-w-[300px]">Logging a session needs the trainee to share their workouts.</p>
        <button type="button" onClick={() => navigate(dash ? `/coach/trainee/${id}` : '/coach')} className="mt-2 text-[15px] font-semibold text-[var(--accent)]">Go back</button>
      </div>
    );
  }

  if (workout) {
    const items = reviewing ? setsToSave(workout) : [];
    const totalSets = items.reduce((n, x) => n + x.sets.length, 0);
    const anyDone = workout.exercises.some((e) => e.sets.some((s) => s.done));
    return (
      <>
        <ActiveWorkout
          workout={workout}
          setWorkout={setWorkout}
          onFinish={() => setReviewing(true)}
          onBackToPrevious={leave}
          openExercisePickerOnStart={openPicker}
          onPickerAutoOpened={() => setOpenPicker(false)}
          weightUnit="lbs"
          historyUserId={id}
          recentExercises={recentExercises}
          contextLabel={`Logging for ${dash.name}`}
          finishLabel={`Review & save for ${dash.name}`}
        />

        {reviewing && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(3,5,9,0.92)' }} onClick={() => !saving && setReviewing(false)}>
            <div
              className="w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-[22px] font-bold text-[var(--text-primary)] leading-tight">Save to {dash.name}&apos;s log</h2>
              <p className="text-[14px] text-[var(--text-secondary)] mt-1">
                {format(new Date(workout.startAt), 'EEE, MMM d')} · {items.length} exercise{items.length === 1 ? '' : 's'} · {totalSets} set{totalSets === 1 ? '' : 's'}
              </p>
              <input
                value={workout.title}
                onChange={(e) => setWorkout((p) => (p ? { ...p, title: e.target.value } : p))}
                placeholder="Session name (optional)"
                className="w-full h-12 rounded-2xl px-4 mt-4 text-[15px] font-semibold outline-none"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              />
              <div className="mt-3 max-h-[40vh] overflow-y-auto rounded-2xl divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
                {items.length === 0 ? (
                  <p className="px-4 py-4 text-[13px] text-[var(--text-muted)]">No sets with weight or reps yet.</p>
                ) : items.map(({ exercise, sets }) => (
                  <div key={exercise.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <p className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{exercise.name}</p>
                    <p className="text-[12px] text-[var(--text-muted)] shrink-0 tabular-nums">
                      {sets.map((s) => (s.weight ? `${s.weight}×${s.reps ?? 0}` : `${s.reps ?? 0}`)).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[12px] text-[var(--text-muted)] mt-2">
                {anyDone ? 'Only ticked sets are saved.' : 'Every set with a value is saved — tick sets in the logger to save only those.'} Weights in lb.
              </p>
              <button
                type="button"
                disabled={saving || items.length === 0}
                onClick={save}
                className="w-full h-13 py-3.5 mt-4 rounded-2xl font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                {saving ? <AppIcon name="Spinner" size="md" /> : 'Save session'}
              </button>
              <button type="button" disabled={saving} onClick={() => setReviewing(false)} className="w-full h-11 mt-2 rounded-2xl text-[14px] font-semibold text-[var(--text-secondary)]">
                Keep editing
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Start chooser ──
  const lastTitle = last ? getWorkoutDisplayTitle(last) : '';
  const lastCount = last ? new Set((last.exercises || []).map((e) => e.name)).size : 0;
  const planDays = plans.flatMap((p) =>
    groupByDay(p.exercises).map(([label, exs], i, all) => ({
      key: `${p.id}-${i}`,
      plan: p,
      label: all.length > 1 ? `${p.title} — ${label || `Day ${i + 1}`}` : p.title,
      day: all.length > 1 ? label : '',
      exs,
    })),
  );

  return (
    <div className="fixed inset-0 z-40 bg-[var(--bg-base)] overflow-y-auto">
      <div className="mx-auto w-full max-w-md px-4 pb-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3 pb-5">
          <button type="button" onClick={() => navigate(`/coach/trainee/${id}`)} aria-label="Back"
            className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--bg-elevated)' }}>
            <AppIcon name="Back" size="md" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">Log a session</h1>
            <p className="text-[14px] text-[var(--text-muted)] truncate">For {dash.name} · pick a starting point</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {draft && (
            <StartCard
              icon="History"
              title="Resume unsaved session"
              sub={`${draft.workout.exercises.length} exercise${draft.workout.exercises.length === 1 ? '' : 's'} in progress`}
              accent
              onClick={() => { setSourcePlanId(draft.sourcePlanId); setSourcePlanDay(draft.sourcePlanDay ?? null); setWorkout(draft.workout); }}
              onDismiss={discardDraft}
            />
          )}
          {last && (
            <StartCard
              icon="Duplicate"
              title="Repeat last session"
              sub={`${lastTitle || 'Workout'} · ${format(new Date(`${last.date}T00:00:00`), 'EEE, MMM d')} · ${lastCount} exercise${lastCount === 1 ? '' : 's'}`}
              accent={!draft}
              onClick={() => start(entriesFromWorkout(last), isWorkoutUnnamed(last) ? '' : last.title, last.source_plan_id, false, last.source_plan_day ?? null)}
            />
          )}
          {planDays.map((d) => (
            <StartCard
              key={d.key}
              icon="Clipboard"
              title={d.label}
              sub={`Assigned plan · ${d.exs.length} exercise${d.exs.length === 1 ? '' : 's'} as prescribed`}
              onClick={() => start(entriesFromPlan(d.exs), d.label, d.plan.id, false, d.day)}
            />
          ))}
          <StartCard
            icon="Plus"
            title="Start blank"
            sub="Pick exercises — each prefills from their last time"
            onClick={() => start([], '', null, true)}
          />
        </div>
      </div>
    </div>
  );
};

const StartCard: React.FC<{
  icon: 'History' | 'Duplicate' | 'Clipboard' | 'Plus';
  title: string;
  sub: string;
  accent?: boolean;
  onClick: () => void;
  onDismiss?: () => void;
}> = ({ icon, title, sub, accent, onClick, onDismiss }) => (
  <div className="relative">
    <button
      type="button"
      onClick={onClick}
      className="w-full glass-card px-4 py-4 flex items-center gap-3.5 text-left active:scale-[0.99] transition-transform"
      style={accent ? { borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)' } : undefined}
    >
      <span className="shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl"
        style={accent ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
        <AppIcon name={icon} size="md" />
      </span>
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-[16px] font-semibold text-[var(--text-primary)] truncate">{title}</p>
        <p className="text-[13px] text-[var(--text-muted)] mt-0.5 truncate">{sub}</p>
      </div>
      {!onDismiss && <AppIcon name="Forward" size="md" />}
    </button>
    {onDismiss && (
      <button type="button" onClick={onDismiss} aria-label="Discard draft"
        className="absolute top-1/2 -translate-y-1/2 right-3 h-8 w-8 rounded-lg flex items-center justify-center" style={{ color: '#ff8080' }}>
        <AppIcon name="Trash" size="sm" />
      </button>
    )}
  </div>
);

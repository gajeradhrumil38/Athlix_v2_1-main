import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { AppIcon } from '../config/icons';
import { ActiveWorkout } from '../components/log/ActiveWorkout';
import { CenterModal } from '../components/shared/CenterModal';
import { CoachLogStartOptions } from '../components/coach/CoachLogStart';
import type { Exercise } from '../components/log/ExercisePicker';
import type { WorkoutState } from './Log';
import { getTraineeDashboard, peekTraineeDashboard, type TraineeDashboard } from '../lib/coachData';
import { getAssignedPlansFor, peekAssignedPlansFor, type AssignedPlan } from '../lib/assignedPlans';
import { muscleFor, readCoachDraft, seedSession, writeCoachDraft, type CoachLogStart } from '../lib/coachLog';
import { resolveEffectiveInputType } from '../lib/exerciseTypes';
import { useExerciseOverrides } from '../contexts/ExerciseOverridesContext';
import { saveWorkout } from '../lib/supabaseData';

// A coach recording a session for a trainee in the SAME logger the athlete
// uses (ActiveWorkout), pointed at the trainee's history. Normally opened from
// the "+ Log" popup with a chosen starting point: the session is built from
// the trainee data already in memory, so the logger appears immediately. Only
// a direct visit (refresh / shared link) loads data and shows the chooser here.

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
  const location = useLocation();
  const { overrides } = useExerciseOverrides();
  const requested = (location.state as { start?: CoachLogStart } | null)?.start ?? null;

  // Seed synchronously from memory so the logger renders on the first frame.
  const [initial] = useState(() => {
    const dash = peekTraineeDashboard(id);
    const plans = peekAssignedPlansFor(id) ?? [];
    const seed = requested && dash ? seedSession(requested, dash, plans, readCoachDraft(id)) : null;
    return { dash, plans, seed };
  });
  const [dash, setDash] = useState<TraineeDashboard | null>(initial.dash);
  const [plans, setPlans] = useState<AssignedPlan[]>(initial.plans);
  const [loading, setLoading] = useState(!initial.dash);
  const [workout, setWorkout] = useState<WorkoutState | null>(initial.seed?.workout ?? null);
  const [sourcePlanId, setSourcePlanId] = useState<string | null>(initial.seed?.sourcePlanId ?? null);
  const [sourcePlanDay, setSourcePlanDay] = useState<string | null>(initial.seed?.sourcePlanDay ?? null);
  const [openPicker, setOpenPicker] = useState(initial.seed?.openPicker ?? false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => readCoachDraft(id));

  // Direct visit with nothing in memory: load, then honour a requested start.
  useEffect(() => {
    if (initial.dash) return;
    let cancelled = false;
    (async () => {
      const [d, p] = await Promise.all([getTraineeDashboard(id), getAssignedPlansFor(id)]);
      if (cancelled) return;
      setDash(d);
      setPlans(p);
      setLoading(false);
      if (d && requested) applySeed(seedSession(requested, d, p, readCoachDraft(id)));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Survive an accidental back/refresh mid-entry.
  useEffect(() => {
    if (workout) writeCoachDraft(id, { workout, sourcePlanId, sourcePlanDay });
  }, [id, workout, sourcePlanId, sourcePlanDay]);

  const applySeed = (seed: ReturnType<typeof seedSession>) => {
    if (!seed) return;
    setSourcePlanId(seed.sourcePlanId);
    setSourcePlanDay(seed.sourcePlanDay);
    setOpenPicker(seed.openPicker);
    setWorkout(seed.workout);
  };

  const workouts = useMemo(() => (dash?.workouts.shared ? dash.workouts.data : []), [dash]);

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

  // Back to the trainee page the way we came — a history pop, so it restores
  // instantly (the page renders from memory) instead of a fresh navigation.
  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(`/coach/trainee/${id}`, { replace: true });
  };

  const leave = () => {
    const hasWork = workout?.exercises.some((e) => e.sets.some((s) => s.weight || s.reps));
    if (hasWork && !window.confirm('Leave without saving? Your entries stay as a draft for next time.')) return;
    goBack();
  };

  const discardDraft = () => {
    if (!window.confirm('Discard the unsaved session?')) return;
    writeCoachDraft(id, null);
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
      writeCoachDraft(id, null);
      // Refresh the in-memory copy so the trainee page shows this session as
      // soon as we're back on it.
      void getTraineeDashboard(id);
      toast.success(`Saved to ${dash.name}'s log`);
      goBack();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save this session.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="fixed inset-0 z-40 bg-[var(--bg-base)]" />;
  }

  if (!dash || !dash.workouts.shared) {
    return (
      <div className="fixed inset-0 z-40 bg-[var(--bg-base)] flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-[18px] font-semibold text-[var(--text-primary)]">
          {dash ? `${dash.name} isn't sharing workouts with you` : 'Trainee not found'}
        </p>
        <p className="text-[14px] text-[var(--text-muted)] max-w-[300px]">Logging a session needs the trainee to share their workouts.</p>
        <button type="button" onClick={() => (dash ? goBack() : navigate('/coach'))} className="mt-2 text-[15px] font-semibold text-[var(--accent)]">Go back</button>
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
          multiSelectPicker
          contextLabel={`Logging for ${dash.name}`}
          finishLabel={`Review & save for ${dash.name}`}
        />

        <CenterModal open={reviewing} onClose={() => !saving && setReviewing(false)} zIndex={60}>
          <div className="p-6 overflow-y-auto">
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
            <div className="mt-3 max-h-[36vh] overflow-y-auto rounded-2xl divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
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
        </CenterModal>
      </>
    );
  }

  // Direct visit without a chosen start: pick one here.
  return (
    <div className="fixed inset-0 z-40 bg-[var(--bg-base)] overflow-y-auto">
      <div className="mx-auto w-full max-w-md px-4 pb-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-3 pb-5">
          <button type="button" onClick={goBack} aria-label="Back"
            className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'var(--bg-elevated)' }}>
            <AppIcon name="Back" size="md" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold text-[var(--text-primary)] leading-tight">Log a session</h1>
            <p className="text-[14px] text-[var(--text-muted)] truncate">For {dash.name} · pick a starting point</p>
          </div>
        </div>
        <CoachLogStartOptions
          dash={dash}
          plans={plans}
          draft={draft}
          onPick={(start) => applySeed(seedSession(start, dash, plans, readCoachDraft(id)))}
          onDiscardDraft={discardDraft}
        />
      </div>
    </div>
  );
};

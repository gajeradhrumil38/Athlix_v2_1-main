import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AppIcon } from '../config/icons';
import { ActiveWorkout } from '../components/log/ActiveWorkout';
import { CoachLogStartOptions } from '../components/coach/CoachLogStart';
import type { WorkoutState } from './Log';
import { getTraineeDashboard, peekTraineeDashboard, type TraineeDashboard } from '../lib/coachData';
import { getAssignedPlansFor, peekAssignedPlansFor, type AssignedPlan } from '../lib/assignedPlans';
import { readCoachDraft, saveCoachSession, seedSession, traineeRecentExercises, writeCoachDraft, type CoachLogStart } from '../lib/coachLog';
import { CoachSessionReview } from '../components/coach/CoachSessionReview';
import { SessionRecapModal } from '../components/coach/SessionRecapModal';
import { useExerciseOverrides } from '../contexts/ExerciseOverridesContext';
import { confirmDialog } from '../components/shared/ConfirmDialog';

// A coach recording a session for a trainee in the SAME logger the athlete
// uses (ActiveWorkout), pointed at the trainee's history. Normally opened from
// the "+ Log" popup with a chosen starting point: the session is built from
// the trainee data already in memory, so the logger appears immediately. Only
// a direct visit (refresh / shared link) loads data and shows the chooser here.

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

  const recentExercises = useMemo(() => traineeRecentExercises(workouts), [workouts]);

  // Back to the trainee page the way we came — a history pop, so it restores
  // instantly (the page renders from memory) instead of a fresh navigation.
  const goBack = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate(`/coach/trainee/${id}`, { replace: true });
  };

  const leave = async () => {
    const hasWork = workout?.exercises.some((e) => e.sets.some((s) => s.weight || s.reps));
    if (hasWork && !(await confirmDialog({ title: 'Leave without saving?', message: 'Your entries stay as a draft for next time.', confirmLabel: 'Leave' }))) return;
    goBack();
  };

  const discardDraft = async () => {
    if (!(await confirmDialog({ title: 'Discard the unsaved session?', message: 'The sets logged in it will be lost.', confirmLabel: 'Discard', danger: true }))) return;
    writeCoachDraft(id, null);
    setDraft(null);
  };

  // After saving, show the recap (against pre-save history), then go back.
  const [recap, setRecap] = useState<{ workout: WorkoutState; dash: TraineeDashboard } | null>(null);
  const save = async () => {
    if (!workout || !dash) return;
    setSaving(true);
    try {
      await saveCoachSession(id, { workout, sourcePlanId, sourcePlanDay }, overrides);
      void getTraineeDashboard(id);
      toast.success(`Saved to ${dash.name}'s log`);
      setReviewing(false);
      setRecap({ workout, dash });
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

        <CoachSessionReview open={reviewing} onClose={() => !saving && setReviewing(false)} traineeName={dash.name}
          workout={workout} onTitle={(title) => setWorkout((p) => (p ? { ...p, title } : p))} saving={saving} onSave={save} />
        {recap && <SessionRecapModal open dash={recap.dash} workout={recap.workout} onDone={goBack} />}
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

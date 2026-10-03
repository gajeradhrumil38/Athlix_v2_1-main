import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AppIcon } from '../../config/icons';
import { useExerciseOverrides } from '../../contexts/ExerciseOverridesContext';
import type { TraineeDashboard } from '../../lib/coachData';
import type { AssignedPlan } from '../../lib/assignedPlans';
import type { WorkoutState } from '../../pages/Log';
import { currentPlan, planProgress } from '../../lib/planProgress';
import { readCoachDraft, saveCoachSession, seedSession, traineeRecentExercises, writeCoachDraft, type CoachLogDraft, type CoachLogStart } from '../../lib/coachLog';
import { TodaySessionCard } from '../home/TodaySessionCard';
import { CoachPlanCardView } from '../home/CoachPlanCardView';
import { CoachLogStartModal } from './CoachLogStart';
import { CoachSessionReview } from './CoachSessionReview';

// Trainee Overview, top: what's next for this trainee and, once started, the
// in-person session as a tick-off card. Same draft as the full coach logger.
interface Props { traineeId: string; dash: TraineeDashboard; plans: AssignedPlan[]; onSaved: () => void; menuInset?: boolean }

export const CoachSessionCard: React.FC<Props> = ({ traineeId, dash, plans, onSaved, menuInset }) => {
  const navigate = useNavigate();
  const { overrides } = useExerciseOverrides();
  const [draft, setDraft] = useState<CoachLogDraft | null>(() => readCoachDraft(traineeId));
  const [choosing, setChoosing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const workouts = useMemo(() => (dash.workouts.shared ? dash.workouts.data : []), [dash]);
  const recent = useMemo(() => traineeRecentExercises(workouts), [workouts]);
  const plan = useMemo(() => currentPlan(plans, workouts), [plans, workouts]);

  const store = (next: CoachLogDraft | null) => { writeCoachDraft(traineeId, next); setDraft(next); };
  const begin = (start: CoachLogStart) => {
    const seed = seedSession(start, dash, plans, readCoachDraft(traineeId));
    if (seed) store({ workout: seed.workout, sourcePlanId: seed.sourcePlanId, sourcePlanDay: seed.sourcePlanDay });
  };
  const update = (workout: WorkoutState) => store({ sourcePlanId: draft?.sourcePlanId ?? null, sourcePlanDay: draft?.sourcePlanDay ?? null, workout });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveCoachSession(traineeId, draft, overrides);
      setReviewing(false);
      setDraft(null);
      toast.success(`Saved to ${dash.name}'s log`);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save this session.');
    } finally {
      setSaving(false);
    }
  };

  if (!dash.workouts.shared) return null;

  if (draft) {
    return (
      <>
        <TodaySessionCard
          workout={draft.workout}
          label={`Session with ${dash.name}`}
          historyUserId={traineeId}
          recentExercises={recent}
          readCurrent={() => readCoachDraft(traineeId)?.workout ?? null}
          onChange={update}
          onDiscard={() => { if (window.confirm('Discard this session? Nothing will be saved.')) store(null); }}
          onOpenLogger={() => navigate(`/coach/trainee/${traineeId}/log`, { state: { start: { kind: 'resume' } } })}
          onFinish={() => setReviewing(true)}
          menuInset={menuInset}
        />
        <CoachSessionReview open={reviewing} onClose={() => !saving && setReviewing(false)} traineeName={dash.name}
          workout={draft.workout} onTitle={(title) => update({ ...draft.workout, title })} saving={saving} onSave={save} />
      </>
    );
  }

  return (
    <>
      {plan ? (
        <div>
          <CoachPlanCardView
            plan={plan}
            coachName={null}
            eyebrow={`Next for ${dash.name}`}
            progress={planProgress(plan, workouts)}
            onStart={(day) => begin({ kind: 'plan', planId: plan.id, day })}
          />
          <button type="button" onClick={() => setChoosing(true)} className="mt-2 text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-1">
            Repeat last session, another plan, or start blank <AppIcon name="Forward" size="sm" />
          </button>
        </div>
      ) : (
        <div className="glass-card px-4 py-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold text-[var(--text-primary)]">Train with {dash.name}</p>
            <p className="text-[13px] text-[var(--text-muted)] mt-0.5">Run an in-person session and tick exercises off as they go.</p>
          </div>
          <button type="button" onClick={() => setChoosing(true)} className="shrink-0 h-11 px-4 rounded-2xl font-bold text-[14px]" style={{ background: 'var(--accent)', color: '#000' }}>
            Start session
          </button>
        </div>
      )}
      <CoachLogStartModal open={choosing} onClose={() => setChoosing(false)} traineeId={traineeId} dash={dash} plans={plans} onPick={begin} />
    </>
  );
};

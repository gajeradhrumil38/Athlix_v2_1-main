import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMyAssignedPlans, getMyPlanSessions, planStartState, type AssignedPlan } from '../../lib/assignedPlans';
import { getMyCoaches, type CoachLink } from '../../lib/coachLinks';
import { currentPlan, planProgress, type PlanSession } from '../../lib/planProgress';
import { CoachPlanCardView } from './CoachPlanCardView';

// Trainee Home: "what to do today" from the coach's current plan. Hidden for
// anyone without an active plan.
export const CoachPlanCard: React.FC<{ onStartDay?: (plan: AssignedPlan, day: string) => void }> = ({ onStartDay }) => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [sessions, setSessions] = useState<PlanSession[]>([]);
  const [coaches, setCoaches] = useState<CoachLink[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, c] = await Promise.all([getMyAssignedPlans(), getMyCoaches()]);
      const s = await getMyPlanSessions(p.map((x) => x.id));
      if (!cancelled) { setPlans(p); setCoaches(c); setSessions(s); }
    })();
    return () => { cancelled = true; };
  }, []);

  const plan = useMemo(
    () => plans.find((p) => p.id === pickedId) ?? currentPlan(plans, sessions),
    [plans, sessions, pickedId],
  );
  if (!plan) return null;

  const coachName = coaches.find((c) => c.trainer_id === plan.trainer_id)?.trainer_name ?? null;
  const others = plans.filter((p) => p.id !== plan.id);

  return (
    <>
      <CoachPlanCardView
        plan={plan}
        coachName={coachName}
        progress={planProgress(plan, sessions)}
        otherPlansCount={others.length}
        onStart={(day) => (onStartDay ? onStartDay(plan, day) : navigate('/log', { state: planStartState(plan, day) }))}
        onOpenPlan={() => navigate('/my-coach')}
        onSwitch={() => setSwitching(true)}
      />
      {switching && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(3,5,9,0.9)' }} onClick={() => setSwitching(false)}>
          <div className="w-full max-w-md rounded-t-3xl p-5" onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <p className="text-[18px] font-bold text-[var(--text-primary)] mb-3">Your plans</p>
            <div className="space-y-2">
              {plans.map((p) => (
                <button key={p.id} type="button" onClick={() => { setPickedId(p.id); setSwitching(false); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left"
                  style={{ background: 'var(--bg-elevated)', border: p.id === plan.id ? '1px solid var(--accent)' : '1px solid transparent' }}>
                  <span className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{p.title}</span>
                  <span className="text-[12px] text-[var(--text-muted)] shrink-0">{p.exercises.length} exercises</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

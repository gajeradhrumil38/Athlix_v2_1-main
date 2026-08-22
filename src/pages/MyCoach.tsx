import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '../config/icons';
import { getMyAssignedPlans, type AssignedPlan } from '../lib/assignedPlans';

// Trainee's view of what their coach assigned. Each plan can be started — it
// loads straight into the logger, pre-filled, via the same route.state the
// recommendation cards use.
export const MyCoach: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { setPlans(await getMyAssignedPlans()); setLoading(false); })();
  }, []);

  const start = (plan: AssignedPlan) => {
    const recommendedExercises = plan.exercises.map((e) => ({
      name: e.name,
      sets: e.default_sets,
      reps: String(e.default_reps),
    }));
    navigate('/log', { state: { recommendedExercises, suggestedTitle: plan.title, sourcePlanId: plan.id } });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      <div className="pt-2 pb-5">
        <h1 className="text-[30px] font-bold text-[var(--text-primary)] leading-none">My coach</h1>
        <p className="text-[15px] text-[var(--text-muted)] mt-1.5">Plans assigned to you</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-muted)] py-10 justify-center">
          <AppIcon name="Spinner" size="sm" /> Loading…
        </div>
      ) : plans.length === 0 ? (
        <div className="glass-card px-6 py-12 flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl mb-4"
            style={{ background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
            <AppIcon name="Clipboard" size="xl" />
          </span>
          <p className="text-[20px] font-bold text-[var(--text-primary)]">No plans yet</p>
          <p className="text-[15px] text-[var(--text-muted)] mt-1.5 max-w-[280px] leading-snug">
            When your coach assigns a workout, it'll show up here ready to start.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => (
            <div key={p.id} className="glass-card overflow-hidden">
              <div className="px-5 pt-4 pb-3">
                <p className="text-[20px] font-bold text-[var(--text-primary)]">{p.title}</p>
                {p.notes && <p className="text-[14px] text-[var(--text-secondary)] mt-1 leading-snug">{p.notes}</p>}
              </div>
              <div className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {p.exercises.map((e, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[16px] font-medium text-[var(--text-primary)] truncate pr-3">{e.name}</p>
                      <p className="text-[14px] text-[var(--text-muted)] shrink-0 tabular-nums">
                        {e.default_sets} × {e.default_reps}{e.default_weight ? ` @ ${e.default_weight}` : ''}{e.rest_seconds ? ` · ${e.rest_seconds}s` : ''}
                      </p>
                    </div>
                    {e.note && <p className="text-[13px] mt-1 leading-snug" style={{ color: 'var(--accent)' }}>{e.note}</p>}
                  </div>
                ))}
              </div>
              <div className="p-4">
                <button
                  type="button"
                  onClick={() => start(p)}
                  className="w-full h-13 py-3.5 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  <AppIcon name="Plus" size="sm" /> Start this workout
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

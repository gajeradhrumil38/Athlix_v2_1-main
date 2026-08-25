import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { groupByDay, type AssignedPlan } from '../../lib/assignedPlans';
import { getExerciseMuscleProfile } from '../../lib/exerciseMuscles';
import { muscleColor } from '../../lib/muscleColors';

// On-demand plan preview — same body/CTA pattern as AssignedPlanModal (the
// "new plan" popup), but triggered by tapping a plan reference elsewhere
// (e.g. the plan chip on an appointment card) instead of an unseen-plans
// queue. A trainer previewing their own trainee's plan can't "start" it —
// only the trainee gets the Start button.
const resolveMuscleGroup = (name: string, stored?: string | null): string =>
  stored || getExerciseMuscleProfile(name).primary[0] || 'Core';

interface Props {
  open: boolean;
  plan: AssignedPlan | null;
  loading: boolean;
  role: 'trainee' | 'trainer';
  onClose: () => void;
}

export const PlanPreviewModal: React.FC<Props> = ({ open, plan, loading, role, onClose }) => {
  const navigate = useNavigate();
  if (!open) return null;

  const dayGroups = plan ? groupByDay(plan.exercises) : [];
  const isMultiDay = dayGroups.length > 1;

  const start = () => {
    if (!plan) return;
    onClose();
    if (isMultiDay) { navigate('/my-coach'); return; }
    const recommendedExercises = plan.exercises.map((e) => ({
      name: e.name,
      sets: e.default_sets,
      reps: String(e.default_reps),
    }));
    navigate('/log', { state: { recommendedExercises, suggestedTitle: plan.title, sourcePlanId: plan.id } });
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[85] flex items-center justify-center px-5"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ background: '#05070b' }}
        onClick={onClose}
      >
        <motion.div
          className="w-full max-w-[400px] rounded-3xl overflow-hidden"
          initial={{ scale: 0.94, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative px-6 pt-7 pb-4 text-center">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute top-3 right-3 h-9 w-9 rounded-full flex items-center justify-center text-[var(--text-muted)]"
              style={{ background: 'var(--bg-elevated)' }}
            >
              <AppIcon name="Close" size="sm" />
            </button>

            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
              style={{ background: 'var(--accent)', color: '#000' }}>
              <AppIcon name="Clipboard" size="xl" />
            </span>

            {loading || !plan ? (
              <p className="text-[15px] text-[var(--text-secondary)] py-6">Loading plan…</p>
            ) : (
              <>
                <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Assigned plan</p>
                <h2 className="text-[23px] font-bold text-[var(--text-primary)] leading-tight mt-1.5">{plan.title}</h2>
                {plan.notes && <p className="text-[14px] text-[var(--text-secondary)] mt-1.5 leading-snug">{plan.notes}</p>}
              </>
            )}
          </div>

          {plan && (
            isMultiDay ? (
              <div className="mx-5 rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
                {dayGroups.map(([dayLabel, exercises], i) => {
                  const counts = new Map<string, number>();
                  for (const e of exercises) {
                    const g = resolveMuscleGroup(e.name, e.muscle_group);
                    counts.set(g, (counts.get(g) || 0) + 1);
                  }
                  const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
                  return (
                    <div key={i} className="flex items-center gap-2.5 px-4 py-3">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: dominant ? muscleColor(dominant) : 'var(--text-muted)' }} />
                      <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate flex-1">{dayLabel || `Day ${i + 1}`}</p>
                      <p className="text-[13px] text-[var(--text-muted)] shrink-0 tabular-nums">{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mx-5 rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
                {plan.exercises.slice(0, 6).map((e, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-4 py-3">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ background: muscleColor(resolveMuscleGroup(e.name, e.muscle_group)) }} />
                    <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate flex-1">{e.name}</p>
                    <p className="text-[13px] text-[var(--text-muted)] shrink-0 tabular-nums">
                      {e.default_sets} sets × {e.default_reps} reps{e.default_weight ? ` @ ${e.default_weight} lb` : ''}
                    </p>
                  </div>
                ))}
                {plan.exercises.length > 6 && (
                  <p className="px-4 py-2 text-[13px] text-[var(--text-muted)]">+{plan.exercises.length - 6} more</p>
                )}
              </div>
            )
          )}

          <div className="px-5 pt-4 pb-5 flex flex-col gap-2.5">
            {role === 'trainee' && plan && (
              <button
                type="button"
                onClick={start}
                className="w-full h-13 py-3.5 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                <AppIcon name="Plus" size="sm" /> {isMultiDay ? 'View plan' : 'Start workout'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full h-12 rounded-2xl font-semibold text-[15px] text-[var(--text-secondary)]"
              style={{ background: 'var(--bg-elevated)' }}
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

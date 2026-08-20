import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { getMyAssignedPlans, type AssignedPlan } from '../../lib/assignedPlans';

// App-wide popup: when the trainee's coach assigns a plan, this surfaces it with
// its exercises and a one-tap "Start workout" that loads them straight into the
// logger — so the athlete never has to go hunting for the plan. Shows once per
// plan (persisted), then it lives on in My Coach.
const SEEN_KEY = 'athlix:seen_plans';
const readSeen = (): string[] => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
};
const markSeen = (id: string) => {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...readSeen(), id])])); } catch { /* ignore */ }
};

export const AssignedPlanModal: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<AssignedPlan[]>([]);

  const load = useCallback(async () => {
    const all = await getMyAssignedPlans();
    const seen = readSeen();
    setPlans(all.filter((p) => !seen.includes(p.id)));
  }, []);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('athlix:refresh-invites', handler);
    return () => window.removeEventListener('athlix:refresh-invites', handler);
  }, [load]);

  const current = plans[0];
  if (!current) return null;

  const dismiss = () => { markSeen(current.id); setPlans((p) => p.slice(1)); };

  const start = () => {
    const recommendedExercises = current.exercises.map((e) => ({
      name: e.name,
      sets: e.default_sets,
      reps: String(e.default_reps),
    }));
    markSeen(current.id);
    setPlans((p) => p.slice(1));
    navigate('/log', { state: { recommendedExercises, suggestedTitle: current.title, sourcePlanId: current.id } });
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[80] flex items-center justify-center px-5"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ background: '#05070b' }}
      >
        <motion.div
          className="w-full max-w-[400px] rounded-3xl overflow-hidden"
          initial={{ scale: 0.94, y: 12, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="relative px-6 pt-7 pb-4 text-center">
            <button
              type="button"
              onClick={dismiss}
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
            <p className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">New plan from your coach</p>
            <h2 className="text-[23px] font-bold text-[var(--text-primary)] leading-tight mt-1.5">{current.title}</h2>
            {current.notes && <p className="text-[14px] text-[var(--text-secondary)] mt-1.5 leading-snug">{current.notes}</p>}
          </div>

          {/* Exercise preview */}
          <div className="mx-5 rounded-2xl overflow-hidden divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
            {current.exercises.slice(0, 5).map((e, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5">
                <p className="text-[15px] font-medium text-[var(--text-primary)] truncate pr-3">{e.name}</p>
                <p className="text-[13px] text-[var(--text-muted)] shrink-0">{e.default_sets} × {e.default_reps}</p>
              </div>
            ))}
            {current.exercises.length > 5 && (
              <p className="px-4 py-2 text-[13px] text-[var(--text-muted)]">+{current.exercises.length - 5} more</p>
            )}
          </div>

          <div className="px-5 pt-4 pb-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={start}
              className="w-full h-13 py-3.5 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              <AppIcon name="Plus" size="sm" /> Start workout
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="w-full h-12 rounded-2xl font-semibold text-[15px] text-[var(--text-secondary)]"
              style={{ background: 'var(--bg-elevated)' }}
            >
              Later
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

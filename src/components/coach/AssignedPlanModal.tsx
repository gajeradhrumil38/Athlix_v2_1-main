import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AppIcon } from '../../config/icons';
import { getMyAssignedPlans, groupByDay, type AssignedPlan } from '../../lib/assignedPlans';
import { getExerciseMuscleProfile } from '../../lib/exerciseMuscles';
import { muscleColor } from '../../lib/muscleColors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

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

// Prefer the muscle group actually stored on the exercise; fall back to
// name-pattern inference so a color always shows, even on rows saved before
// muscle_group was populated.
const resolveMuscleGroup = (name: string, stored?: string | null): string =>
  stored || getExerciseMuscleProfile(name).primary[0] || 'Core';

// Fallback poll interval — only matters while the realtime channel below is
// disconnected/reconnecting. Live delivery is instant; this just guarantees
// the popup can never be more than this far behind even without one.
const POLL_MS = 30_000;

export const AssignedPlanModal: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
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

    // Live push: the instant a coach assigns a plan, Postgres broadcasts the
    // insert over this channel and the popup appears with zero delay — no
    // refresh, no waiting for a poll. postgres_changes respects the table's
    // RLS (assigned_plans_trainee_select), so this only ever fires for rows
    // where this user is the trainee.
    const channel = user
      ? supabase
          .channel(`assigned-plans-${user.id}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'assigned_plans', filter: `trainee_id=eq.${user.id}` },
            () => load(),
          )
          .subscribe()
      : null;

    // Fallback for when the realtime connection is down/reconnecting
    // (backgrounded mobile app, flaky network): poll quietly, and refetch
    // immediately on tab focus/visibility so it's never more than a beat
    // behind even without a live connection.
    const interval = window.setInterval(load, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', load);

    return () => {
      window.removeEventListener('athlix:refresh-invites', handler);
      if (channel) supabase.removeChannel(channel);
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', load);
    };
  }, [load, user]);

  const current = plans[0];
  if (!current) return null;

  const dayGroups = groupByDay(current.exercises);
  const isMultiDay = dayGroups.length > 1;

  const dismiss = () => { markSeen(current.id); setPlans((p) => p.slice(1)); };

  // A multi-day plan can't be blindly "started" — that would bundle every
  // day's exercises into one session. Send the trainee to My Coach instead,
  // where each day gets its own Start button.
  const start = () => {
    markSeen(current.id);
    setPlans((p) => p.slice(1));
    if (isMultiDay) { navigate('/my-coach'); return; }
    const recommendedExercises = current.exercises.map((e) => ({
      name: e.name,
      sets: e.default_sets,
      reps: String(e.default_reps),
    }));
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

          {/* Exercise preview — a colored dot per muscle group (per day for a
              multi-day plan, its dominant group; per exercise otherwise) so
              the trainee gets a sense of what's being trained at a glance,
              not just a wall of names. */}
          {isMultiDay ? (
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
              {current.exercises.slice(0, 5).map((e, i) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-3">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: muscleColor(resolveMuscleGroup(e.name, e.muscle_group)) }} />
                  <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate flex-1">{e.name}</p>
                  <p className="text-[13px] text-[var(--text-muted)] shrink-0 tabular-nums">
                    {e.default_sets} sets × {e.default_reps} reps{e.default_weight ? ` @ ${e.default_weight} lb` : ''}
                  </p>
                </div>
              ))}
              {current.exercises.length > 5 && (
                <p className="px-4 py-2 text-[13px] text-[var(--text-muted)]">+{current.exercises.length - 5} more</p>
              )}
            </div>
          )}

          <div className="px-5 pt-4 pb-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={start}
              className="w-full h-13 py-3.5 rounded-2xl font-bold text-[17px] flex items-center justify-center gap-2"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              <AppIcon name="Plus" size="sm" /> {isMultiDay ? 'View plan' : 'Start workout'}
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

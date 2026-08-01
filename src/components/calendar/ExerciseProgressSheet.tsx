import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { getExerciseRowsWithWorkoutDates } from '../../lib/supabaseData';
import { convertWeight, isWeightUnit, type WeightUnit } from '../../lib/units';
import { muscleColor } from '../../lib/muscleColors';

interface Session {
  date: string;
  top: number;      // top-set weight (or reps for a bodyweight/reps exercise)
  reps: number;     // reps at the top set
  sets: number;     // total sets that session
}

// "Am I progressing?" at a glance — an exercise's recent top sets, its
// all-time best, and the trend vs last time. Loads the full cross-workout
// history lazily on open (the calendar itself only holds the current month).
export const ExerciseProgressSheet: React.FC<{
  exerciseName: string;
  unit: WeightUnit;
  muscleGroup?: string | null;
  onClose: () => void;
}> = ({ exerciseName, unit, muscleGroup, onClose }) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<any[] | null>(null);
  const accent = muscleColor(muscleGroup || '');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getExerciseRowsWithWorkoutDates(user.id)
      .then((all) => { if (!cancelled) setRows(all as any[]); })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [user]);

  const { sessions, best, repsBased } = useMemo(() => {
    if (!rows) return { sessions: [] as Session[], best: 0, repsBased: false };
    const mine = rows.filter((r) => r.name === exerciseName && r.workouts?.date);
    const anyWeight = mine.some((r) => Number(r.weight || 0) > 0);
    const repsBased = !anyWeight;

    const byDate = new Map<string, any[]>();
    for (const r of mine) {
      const d = r.workouts.date as string;
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(r);
    }
    const sessions: Session[] = [...byDate.entries()].map(([date, rs]) => {
      let top = -1, reps = 0, sets = 0;
      for (const r of rs) {
        sets += Math.max(1, Number(r.sets || 1));
        const metric = repsBased
          ? Number(r.reps || 0)
          : convertWeight(Number(r.weight || 0), isWeightUnit(r.unit) ? r.unit : unit, unit, 0.1);
        const repsHere = Number(r.reps || 0);
        if (metric > top || (metric === top && repsHere > reps)) { top = metric; reps = repsHere; }
      }
      return { date, top: Math.max(0, top), reps, sets };
    }).sort((a, b) => b.date.localeCompare(a.date));

    const best = sessions.reduce((m, s) => Math.max(m, s.top), 0);
    return { sessions, best, repsBased };
  }, [rows, exerciseName, unit]);

  const latest = sessions[0];
  const prev = sessions[1];
  const delta = latest && prev ? latest.top - prev.top : 0;
  const metricLabel = repsBased ? 'reps' : unit;
  const recent = sessions.slice(0, 8).reverse(); // oldest→newest for the bar row

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[70] flex items-end justify-center"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 32 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-t-3xl flex flex-col"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full" style={{ background: 'var(--border)' }} />

          <div className="flex items-start justify-between px-5 pt-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.18em]" style={{ color: accent }}>Progression</p>
              <p className="text-[17px] font-bold leading-tight truncate" style={{ color: 'var(--text-primary)' }}>{exerciseName}</p>
            </div>
            <button onClick={onClose} className="h-8 w-8 -mr-1 flex items-center justify-center rounded-full shrink-0"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {rows === null ? (
            <div className="px-5 py-8">
              <div className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--bg-elevated)' }} />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px]" style={{ color: 'var(--text-muted)' }}>
              No history yet for this exercise.
            </p>
          ) : (
            <div className="px-5 pt-4">
              {/* Best + latest-vs-last trend */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] mb-0.5" style={{ color: 'var(--text-muted)' }}>Best</p>
                  <p className="text-[30px] font-black leading-none tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {Math.round(best)}<span className="text-[13px] font-bold ml-1" style={{ color: 'var(--text-muted)' }}>{metricLabel}</span>
                  </p>
                </div>
                {latest && (
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-[0.16em] mb-0.5" style={{ color: 'var(--text-muted)' }}>vs last</p>
                    <div className="flex items-center justify-end gap-1"
                      style={{ color: delta > 0 ? 'var(--accent)' : delta < 0 ? '#f87171' : 'var(--text-muted)' }}>
                      {delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : delta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                      <span className="text-[15px] font-black tabular-nums">{delta > 0 ? '+' : ''}{Math.round(delta)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Recent top-set bars (oldest → newest) */}
              <div className="flex items-end justify-between gap-1.5 mt-5" style={{ height: 72 }}>
                {recent.map((s, i) => {
                  const isBest = s.top === best;
                  const isLatest = i === recent.length - 1;
                  const h = best > 0 ? Math.max(6, Math.round((s.top / best) * 60)) : 6;
                  return (
                    <div key={s.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${format(parseISO(s.date), 'MMM d')} · ${Math.round(s.top)} ${metricLabel} × ${s.reps}`}>
                      <span className="text-[9px] font-bold tabular-nums" style={{ color: isBest ? accent : 'var(--text-muted)' }}>{Math.round(s.top)}</span>
                      <div className="w-full rounded-md" style={{
                        height: h,
                        background: isBest ? accent : isLatest ? 'var(--accent)' : 'var(--bg-elevated)',
                        opacity: isBest || isLatest ? 1 : 0.85,
                      }} />
                      <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{format(parseISO(s.date), 'M/d')}</span>
                    </div>
                  );
                })}
              </div>

              {/* Recent sessions, most recent first */}
              <div className="mt-5 space-y-1.5">
                {sessions.slice(0, 5).map((s, i) => (
                  <div key={s.date} className="flex items-center justify-between py-1.5 px-3 rounded-xl"
                    style={{ background: i === 0 ? 'var(--bg-elevated)' : 'transparent' }}>
                    <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                      {format(parseISO(s.date), 'EEE, MMM d')}
                    </span>
                    <span className="text-[13px] font-bold tabular-nums" style={{ color: s.top === best ? accent : 'var(--text-primary)' }}>
                      {Math.round(s.top)} {metricLabel} × {s.reps}
                      <span className="text-[11px] font-medium ml-1.5" style={{ color: 'var(--text-muted)' }}>· {s.sets} sets</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

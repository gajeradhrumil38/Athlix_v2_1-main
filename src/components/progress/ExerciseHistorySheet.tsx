import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';
import { X, Trophy } from 'lucide-react';
import { format } from 'date-fns';
import { parseDateAtStartOfDay } from '../../lib/dates';
import type { LocalPersonalRecord } from '../../lib/supabaseData';

interface ExerciseHistorySheetProps {
  exerciseName: string;
  muscleGroup: string | null;
  exercises: any[]; // full history rows: .name, .workout_id, .reps, .weight, .workouts.date — already unit-converted by the caller
  personalRecord: LocalPersonalRecord | null;
  weightUnit: 'kg' | 'lbs';
  onClose: () => void;
}

interface ExerciseSet {
  reps: number;
  weight: number;
}

interface ExerciseSession {
  workoutId: string;
  date: string;
  sets: ExerciseSet[];
}

const buildSessions = (exercises: any[], exerciseName: string): ExerciseSession[] => {
  const byWorkout = new Map<string, ExerciseSession>();
  exercises.forEach((ex) => {
    if (ex.name !== exerciseName) return;
    const date = ex.workouts?.date;
    if (!date) return;
    if (!byWorkout.has(ex.workout_id)) {
      byWorkout.set(ex.workout_id, { workoutId: ex.workout_id, date, sets: [] });
    }
    byWorkout.get(ex.workout_id)!.sets.push({ reps: Number(ex.reps) || 0, weight: Number(ex.weight) || 0 });
  });
  return Array.from(byWorkout.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const sessionTopSet = (session: ExerciseSession): ExerciseSet =>
  session.sets.reduce(
    (best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best),
    session.sets[0],
  );

const sessionVolume = (session: ExerciseSession): number =>
  session.sets.reduce((sum, s) => sum + s.reps * s.weight, 0);

type Trend = 'up' | 'plateau' | 'down' | 'insufficient';

// Same 14-day-recent vs 15-56-day-prior comparison window lib/aiCoach.ts's
// progressionReport() already uses for the AI Coach's own trend detection —
// scoped here to a single exercise instead of all training.
const computeTrend = (sessions: ExerciseSession[]): Trend => {
  const now = Date.now();
  const daysSince = (dateStr: string) => {
    const d = parseDateAtStartOfDay(dateStr);
    return d ? Math.floor((now - d.getTime()) / 86_400_000) : Infinity;
  };
  const recentTops = sessions.filter((s) => daysSince(s.date) <= 14).map((s) => sessionTopSet(s).weight);
  const olderTops = sessions.filter((s) => { const d = daysSince(s.date); return d > 14 && d <= 56; }).map((s) => sessionTopSet(s).weight);
  if (!recentTops.length || !olderTops.length) return 'insufficient';
  const diff = Math.max(...recentTops) - Math.max(...olderTops);
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'plateau';
};

export const ExerciseHistorySheet: React.FC<ExerciseHistorySheetProps> = ({
  exerciseName, muscleGroup, exercises, personalRecord, weightUnit, onClose,
}) => {
  const [chartView, setChartView] = useState<'weight' | 'volume'>('weight');

  const sessions = useMemo(() => buildSessions(exercises, exerciseName), [exercises, exerciseName]);
  const lastSession = sessions.length ? sessions[sessions.length - 1] : null;
  const trend = useMemo(() => computeTrend(sessions), [sessions]);

  const chartData = useMemo(() => sessions.map((s) => ({
    date: s.date,
    weight: sessionTopSet(s).weight,
    volume: Math.round(sessionVolume(s)),
  })), [sessions]);

  const prSessionDate = useMemo(() => {
    if (!personalRecord) return null;
    const match = sessions.find((s) =>
      s.sets.some((set) => set.weight === personalRecord.best_weight && set.reps === personalRecord.best_reps),
    );
    return match?.date ?? null;
  }, [sessions, personalRecord]);

  const now = Date.now();
  const daysAgo = (dateStr: string) => {
    const d = parseDateAtStartOfDay(dateStr);
    return d ? (now - d.getTime()) / 86_400_000 : Infinity;
  };
  const sessionsThisWeek = sessions.filter((s) => daysAgo(s.date) <= 7).length;
  const sessionsThisMonth = sessions.filter((s) => daysAgo(s.date) <= 30).length;
  const firstSessionDate = sessions.length ? parseDateAtStartOfDay(sessions[0].date) : null;
  const weeksTracked = firstSessionDate ? Math.max(1, (now - firstSessionDate.getTime()) / (7 * 86_400_000)) : 1;
  const weeklyAverage = sessions.length / weeksTracked;

  const trendLabel = trend === 'up' ? '↑ Improving' : trend === 'down' ? '↓ Declining' : trend === 'plateau' ? '→ Plateau' : null;
  const trendColor = trend === 'up' ? '#4ade80' : trend === 'down' ? '#f87171' : 'var(--text-muted)';

  return (
    <div className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[linear-gradient(160deg,#16191F_0%,#111419_100%)] p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[17px] font-black text-white">{exerciseName}</p>
            {muscleGroup && <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] mt-0.5">{muscleGroup}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-muted)] hover:text-white hover:bg-white/8">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!lastSession ? (
          <p className="text-[13px] text-[var(--text-muted)] py-8 text-center">No logged sessions found for this exercise.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 rounded-full bg-white/5 p-1">
                {(['weight', 'volume'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setChartView(v)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${
                      chartView === v ? 'bg-[var(--accent)] text-black' : 'text-[var(--text-muted)]'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              {trendLabel && <span className="text-[11px] font-bold" style={{ color: trendColor }}>{trendLabel}</span>}
            </div>

            <div className="h-40 rounded-xl bg-white/[0.03] p-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="exHistGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#C8FF00" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#C8FF00" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}
                    tickFormatter={(val) => { const d = parseDateAtStartOfDay(val); return d ? format(d, 'MMM d') : ''; }}
                    interval="preserveStartEnd" />
                  <YAxis domain={['auto', 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 12, padding: '8px 12px' }}
                    cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 2' }}
                    labelFormatter={(val) => { const d = parseDateAtStartOfDay(val); return d ? format(d, 'MMM d, yyyy') : ''; }}
                    formatter={(value) => [`${value} ${weightUnit}`, chartView === 'weight' ? 'Top set' : 'Volume']}
                  />
                  <Area type="monotone" dataKey={chartView} stroke="var(--accent)" strokeWidth={2.5} fill="url(#exHistGrad)"
                    dot={chartData.length <= 20 ? { fill: 'var(--accent)', strokeWidth: 0, r: 3 } : false}
                    activeDot={{ r: 5, fill: 'var(--accent)', stroke: '#111419', strokeWidth: 2 }} />
                  {chartView === 'weight' && prSessionDate && personalRecord && (
                    <ReferenceDot x={prSessionDate} y={personalRecord.best_weight} r={6} fill="#C8FF00" stroke="#111419" strokeWidth={2} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Last time</p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  {(() => { const d = parseDateAtStartOfDay(lastSession.date); return d ? format(d, 'MMM d, yyyy') : '--'; })()}
                </p>
                <p className="text-[13px] font-bold text-white mt-1">
                  {lastSession.sets.map((s) => `${s.weight}${weightUnit}×${s.reps}`).join(', ')}
                </p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)] flex items-center gap-1">
                  <Trophy className="w-3 h-3 text-[var(--accent)]" /> All-time best
                </p>
                {personalRecord ? (
                  <>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {(() => { const d = parseDateAtStartOfDay(personalRecord.achieved_date); return d ? format(d, 'MMM d, yyyy') : '--'; })()}
                    </p>
                    <p className="text-[13px] font-bold text-[var(--accent)] mt-1">{personalRecord.best_weight}{weightUnit}×{personalRecord.best_reps}</p>
                  </>
                ) : (
                  <p className="text-[13px] text-[var(--text-muted)] mt-1">No PR yet</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">This week</p>
                <p className="text-[16px] font-black text-white mt-1">{sessionsThisWeek}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">This month</p>
                <p className="text-[16px] font-black text-white mt-1">{sessionsThisMonth}</p>
              </div>
              <div className="rounded-xl bg-white/[0.03] px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Weekly avg</p>
                <p className="text-[16px] font-black text-white mt-1">{weeklyAverage.toFixed(1)}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

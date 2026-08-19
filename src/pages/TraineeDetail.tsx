import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { AppIcon } from '../config/icons';
import { NotShared } from '../components/coach/NotShared';
import { getTraineeDashboard, type TraineeDashboard, type TraineeWorkout } from '../lib/coachData';

const ACCENT = '#c8ff00';
const MUSCLE_COLORS = ['#c8ff00', '#4FC3F7', '#ff8080', '#ffd54f', '#b388ff', '#4dff91', '#ff9e6d', '#7fd7ff'];

const DAY = 86_400_000;
const parseDay = (d: string) => new Date(`${d}T00:00:00`).getTime();

export const TraineeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dash, setDash] = useState<TraineeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const d = await getTraineeDashboard(id);
      if (!d) setMissing(true); else setDash(d);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return <div className="max-w-2xl mx-auto px-4 py-16 flex items-center justify-center gap-2 text-[var(--text-muted)]">
      <AppIcon name="Spinner" size="sm" /> Loading…
    </div>;
  }
  if (missing || !dash) {
    return <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-[18px] font-semibold text-[var(--text-primary)]">Trainee not found</p>
      <button onClick={() => navigate('/coach')} className="mt-4 text-[15px] font-semibold" style={{ color: ACCENT }}>Back to trainees</button>
    </div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2 pb-5">
        <button onClick={() => navigate('/coach')} aria-label="Back"
          className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--bg-elevated)' }}>
          <AppIcon name="Back" size="md" />
        </button>
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold text-[var(--text-primary)] leading-none truncate">{dash.name}</h1>
          <p className="text-[14px] text-[var(--text-muted)] mt-1">Trainee overview</p>
        </div>
      </div>

      <div className="space-y-6">
        <ReadinessRow dash={dash} />
        <WeeklyStats workouts={dash.workouts.shared ? dash.workouts.data : null} />
        <Section title="Training volume">
          {dash.workouts.shared ? <VolumeTrend workouts={dash.workouts.data} /> : <NotShared label="Workouts" />}
        </Section>
        <Section title="Muscle focus">
          {dash.workouts.shared ? <MuscleSplit workouts={dash.workouts.data} /> : <NotShared label="Workouts" />}
        </Section>
        <Section title="Personal records">
          {dash.prs.shared ? <PRList prs={dash.prs.data} /> : <NotShared label="Personal records" />}
        </Section>
        <Section title="Body weight">
          {dash.bodyWeight.shared ? <WeightTrend weights={dash.bodyWeight.data} /> : <NotShared label="Body weight" />}
        </Section>
        <Section title="Runs">
          {dash.runs.shared ? <RunsView runs={dash.runs.data} /> : <NotShared label="Runs" />}
        </Section>
      </div>
    </div>
  );
};

/* ── Layout bits ─────────────────────────────────────────── */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-2.5">{title}</h2>
    {children}
  </section>
);
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`glass-card p-4 ${className}`}>{children}</div>
);

/* ── Readiness (WHOOP) ───────────────────────────────────── */
const ReadinessRow: React.FC<{ dash: TraineeDashboard }> = ({ dash }) => {
  const tiles = [
    { key: 'recovery', label: 'Recovery', shared: dash.recovery.shared, value: dash.recovery.data, unit: '%', color: '#4dff91' },
    { key: 'sleep', label: 'Sleep', shared: dash.sleep.shared, value: dash.sleep.data, unit: 'h', color: '#4FC3F7' },
    { key: 'strain', label: 'Strain', shared: dash.strain.shared, value: dash.strain.data, unit: '', color: '#ffd54f' },
  ];
  if (tiles.every((t) => !t.shared)) return null;
  return (
    <div className="grid grid-cols-3 gap-3">
      {tiles.map((t) => (
        <div key={t.key} className="glass-card px-3 py-4 text-center">
          <p className="text-[12px] font-medium text-[var(--text-muted)]">{t.label}</p>
          {!t.shared ? (
            <p className="text-[15px] text-[var(--text-muted)] mt-2">—</p>
          ) : (
            <p className="text-[28px] font-bold mt-1 leading-none" style={{ color: t.color }}>
              {t.value != null ? t.value : '—'}<span className="text-[15px] font-semibold text-[var(--text-muted)]">{t.value != null ? t.unit : ''}</span>
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

/* ── Weekly headline stats ───────────────────────────────── */
const WeeklyStats: React.FC<{ workouts: TraineeWorkout[] | null }> = ({ workouts }) => {
  const stat = useMemo(() => {
    if (!workouts) return null;
    const now = Date.now();
    const wk = workouts.filter((w) => now - parseDay(w.date) <= 7 * DAY);
    const sessions = new Set(wk.map((w) => w.date)).size;
    const sets = wk.reduce((s, w) => s + (w.exercises || []).reduce((a, e) => a + (e.sets || 0), 0), 0);
    return { sessions, sets };
  }, [workouts]);
  if (!stat) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="text-center py-5">
        <p className="text-[40px] font-bold leading-none text-[var(--text-primary)]">{stat.sessions}</p>
        <p className="text-[13px] text-[var(--text-muted)] mt-1.5">sessions this week</p>
      </Card>
      <Card className="text-center py-5">
        <p className="text-[40px] font-bold leading-none text-[var(--text-primary)]">{stat.sets}</p>
        <p className="text-[13px] text-[var(--text-muted)] mt-1.5">total sets</p>
      </Card>
    </div>
  );
};

/* ── Volume trend (last 8 weeks) ─────────────────────────── */
const VolumeTrend: React.FC<{ workouts: TraineeWorkout[] }> = ({ workouts }) => {
  const data = useMemo(() => {
    const now = Date.now();
    const weeks = Array.from({ length: 8 }, (_, i) => ({ i: 7 - i, vol: 0, label: '' }));
    for (const w of workouts) {
      const age = now - parseDay(w.date);
      const wi = Math.floor(age / (7 * DAY));
      if (wi < 0 || wi > 7) continue;
      const vol = (w.exercises || []).reduce((a, e) => a + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0);
      weeks[7 - wi].vol += vol;
    }
    return weeks.map((w, idx) => ({ label: idx === 7 ? 'This wk' : `${7 - idx}w`, vol: Math.round(w.vol) }));
  }, [workouts]);
  const empty = data.every((d) => d.vol === 0);
  if (empty) return <Card><Empty text="No workouts logged yet." /></Card>;
  return (
    <Card>
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--text-secondary)' }} formatter={(v: any) => [`${v}`, 'Volume']} />
          <Area type="monotone" dataKey="vol" stroke={ACCENT} strokeWidth={2.5} fill="url(#volFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};

/* ── Muscle split ────────────────────────────────────────── */
const MuscleSplit: React.FC<{ workouts: TraineeWorkout[] }> = ({ workouts }) => {
  const data = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, number>();
    for (const w of workouts) {
      if (now - parseDay(w.date) > 28 * DAY) continue;
      for (const e of w.exercises || []) {
        const m = (e.muscle_group || 'Other').trim();
        map.set(m, (map.get(m) || 0) + (e.sets || 0));
      }
    }
    return [...map.entries()].map(([name, sets]) => ({ name, sets })).sort((a, b) => b.sets - a.sets).slice(0, 8);
  }, [workouts]);
  if (!data.length) return <Card><Empty text="No exercises in the last 4 weeks." /></Card>;
  return (
    <Card>
      <p className="text-[12px] text-[var(--text-muted)] mb-2">Sets per muscle · last 4 weeks</p>
      <ResponsiveContainer width="100%" height={Math.max(150, data.length * 30)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={80} tick={{ fill: 'var(--text-secondary)', fontSize: 13 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--bg-elevated)' }} formatter={(v: any) => [`${v} sets`, '']} />
          <Bar dataKey="sets" radius={[0, 6, 6, 0]}>
            {data.map((_, i) => <Cell key={i} fill={MUSCLE_COLORS[i % MUSCLE_COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};

/* ── PRs ─────────────────────────────────────────────────── */
const PRList: React.FC<{ prs: { exercise_name: string; best_weight: number; best_reps: number; unit: string }[] }> = ({ prs }) => {
  if (!prs.length) return <Card><Empty text="No personal records yet." /></Card>;
  return (
    <Card className="!p-0 overflow-hidden">
      {prs.slice(0, 8).map((p, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3.5 border-t border-[var(--border)] first:border-t-0">
          <p className="text-[16px] font-medium text-[var(--text-primary)] truncate pr-3">{p.exercise_name}</p>
          <p className="text-[16px] font-bold shrink-0" style={{ color: ACCENT }}>
            {p.best_weight}<span className="text-[12px] text-[var(--text-muted)] font-semibold"> {p.unit} × {p.best_reps}</span>
          </p>
        </div>
      ))}
    </Card>
  );
};

/* ── Body weight ─────────────────────────────────────────── */
const WeightTrend: React.FC<{ weights: { date: string; weight: number; unit: string }[] }> = ({ weights }) => {
  if (weights.length < 2) return <Card><Empty text="Not enough body-weight logs." /></Card>;
  const data = weights.map((w) => ({ date: w.date.slice(5), weight: w.weight }));
  const unit = weights[weights.length - 1].unit;
  return (
    <Card>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
          <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => [`${v} ${unit}`, 'Weight']} />
          <Line type="monotone" dataKey="weight" stroke="#4FC3F7" strokeWidth={2.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};

/* ── Runs ────────────────────────────────────────────────── */
const RunsView: React.FC<{ runs: { id: number; run_ts: number; distance: number; duration: number; pace: number }[] }> = ({ runs }) => {
  if (!runs.length) return <Card><Empty text="No runs logged." /></Card>;
  const fmtPace = (p: number) => { const m = Math.floor(p); const s = Math.round((p - m) * 60); return `${m}:${String(s).padStart(2, '0')}`; };
  return (
    <Card className="!p-0 overflow-hidden">
      {runs.slice(0, 6).map((r) => (
        <div key={r.id} className="flex items-center justify-between px-4 py-3.5 border-t border-[var(--border)] first:border-t-0">
          <div>
            <p className="text-[16px] font-semibold text-[var(--text-primary)]">{r.distance.toFixed(2)} km</p>
            <p className="text-[12px] text-[var(--text-muted)]">{new Date(r.run_ts).toLocaleDateString()}</p>
          </div>
          <p className="text-[15px] font-medium text-[var(--text-secondary)]">{fmtPace(r.pace)} /km</p>
        </div>
      ))}
    </Card>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-[14px] text-[var(--text-muted)] text-center py-6">{text}</p>
);
const tooltipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text-primary)' } as const;

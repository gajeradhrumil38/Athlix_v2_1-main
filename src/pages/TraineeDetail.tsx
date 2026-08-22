import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { AppIcon } from '../config/icons';
import { NotShared } from '../components/coach/NotShared';
import { AssignPlanSheet } from '../components/coach/AssignPlanSheet';
import { MuscleMap, type MuscleData } from '../components/home/MuscleMap';
import { MuscleRadar } from '../components/home/MuscleRadar';
import { getExerciseMuscleProfile, PRIMARY_LOAD_WEIGHT, SECONDARY_LOAD_WEIGHT } from '../lib/exerciseMuscles';
import { getTraineeDashboard, type TraineeDashboard, type TraineeWorkout } from '../lib/coachData';
import { getAssignedPlansFor, archivePlan, type AssignedPlan } from '../lib/assignedPlans';
import { Calendar } from './Calendar';
import { CardiacHealth } from '../features/whoop/components/CardiacHealth';
import { LoadInsights } from '../features/whoop/components/LoadInsights';

const ACCENT = '#c8ff00';

const DAY = 86_400_000;
const parseDay = (d: string) => new Date(`${d}T00:00:00`).getTime();

// Build both muscle visualisations from the trainee's workouts — slug-keyed for
// the anatomical MuscleMap (via profile.targets), region-keyed for the radar
// (via primary/secondary). Mirrors how Home feeds the same components.
function buildMuscleViz(workouts: TraineeWorkout[]): { map: MuscleData; radar: MuscleData } {
  const map: MuscleData = {};
  const radar: MuscleData = {};
  const bump = (d: MuscleData, k: string) => (d[k] ??= { sessions: 0, sets: 0, load: 0, relativeLoad: 0 });
  for (const w of workouts) {
    const regions = new Set<string>();
    for (const ex of w.exercises || []) {
      const profile = getExerciseMuscleProfile(ex.name, ex.muscle_group ?? undefined, undefined);
      const sets = Number(ex.sets || 0);
      const load = (Number(ex.weight || 0)) * (Number(ex.reps || 0)) * sets;
      profile.targets.forEach(({ slug, weight }) => { const e = bump(map, slug); e.sets += sets * weight; e.load += load * weight; });
      profile.primary.forEach((r) => { bump(radar, r).sets += sets * PRIMARY_LOAD_WEIGHT; regions.add(r); });
      profile.secondary.forEach((r) => { bump(radar, r).sets += sets * SECONDARY_LOAD_WEIGHT; regions.add(r); });
    }
    regions.forEach((r) => { bump(radar, r).sessions += 1; });
  }
  return { map, radar };
}

export const TraineeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dash, setDash] = useState<TraineeDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [plans, setPlans] = useState<AssignedPlan[]>([]);
  const [assign, setAssign] = useState(false);
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const muscle = useMemo(() => buildMuscleViz(dash?.workouts.shared ? dash.workouts.data : []), [dash]);

  const loadPlans = React.useCallback(async () => {
    if (id) setPlans(await getAssignedPlansFor(id));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const d = await getTraineeDashboard(id);
      if (!d) setMissing(true); else setDash(d);
      await loadPlans();
      setLoading(false);
    })();
  }, [id, loadPlans]);

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
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-bold text-[var(--text-primary)] leading-none truncate">{dash.name}</h1>
          <p className="text-[14px] text-[var(--text-muted)] mt-1">Trainee overview</p>
        </div>
        <button
          type="button"
          onClick={() => setAssign(true)}
          className="shrink-0 flex items-center gap-1.5 h-11 px-4 rounded-2xl font-bold text-[15px]"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          <AppIcon name="Clipboard" size="sm" /> Assign
        </button>
      </div>

      <div className="space-y-6">
        {plans.length > 0 && (
          <Section title="Assigned plans">
            <div className="space-y-3">
              {plans.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  workouts={dash.workouts.shared ? dash.workouts.data : []}
                  onRemove={async () => { await archivePlan(p.id); loadPlans(); }}
                />
              ))}
            </div>
          </Section>
        )}
        <ReadinessRow dash={dash} />
        {/* Same WHOOP boards the athlete sees — fed the trainee's cached data
            (RLS-gated). Each self-hides if the trainee hasn't shared enough. */}
        {id && <LoadInsights userId={id} coachView />}
        {id && <CardiacHealth userId={id} coachView />}
        <WeeklyStats workouts={dash.workouts.shared ? dash.workouts.data : null} />
        <Section title="Muscle map">
          {dash.workouts.shared
            ? <Card><MuscleMap muscleData={muscle.map} view={muscleView} onViewChange={setMuscleView} title="Trained muscles · last sessions" unit="lbs" gender={dash.sex} /></Card>
            : <NotShared label="Workouts" />}
        </Section>
        <Section title="Muscle balance">
          {dash.workouts.shared
            ? <Card><MuscleRadar muscleData={muscle.radar} /></Card>
            : <NotShared label="Workouts" />}
        </Section>
        <Section title="Training volume">
          {dash.workouts.shared ? <VolumeTrend workouts={dash.workouts.data} /> : <NotShared label="Workouts" />}
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
        <Section title="Calendar">
          {dash.workouts.shared
            ? <div className="glass-card overflow-hidden"><Calendar userId={id!} readOnly /></div>
            : <NotShared label="Workouts" />}
        </Section>
      </div>

      <AssignPlanSheet
        open={assign}
        traineeId={id!}
        traineeName={dash.name}
        onClose={() => setAssign(false)}
        onAssigned={loadPlans}
      />
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
// "At a glance" — the three things a coach checks first: is this person still
// active (last trained), training consistently (sessions this week), and how
// much (sets). Shows even with zero workouts so a quiet trainee is obvious.
const WeeklyStats: React.FC<{ workouts: TraineeWorkout[] | null }> = ({ workouts }) => {
  const stat = useMemo(() => {
    if (!workouts) return null;
    const now = Date.now();
    const wk = workouts.filter((w) => now - parseDay(w.date) <= 7 * DAY);
    const sessions = new Set(wk.map((w) => w.date)).size;
    const sets = wk.reduce((s, w) => s + (w.exercises || []).reduce((a, e) => a + (e.sets || 0), 0), 0);
    const last = workouts.reduce((m, w) => Math.max(m, parseDay(w.date)), 0);
    const daysAgo = last ? Math.floor((now - last) / DAY) : null;
    return { sessions, sets, daysAgo };
  }, [workouts]);
  if (!stat) return null;

  const lastLabel = stat.daysAgo == null ? '—' : stat.daysAgo === 0 ? 'Today' : stat.daysAgo === 1 ? '1d' : `${stat.daysAgo}d`;
  // Flag a trainee who's gone quiet (no session in a week).
  const stale = stat.daysAgo != null && stat.daysAgo >= 7;

  return (
    <div className="grid grid-cols-3 gap-3">
      <Card className="text-center py-4">
        <p className="text-[30px] font-bold leading-none" style={{ color: stale ? '#ff8080' : 'var(--text-primary)' }}>{lastLabel}</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1.5">last trained</p>
      </Card>
      <Card className="text-center py-4">
        <p className="text-[30px] font-bold leading-none text-[var(--text-primary)]">{stat.sessions}</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1.5">this week</p>
      </Card>
      <Card className="text-center py-4">
        <p className="text-[30px] font-bold leading-none text-[var(--text-primary)]">{stat.sets}</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-1.5">sets</p>
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

/* ── Assigned plan: adherence + prescribed vs actual ─────── */
const PlanCard: React.FC<{ plan: AssignedPlan; workouts: TraineeWorkout[]; onRemove: () => void }> = ({ plan, workouts, onRemove }) => {
  const [open, setOpen] = useState(false);
  // Every logged session performed from THIS plan (linked via source_plan_id).
  const performed = useMemo(() => workouts.filter((w) => w.source_plan_id === plan.id), [workouts, plan.id]);
  const latest = performed[0]; // workouts arrive date-desc
  const daysAgo = latest ? Math.floor((Date.now() - parseDay(latest.date)) / DAY) : null;
  const lastLabel = daysAgo == null ? '' : daysAgo === 0 ? 'today' : daysAgo === 1 ? '1d ago' : `${daysAgo}d ago`;

  // For the latest session, fold the flat set-rows (one row per set) into a
  // per-exercise "actual": how many sets + the top set. Matched by name.
  const actualFor = (name: string) => {
    if (!latest) return null;
    const rows = latest.exercises.filter((e) => e.name.toLowerCase() === name.toLowerCase());
    if (!rows.length) return null;
    const top = rows.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a));
    return { sets: rows.length, reps: top.reps, weight: top.weight };
  };

  return (
    <Card className="!p-0 overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3.5 text-left">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-[var(--text-primary)] truncate">{plan.title}</p>
          <p className="text-[13px] mt-0.5" style={{ color: performed.length ? 'var(--accent)' : 'var(--text-muted)' }}>
            {performed.length ? `Done ${performed.length}× · last ${lastLabel}` : `Not started · ${plan.exercises.length} exercises`}
          </p>
        </div>
        <span className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}><AppIcon name="ExpandDown" size="md" /></span>
      </button>

      {open && (
        <div className="px-4 pb-3 border-t border-[var(--border)]">
          <div className="flex items-center justify-between pt-3 pb-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              {latest ? `Prescribed → actual (${lastLabel})` : 'Prescribed'}
            </p>
            <button type="button" onClick={onRemove} className="text-[12px] font-semibold" style={{ color: '#ff8080' }}>Remove</button>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {plan.exercises.map((ex, i) => {
              const act = actualFor(ex.name);
              const rx = `${ex.default_sets}×${ex.default_reps}${ex.default_weight ? ` @${ex.default_weight}` : ''}`;
              return (
                <div key={i} className="flex items-center justify-between gap-3 py-2">
                  <p className="text-[14px] text-[var(--text-primary)] truncate flex-1">{ex.name}</p>
                  <p className="text-[13px] text-[var(--text-muted)] shrink-0 tabular-nums">{rx}</p>
                  {latest && (
                    <p className="text-[13px] font-semibold shrink-0 tabular-nums w-[74px] text-right"
                      style={{ color: act ? 'var(--accent)' : '#ff8080' }}>
                      {act ? `${act.sets}×${act.reps}${act.weight ? ` @${act.weight}` : ''}` : 'missed'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-[14px] text-[var(--text-muted)] text-center py-6">{text}</p>
);
const tooltipStyle = { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--text-primary)' } as const;

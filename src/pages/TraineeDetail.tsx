import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { updateCoachNotes } from '../lib/coachLinks';
import { Calendar } from './Calendar';
import { WhoopDashboard } from '../features/whoop/components/WhoopDashboard';

const ACCENT = '#c8ff00';
const OVERVIEW_ORDER_KEY = 'athlix:coach-overview-order';
const DEFAULT_OVERVIEW_ORDER = ['stats', 'trend', 'gauge', 'focus', 'radar', 'map', 'volume', 'prs', 'recent', 'notes', 'plans'];
// Rough card heights → greedy shortest-column packing (true masonry, no gaps).
const CARD_WEIGHT: Record<string, number> = { stats: 1, gauge: 2, trend: 1.3, focus: 1, radar: 3, map: 3, volume: 2.2, prs: 2, recent: 3, notes: 2, plans: 2.5 };
function distributeMasonry(ids: string[], cols: number): string[][] {
  const columns: string[][] = Array.from({ length: cols }, () => []);
  const heights = new Array(cols).fill(0);
  for (const id of ids) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest].push(id);
    heights[shortest] += CARD_WEIGHT[id] ?? 1.5;
  }
  return columns;
}

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
  const [tab, setTab] = useState<'overview' | 'whoop' | 'training' | 'calendar'>('overview');
  const [notes, setNotes] = useState('');
  const [notesSaved, setNotesSaved] = useState(false);
  // Responsive column count for the masonry distribution (1 / 2 / 3).
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const compute = () => setCols(window.innerWidth >= 1280 ? 3 : window.innerWidth >= 768 ? 2 : 1);
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  // Draggable Overview — order persisted locally so a coach's arrangement sticks.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OVERVIEW_ORDER_KEY) || 'null');
      if (Array.isArray(saved)) return [...saved.filter((x: string) => DEFAULT_OVERVIEW_ORDER.includes(x)), ...DEFAULT_OVERVIEW_ORDER.filter((x) => !saved.includes(x))];
    } catch { /* ignore */ }
    return DEFAULT_OVERVIEW_ORDER;
  });
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const next = arrayMove(prev, prev.indexOf(String(active.id)), prev.indexOf(String(over.id)));
      try { localStorage.setItem(OVERVIEW_ORDER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  // Radar is "this week" (matches its label + the sets normalization, so it
  // isn't pinned to the edge by months of cumulative sets); the anatomical map
  // uses a 4-week window like the athlete's own Home.
  const muscle = useMemo(() => {
    const all = dash?.workouts.shared ? dash.workouts.data : [];
    const now = Date.now();
    const week = all.filter((w) => now - parseDay(w.date) <= 7 * DAY);
    const month = all.filter((w) => now - parseDay(w.date) <= 28 * DAY);
    return { map: buildMuscleViz(month).map, radar: buildMuscleViz(week).radar };
  }, [dash]);

  const loadPlans = React.useCallback(async () => {
    if (id) setPlans(await getAssignedPlansFor(id));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const d = await getTraineeDashboard(id);
      if (!d) setMissing(true); else { setDash(d); setNotes(d.link.coach_notes ?? ''); }
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

  const TABS = [
    { key: 'overview' as const, label: 'Overview' },
    { key: 'whoop' as const, label: 'Recovery' },
    { key: 'training' as const, label: 'Training' },
    { key: 'calendar' as const, label: 'Calendar' },
  ];

  // Coaching triage — surface the things a trainer should act on, up front.
  const flags: string[] = (() => {
    if (!dash.workouts.shared) return [];
    const ws = dash.workouts.data;
    const now = Date.now();
    const out: string[] = [];
    const last = ws.reduce((m, w) => Math.max(m, parseDay(w.date)), 0);
    const daysAgo = last ? Math.floor((now - last) / DAY) : null;
    if (daysAgo == null) out.push('No workouts logged yet');
    else if (daysAgo >= 7) out.push(`No workout in ${daysAgo} days`);
    else {
      const week = new Set(ws.filter((w) => now - parseDay(w.date) <= 7 * DAY).map((w) => w.date)).size;
      if (week < 3) out.push(`Only ${week} session${week === 1 ? '' : 's'} this week`);
    }
    const notStarted = plans.filter((p) => !ws.some((w) => w.source_plan_id === p.id));
    if (notStarted.length) out.push(`${notStarted.length} assigned plan${notStarted.length > 1 ? 's' : ''} not started`);
    if (dash.recovery.shared && dash.recovery.data != null && dash.recovery.data < 40) out.push(`Low recovery (${dash.recovery.data}%)`);
    return out;
  })();

  const saveNotes = async () => {
    await updateCoachNotes(dash.link.id, notes);
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2 pb-4">
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

      {/* Coaching triage banner — red flags first, or an all-clear */}
      {flags.length > 0 ? (
        <div className="mb-4 rounded-2xl px-4 py-3" style={{ background: 'rgba(255,128,128,0.10)', border: '1px solid rgba(255,128,128,0.28)' }}>
          <p className="text-[12px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: '#ff8080' }}>Needs attention</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {flags.map((f, i) => (
              <span key={i} className="text-[13px] text-[var(--text-primary)] flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: '#ff8080' }} />{f}
              </span>
            ))}
          </div>
        </div>
      ) : dash.workouts.shared ? (
        <div className="mb-4 rounded-2xl px-4 py-2.5 flex items-center gap-2" style={{ background: 'rgba(77,255,145,0.08)', border: '1px solid rgba(77,255,145,0.22)' }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#4dff91' }} />
          <span className="text-[13px] font-medium" style={{ color: '#4dff91' }}>On track — no flags this week</span>
        </div>
      ) : null}

      {/* Menu bar — sticky so it stays put while scrolling; jumps between views */}
      <div className="sticky top-0 z-30 -mx-4 px-4 pt-1 pb-3" style={{ background: 'var(--bg-base)' }}>
        <div className="flex gap-1 p-1 rounded-2xl overflow-x-auto" style={{ background: 'var(--bg-elevated)' }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex-1 min-w-[84px] h-10 rounded-xl text-[14px] font-semibold transition-colors"
                style={{ background: active ? 'var(--accent)' : 'transparent', color: active ? '#000' : 'var(--text-secondary)' }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'overview' && (() => {
        const ws = dash.workouts.shared ? dash.workouts.data : [];
        const now = Date.now();
        const weekSessions = new Set(ws.filter((w) => now - parseDay(w.date) <= 7 * DAY).map((w) => w.date)).size;
        const GOAL = 5;
        const shared = dash.workouts.shared;

        // This-week vs last-week (sessions + volume) for the trend card.
        const inWindow = (w: TraineeWorkout, from: number, to: number) => { const t = parseDay(w.date); return t > from && t <= to; };
        const volOf = (list: TraineeWorkout[]) => list.reduce((s, w) => s + (w.exercises || []).reduce((a, e) => a + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0), 0);
        const thisWk = ws.filter((w) => inWindow(w, now - 7 * DAY, now));
        const lastWk = ws.filter((w) => inWindow(w, now - 14 * DAY, now - 7 * DAY));
        const thisVol = Math.round(volOf(thisWk)); const lastVol = Math.round(volOf(lastWk));
        const lastSessions = new Set(lastWk.map((w) => w.date)).size;
        const pctDelta = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0);

        // Least-trained muscle group this week → suggest a focus.
        const REGIONS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core'];
        const regionSets = REGIONS.map((r) => ({ r, sets: Math.round(muscle.radar[r]?.sets || 0) }));
        const anyTrained = regionSets.some((x) => x.sets > 0);
        const focusPick = [...regionSets].sort((a, b) => a.sets - b.sets)[0];

        // Each card is a draggable widget. Drag the ⠿ handle to rearrange;
        // order persists per coach. Masonry columns pack tightly — no dead space.
        const WIDGETS: Record<string, React.ReactNode> = {
          stats: <WeeklyStats workouts={shared ? dash.workouts.data : null} />,
          gauge: <GaugeRing pct={weekSessions / GOAL} centerTop={`${weekSessions}/${GOAL}`} centerBottom="sessions this week" caption="Weekly goal" />,
          trend: shared ? (
            <Card>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-3">This week vs last</p>
              <div className="grid grid-cols-2 gap-3">
                <TrendStat label="Sessions" now={weekSessions} prev={lastSessions} delta={pctDelta(weekSessions, lastSessions)} />
                <TrendStat label="Volume" now={thisVol} prev={lastVol} delta={pctDelta(thisVol, lastVol)} />
              </div>
            </Card>
          ) : <NotShared label="Workouts" />,
          focus: shared ? (
            <Card>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-2">Focus next</p>
              {anyTrained ? (
                <>
                  <p className="text-[24px] font-bold text-[var(--text-primary)] leading-none">{focusPick.r}</p>
                  <p className="text-[13px] text-[var(--text-muted)] mt-1.5">Least-trained this week ({focusPick.sets} set{focusPick.sets === 1 ? '' : 's'}) — worth programming next.</p>
                </>
              ) : <p className="text-[14px] text-[var(--text-muted)] py-2">No training logged this week yet.</p>}
            </Card>
          ) : <NotShared label="Workouts" />,
          radar: shared ? <Card><MuscleRadar muscleData={muscle.radar} /></Card> : <NotShared label="Muscle balance" />,
          map: shared ? <Card><MuscleMap muscleData={muscle.map} view={muscleView} onViewChange={setMuscleView} title="Trained muscles" unit="lbs" gender={dash.sex} /></Card> : <NotShared label="Muscle map" />,
          volume: shared ? <VolumeTrend workouts={dash.workouts.data} /> : <NotShared label="Training volume" />,
          prs: dash.prs.shared ? <PRList prs={dash.prs.data} /> : <NotShared label="Personal records" />,
          recent: shared ? <RecentSessions workouts={dash.workouts.data} /> : <NotShared label="Recent sessions" />,
          notes: (
            <Card className="!p-0 overflow-hidden">
              <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
                <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Coach notes</p>
                {notesSaved && <span className="text-[11px] font-semibold" style={{ color: '#4dff91' }}>Saved</span>}
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Private notes — injuries, goals, cues…" rows={4}
                className="w-full bg-transparent px-4 py-3 text-[14px] text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-muted)]" />
            </Card>
          ),
          plans: plans.length > 0 ? (
            <div className="grid gap-3">
              {plans.map((p) => (
                <PlanCard key={p.id} plan={p} workouts={shared ? dash.workouts.data : []} onRemove={async () => { await archivePlan(p.id); loadPlans(); }} />
              ))}
            </div>
          ) : null,
        };
        const ids = order.filter((k) => WIDGETS[k] != null);
        return (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={rectSortingStrategy}>
              {/* Balanced masonry — cards packed into the shortest column so the
                  whole width is used with no dead space; still drag-reorderable. */}
              <div className="flex gap-3 items-start">
                {distributeMasonry(ids, cols).map((colIds, ci) => (
                  <div key={ci} className="flex-1 min-w-0 space-y-3">
                    {colIds.map((k) => <SortableCard key={k} id={k}>{WIDGETS[k]}</SortableCard>)}
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        );
      })()}

      {/* The exact same WHOOP board the athlete sees, fed the trainee's cached data. */}
      {tab === 'whoop' && (id ? <WhoopDashboard userId={id} coachView /> : null)}

      {tab === 'training' && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Every exercise the trainee has done, with its progression history */}
          <div className="lg:col-span-2">
            <Section title="Exercise history">
              {dash.workouts.shared ? <ExerciseHistory workouts={dash.workouts.data} /> : <NotShared label="Workouts" />}
            </Section>
          </div>
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
        </div>
      )}

      {tab === 'calendar' && (
        dash.workouts.shared
          ? <div className="glass-card overflow-hidden"><Calendar userId={id!} readOnly /></div>
          : <NotShared label="Workouts" />
      )}

      <AssignPlanSheet
        open={assign}
        traineeId={id!}
        traineeName={dash.name}
        traineeWorkouts={dash.workouts.shared ? dash.workouts.data : []}
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

/* ── Drag-to-rearrange wrapper (Overview cards) ──────────── */
const SortableCard: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 20 : undefined }}
      className="relative"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to rearrange"
        className="absolute -top-2 -right-2 z-10 touch-none cursor-grab active:cursor-grabbing h-7 w-7 flex items-center justify-center rounded-lg text-[13px] opacity-60 hover:opacity-100"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        ⠿
      </button>
      {children}
    </div>
  );
};

/* ── Circular gauge (BI-style, like the 82.6% ring) ──────── */
const GaugeRing: React.FC<{ pct: number; centerTop: string; centerBottom: string; caption: string }> = ({ pct, centerTop, centerBottom, caption }) => {
  const r = 46, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return (
    <Card className="flex flex-col items-center justify-center py-5">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] self-start mb-1">{caption}</p>
      <div className="relative flex items-center justify-center" style={{ width: 132, height: 132 }}>
        <svg width={132} height={132} className="-rotate-90">
          <circle cx={66} cy={66} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={10} />
          <circle cx={66} cy={66} r={r} fill="none" stroke={ACCENT} strokeWidth={10} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[26px] font-bold leading-none text-[var(--text-primary)]">{centerTop}</span>
          <span className="text-[11px] text-[var(--text-muted)] mt-1">{centerBottom}</span>
        </div>
      </div>
    </Card>
  );
};

/* ── Set metric — one readable visual language for sets/reps/weight ── */
// Bold primary numbers, accent weight, muted small units → the eye lands on
// the data instantly. Reused across recent sessions, PRs and exercise history.
const Metric: React.FC<{ sets?: number; reps: number; weight?: number; unit?: string }> = ({ sets, reps, weight, unit = 'lb' }) => (
  <span className="flex items-baseline gap-1 shrink-0 tabular-nums">
    {sets != null && (
      <>
        <span className="text-[17px] font-bold text-[var(--text-primary)]">{sets}</span>
        <span className="text-[13px] text-[var(--text-muted)]">×</span>
      </>
    )}
    <span className="text-[17px] font-bold text-[var(--text-primary)]">{reps}</span>
    {weight ? (
      <>
        <span className="text-[13px] text-[var(--text-muted)] px-0.5">@</span>
        <span className="text-[17px] font-bold" style={{ color: ACCENT }}>{weight}</span>
        <span className="text-[11px] font-medium text-[var(--text-muted)]">{unit}</span>
      </>
    ) : (
      <span className="text-[11px] font-medium text-[var(--text-muted)] ml-0.5">reps</span>
    )}
  </span>
);

/* ── This-vs-last stat (trend card) ──────────────────────── */
const TrendStat: React.FC<{ label: string; now: number; prev: number; delta: number }> = ({ label, now, delta }) => (
  <div className="rounded-xl px-3 py-3" style={{ background: 'var(--bg-elevated)' }}>
    <p className="text-[12px] text-[var(--text-muted)]">{label}</p>
    <p className="text-[22px] font-bold text-[var(--text-primary)] leading-none mt-1 tabular-nums">{now.toLocaleString()}</p>
    <p className="text-[12px] font-semibold mt-1" style={{ color: delta === 0 ? 'var(--text-muted)' : delta > 0 ? '#4dff91' : '#ff8080' }}>
      {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)}% vs last
    </p>
  </div>
);

/* ── Recent sessions (last 2 weeks) — calendar-style, scrollable ── */
const RecentSessions: React.FC<{ workouts: TraineeWorkout[] | null }> = ({ workouts }) => {
  const recent = useMemo(() => {
    if (!workouts) return [];
    const now = Date.now();
    return workouts
      .filter((w) => now - parseDay(w.date) <= 14 * DAY)
      .sort((a, b) => parseDay(b.date) - parseDay(a.date));
  }, [workouts]);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Recent sessions · 2 weeks</p>
      </div>
      {recent.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] text-center py-6">No sessions in the last 2 weeks.</p>
      ) : (
        <div className="max-h-[340px] overflow-y-auto divide-y divide-[var(--border)]">
          {recent.map((w) => {
            // Fold the per-set rows into one line per exercise (top set + count).
            const groups = new Map<string, { sets: number; reps: number; weight: number }>();
            for (const e of w.exercises || []) {
              const g = groups.get(e.name) || { sets: 0, reps: e.reps, weight: e.weight };
              g.sets += 1;
              if (e.weight > g.weight || (e.weight === g.weight && e.reps > g.reps)) { g.weight = e.weight; g.reps = e.reps; }
              groups.set(e.name, g);
            }
            const when = new Date(`${w.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            return (
              <div key={w.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-bold text-[var(--text-primary)] truncate">{w.title || 'Workout'}</p>
                  <p className="text-[12px] text-[var(--text-muted)] shrink-0">{when}</p>
                </div>
                <div className="mt-2 space-y-1.5">
                  {[...groups.entries()].map(([name, g]) => (
                    <div key={name} className="flex items-center justify-between gap-3">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{name}</p>
                      <Metric sets={g.sets} reps={g.reps} weight={g.weight || undefined} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

/* ── Exercise history — every lift the trainee has done + its progression ── */
interface ExHist { name: string; sessions: number; best: { w: number; r: number }; last: string; byDate: { date: string; sets: number; w: number; r: number }[]; }
function buildExerciseHistory(workouts: TraineeWorkout[]): ExHist[] {
  const map = new Map<string, { sessions: Set<string>; best: { w: number; r: number }; last: string; byDate: Map<string, { sets: number; w: number; r: number }> }>();
  for (const w of workouts) {
    for (const e of w.exercises || []) {
      let m = map.get(e.name);
      if (!m) { m = { sessions: new Set(), best: { w: 0, r: 0 }, last: '', byDate: new Map() }; map.set(e.name, m); }
      m.sessions.add(w.date);
      if (w.date > m.last) m.last = w.date;
      if (e.weight > m.best.w || (e.weight === m.best.w && e.reps > m.best.r)) m.best = { w: e.weight, r: e.reps };
      const d = m.byDate.get(w.date) || { sets: 0, w: 0, r: 0 };
      d.sets += 1;
      if (e.weight > d.w || (e.weight === d.w && e.reps > d.r)) { d.w = e.weight; d.r = e.reps; }
      m.byDate.set(w.date, d);
    }
  }
  return [...map.entries()]
    .map(([name, m]) => ({ name, sessions: m.sessions.size, best: m.best, last: m.last, byDate: [...m.byDate.entries()].map(([date, d]) => ({ date, ...d })).sort((a, b) => b.date.localeCompare(a.date)) }))
    .sort((a, b) => b.last.localeCompare(a.last));
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const ExerciseHistory: React.FC<{ workouts: TraineeWorkout[] | null }> = ({ workouts }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => buildExerciseHistory(workouts ?? []), [workouts]);
  const filtered = list.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-2">Exercise history</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises…"
          className="w-full h-10 rounded-xl px-3 text-[14px] outline-none"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] text-center py-6">{list.length ? 'No match.' : 'No exercises logged.'}</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto divide-y divide-[var(--border)]">
          {filtered.map((ex) => {
            const expanded = open === ex.name;
            return (
              <div key={ex.name}>
                <button type="button" onClick={() => setOpen(expanded ? null : ex.name)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left">
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold text-[var(--text-primary)] truncate">{ex.name}</p>
                    <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{ex.sessions}× · last {fmtDay(ex.last)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Metric reps={ex.best.r} weight={ex.best.w || undefined} />
                    <span className={`text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}><AppIcon name="ExpandDown" size="sm" /></span>
                  </div>
                </button>
                {expanded && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className="rounded-xl overflow-hidden divide-y divide-[var(--border)]" style={{ background: 'var(--bg-elevated)' }}>
                      {ex.byDate.slice(0, 12).map((h) => (
                        <div key={h.date} className="flex items-center justify-between px-3 py-2.5">
                          <p className="text-[13px] font-medium text-[var(--text-secondary)]">{fmtDay(h.date)}</p>
                          <Metric sets={h.sets} reps={h.r} weight={h.w || undefined} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
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
          <p className="text-[16px] font-bold text-[var(--text-primary)] truncate pr-3">{p.exercise_name}</p>
          <Metric reps={p.best_reps} weight={p.best_weight || undefined} unit={p.unit} />
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

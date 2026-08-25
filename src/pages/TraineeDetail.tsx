import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners, useDroppable,
  type DragStartEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AppIcon } from '../config/icons';
import { NotShared } from '../components/coach/NotShared';
import { AssignPlanSheet } from '../components/coach/AssignPlanSheet';
import { MuscleMap, type MuscleData } from '../components/home/MuscleMap';
import { MuscleRadar } from '../components/home/MuscleRadar';
import { getExerciseMuscleProfile, PRIMARY_LOAD_WEIGHT, SECONDARY_LOAD_WEIGHT } from '../lib/exerciseMuscles';
import { getTraineeDashboard, type TraineeDashboard, type TraineeWorkout } from '../lib/coachData';
import { getAssignedPlansFor, deletePlan, type AssignedPlan } from '../lib/assignedPlans';
import { updateCoachNotes } from '../lib/coachLinks';
import { Calendar } from './Calendar';
import { WhoopDashboard } from '../features/whoop/components/WhoopDashboard';
import { RunHistory } from '../features/running/pages/RunHistory';
import { muscleColor } from '../lib/muscleColors';
import { DotGridCard, GlowSparkline } from '../components/shared/GlowChart';

const ACCENT = '#c8ff00';

// Muscle group for an exercise — prefer the group actually stored on the
// logged set; fall back to name-pattern inference so every exercise still
// gets a color + label even on legacy rows with a null muscle_group.
const resolveMuscleGroup = (name: string, stored?: string | null): string =>
  stored || getExerciseMuscleProfile(name).primary[0] || 'Core';
// v2: columns are now persisted as-arranged (string[][]), not recomputed by
// a weight guess every render — that guess is only ever used to SEED a
// column split (first load, a newly-added widget, or a responsive
// column-count change), never to override where the coach actually dragged
// a card. This was the root cause of "can't fit a card where I have space":
// the old design re-ran the guess on every render and could silently
// relocate a card the coach had just placed.
const OVERVIEW_COLUMNS_KEY = 'athlix:coach-overview-columns-v2';
const DEFAULT_OVERVIEW_ORDER = ['stats', 'trend', 'gauge', 'focus', 'radar', 'map', 'volume', 'weight', 'prs', 'recent', 'notes', 'plans'];
// Rough card heights, used only to seed an initial balanced split.
const CARD_WEIGHT: Record<string, number> = { stats: 1, gauge: 2, trend: 1.3, focus: 1, radar: 3, map: 3, volume: 2.2, weight: 2.2, prs: 2, recent: 3, notes: 2, plans: 2.5 };
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
// Reconcile a persisted column split against the widgets actually available
// right now: drop ids that no longer exist, append newly-available ids to
// whichever column is currently shortest (by weight), so a fresh widget
// doesn't get lost or pile onto one column.
function reconcileColumns(saved: string[][], availableIds: string[]): string[][] {
  const known = new Set(availableIds);
  const columns = saved.map((col) => col.filter((id) => known.has(id)));
  const placed = new Set(columns.flat());
  const missing = availableIds.filter((id) => !placed.has(id));
  const heights = columns.map((col) => col.reduce((s, id) => s + (CARD_WEIGHT[id] ?? 1.5), 0));
  for (const id of missing) {
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

  // Draggable Overview — columns (not a flat order) are the source of truth,
  // each its own SortableContext + droppable, matching dnd-kit's own
  // multi-container pattern. A single SortableContext spanning a masonry
  // split across separate DOM containers is what made dragging between
  // columns feel broken ("stuck/straightened") — rectSortingStrategy
  // computes transforms assuming siblings share one parent, which isn't
  // true once the same flat list is rendered into 3 separate column divs.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [columns, setColumns] = useState<string[][]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OVERVIEW_COLUMNS_KEY) || 'null');
      if (Array.isArray(saved) && saved.every((c: unknown) => Array.isArray(c))) return saved;
    } catch { /* ignore */ }
    return distributeMasonry(DEFAULT_OVERVIEW_ORDER, 3);
  });
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [activeCardWidth, setActiveCardWidth] = useState<number | null>(null);

  // 'plans' is the only widget that can be genuinely absent (no assigned
  // plans yet) — every other id always renders, either real content or a
  // NotShared placeholder, so it always occupies a slot.
  const availableIds = useMemo(
    () => DEFAULT_OVERVIEW_ORDER.filter((k) => k !== 'plans' || plans.length > 0),
    [plans],
  );
  const availableKey = availableIds.join(',');

  // Reconcile only when what's available changes or a responsive
  // breakpoint is crossed — never on every render, so a coach's own drag
  // placement is never silently overwritten by the layout guess.
  useEffect(() => {
    setColumns((prev) => {
      const flatPrev = prev.flat();
      const sameIds = flatPrev.length === availableIds.length && flatPrev.every((x) => availableIds.includes(x));
      const sameColCount = prev.length === cols;
      if (sameIds && sameColCount) return prev;
      const merged = reconcileColumns(prev, availableIds);
      const next = sameColCount ? merged : distributeMasonry(merged.flat(), cols);
      try { localStorage.setItem(OVERVIEW_COLUMNS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [availableKey, cols]);

  const findColumn = (id: string, cols2: string[][]) => cols2.findIndex((c) => c.includes(id));

  const onDragStart = (e: DragStartEvent) => {
    setActiveCardId(String(e.active.id));
    // DragOverlay renders via a portal with no containing block of its own,
    // so without an explicit width it stretches to fit its content instead
    // of matching the card it was picked up from.
    setActiveCardWidth(e.active.rect.current.initial?.width ?? null);
  };

  // Live cross-column move as the pointer passes over another card or an
  // empty column — this is what makes a card actually land where there's
  // room, instead of only being able to reorder within its starting column.
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setColumns((prev) => {
      const fromCol = findColumn(activeId, prev);
      const toCol = overId.startsWith('col-') ? Number(overId.slice(4)) : findColumn(overId, prev);
      if (fromCol === -1 || toCol === -1 || fromCol === toCol) return prev;
      const next = prev.map((c) => [...c]);
      next[fromCol].splice(next[fromCol].indexOf(activeId), 1);
      const overIdx = next[toCol].indexOf(overId);
      next[toCol].splice(overIdx === -1 ? next[toCol].length : overIdx, 0, activeId);
      return next;
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveCardId(null);
    setActiveCardWidth(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    setColumns((prev) => {
      const col = findColumn(activeId, prev);
      if (col === -1) return prev;
      let next = prev;
      if (!overId.startsWith('col-')) {
        const overCol = findColumn(overId, prev);
        if (overCol === col && activeId !== overId) {
          const items = prev[col];
          next = prev.map((c, i) => (i === col ? arrayMove(items, items.indexOf(activeId), items.indexOf(overId)) : c));
        }
      }
      try { localStorage.setItem(OVERVIEW_COLUMNS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
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
          weight: dash.bodyWeight.shared ? <WeightTrend weights={dash.bodyWeight.data} /> : <NotShared label="Body weight" />,
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
                <PlanCard
                  key={p.id}
                  plan={p}
                  workouts={shared ? dash.workouts.data : []}
                  onRemove={async () => {
                    if (!window.confirm(`Delete "${p.title}"? This can't be undone.`)) return;
                    const res = await deletePlan(p.id);
                    if (!res.ok) { toast.error(res.error || 'Could not delete plan.'); return; }
                    toast.success('Plan deleted');
                    await loadPlans();
                  }}
                />
              ))}
            </div>
          ) : null,
        };
        // Columns may briefly lag a fresh 'plans' widget (reconciled by the
        // effect above, not synchronously) — filter defensively so a
        // stale id never renders a blank slot for one tick.
        const renderColumns = columns.map((col) => col.filter((k) => WIDGETS[k] != null));
        return (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
            {/* Balanced masonry — each column is its own droppable +
                SortableContext (dnd-kit's multi-container pattern), so a
                card can actually move to wherever there's room, and the
                drag animation stays correct across the column boundary. */}
            <div className="flex gap-3 items-start">
              {renderColumns.map((colIds, ci) => (
                <MasonryColumn key={ci} id={`col-${ci}`} itemIds={colIds}>
                  {colIds.map((k) => <SortableCard key={k} id={k}>{WIDGETS[k]}</SortableCard>)}
                </MasonryColumn>
              ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
              {activeCardId ? (
                <div
                  className="rotate-[1.5deg] scale-[1.03]"
                  style={{ width: activeCardWidth ?? undefined, filter: 'drop-shadow(0 18px 34px rgba(0,0,0,0.55))' }}
                >
                  {WIDGETS[activeCardId]}
                </div>
              ) : null}
            </DragOverlay>
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
          {dash.prs.shared ? <PRList prs={dash.prs.data} /> : <Section title="Personal records"><NotShared label="Personal records" /></Section>}
          <Section title="Body weight">
            {dash.bodyWeight.shared ? <WeightTrend weights={dash.bodyWeight.data} /> : <NotShared label="Body weight" />}
          </Section>
          <div className="lg:col-span-2">
            {dash.runs.shared ? (
              <div className="glass-card overflow-hidden">
                <RunHistory userId={id!} coachView />
              </div>
            ) : (
              <Section title="Runs"><NotShared label="Runs" /></Section>
            )}
          </div>
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
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      className="relative"
    >
      {/* Inset within the card's own bounds (not overlapping the gap
          between cards) so it never gets clipped or fights the neighboring
          column for hit-testing space. */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to rearrange"
        className="absolute top-2.5 right-2.5 z-10 touch-none cursor-grab active:cursor-grabbing h-7 w-7 flex items-center justify-center rounded-lg text-[14px]"
        style={{ background: 'color-mix(in srgb, var(--bg-elevated) 88%, transparent)', backdropFilter: 'blur(4px)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        ⠿
      </button>
      {children}
    </div>
  );
};

/* ── Droppable + sortable column (dnd-kit multi-container pattern) ──── */
const MasonryColumn: React.FC<{ id: string; itemIds: string[]; children: React.ReactNode }> = ({ id, itemIds, children }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className="flex-1 min-w-0 space-y-3 rounded-2xl transition-colors"
      style={{
        outline: isOver ? '2px dashed color-mix(in srgb, var(--accent) 45%, transparent)' : '2px dashed transparent',
        outlineOffset: 4,
        minHeight: itemIds.length ? undefined : 80,
      }}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
        {itemIds.length === 0 && (
          <div className="h-20 rounded-2xl flex items-center justify-center text-[12px]" style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)' }}>
            Drop here
          </div>
        )}
      </SortableContext>
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
    <span className="text-[11px] font-medium text-[var(--text-muted)]">reps</span>
    {weight ? (
      <>
        <span className="text-[13px] text-[var(--text-muted)] px-0.5">@</span>
        <span className="text-[17px] font-bold" style={{ color: ACCENT }}>{weight}</span>
        <span className="text-[11px] font-medium text-[var(--text-muted)]">{unit}</span>
      </>
    ) : null}
  </span>
);

// Exercise row with the muscle group's color as a left accent bar + the
// group name spelled out under the title — the same visual language as the
// athlete's own Calendar cards (colored strip + colored muscle-group label).
const ExerciseAccent: React.FC<{ name: string; muscleGroup: string; right?: React.ReactNode; children?: React.ReactNode }> = ({ name, muscleGroup, right, children }) => {
  const accent = muscleColor(muscleGroup);
  return (
    <div className="relative pl-3">
      <div className="absolute inset-y-0 left-0 w-[3px] rounded-full" style={{ background: accent }} />
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-[var(--text-primary)] truncate">{name}</p>
          <p className="text-[11px] font-semibold mt-0.5" style={{ color: accent }}>{muscleGroup}</p>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      {children}
    </div>
  );
};

type SetT = { reps: number; weight: number };

// Per-set box grid — the SAME tactile layout the athlete sees in the Calendar
// day view and the workout logger: a lime set number, then a big weight box and
// a big reps box. Every set is its own row, so different loads never collapse.
// Bodyweight lifts (no weight) drop the weight column.
const SetGrid: React.FC<{ sets: SetT[]; unit?: string }> = ({ sets, unit = 'lb' }) => {
  if (!sets.length) return null;
  const weighted = sets.some((s) => s.weight > 0);
  return (
    <div className="flex flex-col gap-1.5">
      {sets.map((s, i) => (
        <div key={i} className="grid overflow-hidden rounded-[10px]"
          style={{ gridTemplateColumns: weighted ? '38px 1fr 1fr' : '38px 1fr', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.012)' }}>
          <div className="flex items-center justify-center font-victory text-[22px]"
            style={{ background: 'rgba(200,255,0,0.05)', color: ACCENT, borderRight: '1px solid var(--border)' }}>
            {i + 1}
          </div>
          {weighted && (
            <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2">
              <span className="font-victory text-[26px] leading-none text-white tabular-nums">
                {s.weight ? s.weight.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>{unit}</span>
            </div>
          )}
          <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2"
            style={weighted ? { borderLeft: '1px solid var(--border)' } : undefined}>
            <span className="font-victory text-[26px] leading-none text-white tabular-nums">{s.reps}</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>reps</span>
          </div>
        </div>
      ))}
    </div>
  );
};

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
            // Keep EVERY set per exercise so varying loads are shown accurately.
            const groups = new Map<string, { sets: SetT[]; muscleGroup: string | null }>();
            for (const e of w.exercises || []) {
              const g = groups.get(e.name) || { sets: [], muscleGroup: e.muscle_group ?? null };
              g.sets.push({ reps: e.reps, weight: e.weight });
              if (!g.muscleGroup && e.muscle_group) g.muscleGroup = e.muscle_group;
              groups.set(e.name, g);
            }
            const when = new Date(`${w.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            return (
              <div key={w.id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-bold text-[var(--text-primary)] truncate">{w.title || 'Workout'}</p>
                  <p className="text-[12px] text-[var(--text-muted)] shrink-0">{when}</p>
                </div>
                <div className="mt-2.5 space-y-4">
                  {[...groups.entries()].map(([name, g]) => (
                    <ExerciseAccent
                      key={name}
                      name={name}
                      muscleGroup={resolveMuscleGroup(name, g.muscleGroup)}
                      right={<span className="text-[12px] font-semibold text-[var(--text-muted)]">{g.sets.length} set{g.sets.length !== 1 ? 's' : ''}</span>}
                    >
                      <div className="mt-2"><SetGrid sets={g.sets} /></div>
                    </ExerciseAccent>
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
interface ExHist {
  name: string; muscleGroup: string | null; sessions: number;
  best: { w: number; r: number }; last: string; byDate: { date: string; sets: SetT[] }[];
  // Latest-vs-previous-session top weight, for the trend arrow. null when
  // there's no earlier session to compare, or the lift is bodyweight-only.
  trendLb: number | null;
}
function buildExerciseHistory(workouts: TraineeWorkout[]): ExHist[] {
  const map = new Map<string, { muscleGroup: string | null; sessions: Set<string>; best: { w: number; r: number }; last: string; byDate: Map<string, SetT[]> }>();
  for (const w of workouts) {
    for (const e of w.exercises || []) {
      let m = map.get(e.name);
      if (!m) { m = { muscleGroup: e.muscle_group ?? null, sessions: new Set(), best: { w: 0, r: 0 }, last: '', byDate: new Map() }; map.set(e.name, m); }
      if (!m.muscleGroup && e.muscle_group) m.muscleGroup = e.muscle_group;
      m.sessions.add(w.date);
      if (w.date > m.last) m.last = w.date;
      if (e.weight > m.best.w || (e.weight === m.best.w && e.reps > m.best.r)) m.best = { w: e.weight, r: e.reps };
      const arr = m.byDate.get(w.date) || [];
      arr.push({ reps: e.reps, weight: e.weight });
      m.byDate.set(w.date, arr);
    }
  }
  return [...map.entries()]
    .map(([name, m]) => {
      const byDate = [...m.byDate.entries()].map(([date, sets]) => ({ date, sets })).sort((a, b) => b.date.localeCompare(a.date));
      const topOf = (sets: SetT[]) => sets.reduce((mx, s) => Math.max(mx, s.weight), 0);
      const latestTop = byDate[0] ? topOf(byDate[0].sets) : 0;
      const prevTop = byDate[1] ? topOf(byDate[1].sets) : 0;
      const trendLb = latestTop > 0 && prevTop > 0 ? Math.round((latestTop - prevTop) * 10) / 10 : null;
      return { name, muscleGroup: m.muscleGroup, sessions: m.sessions.size, best: m.best, last: m.last, byDate, trendLb };
    })
    .sort((a, b) => b.last.localeCompare(a.last));
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtRelative = (d: string) => {
  const days = Math.round((Date.now() - parseDay(d)) / DAY);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const ExerciseHistory: React.FC<{ workouts: TraineeWorkout[] | null }> = ({ workouts }) => {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const list = useMemo(() => buildExerciseHistory(workouts ?? []), [workouts]);
  const groups = useMemo(() => [...new Set(list.map((e) => resolveMuscleGroup(e.name, e.muscleGroup)))].sort(), [list]);
  const filtered = list
    .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
    .filter((e) => !group || resolveMuscleGroup(e.name, e.muscleGroup) === group);

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-2">Exercise history</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises…"
          className="w-full h-10 rounded-xl px-3 text-[14px] outline-none mb-2.5"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        />
        {groups.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {[null, ...groups].map((g) => {
              const active = group === g;
              const c = g ? muscleColor(g) : ACCENT;
              return (
                <button
                  key={g ?? 'all'}
                  type="button"
                  onClick={() => setGroup(g)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                  style={active
                    ? { background: `color-mix(in srgb, ${c} 18%, transparent)`, color: c, border: `1px solid color-mix(in srgb, ${c} 35%, transparent)` }
                    : { background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid transparent' }}
                >
                  {g ?? 'All'}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)] text-center py-6">{list.length ? 'No match.' : 'No exercises logged.'}</p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto divide-y divide-[var(--border)]">
          {filtered.map((ex) => {
            const expanded = open === ex.name;
            const group = resolveMuscleGroup(ex.name, ex.muscleGroup);
            const accent = muscleColor(group);
            return (
              <div key={ex.name} className="relative">
                <div className="absolute left-0 top-3.5 bottom-3.5 w-[3px] rounded-full" style={{ background: accent }} />
                <button type="button" onClick={() => setOpen(expanded ? null : ex.name)} className="w-full flex items-center justify-between gap-3 pl-5 pr-4 py-3.5 text-left">
                  <div className="min-w-0">
                    <p className="text-[16px] font-bold text-[var(--text-primary)] truncate">{ex.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] font-semibold" style={{ color: accent }}>{group}</span>
                      <span className="text-[var(--text-muted)]">·</span>
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtRelative(ex.last)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex flex-col items-end gap-0.5">
                      <Metric reps={ex.best.r} weight={ex.best.w || undefined} />
                      {ex.trendLb != null && ex.trendLb !== 0 && (
                        <span className="text-[11px] font-semibold" style={{ color: ex.trendLb > 0 ? '#4dff91' : '#ff8080' }}>
                          {ex.trendLb > 0 ? '▲' : '▼'} {Math.abs(ex.trendLb)} lb vs last
                        </span>
                      )}
                    </div>
                    <span className={`text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}><AppIcon name="ExpandDown" size="sm" /></span>
                  </div>
                </button>
                {expanded && (() => {
                  // Progression = best weight (fallback reps for bodyweight) per
                  // date, oldest→newest, so the coach sees the trend at a glance.
                  const chart = [...ex.byDate].reverse().map((h) => {
                    const topW = h.sets.reduce((m, s) => Math.max(m, s.weight), 0);
                    const topR = h.sets.reduce((m, s) => Math.max(m, s.reps), 0);
                    return { date: fmtDay(h.date).replace(/^\w+, /, ''), value: topW || topR };
                  });
                  const weighted = ex.byDate.some((h) => h.sets.some((s) => s.weight > 0));
                  return (
                    <div className="px-4 pb-3 -mt-1 space-y-3">
                      {chart.length >= 2 && (
                        <DotGridCard accent={accent} className="!p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-1" style={{ color: accent }}>{weighted ? 'Top weight' : 'Top reps'} over time</p>
                          <GlowSparkline
                            points={chart.map((c) => ({ label: c.date, value: c.value }))}
                            color={accent}
                            unit={weighted ? ' lb' : ' reps'}
                            height={100}
                            flagPlateaus
                          />
                        </DotGridCard>
                      )}
                      {ex.byDate.slice(0, 12).map((h) => (
                        <div key={h.date}>
                          <p className="text-[13px] font-bold mb-1.5" style={{ color: 'var(--text-secondary)' }}>{fmtDay(h.date)}</p>
                          <SetGrid sets={h.sets} />
                        </div>
                      ))}
                    </div>
                  );
                })()}
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
  const points = useMemo(() => {
    const now = Date.now();
    const w8 = Array.from({ length: 8 }, () => 0);
    for (const w of workouts) {
      const age = now - parseDay(w.date);
      const wi = Math.floor(age / (7 * DAY));
      if (wi < 0 || wi > 7) continue;
      const vol = (w.exercises || []).reduce((a, e) => a + (e.sets || 0) * (e.reps || 0) * (e.weight || 0), 0);
      w8[7 - wi] += vol;
    }
    return w8.map((v, idx) => ({ label: idx === 7 ? 'Now' : `${7 - idx}w`, value: Math.round(v) }));
  }, [workouts]);
  const weeks = points.map((p) => p.value);
  const empty = weeks.every((v) => v === 0);
  if (empty) return <Card><Empty text="No workouts logged yet." /></Card>;

  const thisWk = weeks[weeks.length - 1];
  const lastWk = weeks[weeks.length - 2] || 0;
  const deltaPct = lastWk > 0 ? Math.round(((thisWk - lastWk) / lastWk) * 100) : null;
  const peak = Math.max(...weeks);
  const avg = Math.round(weeks.reduce((a, b) => a + b, 0) / weeks.length);

  return (
    <DotGridCard accent={ACCENT}>
      <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: ACCENT }}>Training volume</span>
      <div className="flex items-baseline gap-2 mt-2 mb-1.5">
        <span className="font-victory text-[40px] font-black leading-none text-white tabular-nums">{thisWk.toLocaleString()}</span>
        <span className="font-victory text-[15px] font-black" style={{ color: ACCENT }}>this wk</span>
      </div>
      {deltaPct != null && (
        <div className="text-[12px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <span style={{ color: deltaPct >= 0 ? ACCENT : 'rgba(255,100,100,0.9)' }}>{deltaPct >= 0 ? '+' : ''}{deltaPct}%</span> vs last week
        </div>
      )}
      <div className="flex gap-6 mb-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">8wk avg</span>
          <p className="font-victory text-[16px] font-black text-white mt-1">{avg.toLocaleString()}</p>
        </div>
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">Peak wk</span>
          <p className="font-victory text-[16px] font-black text-white mt-1">{peak.toLocaleString()}</p>
        </div>
      </div>
      <GlowSparkline points={points} color={ACCENT} flagPlateaus />
    </DotGridCard>
  );
};

/* ── PRs ─────────────────────────────────────────────────── */
const PRList: React.FC<{ prs: { exercise_name: string; best_weight: number; best_reps: number; unit: string }[] }> = ({ prs }) => {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <AppIcon name="Trophy" size="sm" />
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">Personal records</p>
      </div>
      {!prs.length ? (
        <Empty text="No personal records yet." />
      ) : (
        <div className="p-3 space-y-3 max-h-[320px] overflow-y-auto">
          {prs.map((p, i) => (
            <ExerciseAccent key={i} name={p.exercise_name} muscleGroup={resolveMuscleGroup(p.exercise_name)}>
              <div className="grid overflow-hidden rounded-[10px] mt-2"
                style={{ gridTemplateColumns: p.best_weight ? '1fr 1fr' : '1fr', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.012)' }}>
                {p.best_weight ? (
                  <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2" style={{ borderRight: '1px solid var(--border)' }}>
                    <span className="font-victory text-[26px] leading-none text-white tabular-nums">{p.best_weight.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>{p.unit || 'lb'}</span>
                  </div>
                ) : null}
                <div className="flex flex-col items-center justify-center gap-0.5 py-2.5 px-2">
                  <span className="font-victory text-[26px] leading-none text-white tabular-nums">{p.best_reps}</span>
                  <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: 'var(--text-secondary)' }}>reps</span>
                </div>
              </div>
            </ExerciseAccent>
          ))}
        </div>
      )}
    </Card>
  );
};

/* ── Body weight ─────────────────────────────────────────── */
const WEIGHT_BLUE = '#4FC3F7';
const fmtShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const WeightTrend: React.FC<{ weights: { date: string; weight: number; unit: string }[] }> = ({ weights }) => {
  if (weights.length < 2) return <Card><Empty text="Not enough body-weight logs." /></Card>;
  const unit = weights[weights.length - 1].unit;
  const latest = weights[weights.length - 1].weight;
  const first = weights[0].weight;
  const delta = Math.round((latest - first) * 10) / 10;

  return (
    <DotGridCard accent={WEIGHT_BLUE}>
      <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: WEIGHT_BLUE }}>Body weight</span>
      <div className="flex items-baseline gap-2 mt-2 mb-1.5">
        <span className="font-victory text-[40px] font-black leading-none text-white tabular-nums">{latest.toFixed(1)}</span>
        <span className="font-victory text-[15px] font-black" style={{ color: WEIGHT_BLUE }}>{unit}</span>
      </div>
      {delta !== 0 && (
        <div className="text-[12px] font-semibold mb-4" style={{ color: 'rgba(255,255,255,0.55)' }}>
          <span style={{ color: 'rgba(255,255,255,0.85)' }}>{delta > 0 ? '+' : ''}{delta} {unit}</span> since {fmtShort(weights[0].date)}
        </div>
      )}
      <GlowSparkline points={weights.map((w) => ({ label: fmtShort(w.date), value: w.weight }))} color={WEIGHT_BLUE} unit={` ${unit}`} />
    </DotGridCard>
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

  // For the latest session, collect every logged set of an exercise (matched by
  // name) so 3 sets at different weights show honestly, not collapsed.
  const actualFor = (name: string): SetT[] | null => {
    if (!latest) return null;
    const rows = latest.exercises.filter((e) => e.name.toLowerCase() === name.toLowerCase());
    if (!rows.length) return null;
    return rows.map((e) => ({ reps: e.reps, weight: e.weight }));
  };

  const doneCount = latest ? plan.exercises.filter((ex) => actualFor(ex.name) != null).length : 0;
  const donePct = latest && plan.exercises.length ? doneCount / plan.exercises.length : 0;

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
          <div className="flex items-center justify-between pt-3 pb-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              {latest ? `Last session (${lastLabel})` : 'Prescribed'}
            </p>
            <button
              type="button"
              onClick={onRemove}
              aria-label="Delete plan"
              className="flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] font-semibold transition-colors"
              style={{ color: '#ff8080', background: 'rgba(255,128,128,0.08)' }}
            >
              <AppIcon name="Trash" size="sm" /> Delete
            </button>
          </div>

          {/* Completion progress — "did they do it or not" at a glance */}
          {latest && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">{doneCount}/{plan.exercises.length} exercises done</p>
                <p className="text-[12px] font-bold" style={{ color: donePct === 1 ? '#4dff91' : donePct > 0 ? ACCENT : '#ff8080' }}>
                  {Math.round(donePct * 100)}%
                </p>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                <div className="h-full rounded-full" style={{ width: `${donePct * 100}%`, background: donePct === 1 ? '#4dff91' : ACCENT }} />
              </div>
            </div>
          )}

          <div className="space-y-4">
            {plan.exercises.map((ex, i) => {
              const act = actualFor(ex.name);
              const group = resolveMuscleGroup(ex.name, ex.muscle_group);
              const rx = `Prescribed ${ex.default_sets}×${ex.default_reps}${ex.default_weight ? ` @ ${ex.default_weight} lb` : ''}`;
              return (
                <ExerciseAccent
                  key={i}
                  name={ex.name}
                  muscleGroup={group}
                  right={latest ? (
                    act
                      ? <span className="text-[11px] font-bold" style={{ color: '#4dff91' }}>✓ Done</span>
                      : <span className="text-[11px] font-bold" style={{ color: '#ff8080' }}>Missed</span>
                  ) : undefined}
                >
                  <p className="text-[12px] font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>{rx}</p>
                  {act && <div className="mt-2"><SetGrid sets={act} /></div>}
                </ExerciseAccent>
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

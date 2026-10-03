import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
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
import { getExerciseMuscleProfile, MUSCLE_SLUG_LABELS, PRIMARY_LOAD_WEIGHT, SECONDARY_LOAD_WEIGHT } from '../lib/exerciseMuscles';
import { getTraineeDashboard, peekTraineeDashboard, type TraineeDashboard, type TraineeWorkout } from '../lib/coachData';
import { CoachLogStartModal } from '../components/coach/CoachLogStart';
import { CoachSessionCard } from '../components/coach/CoachSessionCard';
import { CenterModal } from '../components/shared/CenterModal';
import { getAssignedPlansFor, peekAssignedPlansFor, deletePlan, groupByDay, type AssignedPlan } from '../lib/assignedPlans';
import { dayOfSession } from '../lib/planProgress';
import { updateCoachNotes } from '../lib/coachLinks';
import { Calendar, ReadOnlyWorkoutCards } from './Calendar';
import { WhoopDashboard } from '../features/whoop/components/WhoopDashboard';
import { RunHistory } from '../features/running/pages/RunHistory';
import { muscleColor } from '../lib/muscleColors';
import { GlowSparkline, PlotGrid } from '../components/shared/GlowChart';
import { BigNumber, Delta, EmptyState, IDENTITY, StatLabel, TONE, WidgetCard } from '../components/coach/overview/Widget';
import { palette } from '../theme/colors';

// Theme accent for CSS styles. (SVG attributes use palette.accent instead.)
const ACCENT = 'var(--accent)';

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
const DEFAULT_OVERVIEW_ORDER = ['session', 'stats', 'trend', 'gauge', 'focus', 'radar', 'map', 'volume', 'weight', 'prs', 'recent', 'notes', 'plans'];
// Rough card heights, used only to seed an initial balanced split.
const CARD_WEIGHT: Record<string, number> = { session: 3, stats: 1, gauge: 2, trend: 1.3, focus: 1, radar: 3, map: 3, volume: 2.2, weight: 2.2, prs: 2, recent: 3, notes: 2, plans: 2.5 };
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
// doesn't get lost or pile onto one column. The session card is the one
// widget a coach acts on first, so when it's new to a saved layout it goes to
// the top of the first column instead (still draggable like any other card).
const TOP_WIDGETS = new Set(['session']);
function reconcileColumns(saved: string[][], availableIds: string[]): string[][] {
  const known = new Set(availableIds);
  const columns = saved.map((col) => col.filter((id) => known.has(id)));
  const placed = new Set(columns.flat());
  const missing = availableIds.filter((id) => !placed.has(id));
  const heights = columns.map((col) => col.reduce((s, id) => s + (CARD_WEIGHT[id] ?? 1.5), 0));
  for (const id of missing) {
    if (TOP_WIDGETS.has(id) && columns.length) {
      columns[0].unshift(id);
      heights[0] += CARD_WEIGHT[id] ?? 1.5;
      continue;
    }
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest].push(id);
    heights[shortest] += CARD_WEIGHT[id] ?? 1.5;
  }
  return columns;
}

const DAY = 86_400_000;
const parseDay = (d: string) => new Date(`${d}T00:00:00`).getTime();

type Alert = { level: 'high' | 'warn'; text: string; hint?: string };
const ALERT_COLOR: Record<Alert['level'] | 'ok', string> = { high: TONE.bad, warn: TONE.warn, ok: TONE.good };

const REGIONS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Glutes', 'Core'];
const TOTAL_MUSCLES = Object.keys(MUSCLE_SLUG_LABELS).length;
// Ranks the body regions for a period: who led, who trailed, who was skipped.
function regionSummary(radar: MuscleData) {
  const ranked = REGIONS.map((r) => ({ r, sets: Math.round(radar[r]?.sets || 0) })).sort((a, b) => b.sets - a.sets);
  const trained = ranked.filter((x) => x.sets > 0);
  return { dominant: trained[0] ?? null, least: trained.length > 1 ? trained[trained.length - 1] : null, untrained: ranked.filter((x) => x.sets === 0).map((x) => x.r) };
}
const setsIn = (list: TraineeWorkout[]) => list.reduce((s, w) => s + (w.exercises || []).reduce((a, e) => a + (e.sets || 0), 0), 0);

type MusclePeriod = 'today' | 'week' | 'month';
const PERIOD_LABEL: Record<MusclePeriod, string> = { today: 'today', week: 'last 7 days', month: 'last 30 days' };
// Relative to a week of training, for the radar's spokes and goal ring.
const PERIOD_SCALE: Record<MusclePeriod, number> = { today: 0.4, week: 1, month: 4 };
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inPeriod = (date: string, p: MusclePeriod, now: number) =>
  p === 'today' ? date === localToday() : now - parseDay(date) < (p === 'week' ? 7 : 30) * DAY;

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
  // Render from the last-loaded copy (e.g. coming back from the coach logger)
  // and refresh quietly — no "Loading…" flash on every return.
  const [dash, setDash] = useState<TraineeDashboard | null>(() => (id ? peekTraineeDashboard(id) : null));
  const [loading, setLoading] = useState(() => !(id && peekTraineeDashboard(id)));
  const [missing, setMissing] = useState(false);
  const [plans, setPlans] = useState<AssignedPlan[]>(() => (id ? peekAssignedPlansFor(id) ?? [] : []));
  const [assign, setAssign] = useState(false);
  const [logStart, setLogStart] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<AssignedPlan | null>(null);
  const [muscleView, setMuscleView] = useState<'front' | 'back'>('front');
  const [tab, setTab] = useState<'overview' | 'whoop' | 'training' | 'calendar'>('overview');
  const [notes, setNotes] = useState(() => (id ? peekTraineeDashboard(id)?.coachNotes ?? '' : ''));
  const [notesSaved, setNotesSaved] = useState(false);
  const savedNotesRef = React.useRef(notes);
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

  // Every widget id always renders something — real content, a NotShared
  // placeholder, or (for 'plans') an empty-state CTA — so every id always
  // occupies a slot.
  const availableIds = DEFAULT_OVERVIEW_ORDER;
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
  // Each muscle card has its own Today / Week / Month switch, and says which
  // window it shows — the radar used to be "this week" while the map silently
  // covered 4 weeks. "Focus next" always reads the last 7 days.
  const [mapPeriod, setMapPeriod] = useState<MusclePeriod>('week');
  const [radarPeriod, setRadarPeriod] = useState<MusclePeriod>('week');
  const muscle = useMemo(() => {
    const all = dash?.workouts.shared ? dash.workouts.data : [];
    const now = Date.now();
    const pick = (p: MusclePeriod) => all.filter((w) => inPeriod(w.date, p, now));
    const mapList = pick(mapPeriod);
    const radarList = pick(radarPeriod);
    const mapViz = buildMuscleViz(mapList);
    return {
      map: mapViz.map,
      mapRegions: mapViz.radar,
      radar: buildMuscleViz(radarList).radar,
      radarSets: setsIn(radarList),
      radarSessions: new Set(radarList.map((w) => w.date)).size,
      focus: buildMuscleViz(pick('week')).radar,
    };
  }, [dash, mapPeriod, radarPeriod]);

  const loadPlans = React.useCallback(async () => {
    if (id) setPlans(await getAssignedPlansFor(id));
  }, [id]);

  // Pulled out of the mount effect so a coach-logged session (or anything
  // else that changes the trainee's own data) can refresh the dashboard
  // in place, without a full page reload.
  const loadDash = React.useCallback(async () => {
    if (!id) return;
    const d = await getTraineeDashboard(id);
    if (!d) { setMissing(true); return; }
    setDash(d);
    // Only take the server's notes if the coach hasn't edited them meanwhile.
    setNotes((cur) => (cur === savedNotesRef.current ? d.coachNotes : cur));
    savedNotesRef.current = d.coachNotes;
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      await Promise.all([loadDash(), loadPlans()]);
      setLoading(false);
    })();
  }, [id, loadDash, loadPlans]);

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 pt-2 space-y-3">
      <div className="skeleton h-12 rounded-2xl" />
      <div className="skeleton h-12 rounded-2xl" />
      <div className="skeleton h-40 rounded-2xl" />
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

  // Coaching triage — the things a trainer should act on, most serious first.
  const alerts: Alert[] = (() => {
    if (!dash.workouts.shared) return [];
    const ws = dash.workouts.data;
    const now = Date.now();
    const out: Alert[] = [];
    const last = ws.reduce((m, w) => Math.max(m, parseDay(w.date)), 0);
    const daysAgo = last ? Math.floor((now - last) / DAY) : null;
    if (daysAgo == null) out.push({ level: 'warn', text: 'No workouts logged yet', hint: 'Nothing logged since connecting — log a session together or check in.' });
    else if (daysAgo >= 7) out.push({ level: 'high', text: `No workout in ${daysAgo} days`, hint: 'They’ve gone quiet — worth a check-in.' });
    else {
      const week = new Set(ws.filter((w) => now - parseDay(w.date) <= 7 * DAY).map((w) => w.date)).size;
      if (week < 3) out.push({ level: 'warn', text: `Only ${week} session${week === 1 ? '' : 's'} this week`, hint: 'Below the 3-a-week mark.' });
    }
    const notStarted = plans.filter((p) => !ws.some((w) => w.source_plan_id === p.id));
    if (notStarted.length) {
      out.push({
        level: 'warn',
        text: `${notStarted.length} assigned plan${notStarted.length > 1 ? 's' : ''} not started`,
        hint: notStarted.map((p) => p.title).join(', '),
      });
    }
    if (dash.recovery.shared && dash.recovery.data != null && dash.recovery.data < 40) {
      out.push({ level: 'high', text: `Low recovery (${dash.recovery.data}%)`, hint: 'Consider a lighter session today.' });
    }
    return out.sort((x, y) => (x.level === y.level ? 0 : x.level === 'high' ? -1 : 1));
  })();
  const topLevel: Alert['level'] | 'ok' = alerts[0]?.level ?? 'ok';
  // One line of real status under the name instead of a static label.
  const statusLine = (() => {
    if (!dash.workouts.shared) return 'Not sharing workouts with you';
    const ws = dash.workouts.data;
    const now = Date.now();
    const last = ws.reduce((m, w) => Math.max(m, parseDay(w.date)), 0);
    if (!last) return 'No sessions logged yet';
    const d = Math.floor((now - last) / DAY);
    const week = new Set(ws.filter((w) => now - parseDay(w.date) <= 7 * DAY).map((w) => w.date)).size;
    const when = d <= 0 ? 'Trained today' : d === 1 ? 'Trained yesterday' : `Trained ${d}d ago`;
    return `${when} · ${week} session${week === 1 ? '' : 's'} this week`;
  })();

  // Fires on blur — skip the write when nothing changed, and never flash
  // "Saved" for a write that actually failed.
  const saveNotes = async () => {
    if (notes === savedNotesRef.current) return;
    const res = await updateCoachNotes(dash.link.id, notes);
    if (!res.ok) { toast.error(res.error || 'Could not save notes.'); return; }
    savedNotesRef.current = notes;
    setNotesSaved(true);
    setTimeout(() => setNotesSaved(false), 1500);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 pb-10">
      {/* Header */}
      {/* Who + how they're doing, read together: name, the alert status right
          beside it, and a live status line — not a far-right chip. */}
      <div className="flex items-center gap-3 pt-2 pb-4">
        <button onClick={() => navigate('/coach')} aria-label="Back to trainees"
          className="h-11 w-11 shrink-0 rounded-2xl flex items-center justify-center text-[var(--text-primary)]"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <AppIcon name="Back" size="md" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-[26px] font-bold text-[var(--text-primary)] leading-tight truncate">{dash.name}</h1>
            {dash.workouts.shared && (
              <button
                type="button"
                onClick={() => setAlertsOpen(true)}
                aria-label={alerts.length ? `${alerts.length} alert${alerts.length > 1 ? 's' : ''} — view` : 'On track — view'}
                className="shrink-0 h-7 px-2.5 rounded-full text-[12px] font-bold flex items-center gap-1.5"
                style={{ background: `color-mix(in srgb, ${ALERT_COLOR[topLevel]} 14%, transparent)`, color: ALERT_COLOR[topLevel], border: `1px solid color-mix(in srgb, ${ALERT_COLOR[topLevel]} 35%, transparent)` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: ALERT_COLOR[topLevel] }} />
                {alerts.length ? `${alerts.length} alert${alerts.length > 1 ? 's' : ''}` : 'On track'}
              </button>
            )}
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5 truncate">{statusLine}</p>
        </div>
      </div>

      {/* The two things a coach does here. */}
      <div className="flex items-stretch gap-2 pb-4">
        {dash.workouts.shared && (
          <button
            type="button"
            onClick={() => setLogStart(true)}
            title="Record a session you did together"
            className="flex-1 md:flex-none md:w-[200px] h-12 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-1.5"
            style={{ background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)', border: '1.5px solid color-mix(in srgb, var(--accent) 55%, transparent)' }}
          >
            <AppIcon name="Plus" size="sm" /> Log session
          </button>
        )}
        <button
          type="button"
          onClick={() => { setEditingPlan(null); setAssign(true); }}
          title="Give them a plan to follow"
          className="flex-1 md:flex-none md:w-[200px] h-12 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-1.5"
          style={{ background: 'var(--accent)', color: '#000' }}
        >
          <AppIcon name="Clipboard" size="sm" /> Assign plan
        </button>
      </div>

      <CenterModal open={alertsOpen} onClose={() => setAlertsOpen(false)}>
        <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[20px] font-bold text-[var(--text-primary)] leading-tight">{alerts.length ? 'Needs attention' : 'On track'}</h2>
            <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
              {dash.name} · {alerts.length ? `${alerts.length} alert${alerts.length > 1 ? 's' : ''}` : 'no flags this week'}
            </p>
          </div>
          <button type="button" onClick={() => setAlertsOpen(false)} aria-label="Close" className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            <AppIcon name="Close" size="sm" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-2 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="rounded-2xl px-4 py-3 flex items-center gap-2.5" style={{ background: `color-mix(in srgb, ${ALERT_COLOR.ok} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${ALERT_COLOR.ok} 25%, transparent)` }}>
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: ALERT_COLOR.ok }} />
              <span className="text-[14px] font-semibold" style={{ color: ALERT_COLOR.ok }}>Training on schedule — nothing to act on.</span>
            </div>
          ) : alerts.map((a, i) => (
            <div key={i} className="relative rounded-2xl pl-4 pr-3 py-3 overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: ALERT_COLOR[a.level] }} />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-bold text-[var(--text-primary)]">{a.text}</p>
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                  style={{ background: `color-mix(in srgb, ${ALERT_COLOR[a.level]} 16%, transparent)`, color: ALERT_COLOR[a.level] }}>
                  {a.level === 'high' ? 'Urgent' : 'Watch'}
                </span>
              </div>
              {a.hint && <p className="text-[13px] text-[var(--text-secondary)] mt-1 leading-snug">{a.hint}</p>}
            </div>
          ))}
        </div>
      </CenterModal>


      {/* Menu bar — pinned while scrolling. top-0 is right on phones too: the
          scroll area's own top padding already clears the fixed app header.
          The blurred backdrop + bottom edge make it read as a pinned bar
          (same-colour background made it look like it had scrolled away). */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-2 mb-3"
        style={{ background: 'color-mix(in srgb, var(--bg-base) 92%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex gap-1 p-1 rounded-2xl overflow-x-auto w-full md:w-fit" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className="flex-1 md:flex-none min-w-[84px] md:px-6 h-10 rounded-xl text-[14px] font-semibold transition-colors"
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
        const regionSets = REGIONS.map((r) => ({ r, sets: Math.round(muscle.focus[r]?.sets || 0) }));
        const anyTrained = regionSets.some((x) => x.sets > 0);
        const focusPick = [...regionSets].sort((a, b) => a.sets - b.sets)[0];

        // Each card is a draggable widget. Drag the ⠿ handle to rearrange;
        // order persists per coach. Masonry columns pack tightly — no dead space.
        const WIDGETS: Record<string, React.ReactNode> = {
          session: shared
            ? <CoachSessionCard key={id} traineeId={id!} dash={dash} plans={plans} onSaved={() => { void loadDash(); }} menuInset />
            : <NotShared label="Sessions" />,
          stats: shared ? <WeeklyStats workouts={dash.workouts.data} /> : <NotShared label="This week" />,
          gauge: shared ? <GaugeRing value={weekSessions} goal={GOAL} /> : <NotShared label="Weekly goal" />,
          trend: shared ? (
            <WidgetCard title="This week vs last" tone={IDENTITY.consistency}>
              <div className="grid grid-cols-2 gap-2">
                <TrendStat label="Sessions" now={weekSessions} delta={pctDelta(weekSessions, lastSessions)} />
                <TrendStat label="Volume" now={thisVol} unit="lb" delta={pctDelta(thisVol, lastVol)} />
              </div>
            </WidgetCard>
          ) : <NotShared label="This week vs last" />,
          focus: shared ? (
            <WidgetCard title="Focus next" meta="last 7 days" tone={anyTrained ? muscleColor(focusPick.r) : undefined}>
              {anyTrained ? (
                <>
                  <p className="text-[24px] font-bold text-[var(--text-primary)] leading-none">{focusPick.r}</p>
                  <p className="text-[13px] text-[var(--text-secondary)] mt-1.5 leading-snug">Least trained ({focusPick.sets} set{focusPick.sets === 1 ? '' : 's'}) — worth programming next.</p>
                </>
              ) : <EmptyState text="No training logged this week yet." />}
            </WidgetCard>
          ) : <NotShared label="Focus next" />,
          radar: shared ? (() => {
            const sum = regionSummary(muscle.radar);
            const tone = sum.dominant ? muscleColor(sum.dominant.r) : undefined;
            return (
              <WidgetCard title="Muscle load" tone={tone} meta={PERIOD_LABEL[radarPeriod]}>
                <div className="mb-3"><PeriodToggle value={radarPeriod} onChange={setRadarPeriod} /></div>
                {sum.dominant ? (
                  <div className="flex items-end justify-between gap-3 mb-3">
                    <div>
                      <BigNumber value={muscle.radarSets} unit="sets" unitColor={tone} />
                      <StatLabel>{muscle.radarSessions} session{muscle.radarSessions === 1 ? '' : 's'} · {sum.dominant.r}-led</StatLabel>
                    </div>
                    <div className="text-right text-[12px] leading-relaxed text-[var(--text-secondary)]">
                      <p>Most <span className="font-bold" style={{ color: muscleColor(sum.dominant.r) }}>{sum.dominant.r} {sum.dominant.sets}</span></p>
                      {sum.least && <p>Least <span className="font-bold" style={{ color: muscleColor(sum.least.r) }}>{sum.least.r} {sum.least.sets}</span></p>}
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[var(--text-secondary)] mb-3">No training {radarPeriod === 'today' ? 'today' : `in the ${PERIOD_LABEL[radarPeriod]}`} yet.</p>
                )}
                <PlotGrid accent={tone ?? palette.accent}>
                  <MuscleRadar muscleData={muscle.radar} showTitle={false} periodLabel={PERIOD_LABEL[radarPeriod]} scale={PERIOD_SCALE[radarPeriod]} />
                </PlotGrid>
              </WidgetCard>
            );
          })() : <NotShared label="Muscle load" />,
          map: shared ? (() => {
            const sum = regionSummary(muscle.mapRegions);
            const tone = sum.dominant ? muscleColor(sum.dominant.r) : undefined;
            const hit = Object.values(muscle.map).filter((m) => (m.sets || 0) > 0).length;
            return (
              <WidgetCard title="Trained muscles" tone={tone} meta={PERIOD_LABEL[mapPeriod]}>
                <div className="flex items-end justify-between gap-3 mb-2">
                  <div>
                    <BigNumber value={hit} unit={`/ ${TOTAL_MUSCLES} muscles`} unitColor={tone} />
                    <StatLabel>{hit ? `Worked ${mapPeriod === 'today' ? 'today' : `in the ${PERIOD_LABEL[mapPeriod]}`}` : 'Nothing logged in this period'}</StatLabel>
                  </div>
                  {sum.dominant && (
                    <span className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-full"
                      style={{ background: `color-mix(in srgb, ${muscleColor(sum.dominant.r)} 14%, transparent)`, color: muscleColor(sum.dominant.r) }}>
                      Most: {sum.dominant.r}
                    </span>
                  )}
                </div>
                {sum.untrained.length > 0 && hit > 0 && (
                  <p className="text-[12px] text-[var(--text-secondary)] mb-2.5 leading-snug">
                    Not trained yet: <span className="font-semibold text-[var(--text-primary)]">{sum.untrained.slice(0, 4).join(', ')}{sum.untrained.length > 4 ? '…' : ''}</span>
                  </p>
                )}
                <PlotGrid accent={tone ?? palette.accent}>
                  <div className="px-1 pb-1">
                    <MuscleMap bare muscleData={muscle.map} view={muscleView} onViewChange={setMuscleView} unit="lbs" gender={dash.sex}
                      controls={<PeriodToggle value={mapPeriod} onChange={setMapPeriod} />} />
                  </div>
                </PlotGrid>
                <p className="text-[11px] text-[var(--text-secondary)] mt-2">Brighter = more volume · switch Front / Back to see the other side</p>
              </WidgetCard>
            );
          })() : <NotShared label="Trained muscles" />,
          volume: shared ? <VolumeTrend workouts={dash.workouts.data} /> : <NotShared label="Training volume" />,
          weight: dash.bodyWeight.shared ? <WeightTrend weights={dash.bodyWeight.data} /> : <NotShared label="Body weight" />,
          prs: dash.prs.shared ? <PRList prs={dash.prs.data} /> : <NotShared label="Personal records" />,
          recent: shared ? <RecentSessions workouts={dash.workouts.data} /> : <NotShared label="Recent sessions" />,
          notes: (
            <WidgetCard title="Coach notes" icon="Edit"
              right={<span className="text-[11px] font-semibold" style={{ color: notesSaved ? TONE.good : 'var(--text-secondary)' }}>{notesSaved ? 'Saved ✓' : 'Private · saves automatically'}</span>}>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} placeholder="Injuries, goals, cues…" rows={4}
                className="w-full rounded-xl px-3 py-2.5 text-[14px] text-[var(--text-primary)] outline-none resize-none placeholder:text-[var(--text-secondary)] placeholder:opacity-60"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} />
            </WidgetCard>
          ),
          plans: (
            <WidgetCard title="Assigned plans" tone={IDENTITY.plans} icon="Clipboard" meta={plans.length ? String(plans.length) : undefined}
              right={
                <button type="button" onClick={() => { setEditingPlan(null); setAssign(true); }} aria-label="Assign a new plan"
                  className="h-7 w-7 flex items-center justify-center rounded-lg"
                  style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' }}>
                  <AppIcon name="Plus" size="sm" />
                </button>
              }>
              {plans.length === 0 ? (
                <EmptyState icon="Clipboard" text="No plans assigned yet."
                  action={<button type="button" onClick={() => { setEditingPlan(null); setAssign(true); }} className="text-[13px] font-bold text-[var(--accent)]">+ Assign a plan</button>} />
              ) : (
                <div className="space-y-2">
                  {plans.map((p) => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      workouts={shared ? dash.workouts.data : []}
                      onEdit={() => { setEditingPlan(p); setAssign(true); }}
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
              )}
            </WidgetCard>
          ),
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

      {dash.workouts.shared && (
        <CoachLogStartModal open={logStart} onClose={() => setLogStart(false)} traineeId={id!} dash={dash} plans={plans} />
      )}

      <AssignPlanSheet
        open={assign}
        traineeId={id!}
        traineeName={dash.name}
        traineeWorkouts={dash.workouts.shared ? dash.workouts.data : []}
        editingPlan={editingPlan}
        onClose={() => { setAssign(false); setEditingPlan(null); }}
        onAssigned={loadPlans}
      />

    </div>
  );
};

/* ── Layout bits ─────────────────────────────────────────── */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] mb-2.5">{title}</h2>
    {children}
  </section>
);
// Sliding Today / Week / Month switch — the highlight glides to the chosen
// period (shared layoutId, unique per card instance).
const PERIODS: { key: MusclePeriod; label: string }[] = [
  { key: 'today', label: 'Day' }, { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' },
];
const PeriodToggle: React.FC<{ value: MusclePeriod; onChange: (p: MusclePeriod) => void }> = ({ value, onChange }) => {
  const id = React.useId();
  return (
    <div role="radiogroup" aria-label="Time range" className="relative flex p-0.5 rounded-full w-fit"
      style={{ background: 'rgba(12,20,30,0.7)', border: '1px solid var(--border)' }}>
      {PERIODS.map((p) => {
        const active = value === p.key;
        return (
          <button key={p.key} type="button" role="radio" aria-checked={active} onClick={() => onChange(p.key)}
            className="relative px-4 h-7 rounded-full text-[11px] font-bold transition-colors"
            style={{ color: active ? '#000' : 'var(--text-secondary)' }}>
            {active && (
              <motion.span layoutId={`period-${id}`} className="absolute inset-0 rounded-full"
                style={{ background: 'var(--accent)' }} transition={{ type: 'spring', stiffness: 520, damping: 40 }} />
            )}
            <span className="relative">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
};
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
          column for hit-testing space. z-20, not z-10: some cards (the
          dot-grid ones) lift their own content to z-10, which painted over
          the handle and left only its top edge grabbable. Below the sticky
          tab bar (z-30) so handles never paint over it while scrolling. */}
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to rearrange"
        className="absolute top-2 right-2 z-20 touch-none cursor-grab active:cursor-grabbing h-8 w-8 flex items-center justify-center rounded-lg text-[15px]"
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

/* ── Weekly goal ring ─────────────────────────────────────── */
// SVG attributes need a real colour, not a CSS variable — palette hex.
const GaugeRing: React.FC<{ value: number; goal: number }> = ({ value, goal }) => {
  const r = 46, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, value / goal));
  const left = Math.max(0, goal - value);
  return (
    <WidgetCard title="Weekly goal" tone={IDENTITY.consistency} meta={`${goal} sessions`}>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: 112, height: 112 }}>
          <svg width={112} height={112} viewBox="0 0 132 132" className="-rotate-90">
            <circle cx={66} cy={66} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={10} />
            <circle cx={66} cy={66} r={r} fill="none" stroke={palette.green} strokeWidth={10} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c * (1 - p)} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center"><BigNumber value={`${value}/${goal}`} size="md" /></div>
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-[var(--text-primary)] leading-snug">{left === 0 ? 'Goal hit this week' : `${left} more to hit the goal`}</p>
          <StatLabel>Sessions in the last 7 days</StatLabel>
        </div>
      </div>
    </WidgetCard>
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
            style={{ background: 'color-mix(in srgb, var(--accent) 5%, transparent)', color: ACCENT, borderRight: '1px solid var(--border)' }}>
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
const TrendStat: React.FC<{ label: string; now: number; unit?: string; delta: number }> = ({ label, now, unit, delta }) => (
  <div className="rounded-xl px-3 py-3" style={{ background: 'var(--bg-elevated)' }}>
    <BigNumber value={now.toLocaleString()} unit={unit} size="md" />
    <StatLabel>{label}</StatLabel>
    <div className="mt-1"><Delta pct={delta} /></div>
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
    <WidgetCard title="Recent sessions" meta="2 weeks" flush>
      {recent.length === 0 ? (
        <div className="px-4 pb-4"><EmptyState icon="History" text="No sessions in the last 2 weeks." /></div>
      ) : (
        // The same cards the trainee sees in their own Calendar, read-only —
        // so a session looks identical on both sides.
        <div className="max-h-[520px] overflow-y-auto px-3 pb-3 space-y-3">
          <ReadOnlyWorkoutCards workouts={recent} />
        </div>
      )}
    </WidgetCard>
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
      <div className="px-4 pt-3.5 pb-1">
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-secondary)] mb-2">Exercise history</p>
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
                        <span className="text-[11px] font-semibold" style={{ color: ex.trendLb > 0 ? TONE.good : TONE.bad }}>
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
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5 text-[var(--text-secondary)]">{weighted ? 'Top weight' : 'Top reps'} over time</p>
                          <PlotGrid accent={accent}>
                            <GlowSparkline
                              points={chart.map((c) => ({ label: c.date, value: c.value }))}
                              color={accent}
                              unit={weighted ? ' lb' : ' reps'}
                              height={100}
                              flagPlateaus
                            />
                          </PlotGrid>
                        </div>
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

/* ── This week at a glance ───────────────────────────────── */
// One card, three numbers. "Last trained" lives in the header status line now.
const WeeklyStats: React.FC<{ workouts: TraineeWorkout[] }> = ({ workouts }) => {
  const stat = useMemo(() => {
    const now = Date.now();
    const wk = workouts.filter((w) => now - parseDay(w.date) <= 7 * DAY);
    return {
      sessions: new Set(wk.map((w) => w.date)).size,
      sets: wk.reduce((s, w) => s + (w.exercises || []).reduce((a, e) => a + (e.sets || 0), 0), 0),
      exercises: new Set(wk.flatMap((w) => (w.exercises || []).map((e) => e.name.toLowerCase()))).size,
    };
  }, [workouts]);
  return (
    <WidgetCard title="This week" tone={IDENTITY.consistency} meta="last 7 days">
      <div className="grid grid-cols-3 gap-2">
        {([['Sessions', stat.sessions], ['Sets', stat.sets], ['Exercises', stat.exercises]] as const).map(([label, v]) => (
          <div key={label} className="rounded-xl px-3 py-3" style={{ background: 'var(--bg-elevated)' }}>
            <BigNumber value={v} size="md" />
            <StatLabel>{label}</StatLabel>
          </div>
        ))}
      </div>
    </WidgetCard>
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
  if (weeks.every((v) => v === 0)) {
    return <WidgetCard title="Training volume" tone={IDENTITY.load}><EmptyState icon="Trending" text="No workouts logged yet." /></WidgetCard>;
  }

  const thisWk = weeks[weeks.length - 1];
  const lastWk = weeks[weeks.length - 2] || 0;
  const deltaPct = lastWk > 0 ? Math.round(((thisWk - lastWk) / lastWk) * 100) : null;
  const peak = Math.max(...weeks);
  const avg = Math.round(weeks.reduce((a, b) => a + b, 0) / weeks.length);

  return (
    <WidgetCard title="Training volume" tone={IDENTITY.load} meta="8 weeks">
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <BigNumber value={thisWk.toLocaleString()} unit="lb" unitColor={IDENTITY.load} />
          <StatLabel>This week</StatLabel>
        </div>
        <Delta pct={deltaPct} suffix="vs last week" />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-elevated)' }}>
          <BigNumber value={avg.toLocaleString()} unit="lb" size="sm" /><StatLabel>8-week average</StatLabel>
        </div>
        <div className="rounded-xl px-3 py-2.5" style={{ background: 'var(--bg-elevated)' }}>
          <BigNumber value={peak.toLocaleString()} unit="lb" size="sm" /><StatLabel>Peak week</StatLabel>
        </div>
      </div>
      <PlotGrid accent={palette.accent}>
        <GlowSparkline points={points} color={palette.accent} unit=" lb" flagPlateaus />
      </PlotGrid>
    </WidgetCard>
  );
};

/* ── PRs ─────────────────────────────────────────────────── */
// One compact row per lift — name + muscle on the left, best set on the right.
const PRList: React.FC<{ prs: { exercise_name: string; best_weight: number; best_reps: number; unit: string }[] }> = ({ prs }) => (
  <WidgetCard title="Personal records" tone={IDENTITY.records} icon="Trophy" meta={prs.length ? String(prs.length) : undefined} flush>
    {!prs.length ? (
      <div className="px-4 pb-4"><EmptyState icon="Trophy" text="No personal records yet." /></div>
    ) : (
      <div className="max-h-[360px] overflow-y-auto px-3 pb-3 space-y-1.5">
        {prs.map((p, i) => {
          const group = resolveMuscleGroup(p.exercise_name);
          const color = muscleColor(group);
          return (
            <div key={i} className="relative flex items-center justify-between gap-3 rounded-xl pl-4 pr-3 py-2.5 overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
              <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[var(--text-primary)] truncate">{p.exercise_name}</p>
                <p className="text-[11px] font-semibold mt-0.5" style={{ color }}>{group}</p>
              </div>
              <div className="shrink-0 text-right">
                {p.best_weight ? <BigNumber value={p.best_weight.toLocaleString(undefined, { maximumFractionDigits: 1 })} unit="lb" size="sm" /> : null}
                <p className="text-[11px] font-semibold text-[var(--text-secondary)] mt-0.5">{p.best_reps} reps</p>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </WidgetCard>
);

/* ── Body weight ─────────────────────────────────────────── */
const fmtShort = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const WeightTrend: React.FC<{ weights: { date: string; weight: number; unit: string }[] }> = ({ weights }) => {
  if (weights.length < 2) {
    return <WidgetCard title="Body weight" tone={IDENTITY.weight}><EmptyState icon="Trending" text="Not enough body-weight logs yet." /></WidgetCard>;
  }
  const latest = weights[weights.length - 1].weight;
  const first = weights[0].weight;
  const delta = Math.round((latest - first) * 10) / 10;

  return (
    <WidgetCard title="Body weight" tone={IDENTITY.weight} meta={`since ${fmtShort(weights[0].date)}`}>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <BigNumber value={latest.toFixed(1)} unit="lb" unitColor={IDENTITY.weight} />
          <StatLabel>Latest</StatLabel>
        </div>
        {delta !== 0 && (
          <span className="text-[12px] font-semibold text-[var(--text-primary)]">
            {delta > 0 ? '+' : ''}{delta} lb <span className="text-[var(--text-secondary)] font-medium">overall</span>
          </span>
        )}
      </div>
      <PlotGrid accent={palette.ringVolume}>
        <GlowSparkline points={weights.map((w) => ({ label: fmtShort(w.date), value: w.weight }))} color={palette.ringVolume} unit=" lb" />
      </PlotGrid>
    </WidgetCard>
  );
};

/* ── Assigned plan: adherence + prescribed vs actual ─────── */
const PlanCard: React.FC<{ plan: AssignedPlan; workouts: TraineeWorkout[]; onEdit: () => void; onRemove: () => void }> = ({ plan, workouts, onEdit, onRemove }) => {
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

  // A multi-day plan is performed one day per session, so the latest session
  // is scored against the day it best matches — not the whole program (which
  // marked every other day's exercises "Missed" and capped adherence at ~1/N).
  const dayGroups = groupByDay(plan.exercises);
  const sessionDay = latest && dayGroups.length > 1 ? (dayOfSession(plan, latest) ?? dayGroups[0][0]) : (dayGroups[0]?.[0] ?? '');
  const scored = dayGroups.find(([label]) => label === sessionDay)?.[1] ?? plan.exercises;
  const doneCount = latest ? scored.filter((ex) => actualFor(ex.name) != null).length : 0;
  const donePct = latest && scored.length ? doneCount / scored.length : 0;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
              {latest ? `Last session (${lastLabel})` : 'Prescribed'}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onEdit}
                aria-label="Edit plan"
                className="flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] font-semibold transition-colors"
                style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)' }}
              >
                <AppIcon name="Edit" size="sm" /> Edit
              </button>
              <button
                type="button"
                onClick={onRemove}
                aria-label="Delete plan"
                className="flex items-center gap-1 h-7 px-2 rounded-lg text-[12px] font-semibold transition-colors"
                style={{ color: TONE.bad, background: 'color-mix(in srgb, var(--red) 8%, transparent)' }}
              >
                <AppIcon name="Trash" size="sm" /> Delete
              </button>
            </div>
          </div>

          {/* Completion progress — "did they do it or not" at a glance */}
          {latest && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {doneCount}/{scored.length} exercises done{dayGroups.length > 1 && sessionDay ? ` · ${sessionDay}` : ''}
                </p>
                <p className="text-[12px] font-bold" style={{ color: donePct === 1 ? TONE.good : donePct > 0 ? ACCENT : TONE.bad }}>
                  {Math.round(donePct * 100)}%
                </p>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                <div className="h-full rounded-full" style={{ width: `${donePct * 100}%`, background: donePct === 1 ? TONE.good : ACCENT }} />
              </div>
            </div>
          )}

          {dayGroups.map(([dayLabel, exs], gi) => (
            <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
              {dayLabel && (
                <p className="text-[13px] font-bold mb-2.5" style={{ color: ACCENT }}>{dayLabel}</p>
              )}
              <div className="space-y-4">
                {exs.map((ex, i) => {
                  const act = actualFor(ex.name);
                  const group = resolveMuscleGroup(ex.name, ex.muscle_group);
                  const rx = `Prescribed ${ex.default_sets}×${ex.default_reps}${ex.default_weight ? ` @ ${ex.default_weight} lb` : ''}`;
                  return (
                    <ExerciseAccent
                      key={i}
                      name={ex.name}
                      muscleGroup={group}
                      right={latest && dayLabel === sessionDay ? (
                        act
                          ? <span className="text-[11px] font-bold" style={{ color: TONE.good }}>✓ Done</span>
                          : <span className="text-[11px] font-bold" style={{ color: TONE.bad }}>Missed</span>
                      ) : undefined}
                    >
                      <p className="text-[12px] font-semibold mt-1" style={{ color: 'var(--text-muted)' }}>{rx}</p>
                      {act && <div className="mt-2"><SetGrid sets={act} /></div>}
                    </ExerciseAccent>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

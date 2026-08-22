import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import { Activity, ChevronDown, X, LinkIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { whoopService, KJ_TO_STEPS } from '../services/whoopService';
import { LoadInsights } from './LoadInsights';
import { CardiacHealth } from './CardiacHealth';
import { WhoopCard, TileIcons, type WhoopGauge, type WhoopTile, type WhoopSteps } from './WhoopCard';
import { useAuth } from '../../../contexts/AuthContext';
import { useProgress } from '../../../contexts/ProgressContext';
import type { WhoopRecovery, WhoopSleep, WhoopCycle, WhoopWorkout } from '../types';

type Tab = 'day' | 'week' | 'month';

const TAB_DAYS: Record<Tab, number> = { day: 7, week: 7, month: 30 };

function buildDateRange(days: number) {
  const end = new Date();
  const start = subDays(end, days);
  return { start: start.toISOString(), end: end.toISOString() };
}

function numAvg(arr: number[]): number | null {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function friendlyError(err: unknown): string {
  const e = err as { status?: number; message?: string };
  if (e?.status === 401) return 'Session expired — reconnect WHOOP in Settings';
  return e?.message ?? 'Failed to load data';
}

function recoveryColor(score: number) {
  if (score >= 67) return '#4ade80';
  if (score >= 34) return '#f59e0b';
  return '#f87171';
}

const STAT_INFO: Record<string, { title: string; desc: string }> = {
  HRV: {
    title: 'Heart Rate Variability',
    desc: 'The variation in time between heartbeats. Higher HRV generally indicates better recovery and readiness. WHOOP measures this during sleep.',
  },
  RHR: {
    title: 'Resting Heart Rate',
    desc: 'Your heart rate at complete rest, measured during sleep. A lower RHR typically indicates better cardiovascular fitness and recovery.',
  },
  'IN BED': {
    title: 'Time in Bed',
    desc: 'Total time spent in bed during your last sleep, including time awake in bed. More time in bed doesn\'t always mean better sleep quality.',
  },
  STRAIN: {
    title: 'Strain Score',
    desc: 'A measure of cardiovascular load on a 0–21 scale. Higher strain means more stress on your body. Balance strain with recovery for optimal performance.',
  },
  STEPS: {
    title: 'Estimated Steps',
    desc: 'Steps estimated from energy expenditure (kilojoules) recorded by WHOOP. Day view shows today\'s count; Week/Month shows the total for the selected period.',
  },
};

// ── Circular ring gauge ────────────────────────────────────────
type RingProps = {
  value: number | null;
  max: number;
  color: string;
  label: string;
  unit?: string;
  decimals?: number;
};

const Ring: React.FC<RingProps> = ({ value, max, color, label, unit, decimals = 0 }) => {
  const size = 116;
  const cx = size / 2;
  const cy = size / 2;
  const r = 48;
  const circumference = 2 * Math.PI * r;
  const progress = value != null ? Math.min(Math.max(value / max, 0), 1) : 0;
  const offset = circumference * (1 - progress);
  const display = value != null ? (decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString()) : '—';
  const numFontSize = display === '—' ? 26 : display.length > 4 ? 18 : display.length > 3 ? 22 : 28;

  return (
    <div className="flex flex-col items-center" style={{ gap: 10 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        {/* Progress */}
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={value != null ? color : 'transparent'}
          strokeWidth="7"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.9s ease' }}
        />
        {/* Number — shifted up slightly when unit is present */}
        <text
          x={cx}
          y={unit && value != null ? cy - 6 : cy}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={numFontSize}
          fontWeight="800"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {display}
        </text>
        {/* Unit below number */}
        {unit && value != null && (
          <text
            x={cx} y={cy + numFontSize * 0.72}
            textAnchor="middle"
            dominantBaseline="central"
            fill="rgba(255,255,255,0.55)"
            fontSize="11"
            fontWeight="600"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {unit}
          </text>
        )}
      </svg>
      {/* Label */}
      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
        {label} <span style={{ opacity: 0.5 }}>›</span>
      </div>
    </div>
  );
};

// ── Sub-stat pill with info icon ───────────────────────────────
const Stat: React.FC<{ label: string; value: string; color?: string; onInfo: () => void }> = ({ label, value, color, onInfo }) => (
  <div
    className="flex-1 flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 relative"
    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
  >
    <button
      type="button"
      onClick={onInfo}
      className="absolute top-1.5 right-1.5 flex items-center justify-center"
      style={{ color: 'rgba(255,255,255,0.2)', lineHeight: 1 }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="0.8" />
        <text x="5" y="7" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="700" fontFamily="system-ui">i</text>
      </svg>
    </button>
    <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {label}
    </div>
    <div style={{ color: color ?? 'white', fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </div>
  </div>
);

// ── Info popup ─────────────────────────────────────────────────
const InfoPopup: React.FC<{ stat: string; onClose: () => void }> = ({ stat, onClose }) => {
  const info = STAT_INFO[stat];
  if (!info) return null;
  return (
    <div
      className="absolute inset-x-4 bottom-4 rounded-2xl p-4 z-10"
      style={{ background: 'rgba(20,24,33,0.98)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>{info.title}</span>
        <button type="button" onClick={onClose} style={{ color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
          <X size={14} />
        </button>
      </div>
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 1.6 }}>{info.desc}</p>
    </div>
  );
};

// ── Skeleton shimmer ───────────────────────────────────────────
const RingSkeleton: React.FC = () => (
  <div className="flex flex-col items-center" style={{ gap: 10 }}>
    <div className="skeleton rounded-full" style={{ width: 116, height: 116 }} />
    <div className="skeleton h-2.5 w-16 rounded" />
  </div>
);

// ── Step counter card ──────────────────────────────────────────
const STEP_GOAL = 10_000;

/** Format with thousands separator: 12456 → "12,456" */
const fmtStepsFull = (n: number) => n.toLocaleString();

type StepsCardProps = {
  cycles: WhoopCycle[];
  tab: Tab;
};

const StepsCard: React.FC<StepsCardProps> = ({ cycles, tab }) => {
  if (!cycles.length) return null;

  // ── Compute totals ────────────────────────────────────────────
  // The big "day" number is TODAY's steps only — the cycle whose local date
  // is today, not simply the most recent cycle (which can be a day or two
  // old when WHOOP hasn't synced yet, and would otherwise be mislabelled as
  // today). If there's no cycle for today, show 0.
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayCycle = cycles.find((c) => c.date === todayStr);
  const todaySteps = todayCycle ? Math.round(todayCycle.raw_kilojoules * KJ_TO_STEPS) : 0;

  // Group cycles by calendar date and sum steps per day
  const byDate = new Map<string, number>();
  cycles.forEach((c) => {
    const existing = byDate.get(c.date) ?? 0;
    byDate.set(c.date, existing + Math.round(c.raw_kilojoules * KJ_TO_STEPS));
  });

  const dayEntries = Array.from(byDate.entries())
    .sort((a, b) => b[0].localeCompare(a[0])) // newest first
    .slice(0, tab === 'day' ? 7 : tab === 'week' ? 7 : 30);

  const totalSteps = dayEntries.reduce((s, [, v]) => s + v, 0);
  const avgPerDay = dayEntries.length > 0 ? Math.round(totalSteps / dayEntries.length) : 0;

  const barMax = Math.max(...dayEntries.map(([, v]) => v), STEP_GOAL);

  // Day progress toward goal
  const progressPct = Math.min((todaySteps / STEP_GOAL) * 100, 100);
  const progressColor = todaySteps >= STEP_GOAL ? '#4ade80' : todaySteps >= 7000 ? '#fbbf24' : '#4FC3F7';

  // Show at most 7 day bars
  const barDays = dayEntries.slice(0, 7);

  return (
    <div
      className="mx-4 mb-4 rounded-2xl p-3"
      style={{ background: 'rgba(79,195,247,0.06)', border: '1px solid rgba(79,195,247,0.12)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>
            Steps
          </span>
          <span style={{ fontSize: 8, color: 'rgba(79,195,247,0.5)', fontWeight: 600 }}>
            est. from kilojoules
          </span>
        </div>
        {tab !== 'day' && (
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
            {dayEntries.length}d total
          </span>
        )}
      </div>

      {tab === 'day' ? (
        <>
          {/* Big step count */}
          <div className="flex items-end gap-2 mb-2">
            <span style={{ fontSize: 32, fontWeight: 900, color: progressColor, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
              {fmtStepsFull(todaySteps)}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', fontWeight: 600, marginBottom: 4 }}>
              / {fmtStepsFull(STEP_GOAL)}
            </span>
          </div>

          {/* Goal progress bar */}
          <div className="relative w-full rounded-full overflow-hidden mb-1" style={{ height: 6, background: 'rgba(255,255,255,0.08)' }}>
            <div
              className="absolute left-0 top-0 h-full rounded-full"
              style={{ width: `${progressPct}%`, background: progressColor, transition: 'width 0.8s ease' }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
              {progressPct >= 100 ? 'Goal reached' : `${Math.round(progressPct)}% of daily goal`}
            </span>
            {todaySteps < STEP_GOAL && (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 600 }}>
                {fmtStepsFull(STEP_GOAL - todaySteps)} to go
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Total + average */}
          <div className="flex items-end gap-4 mb-3">
            <div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#4FC3F7', lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {fmtStepsFull(totalSteps)}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.06em', marginTop: 2 }}>
                TOTAL
              </div>
            </div>
            <div style={{ marginBottom: 2 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'rgba(79,195,247,0.7)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {fmtStepsFull(avgPerDay)}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontWeight: 700, letterSpacing: '0.06em', marginTop: 2 }}>
                /DAY AVG
              </div>
            </div>
          </div>

          {/* Per-day bar chart (last 7 days) */}
          {barDays.length > 1 && (
            <div className="flex items-end gap-1" style={{ height: 40 }}>
              {barDays.map(([date, steps]) => {
                const barH = Math.max(3, Math.round((steps / barMax) * 36));
                const isGoal = steps >= STEP_GOAL;
                const barColor = isGoal ? '#4ade80' : steps >= 7000 ? '#4FC3F7' : 'rgba(79,195,247,0.35)';
                return (
                  <div key={date} className="flex-1 flex flex-col items-center gap-1">
                    <div style={{ height: 36, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                      <div style={{ width: '100%', height: barH, borderRadius: 3, background: barColor }} />
                    </div>
                    <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', fontWeight: 700 }}>
                      {format(new Date(date + 'T12:00:00'), 'E')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Goal hit count */}
          {(() => {
            const goalDays = dayEntries.filter(([, v]) => v >= STEP_GOAL).length;
            if (goalDays === 0) return null;
            return (
              <div className="mt-1.5" style={{ fontSize: 9, color: 'rgba(79,195,247,0.5)', fontWeight: 600 }}>
                {goalDays}/{dayEntries.length} days hit {fmtStepsFull(STEP_GOAL)} goal
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
};

// ── HR zone colours (zone 0 = resting/gray, 1-5 = blue→red) ──
const ZONE_COLORS = ['#374151', '#60a5fa', '#4ade80', '#fbbf24', '#f97316', '#ef4444'];
const ZONE_LABELS = ['Rest', 'Recovery', 'Aerobic', 'Moderate', 'Threshold', 'Max'];

const ZoneBar: React.FC<{ zones: WhoopWorkout['zone_durations']; height?: number }> = ({ zones, height = 6 }) => {
  if (!zones) return null;
  const values = [zones.zone_zero, zones.zone_one, zones.zone_two, zones.zone_three, zones.zone_four, zones.zone_five];
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="flex w-full overflow-hidden" style={{ borderRadius: height, gap: 1, height }}>
      {values.map((v, i) => {
        const pct = (v / total) * 100;
        if (pct < 0.5) return null;
        return <div key={i} style={{ width: `${pct}%`, background: ZONE_COLORS[i], minWidth: 2 }} />;
      })}
    </div>
  );
};

const ZoneLegend: React.FC<{ zones: WhoopWorkout['zone_durations'] }> = ({ zones }) => {
  if (!zones) return null;
  const values = [zones.zone_zero, zones.zone_one, zones.zone_two, zones.zone_three, zones.zone_four, zones.zone_five];
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const toMin = (ms: number) => Math.round(ms / 60000);
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {values.map((v, i) => {
        const pct = (v / total) * 100;
        if (pct < 1) return null;
        return (
          <div key={i} className="flex items-center gap-1">
            <div style={{ width: 6, height: 6, borderRadius: 2, background: ZONE_COLORS[i], flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.05em' }}>
              Z{i} · {toMin(v)}m
            </span>
          </div>
        );
      })}
    </div>
  );
};

const fmtDuration = (ms: number) => {
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const WorkoutCard: React.FC<{ w: WhoopWorkout; isHardest?: boolean }> = ({ w, isHardest }) => {
  const [expanded, setExpanded] = useState(false);
  const strainColor = w.strain == null ? 'rgba(255,255,255,0.5)'
    : w.strain >= 18 ? '#ef4444'
    : w.strain >= 14 ? '#f97316'
    : w.strain >= 10 ? '#fbbf24'
    : '#60a5fa';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)', border: isHardest ? '1px solid rgba(249,115,22,0.5)' : '1px solid rgba(255,255,255,0.07)' }}
    >
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 12, fontWeight: 800, color: 'white' }}>{w.sport_name}</span>
            {w.strain != null && (
              <span style={{ fontSize: 10, fontWeight: 700, color: strainColor, marginLeft: 2 }}>
                {w.strain.toFixed(1)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
            {format(new Date(w.start), 'h:mm a')} · {fmtDuration(w.duration_milli)}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {w.average_heart_rate != null && (
            <div className="text-right">
              <div style={{ fontSize: 14, fontWeight: 800, color: '#f87171', lineHeight: 1 }}>
                {w.average_heart_rate}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.05em' }}>
                AVG BPM
              </div>
            </div>
          )}
          {w.max_heart_rate != null && (
            <div className="text-right">
              <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', lineHeight: 1 }}>
                {w.max_heart_rate}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: '0.05em' }}>
                MAX BPM
              </div>
            </div>
          )}
          <ChevronDown
            size={14}
            style={{ color: 'rgba(255,255,255,0.25)', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <ZoneBar zones={w.zone_durations} height={8} />
          <ZoneLegend zones={w.zone_durations} />
          {w.distance_meter != null && w.distance_meter > 0 && (
            <div className="mt-2" style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
              {(w.distance_meter / 1000).toFixed(2)} km
              {w.kilojoules != null && ` · ${Math.round(w.kilojoules * 0.239)} kcal`}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Main dashboard ────────────────────────────────────────── */
export const WhoopDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { startProgress, doneProgress } = useProgress();
  const [connected, setConnected] = useState(false);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('day');
  // Day-view browsing offset: 0 = most recent day (today when synced), higher
  // = further back. Reset whenever the tab changes.
  const [dayIdx, setDayIdx] = useState(0);
  useEffect(() => { setDayIdx(0); }, [tab]);

  const [recovery, setRecovery] = useState<WhoopRecovery[]>([]);
  const [sleep, setSleep] = useState<WhoopSleep[]>([]);
  const [steps, setSteps] = useState<WhoopCycle[]>([]);
  const [workouts, setWorkouts] = useState<WhoopWorkout[]>([]);
  const [showWorkouts, setShowWorkouts] = useState(true);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeInfo, setActiveInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setConnectionLoading(false); return; }
    whoopService.getConnectionInfo(user.id)
      .then((info) => setConnected(info?.connected ?? false))
      .catch(() => setConnected(false))
      .finally(() => setConnectionLoading(false));
  }, [user?.id]);

  const fetchAll = useCallback(async () => {
    if (!connected || !user?.id) return;
    startProgress();
    setLoading(true);
    setError(null);
    try {
      const { start, end } = tab === 'day' ? { start: undefined, end: undefined } : buildDateRange(TAB_DAYS[tab]);
      const result = await whoopService.fetchAll(tab, start, end);
      setRecovery(result.recovery);
      setSleep(result.sleep);
      setSteps(result.cycles);
      setWorkouts(result.workouts);
      setStale(result.fromCache);
    } catch (err) {
      // A dead/expired token (401) means the WHOOP link is broken — flip to the
      // reconnect prompt (with its Connect button) instead of a dead-end error,
      // so the user always has a one-tap path back to a working connection.
      const status = (err as { status?: number })?.status;
      if (status === 401) setConnected(false);
      else setError(friendlyError(err));
    } finally {
      doneProgress();
      setLoading(false);
    }
  }, [connected, tab, user?.id, startProgress, doneProgress]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  if (connectionLoading) {
    return (
      <div
        className="rounded-2xl animate-pulse overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #0d1117 0%, #111827 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          height: 80,
        }}
      />
    );
  }

  if (!connected) {
    return (
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(160deg, #0d1117 0%, #111827 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" style={{ color: '#C8FF00' }} />
            <span style={{ color: 'white', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em' }}>WHOOP</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
            style={{ background: 'rgba(200,255,0,0.12)', border: '1px solid rgba(200,255,0,0.25)' }}
          >
            <LinkIcon className="w-3 h-3" style={{ color: '#C8FF00' }} />
            <span style={{ color: '#C8FF00', fontSize: 11, fontWeight: 700 }}>Connect</span>
          </button>
        </div>
        <p className="px-4 pb-4 text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Link your WHOOP in Settings to see recovery, sleep and strain data here.
        </p>
      </div>
    );
  }

  // ── Day-by-day browsing (day tab) ──────────────────────────
  // Union of dates across recovery / sleep / cycle, newest first, so a day
  // that has only some of the three metrics still appears. dayIdx 0 = latest
  // (today when synced); the arrows in the card header step back through it,
  // like the calendar. Every day-view metric is read for the SAME selected
  // date (previously each used index [0], which could mix dates).
  // Plain computation, NOT useMemo: this runs below the component's early
  // returns (connectionLoading / !connected), so making it a hook would break
  // the Rules of Hooks and crash the card when the connection state flips.
  // The arrays are tiny (~10 days), so recomputing each render is free.
  const dayDates = (() => {
    const set = new Set<string>();
    recovery.forEach((r) => r.date && set.add(r.date));
    sleep.forEach((s) => s.date && set.add(s.date));
    steps.forEach((c) => c.date && set.add(c.date));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  })();

  const clampedDayIdx = Math.min(dayIdx, Math.max(0, dayDates.length - 1));
  const selectedDate = dayDates[clampedDayIdx] ?? null;
  const dayRec = selectedDate ? recovery.find((r) => r.date === selectedDate) : recovery[0];
  // Link sleep/strain to the day's recovery via WHOOP's own ids (TZ-immune) —
  // last night's sleep and today's cycle can format to a different local day
  // than the recovery, which made them blank under exact-date matching. Fall
  // back to date match when there's no recovery/id for the day.
  const daySleep = (dayRec?.sleep_id && sleep.find((s) => s.id === dayRec.sleep_id))
    || (selectedDate ? sleep.find((s) => s.date === selectedDate) : sleep[0]);
  const dayCycle = (dayRec?.cycle_id != null && steps.find((c) => c.id === dayRec.cycle_id))
    || (selectedDate ? steps.find((c) => c.date === selectedDate) : steps[0]);

  // ── Ring values ────────────────────────────────────────────
  let recoveryVal: number | null = null;
  let strainVal: number | null = null;
  let sleepVal: number | null = null;

  if (tab === 'day') {
    recoveryVal = dayRec?.recovery_score ?? null;
    strainVal = dayCycle?.strain_score ?? null;
    sleepVal = daySleep?.sleep_performance_percentage ?? null;
  } else {
    recoveryVal = numAvg(recovery.map((r) => r.recovery_score));
    const strainArr = steps.filter((s) => s.strain_score != null).map((s) => s.strain_score!);
    strainVal = numAvg(strainArr);
    sleepVal = numAvg(sleep.map((s) => s.sleep_performance_percentage));
  }

  const hrv = dayRec?.hrv_rmssd_milli ?? null;
  const rhr = dayRec?.resting_heart_rate ?? null;
  const inBedHours = daySleep ? (daySleep.total_in_bed_time_milli / 3_600_000).toFixed(1) : null;
  const strain = dayCycle?.strain_score ?? null;

  const avgHrv = tab !== 'day' ? numAvg(recovery.map((r) => r.hrv_rmssd_milli)) : null;
  const avgRhr = tab !== 'day' ? numAvg(recovery.map((r) => r.resting_heart_rate)) : null;
  const avgSleep = tab !== 'day' ? numAvg(sleep.map((s) => s.sleep_performance_percentage)) : null;
  const avgStrain = tab !== 'day' ? numAvg(steps.filter((s) => s.strain_score != null).map((s) => s.strain_score!)) : null;

  const dayDateObj = selectedDate ? new Date(`${selectedDate}T00:00:00`) : null;
  const lastDate = tab === 'day'
    ? (dayDateObj ? format(dayDateObj, 'EEE, MMM d') : null)
    : (recovery[0]?.date ? format(new Date(recovery[0].date), 'MMM d') : null);

  const dayNav = tab === 'day' && dayDates.length > 0
    ? {
        label: lastDate ?? '',
        canPrev: clampedDayIdx < dayDates.length - 1,   // older day exists
        canNext: clampedDayIdx > 0,                     // newer day exists
        onPrev: () => setDayIdx((i) => Math.min(i + 1, dayDates.length - 1)),
        onNext: () => setDayIdx((i) => Math.max(i - 1, 0)),
      }
    : null;

  // ── Redesigned-card data (see WhoopCard) ───────────────────
  const caption = { day: 'Last night', week: 'This week', month: 'This month' }[tab];
  const avgInBed = tab !== 'day' ? numAvg(sleep.map((s) => s.total_in_bed_time_milli / 3_600_000)) : null;

  const SLEEP_C = '#4fc3f7', REC_C = '#ffd54f', STRAIN_C = '#C8FF00', HRV_C = '#afa9ec', RHR_C = '#ff8080';

  const gauges: WhoopGauge[] = [
    { label: 'Sleep', value: sleepVal != null ? sleepVal.toFixed(1) : '—', pctUnit: '%', pct: sleepVal ?? 0, color: SLEEP_C, max: '100', caption },
    { label: 'Recovery', value: recoveryVal != null ? String(Math.round(recoveryVal)) : '—', pctUnit: '%', pct: recoveryVal ?? 0, color: REC_C, max: '100', caption },
    { label: 'Strain', value: strainVal != null ? strainVal.toFixed(1) : '—', pctUnit: '', pct: strainVal != null ? (strainVal / 21) * 100 : 0, color: STRAIN_C, max: '21', caption },
  ];

  const tiles: WhoopTile[] = tab === 'day'
    ? [
        { label: 'HRV', value: hrv != null ? String(Math.round(hrv)) : '—', unit: 'ms', color: HRV_C, icon: TileIcons.hrv(HRV_C) },
        { label: 'RHR', value: rhr != null ? String(rhr) : '—', unit: 'bpm', color: RHR_C, icon: TileIcons.rhr(RHR_C) },
        { label: 'In Bed', value: inBedHours ?? '—', unit: 'h', color: SLEEP_C, icon: TileIcons.inBed(SLEEP_C) },
        { label: 'Strain', value: strain != null ? strain.toFixed(1) : '—', unit: '', color: STRAIN_C, icon: TileIcons.strain(STRAIN_C) },
      ]
    : [
        { label: 'HRV', value: avgHrv != null ? String(Math.round(avgHrv)) : '—', unit: 'ms', color: HRV_C, icon: TileIcons.hrv(HRV_C) },
        { label: 'RHR', value: avgRhr != null ? String(Math.round(avgRhr)) : '—', unit: 'bpm', color: RHR_C, icon: TileIcons.rhr(RHR_C) },
        { label: 'In Bed', value: avgInBed != null ? avgInBed.toFixed(1) : '—', unit: 'h', color: SLEEP_C, icon: TileIcons.inBed(SLEEP_C) },
        { label: 'Strain', value: avgStrain != null ? avgStrain.toFixed(1) : '—', unit: '', color: STRAIN_C, icon: TileIcons.strain(STRAIN_C) },
      ];

  const stepGoal = tab === 'day' ? 10_000 : tab === 'week' ? 70_000 : 300_000;
  const stepTotal = tab === 'day'
    ? (dayCycle ? Math.round(dayCycle.raw_kilojoules * KJ_TO_STEPS) : 0)
    : steps.reduce((sum, cy) => sum + Math.round(cy.raw_kilojoules * KJ_TO_STEPS), 0);
  const stepsData: WhoopSteps = {
    value: stepTotal.toLocaleString(),
    goal: stepGoal.toLocaleString(),
    pct: stepGoal > 0 ? (stepTotal / stepGoal) * 100 : 0,
    reached: stepTotal >= stepGoal,
    showCaption: true,
  };

  return (
    <div className="space-y-4">
      <WhoopCard
        tab={tab}
        onTab={setTab}
        loading={loading}
        error={error}
        onRetry={() => void fetchAll()}
        stale={stale}
        dateLabel={lastDate}
        dayNav={dayNav}
        gauges={gauges}
        tiles={tiles}
        steps={stepsData}
      />

      {/* Training load & injury risk (self-fetches its own 4-week window) */}
      {user?.id && <LoadInsights userId={user.id} />}

      {/* Cardiometric health — VO2max, resting HR, HRV, HR reserve */}
      {user?.id && <CardiacHealth userId={user.id} />}

      {/* Workouts */}
      {!loading && !error && workouts.length > 0 && (
        <div className="rounded-2xl px-4 py-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setShowWorkouts((p) => !p)}
            className="w-full flex items-center justify-between mb-2 cursor-pointer"
          >
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
              Activities · {workouts.length}
            </span>
            <ChevronDown
              size={12}
              style={{ color: 'rgba(255,255,255,0.25)', transition: 'transform 0.2s', transform: showWorkouts ? 'rotate(180deg)' : 'none' }}
            />
          </button>
          {(() => {
            const hardest = workouts.reduce<WhoopWorkout | null>(
              (best, w) => (w.strain != null && (!best || w.strain > (best.strain ?? -1)) ? w : best),
              null,
            );
            return (
              <>
                {hardest?.strain != null && (
                  <div className="flex items-center justify-between mb-2" style={{ fontSize: 10, fontWeight: 700 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Hardest recently</span>
                    <span style={{ color: 'white' }}>
                      {hardest.sport_name} · <span style={{ color: '#f97316' }}>{hardest.strain.toFixed(1)}</span>
                    </span>
                  </div>
                )}
                {showWorkouts && (
                  <div className="flex flex-col gap-2">
                    {workouts.slice(0, 8).map((w) => <WorkoutCard key={w.id} w={w} isHardest={w.id === hardest?.id} />)}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {activeInfo && <InfoPopup stat={activeInfo} onClose={() => setActiveInfo(null)} />}
    </div>
  );

};

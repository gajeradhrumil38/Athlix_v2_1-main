import React, { useState, useEffect, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import { Activity, ChevronDown, X, LinkIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { whoopService } from '../services/whoopService';
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
  // Re-derive from raw_kilojoules for maximum accuracy (avoids rounding from the parse step)
  const today = cycles[0];
  const todaySteps = Math.round(today.raw_kilojoules * 23.9);

  // Group cycles by calendar date and sum steps per day
  const byDate = new Map<string, number>();
  cycles.forEach((c) => {
    const existing = byDate.get(c.date) ?? 0;
    byDate.set(c.date, existing + Math.round(c.raw_kilojoules * 23.9));
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

const WorkoutCard: React.FC<{ w: WhoopWorkout }> = ({ w }) => {
  const [expanded, setExpanded] = useState(false);
  const strainColor = w.strain == null ? 'rgba(255,255,255,0.5)'
    : w.strain >= 18 ? '#ef4444'
    : w.strain >= 14 ? '#f97316'
    : w.strain >= 10 ? '#fbbf24'
    : '#60a5fa';

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
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

  const [recovery, setRecovery] = useState<WhoopRecovery[]>([]);
  const [sleep, setSleep] = useState<WhoopSleep[]>([]);
  const [steps, setSteps] = useState<WhoopCycle[]>([]);
  const [workouts, setWorkouts] = useState<WhoopWorkout[]>([]);
  const [showWorkouts, setShowWorkouts] = useState(false);
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
      setError(friendlyError(err));
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

  // ── Compute ring values ────────────────────────────────────
  let recoveryVal: number | null = null;
  let strainVal: number | null = null;
  let sleepVal: number | null = null;

  if (tab === 'day') {
    recoveryVal = recovery[0]?.recovery_score ?? null;
    strainVal = steps[0]?.strain_score ?? null;
    sleepVal = sleep[0]?.sleep_performance_percentage ?? null;
  } else {
    recoveryVal = numAvg(recovery.map((r) => r.recovery_score));
    const strainArr = steps.filter((s) => s.strain_score != null).map((s) => s.strain_score!);
    strainVal = numAvg(strainArr);
    sleepVal = numAvg(sleep.map((s) => s.sleep_performance_percentage));
  }

  const todayRec = recovery[0];
  const todaySleep = sleep[0];
  const todayStep = steps[0];

  const hrv = todayRec?.hrv_rmssd_milli ?? null;
  const rhr = todayRec?.resting_heart_rate ?? null;
  const inBedHours = todaySleep ? (todaySleep.total_in_bed_time_milli / 3_600_000).toFixed(1) : null;
  const strain = todayStep?.strain_score ?? null;

  const avgRecovery = tab !== 'day' ? numAvg(recovery.map((r) => r.recovery_score)) : null;
  const avgHrv = tab !== 'day' ? numAvg(recovery.map((r) => r.hrv_rmssd_milli)) : null;
  const avgRhr = tab !== 'day' ? numAvg(recovery.map((r) => r.resting_heart_rate)) : null;
  const avgSleep = tab !== 'day' ? numAvg(sleep.map((s) => s.sleep_performance_percentage)) : null;
  const avgStrain = tab !== 'day' ? numAvg(steps.filter((s) => s.strain_score != null).map((s) => s.strain_score!)) : null;
  const lastDate = recovery[0]?.date ? format(new Date(recovery[0].date), 'MMM d') : null;

  const hasSubStats = tab === 'day'
    ? (hrv != null || rhr != null || inBedHours != null || strain != null)
    : (avgRecovery != null || avgHrv != null || avgRhr != null || avgSleep != null || avgStrain != null);

  return (
    <div
      className="rounded-2xl animate-card-enter overflow-hidden relative"
      style={{
        background: 'linear-gradient(160deg, #0d1117 0%, #111827 100%)',
        border: '1px solid rgba(255,255,255,0.08)',
        animationDelay: '420ms',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: '#C8FF00' }} />
          <span style={{ color: 'white', fontSize: 13, fontWeight: 800, letterSpacing: '0.08em' }}>WHOOP</span>
        </div>
        <div className="flex items-center gap-2">
          {lastDate && tab === 'day' && (
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{lastDate}</span>
          )}
          {stale && !loading && (
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, letterSpacing: '0.05em' }}>cached</span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b mx-4" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {(['day', 'week', 'month'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-center transition-colors"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: tab === t ? 'white' : 'rgba(255,255,255,0.3)',
              borderBottom: tab === t ? '2px solid #C8FF00' : '2px solid transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
          {error} —{' '}
          <button type="button" onClick={() => void fetchAll()} className="underline">Retry</button>
        </div>
      )}

      {/* Rings */}
      <div className="flex justify-around px-3 py-4">
        {loading ? (
          <>
            <RingSkeleton />
            <RingSkeleton />
            <RingSkeleton />
          </>
        ) : (
          <>
            <Ring
              value={sleepVal}
              max={100}
              color="#60a5fa"
              label="Sleep"
              unit="%"
              decimals={1}
            />
            <Ring
              value={recoveryVal}
              max={100}
              color={recoveryVal != null ? recoveryColor(recoveryVal) : '#666'}
              label="Recovery"
              unit="%"
            />
            <Ring
              value={strainVal}
              max={21}
              color="#C8FF00"
              label="Strain"
              unit="/ 21"
              decimals={1}
            />
          </>
        )}
      </div>

      {/* Sub-stats */}
      {!loading && !error && hasSubStats && (
        <div className="px-4 pb-4">
          {tab === 'day' ? (
            <div className="flex gap-2">
              {hrv != null && <Stat label="HRV" value={`${Math.round(hrv)}ms`} color="#a78bfa" onInfo={() => setActiveInfo('HRV')} />}
              {rhr != null && <Stat label="RHR" value={`${rhr}bpm`} color="#f87171" onInfo={() => setActiveInfo('RHR')} />}
              {inBedHours && <Stat label="In Bed" value={`${inBedHours}h`} color="#60a5fa" onInfo={() => setActiveInfo('IN BED')} />}
              {strain != null && <Stat label="Strain" value={strain.toFixed(1)} color="#C8FF00" onInfo={() => setActiveInfo('STRAIN')} />}
            </div>
          ) : (
            <div className="flex gap-2">
              {avgHrv != null && <Stat label="Avg HRV" value={`${Math.round(avgHrv)}ms`} color="#a78bfa" onInfo={() => setActiveInfo('HRV')} />}
              {avgRhr != null && <Stat label="Avg RHR" value={`${Math.round(avgRhr)}`} color="#f87171" onInfo={() => setActiveInfo('RHR')} />}
              {avgSleep != null && <Stat label="Avg Sleep" value={`${Math.round(avgSleep)}%`} color="#60a5fa" onInfo={() => setActiveInfo('IN BED')} />}
              {avgStrain != null && <Stat label="Avg Strain" value={avgStrain.toFixed(1)} color="#C8FF00" onInfo={() => setActiveInfo('STRAIN')} />}
            </div>
          )}
        </div>
      )}

      {/* Step counter */}
      {!loading && !error && steps.length > 0 && (
        <StepsCard cycles={steps} tab={tab} />
      )}

      {/* Workouts section */}
      {!loading && !error && workouts.length > 0 && (
        <div className="px-4 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginTop: -2 }}>
          <button
            type="button"
            onClick={() => setShowWorkouts((p) => !p)}
            className="w-full flex items-center justify-between mb-2 cursor-pointer"
          >
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
              Workouts · {workouts.length}
            </span>
            <ChevronDown
              size={12}
              style={{ color: 'rgba(255,255,255,0.25)', transition: 'transform 0.2s', transform: showWorkouts ? 'rotate(180deg)' : 'none' }}
            />
          </button>
          {showWorkouts && (
            <div className="flex flex-col gap-2">
              {workouts.slice(0, 8).map((w) => <WorkoutCard key={w.id} w={w} />)}
            </div>
          )}
        </div>
      )}

      {/* Info popup overlay */}
      {activeInfo && (
        <InfoPopup stat={activeInfo} onClose={() => setActiveInfo(null)} />
      )}
    </div>
  );
};

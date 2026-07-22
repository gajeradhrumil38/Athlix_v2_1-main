import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, Footprints, Trash2, Calendar,
  Share2, X, Cloud, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, startOfDay, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, subMonths, addMonths, subDays } from 'date-fns';
import { getRuns, deleteRun, loadRunsFromCloud, deleteRunFromCloud, mergeRuns } from '../utils/storage';
import type { SavedRun } from '../utils/storage';
import { RunRouteBackground } from '../components/RunRouteBackground';
import { formatDuration, formatPace } from '../utils/gpsCalculations';
import type { GpsPoint } from '../utils/gpsCalculations';
import { useAuth } from '../../../contexts/AuthContext';
import { whoopService } from '../../whoop/services/whoopService';
import type { WhoopWorkout } from '../../whoop/types';

// ── Demo runs (shown only when user has zero real runs) ──────────────────────
const DEMO_PATH_5MI = [
  { lat: 42.0080, lng: -91.6430 }, { lat: 42.0073, lng: -91.6441 },
  { lat: 42.0065, lng: -91.6449 }, { lat: 42.0057, lng: -91.6456 },
  { lat: 42.0048, lng: -91.6462 }, { lat: 42.0039, lng: -91.6466 },
  { lat: 42.0029, lng: -91.6469 }, { lat: 42.0019, lng: -91.6471 },
  { lat: 42.0009, lng: -91.6472 }, { lat: 41.9999, lng: -91.6472 },
  { lat: 41.9989, lng: -91.6470 }, { lat: 41.9979, lng: -91.6468 },
  { lat: 41.9970, lng: -91.6464 }, { lat: 41.9962, lng: -91.6458 },
  { lat: 41.9955, lng: -91.6450 }, { lat: 41.9949, lng: -91.6441 },
  { lat: 41.9944, lng: -91.6431 }, { lat: 41.9941, lng: -91.6420 },
  { lat: 41.9940, lng: -91.6408 }, { lat: 41.9941, lng: -91.6396 },
  { lat: 41.9944, lng: -91.6386 }, { lat: 41.9949, lng: -91.6377 },
  { lat: 41.9956, lng: -91.6370 }, { lat: 41.9964, lng: -91.6366 },
  { lat: 41.9973, lng: -91.6366 }, { lat: 41.9981, lng: -91.6370 },
  { lat: 41.9989, lng: -91.6376 }, { lat: 41.9996, lng: -91.6383 },
  { lat: 42.0003, lng: -91.6392 }, { lat: 42.0010, lng: -91.6400 },
  { lat: 42.0017, lng: -91.6408 }, { lat: 42.0024, lng: -91.6415 },
  { lat: 42.0031, lng: -91.6420 }, { lat: 42.0039, lng: -91.6424 },
  { lat: 42.0048, lng: -91.6426 }, { lat: 42.0057, lng: -91.6428 },
  { lat: 42.0066, lng: -91.6429 }, { lat: 42.0073, lng: -91.6429 },
  { lat: 42.0080, lng: -91.6430 },
];

const DEMO_PATH_3MI = [
  { lat: 41.9628, lng: -91.6350 }, { lat: 41.9624, lng: -91.6334 },
  { lat: 41.9621, lng: -91.6318 }, { lat: 41.9619, lng: -91.6302 },
  { lat: 41.9619, lng: -91.6286 }, { lat: 41.9622, lng: -91.6272 },
  { lat: 41.9628, lng: -91.6260 }, { lat: 41.9636, lng: -91.6251 },
  { lat: 41.9645, lng: -91.6246 }, { lat: 41.9654, lng: -91.6245 },
  { lat: 41.9663, lng: -91.6248 }, { lat: 41.9670, lng: -91.6254 },
  { lat: 41.9676, lng: -91.6263 }, { lat: 41.9680, lng: -91.6275 },
  { lat: 41.9681, lng: -91.6289 }, { lat: 41.9679, lng: -91.6304 },
  { lat: 41.9675, lng: -91.6317 }, { lat: 41.9669, lng: -91.6328 },
  { lat: 41.9661, lng: -91.6337 }, { lat: 41.9652, lng: -91.6344 },
  { lat: 41.9642, lng: -91.6348 }, { lat: 41.9635, lng: -91.6350 },
  { lat: 41.9628, lng: -91.6350 },
];

const NOW = Date.now();
const DEMO_RUNS: SavedRun[] = [
  {
    id: -1, path: DEMO_PATH_5MI, distance: 8.047, duration: 2970000, pace: 6.21,
    timestamp: NOW - 2 * 24 * 60 * 60 * 1000 - 7.25 * 60 * 60 * 1000,
    splits: [
      { km: 1, pace: 6.4 }, { km: 2, pace: 6.3 }, { km: 3, pace: 6.2 },
      { km: 4, pace: 6.1 }, { km: 5, pace: 6.0 }, { km: 6, pace: 6.2 },
      { km: 7, pace: 6.3 }, { km: 8, pace: 6.1 },
    ],
  },
  {
    id: -2, path: DEMO_PATH_3MI, distance: 4.828, duration: 1728000, pace: 5.98,
    timestamp: NOW - 4 * 24 * 60 * 60 * 1000 - 6.75 * 60 * 60 * 1000,
    splits: [{ km: 1, pace: 6.1 }, { km: 2, pace: 5.9 }, { km: 3, pace: 5.8 }, { km: 4, pace: 6.0 }],
  },
];

// ── Distance unit ─────────────────────────────────────────────────────────────
const useDistanceUnit = (): 'km' | 'mi' => {
  try { const s = localStorage.getItem('athlix_distance_unit'); return s === 'mi' ? 'mi' : 'km'; }
  catch { return 'km'; }
};

// ── Mini route SVG thumbnail ──────────────────────────────────────────────────
const MiniRoute: React.FC<{ path: GpsPoint[]; size?: number }> = ({ path, size = 68 }) => {
  if (path.length < 2) return (
    <div style={{ width: size, height: size, borderRadius: 12,
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Footprints style={{ width: 20, height: 20, color: 'rgba(200,255,0,0.2)' }} />
    </div>
  );

  const lats = path.map(p => p.lat);
  const lngs = path.map(p => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 0.001;
  const lngRange = maxLng - minLng || 0.001;

  // Preserve aspect ratio inside the square
  const aspect = lngRange / latRange;
  const pad = 7;
  const innerSize = size - pad * 2;
  let drawW: number, drawH: number;
  if (aspect >= 1) { drawW = innerSize; drawH = innerSize / aspect; }
  else              { drawH = innerSize; drawW = innerSize * aspect; }
  const offX = (innerSize - drawW) / 2 + pad;
  const offY = (innerSize - drawH) / 2 + pad;

  const toX = (lng: number) => offX + ((lng - minLng) / lngRange) * drawW;
  const toY = (lat: number) => offY + ((maxLat - lat) / latRange) * drawH;

  // Subsample to ≤50 points for thumbnail
  const step = Math.max(1, Math.floor(path.length / 50));
  const pts = path.filter((_, i) => i % step === 0 || i === path.length - 1);
  const polyline = pts.map(p => `${toX(p.lng).toFixed(1)},${toY(p.lat).toFixed(1)}`).join(' ');
  const sx = toX(pts[0].lng), sy = toY(pts[0].lat);
  const ex = toX(pts[pts.length - 1].lng), ey = toY(pts[pts.length - 1].lat);

  return (
    <div style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden',
      background: 'rgba(13,15,20,0.9)', border: '1px solid rgba(200,255,0,0.18)',
      flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        {/* Subtle glow under route */}
        <polyline points={polyline} fill="none" stroke="#C8FF00" strokeWidth="5" strokeLinecap="round"
          strokeLinejoin="round" opacity="0.07" />
        {/* Route line */}
        <polyline points={polyline} fill="none" stroke="#C8FF00" strokeWidth="1.8" strokeLinecap="round"
          strokeLinejoin="round" opacity="0.88" />
        {/* Start dot */}
        <circle cx={sx} cy={sy} r={2.5} fill="#C8FF00" opacity="0.6" />
        {/* End dot */}
        <circle cx={ex} cy={ey} r={3} fill="#C8FF00" />
        <circle cx={ex} cy={ey} r={5.5} fill="#C8FF00" opacity="0.15" />
      </svg>
    </div>
  );
};

// ── Mini ring metric (mirrors ActiveRun's RingMetric at 92px) ────────────────
const MiniRingMetric: React.FC<{ pct: number; value: string; unit: string; pr?: boolean; large?: boolean }> = ({ pct, value, unit, pr, large = false }) => {
  const S = large ? 210 : 92;
  const cx = S / 2, cy = S / 2;
  const R = large ? 88 : 37;
  const sw = large ? 10 : 5.5;
  const C = 2 * Math.PI * R;
  const arc = Math.min(1, Math.max(0.04, pct));
  const color = pr ? '#fac775' : '#C8FF00';
  const glowOpacity = large ? 0.14 : 0.12;
  return (
    <div style={{ position: 'relative', width: S, height: S, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
        background: pr
          ? `radial-gradient(circle, rgba(250,199,117,${glowOpacity}) 0%, transparent 68%)`
          : `radial-gradient(circle, rgba(200,255,0,${glowOpacity}) 0%, transparent 68%)`,
      }} />
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}
        style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={sw} />
        <circle cx={cx} cy={cy} r={R} fill="none"
          stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - arc)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: large ? 6 : 3 }}>
        <span className="font-victory tabular-nums font-black text-white"
          style={{ fontSize: large ? 58 : 20, lineHeight: large ? 0.84 : 1 }}>{value}</span>
        <span className="font-victory font-black"
          style={{ fontSize: large ? 14 : 10, color, letterSpacing: '0.16em', lineHeight: 1 }}>{unit}</span>
      </div>
    </div>
  );
};

// ── Effort bars ───────────────────────────────────────────────────────────────
const EffortBars: React.FC<{ effort: number }> = ({ effort }) => (
  <div className="flex items-end gap-[3px]">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} style={{ width: 5, height: 4 + i * 3, borderRadius: 2,
        background: i <= effort ? 'var(--accent)' : 'rgba(255,255,255,0.12)' }} />
    ))}
  </div>
);

// ── Weekly mini bar chart ─────────────────────────────────────────────────────
const WeekBarChart: React.FC<{ dayKms: number[] }> = ({ dayKms }) => {
  const maxKm = Math.max(...dayKms, 0.1);
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const today = (new Date().getDay() + 6) % 7;
  return (
    <div className="flex items-end gap-1.5">
      {dayKms.map((km, i) => {
        const barH = Math.max(2, Math.round((km / maxKm) * 28));
        const isToday = i === today;
        const hasRun = km > 0;
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <div style={{ width: 14, height: barH, borderRadius: 3,
              background: hasRun ? (isToday ? 'var(--accent)' : 'rgba(200,255,0,0.45)') : 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: 8, fontWeight: 700, color: isToday ? 'var(--accent)' : 'rgba(255,255,255,0.3)' }}>
              {days[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Calendar modal ────────────────────────────────────────────────────────────
const CalendarModal: React.FC<{
  runs: SavedRun[];
  onClose: () => void;
  onDayFilter: (date: Date | null) => void;
  filteredDate: Date | null;
  dist: (km: number) => number;
  distanceUnit: string;
}> = ({ runs, onClose, onDayFilter, filteredDate, dist, distanceUnit }) => {
  const [viewMonth, setViewMonth] = useState(new Date());

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // leading blank cells so week starts Monday
  const leadingBlanks = (getDay(monthStart) + 6) % 7;

  const runsByDay = useMemo(() => {
    const map = new Map<string, SavedRun[]>();
    for (const run of runs) {
      const key = format(new Date(run.timestamp), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(run);
    }
    return map;
  }, [runs]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[70] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl flex flex-col"
        style={{
          background: '#161a22',
          border: '1px solid rgba(255,255,255,0.08)',
          paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
          maxHeight: '88vh',
          overflow: 'hidden',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <button onClick={onClose} className="p-1 text-white/40 active:text-white transition-colors">
            <X className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => setViewMonth(m => subMonths(m, 1))}
              className="p-1.5 rounded-full text-white/40 active:bg-white/08 transition-all">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[14px] font-black text-white tracking-[0.08em]">
              {format(viewMonth, 'MMMM yyyy').toUpperCase()}
            </span>
            <button onClick={() => setViewMonth(m => addMonths(m, 1))}
              className="p-1.5 rounded-full text-white/40 active:bg-white/08 transition-all">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {filteredDate ? (
            <button onClick={() => onDayFilter(null)}
              className="text-[11px] font-black tracking-[0.08em] transition-colors"
              style={{ color: 'var(--accent)' }}>
              CLEAR
            </button>
          ) : <div className="w-10" />}
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 px-4 pb-1">
          {['M','T','W','T','F','S','S'].map((d, i) => (
            <div key={i} className="flex justify-center">
              <span className="text-[10px] font-black text-white/25">{d}</span>
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-y-1 px-4 pb-4">
          {Array.from({ length: leadingBlanks }).map((_, i) => <div key={`b${i}`} />)}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayRuns = runsByDay.get(key) ?? [];
            const hasRun = dayRuns.length > 0;
            const isSelected = filteredDate ? isSameDay(day, filteredDate) : false;
            const isToday = isSameDay(day, new Date());
            const totalKm = dayRuns.reduce((s, r) => s + r.distance, 0);

            return (
              <button
                key={key}
                onClick={() => onDayFilter(isSelected ? null : day)}
                className="flex flex-col items-center py-1.5 rounded-xl transition-all active:scale-90"
                style={{
                  background: isSelected
                    ? 'rgba(200,255,0,0.15)'
                    : hasRun ? 'rgba(200,255,0,0.05)' : 'transparent',
                  border: isSelected
                    ? '1.5px solid var(--accent)'
                    : isToday ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent',
                }}
              >
                <span className="text-[12px] font-black leading-none" style={{
                  color: isSelected ? 'var(--accent)' : hasRun ? '#fff' : isToday ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
                }}>
                  {format(day, 'd')}
                </span>
                {hasRun && (
                  <div className="mt-0.5 flex items-center gap-0.5">
                    <div className="h-1 w-1 rounded-full" style={{ background: 'var(--accent)' }} />
                    {dayRuns.length > 1 && (
                      <span className="text-[7px] font-black" style={{ color: 'var(--accent)' }}>{dayRuns.length}</span>
                    )}
                  </div>
                )}
                {hasRun && totalKm > 0 && (
                  <span className="text-[7px] font-semibold mt-0.5" style={{ color: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.3)' }}>
                    {dist(totalKm).toFixed(1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Selected day runs summary */}
        {filteredDate && (() => {
          const key = format(filteredDate, 'yyyy-MM-dd');
          const dayRuns = runsByDay.get(key) ?? [];
          if (dayRuns.length === 0) return (
            <div className="mx-5 mb-2 rounded-2xl p-3 text-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[12px] text-white/40">No runs on this day</p>
            </div>
          );
          return (
            <div className="mx-5 mb-2 flex flex-col gap-2">
              <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--accent)' }}>
                {format(filteredDate, 'EEEE, MMMM d').toUpperCase()}
              </span>
              {dayRuns.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="font-victory text-[20px] font-black text-white tabular-nums">
                    {dist(r.distance).toFixed(2)}
                  </span>
                  <span className="text-[10px] font-bold text-white/30">{distanceUnit}</span>
                  <div className="h-4 w-px bg-white/10" />
                  <span className="text-[14px] font-bold text-white">{formatDuration(r.duration)}</span>
                  <div className="flex-1" />
                  <span className="text-[11px] font-semibold text-white/40">
                    {format(new Date(r.timestamp), 'h:mm a')}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </motion.div>
    </motion.div>
  );
};

// ── WHOOP HR zone helpers (used in run detail overlay) ───────────────────────
const W_ZONE_COLORS = ['#374151', '#60a5fa', '#4ade80', '#fbbf24', '#f97316', '#ef4444'];

const WZoneBar: React.FC<{ zones: WhoopWorkout['zone_durations'] }> = ({ zones }) => {
  if (!zones) return null;
  const values = [zones.zone_zero, zones.zone_one, zones.zone_two, zones.zone_three, zones.zone_four, zones.zone_five];
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return (
    <div className="flex w-full overflow-hidden" style={{ borderRadius: 4, gap: 1, height: 8 }}>
      {values.map((v, i) => {
        const pct = (v / total) * 100;
        if (pct < 0.5) return null;
        return <div key={i} style={{ width: `${pct}%`, background: W_ZONE_COLORS[i], minWidth: 2 }} />;
      })}
    </div>
  );
};

const WZoneLegend: React.FC<{ zones: WhoopWorkout['zone_durations'] }> = ({ zones }) => {
  if (!zones) return null;
  const values = [zones.zone_zero, zones.zone_one, zones.zone_two, zones.zone_three, zones.zone_four, zones.zone_five];
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const toMin = (ms: number) => Math.round(ms / 60000);
  const labels = ['Rest', 'Recovery', 'Aerobic', 'Moderate', 'Threshold', 'Max'];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
      {values.map((v, i) => {
        const pct = (v / total) * 100;
        if (pct < 1) return null;
        return (
          <div key={i} className="flex items-center gap-1">
            <div style={{ width: 6, height: 6, borderRadius: 2, background: W_ZONE_COLORS[i], flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
              {labels[i]} · {toMin(v)}m
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

type RunTab = 'all' | 'outdoor' | 'treadmill';

export const RunHistory: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [localRuns, setLocalRuns] = useState<SavedRun[]>(() => getRuns());
  const [cloudRuns, setCloudRuns] = useState<SavedRun[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [selected, setSelected] = useState<SavedRun | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedRun | null>(null);
  const [runTab, setRunTab] = useState<RunTab>('all');
  const [showCalendar, setShowCalendar] = useState(false);
  const [calFilterDate, setCalFilterDate] = useState<Date | null>(null);
  const distanceUnit = useDistanceUnit();
  const [whoopWorkouts, setWhoopWorkouts] = useState<WhoopWorkout[]>([]);

  // Load cloud runs once on mount
  useEffect(() => {
    if (!user) return;
    setCloudLoading(true);
    loadRunsFromCloud(user.id)
      .then(setCloudRuns)
      .finally(() => setCloudLoading(false));
  }, [user]);

  // Load WHOOP workouts for the last 60 days — used to enrich run detail with HR data
  useEffect(() => {
    if (!user) return;
    whoopService.getConnectionInfo(user.id).then((info) => {
      if (!info?.connected) return;
      const start = subDays(new Date(), 60).toISOString();
      const end = new Date().toISOString();
      return whoopService.fetchAll('month', start, end);
    }).then((data) => {
      if (data) setWhoopWorkouts(data.workouts);
    }).catch(() => {/* non-critical */});
  }, [user]);

  const refreshCloud = useCallback(() => {
    if (!user) return;
    setCloudLoading(true);
    loadRunsFromCloud(user.id)
      .then(setCloudRuns)
      .finally(() => setCloudLoading(false));
  }, [user]);

  // Merged: real runs (local + cloud) + demo only when 0 real runs
  const realRuns = useMemo(() => mergeRuns(localRuns, cloudRuns), [localRuns, cloudRuns]);
  const showDemo = realRuns.length === 0;
  const allRuns = useMemo(() => showDemo ? DEMO_RUNS : realRuns, [showDemo, realRuns]);

  const isDemo = (run: SavedRun) => run.id < 0;

  const bestPace = useMemo(() => {
    const validPaces = allRuns.map((r) => r.pace).filter((p) => p > 0);
    return validPaces.length > 0 ? Math.min(...validPaces) : null;
  }, [allRuns]);
  const isPR = (run: SavedRun) => bestPace !== null && run.pace > 0 && run.pace === bestPace;

  const dist = (km: number) => (distanceUnit === 'mi' ? km * 0.621371 : km);
  const paceDisplay = (paceKm: number) => (distanceUnit === 'mi' ? paceKm * 1.609344 : paceKm);

  // Tab + calendar day filtering
  const filteredRuns = useMemo(() => {
    let runs = runTab === 'treadmill' ? [] : allRuns;
    if (calFilterDate) {
      runs = runs.filter((r) => isSameDay(new Date(r.timestamp), calFilterDate));
    }
    return runs;
  }, [allRuns, runTab, calFilterDate]);

  const maxDist = useMemo(() => Math.max(...allRuns.map((r) => r.distance), 1), [allRuns]);

  // Weekly stats
  const weeklyStats = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const weekMs = 7 * dayMs;
    const weekRuns = allRuns.filter((r) => r.timestamp >= now - weekMs);
    const prevWeekRuns = allRuns.filter((r) => r.timestamp >= now - 2 * weekMs && r.timestamp < now - weekMs);
    const weekKm = weekRuns.reduce((s, r) => s + r.distance, 0);
    const prevWeekKm = prevWeekRuns.reduce((s, r) => s + r.distance, 0);
    const weekTime = weekRuns.reduce((s, r) => s + r.duration, 0);
    const weekChange = weekKm - prevWeekKm;
    const todayStart = startOfDay(new Date()).getTime();
    const dayKms = Array.from({ length: 7 }, (_, i) => {
      const dayStart = todayStart - ((((new Date().getDay() + 6) % 7) - i) * dayMs);
      const dayEnd = dayStart + dayMs;
      return weekRuns.filter((r) => r.timestamp >= dayStart && r.timestamp < dayEnd)
        .reduce((s, r) => s + r.distance, 0);
    });
    return { weekKm, weekChange, weekTime, weekCount: weekRuns.length, dayKms };
  }, [allRuns]);

  const handleDelete = (run: SavedRun) => {
    if (isDemo(run)) {
      toast('Demo runs are for preview only', { icon: '👟' });
      setConfirmDelete(null);
      return;
    }
    // Remove from localStorage
    deleteRun(run.id);
    // Remove from cloud (best-effort)
    if (user && run.fromCloud) void deleteRunFromCloud(run.id);
    setLocalRuns((prev) => prev.filter((r) => r.id !== run.id));
    setCloudRuns((prev) => prev.filter((r) => r.id !== run.id));
    if (selected?.id === run.id) setSelected(null);
    setConfirmDelete(null);
    toast.success('Run deleted');
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#0d0f14', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <button onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-all active:scale-95"
          style={{ background: 'rgba(255,255,255,0.08)' }}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex flex-col gap-0">
          <span className="font-victory text-[22px] font-black tracking-[0.18em] text-white uppercase leading-tight">
            RUN HISTORY
          </span>
          <span className="text-[12px] font-semibold text-white/50">
            {allRuns.length} {allRuns.length === 1 ? 'run' : 'runs'} total
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Cloud sync indicator */}
          <button
            onClick={refreshCloud}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-95"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            title="Sync from cloud"
          >
            {cloudLoading
              ? <RefreshCw className="h-4 w-4 text-white/40 animate-spin" />
              : <Cloud className="h-4 w-4 text-white/40" />}
          </button>
          {/* Calendar */}
          <button
            onClick={() => setShowCalendar(true)}
            className="flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-95"
            style={{
              background: calFilterDate ? 'rgba(200,255,0,0.1)' : 'rgba(255,255,255,0.06)',
              border: calFilterDate ? '1px solid rgba(200,255,0,0.3)' : '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Calendar className="h-4 w-4" style={{ color: calFilterDate ? 'var(--accent)' : 'rgba(255,255,255,0.5)' }} />
          </button>
        </div>
      </div>

      {/* Calendar filter badge */}
      {calFilterDate && (
        <div className="mx-4 mb-3 flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'rgba(200,255,0,0.07)', border: '1px solid rgba(200,255,0,0.18)' }}>
          <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <span className="text-[12px] font-bold" style={{ color: 'var(--accent)' }}>
            Filtering: {format(calFilterDate, 'EEE, MMM d')}
          </span>
          <button onClick={() => setCalFilterDate(null)} className="ml-auto p-0.5">
            <X className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
          </button>
        </div>
      )}

      {/* ── Weekly summary card ── */}
      {!calFilterDate && (
        <div className="px-4 pb-3">
          <div className="relative overflow-hidden p-4"
            style={{
              background: 'rgba(16,18,24,0.55)',
              backdropFilter: 'blur(18px) saturate(150%)',
              WebkitBackdropFilter: 'blur(18px) saturate(150%)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 20,
              boxShadow: '0 10px 34px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
            }}>
            {/* Dot-grid background */}
            <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.5,
              backgroundImage: `linear-gradient(rgba(200,255,0,0.035) 1px,transparent 1px),linear-gradient(90deg,rgba(200,255,0,0.035) 1px,transparent 1px)`,
              backgroundSize: '30px 30px', borderRadius: 20 }} />
            <div className="relative z-10">
              <div className="flex items-end justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--accent)' }}>
                    THIS WEEK
                  </span>
                  <div className="flex items-baseline gap-2 mt-2 mb-1.5">
                    <span className="font-victory text-[44px] font-black leading-none text-white tabular-nums">
                      {dist(weeklyStats.weekKm).toFixed(1)}
                    </span>
                    <span className="font-victory text-[20px] font-black" style={{ color: 'var(--accent)' }}>{distanceUnit.toUpperCase()}</span>
                  </div>
                  <div className="text-[12px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    <span style={{ color: weeklyStats.weekChange >= 0 ? 'var(--accent)' : 'rgba(255,100,100,0.9)' }}>
                      {weeklyStats.weekChange >= 0 ? '+' : ''}{dist(weeklyStats.weekChange).toFixed(1)} {distanceUnit}
                    </span>
                    {' '}vs last week
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">TIME</span>
                      <p className="font-victory text-[18px] font-black text-white mt-1">{formatDuration(weeklyStats.weekTime)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">RUNS</span>
                      <p className="font-victory text-[18px] font-black text-white mt-1">{weeklyStats.weekCount}</p>
                    </div>
                  </div>
                </div>
                <WeekBarChart dayKms={weeklyStats.dayKms} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className="flex px-4 gap-0 relative mb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {(['all', 'outdoor', 'treadmill'] as RunTab[]).map((tab) => {
          const active = runTab === tab;
          const labels: Record<RunTab, string> = { all: 'All', outdoor: 'Outdoor', treadmill: 'Treadmill' };
          return (
            <button key={tab} onClick={() => setRunTab(tab)}
              className={`relative py-3 text-[13px] font-black uppercase tracking-[0.14em] transition-all ${tab === 'all' ? 'pl-0 pr-4' : 'px-4'}`}
              style={{ color: active ? 'var(--accent)' : 'rgba(255,255,255,0.45)' }}>
              {labels[tab]}
              {active && (
                <motion.div layoutId="tabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
                  style={{ background: 'var(--accent)' }} />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Empty state ── */}
      {filteredRuns.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'rgba(200,255,0,0.07)', border: '1px solid rgba(200,255,0,0.14)' }}>
            <Footprints className="h-7 w-7 opacity-50" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-[17px] font-black text-white">
              {calFilterDate ? 'No runs on this day' : `No ${runTab === 'all' ? '' : runTab + ' '}runs yet`}
            </p>
            <p className="mt-1 text-[12px] font-semibold text-white/40">
              {calFilterDate ? 'Select another day or clear the filter' : 'Your completed runs will appear here'}
            </p>
          </div>
          {!calFilterDate && (
            <button onClick={() => navigate('/run')}
              className="mt-1 h-[60px] rounded-full px-8 font-victory text-[14px] font-black tracking-[0.2em] text-black transition-all active:scale-[0.97]"
              style={{ background: 'var(--accent)', boxShadow: '0 0 0 5px rgba(200,255,0,0.12), 0 10px 28px rgba(200,255,0,0.32)' }}>
              START A RUN
            </button>
          )}
          {calFilterDate && (
            <button onClick={() => setCalFilterDate(null)}
              className="text-[13px] font-bold transition-opacity active:opacity-60"
              style={{ color: 'var(--accent)' }}>
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* ── Run list ── */}
      {filteredRuns.length > 0 && (
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <div className="flex flex-col gap-3">
            {filteredRuns.map((run, idx) => {
              const d = dist(run.distance);
              const p = paceDisplay(run.pace);
              const demo = isDemo(run);
              const pr = isPR(run);
              return (
                <motion.div
                  key={run.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: Math.min(idx * 0.04, 0.3) }}
                  className="overflow-visible"
                  style={{
                    background: 'rgba(16,18,24,0.55)',
                    backdropFilter: 'blur(18px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(18px) saturate(150%)',
                    border: pr ? '1px solid rgba(200,255,0,0.35)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 20,
                    boxShadow: pr
                      ? '0 0 18px rgba(200,255,0,0.06), 0 10px 34px rgba(0,0,0,0.5)'
                      : '0 10px 34px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
                  }}
                >
                  <button onClick={() => setSelected(run)}
                    className="w-full text-left transition-all active:scale-[0.98]">

                    {/* Header row: date · time · badges */}
                    <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-victory text-[15px] font-black leading-none tracking-[0.08em]"
                            style={{ color: pr ? '#fac775' : 'rgba(255,255,255,0.88)' }}>
                            {format(new Date(run.timestamp), 'EEE, MMM d').toUpperCase()}
                          </span>
                          <span className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                            {format(new Date(run.timestamp), 'h:mm a')}
                          </span>
                          {run.fromCloud && !demo && (
                            <Cloud className="h-3 w-3 shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] font-semibold tracking-[0.06em]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                            {demo ? 'Cedar Rapids, IA' : 'Outdoor'}
                          </span>
                          {pr && (
                            <span className="rounded-full px-2 py-0.5 text-[9px] font-black tracking-[0.08em]"
                              style={{ background: 'linear-gradient(135deg, #fac775 0%, #d99a3a 100%)', color: '#000' }}>
                              PERSONAL BEST
                            </span>
                          )}
                          {demo && (
                            <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em]"
                              style={{ background: 'rgba(200,255,0,0.1)', color: 'rgba(200,255,0,0.6)', border: '1px solid rgba(200,255,0,0.18)' }}>
                              DEMO
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.32)' }} />
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginLeft: 16, marginRight: 16 }} />

                    {/* Body: ring + stats + route */}
                    <div className="flex items-center gap-4 px-4 py-3.5">
                      {/* Ring */}
                      <MiniRingMetric
                        pct={run.distance / maxDist}
                        value={d.toFixed(2)}
                        unit={distanceUnit.toUpperCase()}
                        pr={pr}
                      />

                      {/* Stats grid */}
                      <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-3">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.45)' }}>TIME</span>
                          <p className="font-victory text-[20px] font-black leading-none text-white tabular-nums mt-1">
                            {formatDuration(run.duration)}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.45)' }}>PACE</span>
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="font-victory text-[20px] font-black leading-none text-white tabular-nums">
                              {p > 0 ? formatPace(p) : '--:--'}
                            </span>
                            <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>/{distanceUnit}</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.45)' }}>CAL</span>
                          <div className="flex items-baseline gap-1.5 mt-1">
                            <span className="font-victory text-[20px] font-black leading-none text-white tabular-nums">
                              {Math.round(run.distance * 65)}
                            </span>
                            <span className="text-[10px] font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>kcal</span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.45)' }}>SPLITS</span>
                          <p className="font-victory text-[20px] font-black leading-none text-white tabular-nums mt-1">
                            {run.splits?.length ?? 0}
                          </p>
                        </div>
                      </div>

                      {/* Mini route */}
                      <MiniRoute path={run.path} size={64} />
                    </div>
                  </button>

                  {/* Delete strip */}
                  <div className="flex items-center justify-end px-4 pb-3.5"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <button onClick={() => setConfirmDelete(run)}
                      className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg transition-all active:scale-95 group"
                      aria-label="Delete run">
                      <Trash2 className="h-3.5 w-3.5 transition-colors" style={{ color: 'rgba(255,255,255,0.28)' }} />
                      <span className="text-[11px] font-semibold transition-colors" style={{ color: 'rgba(255,255,255,0.28)' }}>
                        Delete
                      </span>
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
            onClick={() => setConfirmDelete(null)}>
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[320px] rounded-3xl p-6 flex flex-col gap-5"
              style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.22)' }}>
                  <Trash2 className="h-5 w-5 text-red-400" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-[16px] font-black text-white">Delete Run?</p>
                <p className="mt-1.5 text-[12px] font-semibold leading-relaxed text-white/45">
                  {format(new Date(confirmDelete.timestamp), "EEE, MMM d · h:mm a")}
                  <br />This run will be permanently removed.
                </p>
              </div>
              <div className="flex gap-2.5">
                <button onClick={() => setConfirmDelete(null)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white/70 transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  CANCEL
                </button>
                <button onClick={() => handleDelete(confirmDelete)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(239,68,68,0.82)', border: '1px solid rgba(239,68,68,0.3)' }}>
                  DELETE
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Calendar modal ── */}
      <AnimatePresence>
        {showCalendar && (
          <CalendarModal
            runs={allRuns.filter(r => !isDemo(r))}
            onClose={() => setShowCalendar(false)}
            onDayFilter={(d) => { setCalFilterDate(d); if (d) setShowCalendar(false); }}
            filteredDate={calFilterDate}
            dist={dist}
            distanceUnit={distanceUnit}
          />
        )}
      </AnimatePresence>

      {/* ── Detail overlay ── */}
      <AnimatePresence>
        {selected && (() => {
          const cal = Math.round(selected.distance * 65);
          const effort = selected.pace <= 0 ? 3
            : selected.pace < 4 ? 5
            : selected.pace < 5 ? 4
            : selected.pace < 6 ? 3
            : selected.pace < 7 ? 2
            : 1;
          const pr = isPR(selected);
          const demo = isDemo(selected);

          return (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed inset-0 z-50 overflow-hidden"
              style={{ background: '#0d0f14' }}
              onClick={() => setSelected(null)}
            >
              <RunRouteBackground path={selected.path} />

              <div className="absolute inset-0"
                style={{ background: 'linear-gradient(to bottom, rgba(13,15,20,0) 0%, rgba(13,15,20,0.05) 20%, rgba(13,15,20,0.55) 44%, rgba(13,15,20,0.95) 60%, #0d0f14 72%)' }} />

              {/* Top bar */}
              <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-4"
                style={{ zIndex: 10, paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
                <button onClick={(e) => { e.stopPropagation(); setSelected(null); }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-all active:scale-95"
                  style={{ background: 'rgba(13,15,20,0.65)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                  className="flex flex-col items-center gap-0.5">
                  <span className="text-[11px] font-black uppercase tracking-[0.24em]" style={{ color: 'var(--accent)' }}>
                    {format(new Date(selected.timestamp), "EEE, MMM d")}
                  </span>
                  <span className="text-[10px] font-semibold text-white/35 tracking-[0.1em]">
                    {format(new Date(selected.timestamp), "h:mm a")}
                  </span>
                  {demo && (
                    <span className="mt-0.5 rounded-full px-2 py-px text-[8px] font-black uppercase tracking-[0.14em]"
                      style={{ background: 'rgba(200,255,0,0.08)', color: 'rgba(200,255,0,0.5)', border: '1px solid rgba(200,255,0,0.15)' }}>
                      Cedar Rapids, IA
                    </span>
                  )}
                </motion.div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (navigator.share) {
                      navigator.share({
                        title: 'My Run',
                        text: `I ran ${dist(selected.distance).toFixed(2)} ${distanceUnit} in ${formatDuration(selected.duration)}!`,
                      }).catch(() => {});
                    } else {
                      toast('Share not supported on this device');
                    }
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 transition-all active:scale-95"
                  style={{ background: 'rgba(13,15,20,0.65)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)' }}>
                  <Share2 className="h-4 w-4" />
                </button>
              </div>

              {/* PR badge */}
              {pr && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: 'spring', stiffness: 280 }}
                  className="absolute right-5 z-20 flex items-center gap-1 rounded-full px-3 py-1.5"
                  style={{ top: 'calc(max(16px, env(safe-area-inset-top)) + 52px)', background: 'linear-gradient(135deg, #fac775 0%, #d99a3a 100%)' }}>
                  <span className="text-[10px] font-black tracking-[0.14em] text-black">PERSONAL BEST</span>
                </motion.div>
              )}

              {/* Stats — no-box vertical layout, blends into gradient */}
              <div
                className="absolute bottom-0 left-0 right-0 z-10 cursor-default"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="overflow-y-auto flex flex-col items-center"
                  style={{
                    maxHeight: '74vh',
                    paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {/* Distance hero */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.12, type: 'spring', stiffness: 240, damping: 22 }}
                    className="flex items-baseline justify-center gap-2 mt-4 mb-1 px-6"
                  >
                    <span className="font-victory font-black leading-none tabular-nums text-white"
                      style={{ fontSize: 88, letterSpacing: '-0.02em', lineHeight: 0.88 }}>
                      {dist(selected.distance).toFixed(2)}
                    </span>
                    <span className="font-victory font-black" style={{ fontSize: 28, color: pr ? '#fac775' : '#C8FF00', lineHeight: 1 }}>
                      {distanceUnit.toUpperCase()}
                    </span>
                  </motion.div>

                  {/* Vertical stat rows — centered, label above value */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 }}
                    className="w-full"
                  >
                    {[
                      {
                        label: 'PACE',
                        value: selected.pace > 0 ? formatPace(paceDisplay(selected.pace)) : '--:--',
                        sub: `/${distanceUnit}`,
                        accent: true,
                      },
                      { label: 'TIME', value: formatDuration(selected.duration), sub: 'elapsed', accent: false },
                      { label: 'CALORIES', value: String(cal), sub: 'kcal', accent: false },
                    ].map((s, i) => (
                      <div key={i} className="flex flex-col items-center px-6 py-3.5"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                        <span className="text-[11px] font-black uppercase tracking-[0.2em] mb-1.5"
                          style={{ color: 'rgba(255,255,255,0.38)' }}>
                          {s.label}
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-victory text-[36px] font-black tabular-nums leading-none"
                            style={{ color: s.accent ? '#C8FF00' : 'white' }}>
                            {s.value}
                          </span>
                          {s.sub && (
                            <span className="text-[13px] font-semibold"
                              style={{ color: s.accent ? 'rgba(200,255,0,0.55)' : 'rgba(255,255,255,0.38)' }}>
                              {s.sub}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Effort row */}
                    <div className="flex flex-col items-center px-6 py-3.5"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                      <span className="text-[11px] font-black uppercase tracking-[0.2em] mb-1.5"
                        style={{ color: 'rgba(255,255,255,0.38)' }}>
                        EFFORT
                      </span>
                      <div className="flex items-center gap-2.5">
                        <EffortBars effort={effort} />
                        <span className="font-victory text-[28px] font-black leading-none text-white">
                          {effort}<span className="text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.38)' }}>/5</span>
                        </span>
                      </div>
                    </div>
                  </motion.div>

                  {/* Splits — secondary, minimal, no bars */}
                  {selected.splits && selected.splits.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.32 }}
                      className="w-full px-6 py-3"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] block text-center"
                        style={{ color: 'rgba(255,255,255,0.26)' }}>
                        SPLITS · /{distanceUnit}
                      </span>
                      <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-2">
                        {(() => {
                          const paces = selected.splits!.map((s) => s.pace);
                          const bestP = Math.min(...paces);
                          return selected.splits!.map((split, idx) => {
                            const isBest = split.pace === bestP;
                            return (
                              <div key={idx} className="flex items-baseline gap-1">
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', fontWeight: 700 }}>{idx + 1}</span>
                                <span className="font-victory tabular-nums font-black"
                                  style={{ fontSize: 14, color: isBest ? '#C8FF00' : 'rgba(255,255,255,0.52)' }}>
                                  {formatPace(paceDisplay(split.pace))}
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </motion.div>
                  )}

                  {/* WHOOP — no card, blended */}
                  {(() => {
                    const runMs = selected.timestamp;
                    const match = whoopWorkouts.find(
                      (w) => Math.abs(runMs - new Date(w.start).getTime()) < 2 * 60 * 60 * 1000,
                    );
                    if (!match) return null;
                    return (
                      <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}
                        className="w-full px-6 py-3"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
                      >
                        <div className="flex flex-col items-center mb-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]"
                            style={{ color: 'rgba(255,255,255,0.26)' }}>
                            WHOOP
                          </span>
                          <span style={{ fontSize: 10, color: 'rgba(200,255,0,0.48)', fontWeight: 700, letterSpacing: '0.06em', marginTop: 2 }}>
                            {match.sport_name.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-center gap-6 mb-3">
                          {match.average_heart_rate != null && (
                            <div className="flex items-baseline gap-1">
                              <span className="font-victory text-[22px] font-black leading-none" style={{ color: '#f87171' }}>
                                {match.average_heart_rate}
                              </span>
                              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.06em' }}>AVG BPM</span>
                            </div>
                          )}
                          {match.max_heart_rate != null && (
                            <div className="flex items-baseline gap-1">
                              <span className="font-victory text-[22px] font-black leading-none" style={{ color: '#ef4444' }}>
                                {match.max_heart_rate}
                              </span>
                              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.06em' }}>MAX</span>
                            </div>
                          )}
                          {match.strain != null && (
                            <div className="flex items-baseline gap-1">
                              <span className="font-victory text-[22px] font-black leading-none" style={{ color: '#C8FF00' }}>
                                {match.strain.toFixed(1)}
                              </span>
                              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.06em' }}>STRAIN</span>
                            </div>
                          )}
                        </div>
                        <WZoneBar zones={match.zone_durations} />
                        <WZoneLegend zones={match.zone_durations} />
                      </motion.div>
                    );
                  })()}

                  <motion.p
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                    className="px-6 pb-1 text-[10px] font-semibold w-full"
                    style={{ color: 'rgba(255,255,255,0.18)', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12 }}>
                    © {new Date().getFullYear()} Athlix · Map © OpenStreetMap &amp; CARTO
                  </motion.p>
                </div>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Square, MapPin, AlertCircle, ChevronLeft, LocateOff, Play, Pause,
  Home, History, Target, Share2, Pencil,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { saveWorkout } from '../../../lib/supabaseData';
import { useRunTracking } from '../hooks/useRunTracking';
import { RunMap } from '../components/RunMap';
import { RunRouteBackground } from '../components/RunRouteBackground';
import { saveRun, getRuns, saveRunToCloud, loadRunsFromCloud, mergeRuns, linkRunToWorkout } from '../utils/storage';
import { formatDuration, formatPace } from '../utils/gpsCalculations';
import type { GpsPoint } from '../utils/gpsCalculations';

/* ── Glass pill style ───────────────────────────────────────────── */
const glassPillStyle: React.CSSProperties = {
  background: 'rgba(16,18,24,0.6)',
  backdropFilter: 'blur(16px) saturate(150%)',
  WebkitBackdropFilter: 'blur(16px) saturate(150%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 999,
  boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
};

const glassCardStyle: React.CSSProperties = {
  background: 'rgba(16,18,24,0.165)',
  backdropFilter: 'blur(18px) saturate(150%)',
  WebkitBackdropFilter: 'blur(18px) saturate(150%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  boxShadow: '0 10px 34px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.05) inset',
};

/* ── Circle button ──────────────────────────────────────────────── */
const CircleBtn: React.FC<{ onClick: () => void; children: React.ReactNode; red?: boolean }> = ({ onClick, children, red }) => (
  <button
    onClick={onClick}
    className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-all active:scale-95"
    style={{
      background: red ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.1)',
      border: red ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}
  >
    {children}
  </button>
);

/* ── Progress ring ──────────────────────────────────────────────── */
// Sized to sit beside the stat grid (not centered full-width) so the live
// map behind the bottom panel stays visible while running — the panel used
// to run a 210px ring plus four full-width stacked stat rows, easily
// 500px+ tall, leaving almost none of the map on screen during a run.
const RingMetric: React.FC<{
  pct: number;
  distDisplay: string;
  distUnit: string;
  goalDisplay: string;
  dimmed?: boolean;
}> = ({ pct, distDisplay, distUnit, goalDisplay, dimmed }) => {
  const S = 138, R = 62, C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: S, height: S, flexShrink: 0, opacity: dimmed ? 0.88 : 1 }}>
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}
        style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, pct)))}
          style={{ filter: 'drop-shadow(0 0 8px rgba(200,255,0,0.35))', transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 6 }}>
        <span className="flex items-baseline" style={{ gap: 4 }}>
          <span className="font-victory tabular-nums" style={{ fontSize: 40, lineHeight: 0.84, color: '#ffffff' }}>
            {distDisplay}
          </span>
          <span className="font-victory" style={{ fontSize: 13, color: '#ffffff', letterSpacing: '0.14em', lineHeight: 1 }}>
            {distUnit.toUpperCase()}
          </span>
        </span>
        {goalDisplay && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)' }}>Goal</span>
            <span className="font-victory" style={{ fontSize: 13, color: 'var(--accent)', lineHeight: 1 }}>{goalDisplay}</span>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Hex-grid GPS loading overlay ──────────────────────────────── */
const HexOverlay: React.FC<{ show: boolean }> = ({ show }) => (
  <AnimatePresence>
    {show && (
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.9 }}
        className="absolute inset-0 z-30 flex flex-col items-center justify-center"
        style={{ background: '#0d0f14' }}
      >
        <svg className="absolute inset-0 h-full w-full opacity-40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hx" x="0" y="0" width="62" height="71.6" patternUnits="userSpaceOnUse">
              <polygon points="31,3 59,18.8 59,52.8 31,68.6 3,52.8 3,18.8"
                fill="none" stroke="rgba(200,255,0,0.22)" strokeWidth="1" />
            </pattern>
            <pattern id="hx2" x="31" y="35.8" width="62" height="71.6" patternUnits="userSpaceOnUse">
              <polygon points="31,3 59,18.8 59,52.8 31,68.6 3,52.8 3,18.8"
                fill="none" stroke="rgba(200,255,0,0.22)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hx)" />
          <rect width="100%" height="100%" fill="url(#hx2)" />
        </svg>

        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="relative flex items-center justify-center">
            <span className="absolute h-20 w-20 rounded-full bg-[var(--accent)]/15 animate-ping" />
            <span className="absolute h-12 w-12 rounded-full bg-[var(--accent)]/25 animate-ping [animation-delay:0.35s]" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-[var(--accent)]/40 bg-[var(--accent)]/10">
              <MapPin className="h-6 w-6 text-[var(--accent)]" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-[17px] font-black tracking-wide text-white">Acquiring GPS</p>
            <p className="mt-0.5 text-[12px] font-semibold text-white/40">Loading nearest area…</p>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);


/* ── Goal card ──────────────────────────────────────────────────── */
type GoalType = 'open' | '5k' | '30min' | 'pace';

const GOAL_CARDS: { key: GoalType; label: string; sub: string }[] = [
  { key: 'open',  label: 'Open',  sub: 'Free run' },
  { key: '5k',    label: '5 km',  sub: 'Distance' },
  { key: '30min', label: '30',    sub: 'min / Time' },
  { key: 'pace',  label: '5:30',  sub: 'Pace' },
];

/* ── Goal option lists ──────────────────────────────────────────── */
const DIST_OPTIONS_MI = [1, 1.5, 2, 2.5, 3, 3.1, 4, 5, 6, 6.2, 8, 10, 13.1, 26.2];
const DIST_OPTIONS_KM = [1, 2, 3, 5, 6, 8, 10, 15, 21.1, 42.2];
const TIME_OPTIONS    = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 120];
const PACE_OPTIONS    = ['4:00','4:30','5:00','5:30','6:00','6:30','7:00','7:30','8:00','8:30','9:00','9:30','10:00','11:00','12:00'];

// Below this, GPS drift alone can produce it — treat it as "never actually
// went anywhere" (accidental Start Run tap, indoor test, permission never
// really granted) rather than a real run, so it doesn't get saved as one.
const MIN_VALID_RUN_KM = 0.05;

// Same qualification RunHistory.tsx uses for its "Personal Best" badge — a
// short fast burst isn't a comparable effort to a real run.
const MIN_PR_ELIGIBLE_KM = 1;

/* ── Goal value chip picker ───────────────────────────────────────
   Was a custom scroll-snap "drum roll": onScroll computed the selected
   index from raw scrollTop/ITEM_H, rounded. That only ever matches
   cleanly on a perfectly-settled snap position — real touch/trackpad
   momentum routinely lands mid-pixel near scroll boundaries (worst right
   at the top, which is exactly where the smallest values — 1 mi, 1.5 mi,
   2 mi — live), so those rounded to the wrong neighbor or never fired
   onChange at all. Chips remove scroll precision from the equation
   entirely: every value is its own directly-tappable target, so
   selection can't depend on where a scroll gesture happened to stop. */
const ChipPicker: React.FC<{
  options: string[];
  index: number;
  onChange: (i: number) => void;
  unit?: string;
}> = ({ options, index, onChange, unit }) => {
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    chipRefs.current[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [index]);

  return (
    <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none', paddingBottom: 2 }}>
      {options.map((opt, i) => {
        const active = i === index;
        return (
          <button
            key={i}
            ref={(el) => { chipRefs.current[i] = el; }}
            onClick={() => onChange(i)}
            className="flex shrink-0 flex-col items-center justify-center rounded-2xl transition-all active:scale-95"
            style={{
              minWidth: 60, height: 60, padding: '0 12px',
              background: active ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              border: active ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <span className="font-victory leading-none" style={{ fontSize: 17, fontWeight: 900, color: active ? '#000' : '#fff' }}>
              {opt}
            </span>
            {unit && (
              <span className="mt-1 text-[9px] font-bold" style={{ color: active ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.32)' }}>
                {unit}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/* ── Effort bars ────────────────────────────────────────────────── */
const EffortBars: React.FC<{ effort: number }> = ({ effort }) => (
  <div className="flex items-end gap-[3px]">
    {[1, 2, 3, 4, 5].map((i) => (
      <div
        key={i}
        style={{
          width: 5,
          height: 4 + i * 3,
          borderRadius: 2,
          background: i <= effort ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
        }}
      />
    ))}
  </div>
);

/* ── Goal ring icon — mirrors the ring+glow construction used on the run
   history cards (MiniRingMetric), so the same "ring = goal/progress"
   visual language reads consistently across the idle, running, and
   history screens instead of a plain bullseye glyph. ── */
const GoalRingIcon: React.FC = () => {
  const S = 40, R = 15, C = 2 * Math.PI * R;
  return (
    <div style={{ position: 'relative', width: S, height: S, flexShrink: 0 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(200,255,0,0.16) 0%, transparent 68%)',
      }} />
      <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ display: 'block', transform: 'rotate(-90deg)' }}>
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="4" />
        <circle cx={S / 2} cy={S / 2} r={R} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * 0.24} />
      </svg>
      <Target className="absolute" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 14, height: 14, color: 'var(--accent)' }} />
    </div>
  );
};

/* ── Main component ────────────────────────────────────────────── */
export const ActiveRun: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    isRunning, isPaused, isAutoPaused, path, currentPosition,
    totalDistance, elapsedTime, pace, splits, elevationGain, error, errorCode,
    startRun, pauseRun, resumeRun, stopRun,
  } = useRunTracking();

  const [distanceUnit, setDistanceUnit] = useState<'km' | 'mi'>(() => {
    try { const s = localStorage.getItem('athlix_distance_unit'); return s === 'km' ? 'km' : 'mi'; }
    catch { return 'mi'; }
  });

  const toggleUnit = () => {
    const next = distanceUnit === 'km' ? 'mi' : 'km';
    try { localStorage.setItem('athlix_distance_unit', next); } catch {}
    setDistanceUnit(next);
    setGoalDistIdx(next === 'mi' ? 5 : 3); // reset to 3.1 mi or 5 km
  };

  const distOpts = distanceUnit === 'mi' ? DIST_OPTIONS_MI : DIST_OPTIONS_KM;
  const [goalDistIdx,  setGoalDistIdx]  = useState(() => distanceUnit === 'mi' ? 5 : 3); // 3.1 mi / 5 km
  const [goalTimeIdx,  setGoalTimeIdx]  = useState(4); // 30 min
  const [goalPaceIdx,  setGoalPaceIdx]  = useState(7); // 7:30
  const [editingGoal,  setEditingGoal]  = useState<GoalType | null>(null);

  const displayDistance = useMemo(
    () => (distanceUnit === 'mi' ? totalDistance * 0.621371 : totalDistance),
    [distanceUnit, totalDistance],
  );
  const displayPace = distanceUnit === 'mi' ? pace * 1.609344 : pace;

  const [activeGoal, setActiveGoal] = useState<GoalType>('5k');
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);

  // Idle-screen stats (last run / weekly total / streak) — starts from
  // local storage only (synchronous, no loading flash), then merges in
  // cloud history once it loads. Previously these were local-only forever
  // (a lazy useState initializer that never re-ran), so a fresh install or
  // a second device showed "Last Run: --" / a reset streak despite real
  // cloud history existing — the same class of gap as a stale cache that
  // never gets refreshed.
  const [allRuns, setAllRuns] = useState(() => getRuns());
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadRunsFromCloud(user.id).then((cloud) => {
      if (cancelled || cloud.length === 0) return;
      setAllRuns((local) => mergeRuns(local, cloud));
    });
    return () => { cancelled = true; };
  }, [user]);

  // Order-independent on purpose: getRuns() (local storage) sorts oldest
  // first, but mergeRuns() (fired once cloud history loads, see effect
  // above) re-sorts newest first — indexing allRuns[length-1] silently
  // flipped from "most recent run" to "oldest run" the moment the cloud
  // merge landed, which is exactly why this showed a stale/wrong distance
  // instead of the actual last run.
  const lastRun = allRuns.reduce<typeof allRuns[number] | null>(
    (latest, r) => (!latest || r.timestamp > latest.timestamp) ? r : latest,
    null,
  );
  const weekStats = useMemo(() => {
    const now = Date.now();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weekRuns = allRuns.filter((r) => r.timestamp >= now - weekMs);
    const weekKm = weekRuns.reduce((s, r) => s + r.distance, 0);
    return { count: weekRuns.length, km: weekKm };
  }, [allRuns]);
  const streak = useMemo(() => {
    if (allRuns.length === 0) return 0;
    const dayMs = 24 * 60 * 60 * 1000;
    const today = Math.floor(Date.now() / dayMs);
    const days = new Set(allRuns.map((r) => Math.floor(r.timestamp / dayMs)));
    let s = 0;
    for (let d = today; days.has(d); d--) s++;
    return s;
  }, [allRuns]);

  const [finished, setFinished] = useState<{
    distance: number;
    duration: number;
    pace: number;
    rawPace: number;
    unit: 'km' | 'mi';
    path: GpsPoint[];
    splits: { km: number; pace: number }[];
    elevationGain: number;
    timestamp: number;
    noRunDetected: boolean;
  } | null>(null);

  const needsInternet = typeof navigator !== 'undefined' && !navigator.onLine;
  const isPermDenied = errorCode === 1;
  const isAcquiring = isRunning && !currentPosition;

  const goalDistKm = distanceUnit === 'mi'
    ? distOpts[goalDistIdx] / 0.621371
    : distOpts[goalDistIdx];
  const goalMinutes = TIME_OPTIONS[goalTimeIdx];

  const goalProgress = useMemo(() => {
    if (activeGoal === '5k') return Math.min(1, totalDistance / goalDistKm);
    if (activeGoal === '30min') return Math.min(1, elapsedTime / (goalMinutes * 60 * 1000));
    return 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGoal, totalDistance, elapsedTime, goalDistKm, goalMinutes]);

  const goalDistDisplay = `${distOpts[goalDistIdx]} ${distanceUnit.toUpperCase()}`;
  const goalLabel = activeGoal === '5k' ? `${goalDistDisplay} GOAL`
    : activeGoal === '30min' ? `${goalMinutes} MIN GOAL`
    : activeGoal === 'pace' ? `PACE GOAL`
    : 'OPEN RUN';

  // Voice cues — Web Speech API (built into the browser, no dependency).
  // The two moments a runner most needs audio feedback: a new split just
  // completed, and auto-pause kicking in/releasing (which happens without
  // any tap, so there's otherwise no way to know it happened without
  // looking at the screen).
  const speak = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel(); // don't stack overlapping cues
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    } catch { /* speech synthesis unavailable/blocked — fail silent */ }
  }, []);

  const announcedSplitsRef = useRef(0);
  useEffect(() => {
    if (splits.length === 0 || splits.length <= announcedSplitsRef.current) return;
    announcedSplitsRef.current = splits.length;
    const latest = splits[splits.length - 1];
    speak(`Kilometer ${Math.round(latest.km)}. Pace ${formatPace(latest.pace)} per kilometer.`);
  }, [splits, speak]);

  const prevAutoPausedRef = useRef(false);
  useEffect(() => {
    if (isAutoPaused && !prevAutoPausedRef.current) {
      speak('Paused. No movement detected.');
    } else if (!isAutoPaused && prevAutoPausedRef.current) {
      speak('Resumed.');
    }
    prevAutoPausedRef.current = isAutoPaused;
  }, [isAutoPaused, speak]);

  // Guards against a double-submit: the STOP/FINISH button stays mounted
  // (and tappable) until `setFinished` re-renders past it, and that render
  // is asynchronous relative to a fast double-tap — without this, two
  // taps in quick succession could fire handleStop twice concurrently and
  // save the same run twice (locally, in the cloud, and as a workout).
  const isStoppingRef = useRef(false);

  const handleStop = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    const summary = stopRun();
    const displayDist = distanceUnit === 'mi' ? summary.distance * 0.621371 : summary.distance;
    const displayPaceVal = distanceUnit === 'mi' ? summary.pace * 1.609344 : summary.pace;
    const noRunDetected = summary.distance < MIN_VALID_RUN_KM;

    if (noRunDetected) {
      // Never moved far enough for this to be a real run — most likely an
      // accidental Start Run tap, an indoor test, or GPS that never
      // actually acquired. Don't let it into local storage, the cloud, or
      // workout history as a fake 0.00 entry.
      speak('No run detected.');
      setFinished({
        distance: displayDist, duration: summary.duration, pace: displayPaceVal,
        rawPace: summary.pace, unit: distanceUnit, path: summary.path,
        splits: summary.splits, elevationGain: summary.elevationGain,
        timestamp: summary.timestamp, noRunDetected: true,
      });
      return;
    }

    speak(`Run complete. ${displayDist.toFixed(2)} ${distanceUnit}, in ${formatDuration(summary.duration)}.`);
    const saved = saveRun(summary);
    setAllRuns((prev) => [...prev, saved]);
    const cloudRunPromise = user ? saveRunToCloud(user.id, saved) : Promise.resolve(null);

    const workoutPromise = user ? (async () => {
      const durationMinutes = Math.max(1, Math.round(summary.duration / 60000));
      const roundedDist = Math.max(0, Number(displayDist.toFixed(2)));
      try {
        const workoutRow = await saveWorkout(user.id, {
          title: 'Outdoor Run',
          date: format(new Date(summary.timestamp), 'yyyy-MM-dd'),
          duration_minutes: durationMinutes,
          notes: `Live run tracking – ${roundedDist.toFixed(2)} ${distanceUnit}`,
          exercises: [{
            name: 'Running', muscle_group: 'Cardio',
            completed_sets: [{ reps: durationMinutes, weight: roundedDist, unit: distanceUnit }],
          }],
        });
        toast.success('Run synced to workout history');
        return workoutRow;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Run saved locally, sync failed.';
        toast.error(msg);
        return null;
      }
    })() : Promise.resolve(null);

    const [cloudRunId, workoutRow] = await Promise.all([cloudRunPromise, workoutPromise]);
    if (user && cloudRunId == null) toast.error('Run saved on this device, but cloud sync failed.');
    if (cloudRunId != null && workoutRow != null) {
      // Best-effort: if this fails, the run and workout both still
      // exist and saved correctly — it just won't cascade-delete
      // later, same as a run that predates this feature entirely.
      void linkRunToWorkout(cloudRunId, workoutRow.id);
    }
    setFinished({
      distance: displayDist,
      duration: summary.duration,
      pace: displayPaceVal,
      rawPace: summary.pace,
      unit: distanceUnit,
      path: summary.path,
      splits: summary.splits,
      elevationGain: summary.elevationGain,
      timestamp: summary.timestamp,
      noRunDetected: false,
    });
  };

  /* ── Permission denied ─────────────────────────────────────── */
  if (isPermDenied && !isRunning) {
    return (
      <div className="flex min-h-screen flex-col" style={{ background: '#0d0f14', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-center gap-3 px-4 pb-3" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/60 active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-black text-white">Run</span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <LocateOff className="h-7 w-7 text-red-400" />
          </div>
          <div>
            <p className="text-[18px] font-black text-white">Location access denied</p>
            <p className="mt-1 text-[13px] font-semibold text-white/50">Re-enable in Chrome to track your run:</p>
          </div>
          <div className="w-full space-y-2 text-left">
            {[
              { n: 1, text: 'Tap the 🔒 lock icon in the Chrome address bar' },
              { n: 2, text: 'Tap "Site settings" → set Location to Allow' },
              { n: 3, text: 'Reload this page and tap Start Run again' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3 rounded-xl px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-black" style={{ background: 'var(--accent)', marginTop: 1 }}>{n}</span>
                <span className="text-[12px] font-semibold leading-relaxed text-white/60">{text}</span>
              </div>
            ))}
          </div>
          <div className="flex w-full flex-col gap-2">
            <button
              onClick={() => window.location.reload()}
              className="h-12 w-full rounded-full text-[14px] font-black text-black transition-all active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}
            >
              Reload &amp; Try Again
            </button>
            <button
              onClick={() => navigate('/')}
              className="h-11 w-full rounded-full text-[13px] font-bold text-white/60 transition-all active:scale-[0.98]"
              style={{ background: 'rgba(255,255,255,0.06)' }}
            >
              Back to App
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── No run detected — nothing was saved, see handleStop ─────── */
  if (finished?.noRunDetected) {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden" style={{ background: '#0d0f14' }}>
        <RunRouteBackground path={finished.path} />
        <div className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, rgba(13,15,20,0.55) 0%, rgba(13,15,20,0.75) 45%, rgba(13,15,20,0.97) 75%, #0d0f14 90%)' }} />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <LocateOff className="h-7 w-7" style={{ color: 'rgba(255,255,255,0.4)' }} />
          </div>
          <div>
            <p className="text-[18px] font-black text-white">No run detected</p>
            <p className="mt-1.5 text-[13px] font-semibold text-white/45" style={{ maxWidth: 280 }}>
              You didn't move far enough for this to count as a run, so nothing was saved.
            </p>
          </div>
        </div>

        {/* DONE pinned to the bottom, matching the finish/history screens */}
        <div className="relative z-10 px-5" style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => setFinished(null)}
            className="h-[60px] w-full rounded-full font-victory text-[17px] font-black tracking-[0.22em] text-black transition-all active:scale-[0.97]"
            style={{ background: 'var(--accent)', boxShadow: '0 0 0 5px rgba(200,255,0,0.12), 0 10px 28px rgba(200,255,0,0.32)' }}
          >
            DONE
          </button>
        </div>
      </div>
    );
  }

  /* ── Run complete ───────────────────────────────────────────── */
  if (finished) {
    const cal = Math.round(finished.distance * (finished.unit === 'mi' ? 1.609344 : 1) * 65);
    const effort = finished.pace <= 0 ? 3
      : finished.pace < 4 ? 5
      : finished.pace < 5 ? 4
      : finished.pace < 6 ? 3
      : finished.pace < 7 ? 2
      : 1;

    // Check if this is a PR (best pace among all saved runs, same
    // MIN_PR_ELIGIBLE_KM qualification RunHistory.tsx uses — a short fast
    // burst isn't a comparable effort to a real run, so it shouldn't be
    // able to claim "Personal Best" here but not there).
    const finishedDistanceKm = finished.unit === 'mi' ? finished.distance / 0.621371 : finished.distance;
    const allRuns = getRuns();
    const validPaces = allRuns.filter((r) => r.distance >= MIN_PR_ELIGIBLE_KM).map((r) => r.pace).filter((p) => p > 0);
    const isPR = validPaces.length > 0 && finished.rawPace > 0 && finishedDistanceKm >= MIN_PR_ELIGIBLE_KM &&
      finished.rawPace <= Math.min(...validPaces);

    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden" style={{ background: '#0d0f14' }}>
        <RunRouteBackground path={finished.path} />

        {/* Two layers: the vertical fade keeps content legible over the
            map, and the radial "spotlight" gives guaranteed contrast right
            behind the hero distance + PACE numbers specifically — the
            brightness boost on the map tiles (needed to make the map
            visible at all) means a bright patch of street or a lime route
            segment can land right behind big white/lime text otherwise. */}
        <div
          className="absolute inset-0"
          style={{
            background: `
              radial-gradient(65% 42% at 50% 66%, rgba(13,15,20,0.62) 0%, rgba(13,15,20,0.22) 60%, transparent 85%),
              linear-gradient(to bottom, rgba(13,15,20,0.55) 0%, rgba(13,15,20,0.7) 40%, rgba(13,15,20,0.96) 70%, #0d0f14 85%)
            `,
          }}
        />

        {/* Top bar */}
        <div
          className="absolute left-0 right-0 top-0 flex items-center justify-between px-4 z-20"
          style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
        >
          <CircleBtn onClick={() => navigate('/')}>
            <ChevronLeft className="h-5 w-5" />
          </CircleBtn>

          <div className="flex flex-col items-center" style={{ gap: 2 }}>
            <span className="font-victory font-black" style={{ fontSize: 20, letterSpacing: '0.02em', color: 'var(--accent)' }}>
              {format(new Date(finished.timestamp), 'EEE, MMM d').toUpperCase()}
            </span>
            <span className="text-[13px] font-medium text-white/50">
              {format(new Date(finished.timestamp), 'h:mm a')} · Outdoor
            </span>
          </div>

          <CircleBtn onClick={() => {
            if (navigator.share) {
              navigator.share({ title: 'My Run', text: `I ran ${finished.distance.toFixed(2)} ${finished.unit}!` }).catch(() => {});
            } else {
              toast('Share not supported on this device');
            }
          }}>
            <Share2 className="h-4 w-4" />
          </CircleBtn>
        </div>

        {/* PR badge / RUN SAVED badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 280 }}
          className="absolute right-5 z-20 flex items-center gap-1 rounded-full px-3 py-2"
          style={{
            top: 'calc(max(16px, env(safe-area-inset-top)) + 52px)',
            background: isPR
              ? 'linear-gradient(135deg, #fac775 0%, #d99a3a 100%)'
              : 'rgba(200,255,0,0.16)',
            border: isPR ? 'none' : '1px solid rgba(200,255,0,0.32)',
            boxShadow: isPR ? '0 8px 24px rgba(250,199,117,0.3)' : 'none',
          }}
        >
          <span className="text-[10px] font-black tracking-[0.14em]"
            style={{ color: isPR ? '#1a0f00' : 'var(--accent)' }}>
            {isPR ? '★ PERSONAL BEST' : '✓ RUN SAVED'}
          </span>
        </motion.div>

        {/* Content */}
        <div
          className="relative z-10 flex flex-1 flex-col items-center justify-end gap-3 px-5"
          style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
        >
          {/* Hero distance — same vertical-stack layout as the history detail
              screen (Run Detail Screen.dc.html) so a run looks the same
              whether you're seeing it right after finishing or later from
              history, instead of two different layouts for the same data. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 20 }}
            className="flex justify-center"
          >
            {/* The unit is absolutely positioned so it doesn't add to this
                wrapper's width — otherwise centering the number+unit pair
                as one block shifts the NUMBER off true center. This keeps
                the number itself dead-center on the page; the unit just
                tucks next to whichever edge it ends up on. */}
            <span style={{ position: 'relative', display: 'inline-block' }}>
              <span className="font-victory font-black tabular-nums text-white" style={{ fontSize: 108, letterSpacing: '-0.02em', lineHeight: 1.05 }}>
                {finished.distance.toFixed(2)}
              </span>
              <span className="font-black uppercase" style={{
                position: 'absolute', left: '100%', bottom: 14, marginLeft: 6, whiteSpace: 'nowrap',
                fontSize: 22, letterSpacing: '0.16em', color: isPR ? '#fac775' : 'var(--accent)',
              }}>{finished.unit}</span>
            </span>
          </motion.div>

          {/* Vertical stat stack — plain gap spacing, no row dividers,
              PACE weighted bigger than TIME/CALORIES — matches the Run
              Detail Screen design exactly (and the history detail screen,
              which uses the identical treatment). */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="w-full flex flex-col items-center px-6"
            style={{ gap: 28, marginTop: 4 }}
          >
            {[
              { label: 'PACE', value: finished.pace > 0 ? formatPace(finished.pace) : '--:--', sub: `/${finished.unit}`, accent: true, size: 46 },
              { label: 'TIME', value: formatDuration(finished.duration), sub: 'elapsed', accent: false, size: 40 },
              { label: 'CALORIES', value: String(cal), sub: 'kcal', accent: false, size: 40 },
              ...(finished.elevationGain > 0
                ? [{ label: 'ELEV', value: String(Math.round(finished.elevationGain)), sub: 'm gain', accent: false, size: 40 }]
                : []),
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center" style={{ gap: 6 }}>
                <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {s.label}
                </span>
                {/* Unit absolutely positioned (see hero above for why) so
                    the value itself stays centered under its label. */}
                <span style={{ position: 'relative', display: 'inline-block' }}>
                  <span className="font-victory tabular-nums leading-none"
                    style={{ fontSize: s.size, color: s.accent ? '#C8FF00' : 'white' }}>
                    {s.value}
                  </span>
                  <span className="text-[15px] font-medium" style={{
                    position: 'absolute', left: '100%', bottom: 2, marginLeft: 6, whiteSpace: 'nowrap',
                    color: 'rgba(255,255,255,0.45)',
                  }}>
                    {s.sub}
                  </span>
                </span>
              </div>
            ))}

            {/* Effort row — not part of the original design, kept at the
                same visual weight as TIME/CALORIES */}
            <div className="flex flex-col items-center" style={{ gap: 6 }}>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
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

          {/* Splits — secondary, minimal, no bars (matches history detail) */}
          {finished.splits && finished.splits.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45 }}
              className="w-full px-6 py-3 flex flex-col items-center"
              style={{ marginTop: 4, gap: 8 }}
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                SPLITS · /{finished.unit}
              </span>
              {(() => {
                const paces = finished.splits!.map((s) => s.pace);
                const bestP = Math.min(...paces);
                const splits = finished.splits!;
                return splits.map((split, idx) => {
                  const isBest = split.pace === bestP;
                  const isLast = idx === splits.length - 1;
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div className="flex items-center justify-center" style={{ gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.45)' }}>{idx + 1}</span>
                        <span style={{ color: 'rgba(255,255,255,0.26)' }}>—</span>
                        <span className="font-victory tabular-nums leading-none"
                          style={{ fontSize: 26, color: isBest ? 'var(--accent)' : 'white' }}>
                          {formatPace(distanceUnit === 'mi' ? split.pace * 1.609344 : split.pace)}
                        </span>
                      </div>
                      {!isLast && <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.18)', opacity: 0.6 }} />}
                    </div>
                  );
                });
              })()}
            </motion.div>
          )}

          {/* DONE button */}
          <motion.button
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
            onClick={() => navigate('/')}
            className="h-[60px] w-full rounded-full font-victory text-[17px] font-black tracking-[0.22em] text-black transition-all active:scale-[0.97]"
            style={{ background: 'var(--accent)', boxShadow: '0 0 0 5px rgba(200,255,0,0.12), 0 10px 28px rgba(200,255,0,0.32)' }}
          >
            DONE
          </motion.button>

          <p className="text-[10px] font-semibold text-white/20">
            © {new Date().getFullYear()} Athlix · Map © OpenStreetMap &amp; CARTO
          </p>
        </div>
      </div>
    );
  }

  /* ── Main run screen ─────────────────────────────────────────── */
  return (
    <div className="relative h-screen w-full overflow-hidden" style={{ background: '#0d0f14' }}>

      {/* Full-bleed map */}
      <div className="absolute inset-0" style={{ isolation: 'isolate', zIndex: 0 }}>
        <RunMap path={path} currentPosition={currentPosition} />
      </div>

      {/* Gradient overlay */}
      {!isRunning && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 1,
            background: 'linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(13,15,20,0.65) 55%, #0d0f14 75%)',
          }}
        />
      )}

      {/* Hex loading overlay */}
      <HexOverlay show={isAcquiring} />

      {/* ── Top bar ── */}
      <div
        className="absolute left-0 right-0 top-0 flex items-center justify-between px-4"
        style={{
          zIndex: 50,
          paddingTop: 'max(14px, env(safe-area-inset-top))',
          paddingBottom: 8,
          background: isRunning && !isPaused
            ? 'linear-gradient(to bottom, rgba(13,15,20,0.75) 0%, transparent 100%)'
            : undefined,
        }}
      >
        <CircleBtn onClick={() => navigate(-1)}>
          <ChevronLeft className="h-5 w-5" />
        </CircleBtn>

        {/* Center status */}
        {!isRunning && (
          <div className="flex flex-col items-center gap-1">
            <span className="font-victory text-[15px] font-black tracking-[0.25em] text-white">READY</span>
            <div
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={glassPillStyle}
            >
              <MapPin className="h-2.5 w-2.5" style={{ color: currentPosition ? 'var(--accent)' : 'rgba(255,255,255,0.4)' }} />
              <span className="text-[9px] font-black uppercase tracking-[0.18em]"
                style={{ color: currentPosition ? 'var(--accent)' : 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                {currentPosition ? 'GPS LOCKED' : 'ACQUIRING GPS'}
              </span>
            </div>
          </div>
        )}

        {isRunning && !isPaused && (
          <div
            className="flex items-center gap-2 rounded-full px-3 py-1.5"
            style={glassPillStyle}
          >
            <span
              className="h-2 w-2 rounded-full bg-red-500 shrink-0"
              style={{ animation: 'recBlink 1.1s step-end infinite' }}
            />
            <style>{`@keyframes recBlink { 0%,100%{opacity:1} 50%{opacity:0.2} }`}</style>
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white" style={{ whiteSpace: 'nowrap' }}>
              REC · {activeGoal === '5k' ? '5K' : activeGoal === '30min' ? '30M' : activeGoal === 'pace' ? 'PACE' : 'FREE'}
            </span>
          </div>
        )}

        {isRunning && isPaused && (
          <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={glassPillStyle}>
            <span style={{ display: 'flex', gap: 3 }}>
              <span style={{ width: 3, height: 11, borderRadius: 2, background: 'var(--accent)' }} />
              <span style={{ width: 3, height: 11, borderRadius: 2, background: 'var(--accent)' }} />
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>
              {isAutoPaused ? 'AUTO-PAUSED · STOPPED MOVING' : 'PAUSED'}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {!(isRunning && !isPaused) && (
            <CircleBtn onClick={() => navigate('/')}>
              <Home className="h-4 w-4" />
            </CircleBtn>
          )}
        </div>
      </div>


      {/* ── Bottom panel ── */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col px-4"
        style={{
          zIndex: 50,
          paddingTop: isRunning ? 0 : 12,
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          background: 'linear-gradient(to top, #0d0f14 0%, #0d0f14 38%, rgba(13,15,20,0.82) 58%, transparent 100%)',
        }}
      >
        <AnimatePresence mode="wait">

          {/* ─────────── IDLE / NOT STARTED ─────────── */}
          {!isRunning && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex flex-col gap-2"
            >
              {/* Goal — GlassCard, whole card is the tap target now (was
                  just the small "Change" text — well under the 44px touch
                  target guideline on its own) */}
              <button
                onClick={() => setShowGoalPicker(true)}
                className="w-full text-left transition-all active:scale-[0.99]"
                style={{ ...glassCardStyle, overflow: 'hidden' }}
              >
                <div className="flex items-center justify-between p-4 gap-3">
                  <div className="flex items-center gap-3">
                    <GoalRingIcon />
                    <div>
                      <span className="block text-[9px] font-black uppercase tracking-[0.18em] mb-1" style={{ color: 'var(--accent)' }}>Goal</span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-victory text-[28px] font-black leading-none text-white">
                          {activeGoal === '5k'    ? distOpts[goalDistIdx]
                         : activeGoal === '30min' ? TIME_OPTIONS[goalTimeIdx]
                         : activeGoal === 'pace'  ? PACE_OPTIONS[goalPaceIdx]
                         : 'OPEN'}
                        </span>
                        <span className="font-victory text-[14px] font-black" style={{ color: 'var(--accent)' }}>
                          {activeGoal === '5k'    ? distanceUnit.toUpperCase()
                         : activeGoal === '30min' ? 'MIN'
                         : activeGoal === 'pace'  ? `/${distanceUnit}`
                         : ''}
                        </span>
                        <span className="text-[11px] font-medium text-white/35">
                          {activeGoal === '5k'    ? 'Distance'
                         : activeGoal === '30min' ? 'Time'
                         : activeGoal === 'pace'  ? 'Pace'
                         : 'Free run'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="flex items-center gap-0.5 text-[11px] font-black tracking-[0.06em] shrink-0" style={{ color: 'var(--accent)' }}>
                    Change <ChevronLeft className="h-3.5 w-3.5 rotate-180" />
                  </span>
                </div>
              </button>

              {/* Quick stats row */}
              <div className="grid grid-cols-3">
                {[
                  {
                    label: 'Last Run',
                    value: lastRun ? (distanceUnit === 'mi' ? lastRun.distance * 0.621371 : lastRun.distance).toFixed(1) : '--',
                    sub: lastRun ? `${distanceUnit} · ${Math.floor((Date.now() - lastRun.timestamp) / (24*60*60*1000))}d ago` : '',
                    hl: false,
                  },
                  {
                    label: 'This Week',
                    value: (distanceUnit === 'mi' ? weekStats.km * 0.621371 : weekStats.km).toFixed(1),
                    sub: `${distanceUnit} · ${weekStats.count} runs`,
                    hl: true,
                  },
                  {
                    label: 'Streak',
                    value: String(streak),
                    sub: streak === 1 ? 'day' : 'days',
                    hl: streak > 0,
                  },
                ].map((s, i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 py-3"
                    style={{ borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <span className="text-[9px] font-black uppercase tracking-[0.14em]"
                      style={{ color: s.hl ? 'var(--accent)' : 'rgba(255,255,255,0.42)' }}>
                      {s.label}
                    </span>
                    <span className="font-victory text-[22px] font-black leading-none"
                      style={{ color: s.hl ? 'var(--accent)' : '#f3f5f7' }}>
                      {s.value}
                    </span>
                    {s.sub && <span className="text-[8px] font-medium" style={{ color: 'rgba(255,255,255,0.28)' }}>{s.sub}</span>}
                  </div>
                ))}
              </div>

              {/* Start run button */}
              <button
                onClick={() => setShowStartConfirm(true)}
                className="w-full h-[60px] rounded-full font-victory text-[18px] font-black text-black transition-all active:scale-[0.97] flex items-center justify-center gap-3"
                style={{ background: 'var(--accent)', boxShadow: '0 0 0 6px rgba(200,255,0,0.12), 0 12px 34px rgba(200,255,0,0.36)' }}
              >
                <Play className="h-5 w-5 fill-black" />
                Start Run
              </button>

              {/* View history */}
              <button
                onClick={() => navigate('/run/history')}
                className="w-full py-3 flex items-center justify-center gap-2 text-[12px] font-black tracking-[0.12em] transition-all active:opacity-60"
                style={{ color: 'var(--accent)', letterSpacing: '0.08em' }}
              >
                <History className="h-3.5 w-3.5" />
                VIEW RUN HISTORY ›
              </button>
            </motion.div>
          )}

          {/* ─────────── RUNNING / PAUSED — one continuously-mounted block ───────────
              Pause/resume used to be two separate motion.div's with different
              AnimatePresence keys, so every tap unmounted the whole ring+stats
              subtree and mounted a fresh one — a visible flash even though the
              underlying numbers barely changed. Now it's a single block; only
              `isPaused` toggles a few style props, and the two buttons below
              use Framer Motion's `layout` prop so a shape/position change
              (pill <-> circle) animates as a smooth morph instead of a swap. */}
          {isRunning && (
            <motion.div
              key="active"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              {/* Metrics band — TIME/ELEV left, goal ring centered,
                  PACE/CAL right. Sits directly on the bottom panel's own
                  gradient (no card box) so the map reads through. */}
              <div className="flex w-full items-center justify-between gap-3"
                style={{ padding: '6px 4px 18px', opacity: isPaused ? 0.88 : 1, transition: 'opacity 0.3s ease' }}>
                <div className="flex flex-col items-start flex-1 min-w-0" style={{ gap: 22 }}>
                  {[
                    { label: 'TIME', value: formatDuration(elapsedTime), unit: 'elapsed', accent: false },
                    { label: 'ELEV', value: String(Math.round(elevationGain)), unit: 'm gain', accent: false },
                  ].map((s, i) => (
                    <div key={i} className="flex flex-col items-start" style={{ gap: 4 }}>
                      <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                        {s.label}
                      </span>
                      <div className="flex items-baseline" style={{ gap: 5 }}>
                        <span className="font-victory tabular-nums leading-none" style={{ fontSize: 28, color: s.accent ? 'var(--accent)' : '#ffffff' }}>
                          {s.value}
                        </span>
                        <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.32)' }}>
                          {s.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <RingMetric
                  pct={goalProgress}
                  distDisplay={displayDistance.toFixed(2)}
                  distUnit={distanceUnit}
                  goalDisplay={
                    activeGoal === '5k'    ? `${distOpts[goalDistIdx]} ${distanceUnit.toUpperCase()}`
                    : activeGoal === '30min' ? `${TIME_OPTIONS[goalTimeIdx]}M`
                    : activeGoal === 'pace' ? PACE_OPTIONS[goalPaceIdx]
                    : 'OPEN'
                  }
                  dimmed={isPaused}
                />

                <div className="flex flex-col items-end flex-1 min-w-0" style={{ gap: 22 }}>
                  {[
                    { label: 'PACE', value: displayPace > 0 ? formatPace(displayPace) : '--:--', unit: `/${distanceUnit}`, accent: true },
                    { label: 'CAL', value: String(Math.round(totalDistance * 65)), unit: 'kcal', accent: false },
                  ].map((s, i) => (
                    <div key={i} className="flex flex-col items-start" style={{ gap: 4 }}>
                      <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                        {s.label}
                      </span>
                      <div className="flex items-baseline" style={{ gap: 5 }}>
                        <span className="font-victory tabular-nums leading-none" style={{ fontSize: 28, color: s.accent ? 'var(--accent)' : '#ffffff' }}>
                          {s.value}
                        </span>
                        <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.32)' }}>
                          {s.unit}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Alerts */}
              {!isPaused && needsInternet && (
                <div className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-amber-200" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: 8 }}>
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Map tiles need internet — GPS tracking continues offline.
                </div>
              )}

              {/* Controls row — same two buttons throughout; layout animates
                  the pill<->circle morph instead of swapping elements.
                  Softened from the original 500/34 spring — that read as a
                  hard snap on a size change this big (full pill down to a
                  72px circle); slightly lower stiffness + added mass reads
                  as a real physical object settling instead of teleporting
                  to its new spot the instant you tap. */}
              <div className="flex w-full items-center gap-3">
                <motion.button
                  layout
                  transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.9 }}
                  onClick={isPaused ? resumeRun : pauseRun}
                  className="flex flex-1 items-center justify-center gap-2.5 rounded-full active:scale-[0.96]"
                  style={{
                    height: isPaused ? 62 : 60,
                    background: isPaused ? 'var(--accent)' : 'rgba(255,255,255,0.07)',
                    border: isPaused ? 'none' : '1.5px solid rgba(255,255,255,0.16)',
                    boxShadow: isPaused ? '0 0 0 5px rgba(200,255,0,0.12), 0 10px 28px rgba(200,255,0,0.34)' : 'none',
                  }}
                >
                  <motion.span layout="position" className="flex items-center gap-2.5">
                    {isPaused
                      ? <Play className="h-5 w-5 fill-black" />
                      : <Pause className="h-5 w-5 fill-white text-white" />}
                    {/* Normal case, not the small-caps-label treatment GOAL/
                        CAL use elsewhere — this is a primary action, not a
                        stat label, so it reads as a bigger, bolder word
                        instead of tracked-out letters. */}
                    <span className="font-victory text-[17px] font-black"
                      style={{ color: isPaused ? '#000' : '#fff' }}>
                      {isPaused ? 'Resume' : 'Pause'}
                    </span>
                  </motion.span>
                </motion.button>
                <motion.button
                  layout
                  transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.9 }}
                  onClick={isPaused ? () => { void handleStop(); } : () => setShowStopConfirm(true)}
                  className="flex shrink-0 items-center justify-center rounded-full active:scale-95"
                  style={{
                    height: isPaused ? 62 : 72,
                    width: isPaused ? undefined : 72,
                    flex: isPaused ? 1 : '0 0 auto',
                    gap: isPaused ? 10 : 0,
                    background: isPaused ? 'rgba(239,68,68,0.9)' : '#ef4444',
                    boxShadow: isPaused ? 'none' : '0 0 0 6px rgba(239,68,68,0.16), 0 10px 28px rgba(239,68,68,0.4)',
                  }}
                >
                  {/* Icon size used to hard-swap classNames (h-4 <-> h-6),
                      snapping instantly while the button around it was
                      still mid-animation — one part of the button arriving
                      before the rest is exactly what read as jarring.
                      Scaling a fixed-size icon smoothly instead keeps the
                      icon in step with the button's own shape change. */}
                  <motion.div layout="position"
                    animate={{ scale: isPaused ? 0.67 : 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.9 }}
                  >
                    <Square className="h-6 w-6 fill-white text-white" />
                  </motion.div>
                  {/* "Finish" fades in on a short delay rather than popping
                      in the instant isPaused flips — it now only appears
                      once the button has had a moment to grow toward its
                      final pill width, instead of racing ahead of the
                      shape it's supposed to be labeling. */}
                  <AnimatePresence>
                    {isPaused && (
                      <motion.span
                        key="finish-label"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { delay: 0.14, duration: 0.15 } }}
                        exit={{ opacity: 0, transition: { duration: 0.08 } }}
                        className="font-victory text-[17px] font-black text-white"
                      >
                        Finish
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Start confirm popup ── */}
      <AnimatePresence>
        {showStartConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-6"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowStartConfirm(false)}
          >
            <motion.div
              initial={{ y: 48, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 48, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl p-5 flex flex-col gap-4"
              style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              {/* Handle */}
              <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />

              <div className="text-center">
                <p className="text-[18px] font-black text-white">Ready to run?</p>
                <p className="mt-1.5 text-[13px] font-semibold text-white/40">
                  Goal: <span style={{ color: 'var(--accent)' }}>{goalLabel}</span>
                </p>
                <p className="mt-1 text-[12px] text-white/25">
                  Make sure GPS is locked before you start
                </p>
              </div>

              {/* GPS status pill */}
              <div
                className="flex items-center justify-center gap-2 rounded-2xl py-3"
                style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.14)' }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
                <span className="text-[12px] font-bold tracking-[0.1em]" style={{ color: 'var(--accent)' }}>
                  GPS READY · HIGH ACCURACY
                </span>
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowStartConfirm(false)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white/60 transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  CANCEL
                </button>
                <button
                  onClick={() => { setShowStartConfirm(false); isStoppingRef.current = false; startRun(); }}
                  className="flex-1 h-12 rounded-full font-victory text-[16px] font-black text-black transition-all active:scale-[0.97] flex items-center justify-center gap-2"
                  style={{ background: 'var(--accent)' }}
                >
                  <Play className="h-4 w-4 fill-black" />
                  Let's Go
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stop confirm dialog ── */}
      <AnimatePresence>
        {showStopConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-8"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowStopConfirm(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl p-5 flex flex-col gap-4"
              style={{ background: '#161a22', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <div className="text-center">
                <p className="text-[16px] font-black text-white">Stop this run?</p>
                <p className="mt-1 text-[12px] font-semibold text-white/40">
                  {displayDistance.toFixed(2)} {distanceUnit} · {formatDuration(elapsedTime)}
                </p>
              </div>
              <div className="flex gap-2.5">
                <button
                  onClick={() => setShowStopConfirm(false)}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white/70 transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  KEEP GOING
                </button>
                <button
                  onClick={() => { setShowStopConfirm(false); void handleStop(); }}
                  className="flex-1 h-12 rounded-full text-[13px] font-black tracking-[0.1em] text-white transition-all active:scale-[0.97]"
                  style={{ background: 'rgba(239,68,68,0.82)', border: '1px solid rgba(239,68,68,0.3)' }}
                >
                  STOP RUN
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Goal picker bottom sheet ── */}
      <AnimatePresence>
        {showGoalPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[60] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowGoalPicker(false)}
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 340, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-t-3xl p-5 flex flex-col gap-4"
              style={{
                background: '#161a22',
                border: '1px solid rgba(255,255,255,0.08)',
                paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
              }}
            >
              {/* Handle */}
              <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />

              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                  <span className="text-[13px] font-black uppercase tracking-[0.18em] text-white">Choose Goal</span>
                </div>
                {/* Unit toggle */}
                <button
                  onClick={toggleUnit}
                  className="flex overflow-hidden rounded-full"
                  style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                >
                  {(['km', 'mi'] as const).map((u) => (
                    <span
                      key={u}
                      className="px-3 py-1.5 text-[11px] font-black tracking-[0.1em] uppercase transition-all"
                      style={{
                        background: distanceUnit === u ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                        color: distanceUnit === u ? '#000' : 'rgba(255,255,255,0.38)',
                      }}
                    >
                      {u}
                    </span>
                  ))}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {GOAL_CARDS.map(({ key }) => {
                  const active = activeGoal === key;
                  const canEdit = key !== 'open';
                  const dynLabel = key === '5k'    ? `${distOpts[goalDistIdx]}`
                                 : key === '30min' ? `${TIME_OPTIONS[goalTimeIdx]}`
                                 : key === 'pace'  ? PACE_OPTIONS[goalPaceIdx]
                                 : 'Open';
                  const dynSub   = key === '5k'    ? distanceUnit.toUpperCase()
                                 : key === '30min' ? 'min'
                                 : key === 'pace'  ? `/${distanceUnit}`
                                 : 'Free run';
                  return (
                    <div
                      key={key}
                      className="relative overflow-hidden"
                      style={{
                        borderRadius: 16,
                        background: active ? 'rgba(200,255,0,0.09)' : 'rgba(255,255,255,0.04)',
                        border: active ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <button
                        onClick={() => { setActiveGoal(key); setShowGoalPicker(false); }}
                        className="w-full flex flex-col items-center transition-all active:opacity-80"
                        style={{ padding: '16px 8px 12px' }}
                      >
                        <span
                          className="font-victory text-[26px] font-black leading-none"
                          style={{ color: active ? 'var(--accent)' : 'white' }}
                        >
                          {dynLabel}
                        </span>
                        <span className="mt-0.5 text-[11px] font-semibold text-white/35">{dynSub}</span>
                        {active && (
                          <span
                            className="mt-2 rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-black"
                            style={{ background: 'var(--accent)' }}
                          >
                            SELECTED
                          </span>
                        )}
                      </button>
                      {canEdit && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingGoal(key); }}
                          className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full transition-all active:scale-90"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                        >
                          <Pencil className="h-3 w-3 text-white/40" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Goal edit dial sheet ── */}
      <AnimatePresence>
        {editingGoal && (() => {
          const titles: Record<GoalType, string> = { '5k': 'Distance Goal', '30min': 'Time Goal', 'pace': 'Pace Goal', open: '' };
          const isDistance = editingGoal === '5k';
          const isTime     = editingGoal === '30min';
          const isPace     = editingGoal === 'pace';

          const opts    = isDistance ? distOpts.map(String)
                        : isTime     ? TIME_OPTIONS.map(String)
                        : PACE_OPTIONS;
          const curIdx  = isDistance ? goalDistIdx : isTime ? goalTimeIdx : goalPaceIdx;
          const setIdx  = isDistance ? setGoalDistIdx : isTime ? setGoalTimeIdx : setGoalPaceIdx;
          const pickerUnit = isDistance ? distanceUnit.toUpperCase()
                           : isTime     ? 'min'
                           : `/${distanceUnit}`;

          return (
            <motion.div
              key="editDial"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[70] flex items-end justify-center"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
              onClick={() => setEditingGoal(null)}
            >
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-t-3xl p-5 flex flex-col gap-4"
                style={{
                  background: '#161a22',
                  border: '1px solid rgba(255,255,255,0.08)',
                  paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
                }}
              >
                <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />

                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-black uppercase tracking-[0.18em] text-white">
                    {titles[editingGoal]}
                  </span>
                  <span className="text-[11px] font-semibold text-white/30">
                    {isDistance && `${distOpts[curIdx]} ${distanceUnit}`}
                    {isTime && `${TIME_OPTIONS[curIdx]} min`}
                    {isPace && PACE_OPTIONS[curIdx]}
                  </span>
                </div>

                <ChipPicker
                  options={opts}
                  index={curIdx}
                  onChange={setIdx}
                  unit={pickerUnit}
                />

                <button
                  onClick={() => setEditingGoal(null)}
                  className="h-[60px] w-full rounded-full font-victory text-[15px] font-black tracking-[0.18em] text-black transition-all active:scale-[0.97]"
                  style={{ background: 'var(--accent)', boxShadow: '0 0 0 5px rgba(200,255,0,0.12), 0 10px 28px rgba(200,255,0,0.32)' }}
                >
                  DONE
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── GPS / network errors ── */}
      <AnimatePresence>
        {error && !isPermDenied && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="absolute left-4 right-4 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold text-red-300"
            style={{
              zIndex: 55,
              top: 'calc(max(14px, env(safe-area-inset-top)) + 64px)',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

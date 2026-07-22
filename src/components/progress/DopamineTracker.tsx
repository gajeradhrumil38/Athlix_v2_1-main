import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, subDays, parseISO, differenceInDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, addMonths, getMonth, getYear } from 'date-fns';
import {
  ShieldAlert, CheckCircle2, XCircle, X, Flame, Wind, Droplets, Zap, Target,
  TrendingUp, Brain, Heart, Timer, Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getDopamineEntries, upsertDopamineEntry, deleteDopamineEntry } from '../../lib/supabaseData';
import type { DopamineEntry } from '../../lib/supabaseData';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUCCESS_COLORS = ['', '#C8FF00', '#96CC00', '#6A9900', '#4A6B00', '#2E4200'];
const RELAPSE_COLOR  = '#f87171';
const EMPTY_COLOR    = 'rgba(255,255,255,0.05)';
const TODAY_BORDER   = '#FAC775';

const TRIGGER_OPTIONS = ['Stress', 'Boredom', 'Loneliness', 'Fatigue', 'Social media', 'Physical urge', 'Emotional pain', 'Idle time'];
const HELPED_OPTIONS  = ['Exercise', 'Cold shower', 'Deep breathing', 'Meditation', 'Journaling', 'Called someone', 'Left the space', 'Distraction'];
const URGE_LABELS     = ['', 'Very Low', 'Low', 'Medium', 'High', 'Very High'];

const PHASE_SEQ = [
  { k: 'in',    label: 'Breathe in',  dur: 4, scale: 1.0  },
  { k: 'hold1', label: 'Hold',        dur: 4, scale: 1.0  },
  { k: 'out',   label: 'Breathe out', dur: 4, scale: 0.55 },
  { k: 'hold2', label: 'Hold',        dur: 4, scale: 0.55 },
];

const BENEFITS_TIMELINE = [
  { days: 3,  benefit: 'Sleep improving. Energy returning. Brain fog lifting.' },
  { days: 7,  benefit: 'Dopamine receptors begin healing. Morning motivation returning.' },
  { days: 14, benefit: 'Mental clarity sharper. Anxiety and social anxiety reducing.' },
  { days: 30, benefit: 'Real confidence emerging. Deeper focus. Better eye contact.' },
  { days: 60, benefit: 'Brain rewiring nearly complete. Authentic drive restored.' },
  { days: 90, benefit: 'Dopamine baseline reset. You are operating at full capacity.' },
];

const COACH_MESSAGES: { days: number; msg: string }[] = [
  { days: 0,  msg: "Every reset starts with a single day. Today is that day — make it count." },
  { days: 1,  msg: "Day 1 done. Most people quit here. You didn't. That means everything." },
  { days: 3,  msg: "3 days in. Your brain is already recalibrating. The fog is starting to lift." },
  { days: 7,  msg: "One full week clean. The urges are real — and you beat every single one." },
  { days: 14, msg: "Two weeks of rewiring. The old version of you can't believe how far you've come." },
  { days: 30, msg: "30 days. You've built something that took real discipline. That's yours to keep." },
  { days: 60, msg: "Two months strong. The old patterns have lost their grip. You're proving it daily." },
  { days: 90, msg: "90 days. This isn't a streak anymore — it's just who you are now." },
];

const DOW_LABELS_MON = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DOW_FULL_MON   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getCoachMessage(streak: number): string {
  return [...COACH_MESSAGES].reverse().find((m) => streak >= m.days)?.msg
    ?? "Every day clean is a win. You're building something real — don't stop now.";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getEntryColor = (entry: DopamineEntry | undefined) => {
  if (!entry) return EMPTY_COLOR;
  if (entry.status === 'relapse') return RELAPSE_COLOR;
  return SUCCESS_COLORS[Math.max(1, Math.min(5, entry.urge))] ?? '#C8FF00';
};

const computeMomentumPts = (entries: DopamineEntry[]): number[] => {
  const entryMap = new Map(entries.map((e) => [e.date, e]));
  const pts: number[] = [];
  let streak = 0;
  for (let i = 89; i >= 0; i--) {
    const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const e = entryMap.get(d);
    if (!e || e.status === 'relapse') { streak = 0; }
    else { streak++; }
    pts.push(streak);
  }
  return pts;
};

const computeStats = (entries: DopamineEntry[]) => {
  const entryMap = new Map(entries.map((e) => [e.date, e]));

  // If today has no entry yet, start counting from yesterday (grace period)
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const hasToday = entryMap.has(todayKey);
  const startIdx = hasToday ? 0 : 1;

  let current = 0;
  for (let i = startIdx; i <= 365; i++) {
    const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
    const e = entryMap.get(d);
    if (!e || e.status === 'relapse') break;
    current++;
  }

  let best = 0, run = 0, prevDate: string | null = null;
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    if (e.status === 'relapse') { run = 0; prevDate = null; continue; }
    if (prevDate && differenceInDays(parseISO(e.date), parseISO(prevDate)) === 1) run++;
    else run = 1;
    if (run > best) best = run;
    prevDate = e.date;
  }

  const cutoff = format(subDays(new Date(), 29), 'yyyy-MM-dd');
  const last30 = entries.filter((e) => e.date >= cutoff);
  const successes = last30.filter((e) => e.status === 'success');
  const successRate = last30.length > 0 ? Math.round((successes.length / last30.length) * 100) : null;
  const avgUrge = successes.length > 0
    ? (successes.reduce((s, e) => s + e.urge, 0) / successes.length).toFixed(1)
    : null;

  const allTriggers = entries.flatMap((e) => e.triggers ?? []);
  const triggerFreq: Record<string, number> = {};
  allTriggers.forEach((t) => { triggerFreq[t] = (triggerFreq[t] ?? 0) + 1; });
  const topTrigger = Object.entries(triggerFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const allHelped = entries.flatMap((e) => e.helped_by ?? []);
  const helpedFreq: Record<string, number> = {};
  allHelped.forEach((h) => { helpedFreq[h] = (helpedFreq[h] ?? 0) + 1; });
  const topHelper = Object.entries(helpedFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const relapseDayCount: Record<number, number> = {};
  entries.filter((e) => e.status === 'relapse').forEach((e) => {
    const dow = parseISO(e.date).getDay();
    relapseDayCount[dow] = (relapseDayCount[dow] ?? 0) + 1;
  });
  const hardestDow = Object.entries(relapseDayCount).sort((a, b) => b[1] - a[1])[0];
  const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hardestDay = hardestDow ? DOW_NAMES[Number(hardestDow[0])] : null;

  // Total clean days
  const totalClean = entries.filter((e) => e.status === 'success').length;

  // Day-of-week success % over last 60 days (Mon=0 … Sun=6)
  const cutoff60 = format(subDays(new Date(), 59), 'yyyy-MM-dd');
  const last60 = entries.filter((e) => e.date >= cutoff60);
  const dowTotal   = Array(7).fill(0) as number[];
  const dowSuccess = Array(7).fill(0) as number[];
  last60.forEach((e) => {
    const jsDow = parseISO(e.date).getDay(); // 0=Sun
    const idx = jsDow === 0 ? 6 : jsDow - 1; // Mon=0..Sun=6
    dowTotal[idx]++;
    if (e.status === 'success') dowSuccess[idx]++;
  });
  const dowPct = dowTotal.map((t, i) => t > 0 ? Math.round((dowSuccess[i] / t) * 100) : 0);

  // Hardest dow by lowest success rate (among days with data)
  let hardestDowIdx = 0;
  let minRate = 101;
  dowTotal.forEach((t, i) => {
    if (t > 0 && dowPct[i] < minRate) { minRate = dowPct[i]; hardestDowIdx = i; }
  });

  return { current, best, successRate, avgUrge, topTrigger, topHelper, hardestDay, totalClean, dowPct, hardestDowIdx };
};

const getMilestone = (streak: number) => {
  return [...BENEFITS_TIMELINE].reverse().find((b) => streak >= b.days) ?? null;
};

const getNextMilestone = (streak: number) => {
  return BENEFITS_TIMELINE.find((b) => streak < b.days) ?? null;
};

// ─── SOS Sub-components ───────────────────────────────────────────────────────

const BreathPacer: React.FC = () => {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [count, setCount] = useState(4);
  const [cycle, setCycle] = useState(1);

  useEffect(() => {
    const id = setInterval(() => {
      setCount((c) => {
        if (c > 1) return c - 1;
        setPhaseIdx((prev) => {
          const next = (prev + 1) % PHASE_SEQ.length;
          if (next === 0) setCycle((cy) => cy + 1);
          return next;
        });
        return 4;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const phase = PHASE_SEQ[phaseIdx];
  // 'in' expands (0.55→1.0), 'out' contracts (1.0→0.55), holds snap-keep current scale
  const duration = phase.k === 'in' || phase.k === 'out' ? 4 : 0;

  return (
    <div className="flex flex-col items-center justify-center" style={{ padding: '16px 0 10px' }}>
      {/* Phase label — fixed above the circle so it never overlaps */}
      <p className="text-[11px] font-bold uppercase tracking-[0.22em] mb-3" style={{ color: '#C8FF00', minHeight: 16 }}>
        {phase.label}
      </p>

      <div className="relative flex items-center justify-center"
        style={{ width: 200, height: 200 }}>
        {/* Outer glow */}
        <div className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgba(200,255,0,0.05), rgba(200,255,0,0) 70%)' }} />
        {/* Dashed outer ring */}
        <div className="absolute rounded-full"
          style={{ inset: 10, border: '1px dashed rgba(200,255,0,0.22)' }} />
        {/* Breathing ring — Framer Motion handles scale so it always transitions correctly */}
        <motion.div
          className="absolute rounded-full"
          style={{
            inset: 32,
            background: 'radial-gradient(circle at 35% 30%, rgba(200,255,0,0.28), rgba(200,255,0,0.06) 60%, rgba(200,255,0,0) 80%)',
            border: '1px solid rgba(200,255,0,0.45)',
            boxShadow: '0 0 40px rgba(200,255,0,0.18) inset, 0 0 60px rgba(200,255,0,0.12)',
          }}
          animate={{ scale: phase.scale }}
          transition={{ duration, ease: [0.4, 0, 0.2, 1] }}
        />
        {/* Count — centered, lime with glow */}
        <p className="relative z-10 tabular-nums font-black leading-none"
          style={{ fontSize: 64, color: '#C8FF00', letterSpacing: '-0.04em', textShadow: '0 0 32px rgba(200,255,0,0.5)' }}>
          {count}
        </p>
      </div>

      <p className="text-[10px] uppercase tracking-[0.16em] mt-4" style={{ color: 'rgba(255,255,255,0.3)' }}>
        cycle {cycle} · 4-4-4-4 box breath
      </p>
    </div>
  );
};

const UrgeWave: React.FC = () => {
  const W = 320, H = 50;
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 4) {
    const t = (x - W / 2) / (W / 4);
    const y = H - 6 - Math.exp(-(t * t)) * (H - 14);
    pts.push(`${x},${y.toFixed(1)}`);
  }
  const path = 'M ' + pts.join(' L ');
  const youX = W * 0.30;
  const tYou = (youX - W / 2) / (W / 4);
  const youY = H - 6 - Math.exp(-(tYou * tYou)) * (H - 14);

  return (
    <div className="mx-4 mt-4 rounded-2xl p-4"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <p className="text-[9px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
        Urge curve
      </p>
      <p className="text-[13px] font-bold leading-snug mb-3" style={{ color: '#fff' }}>
        This <span style={{ color: '#C8FF00' }}>peaks in ~15 min</span> then fades.
        You don't have to act — just outlast it.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 60 }}>
        <defs>
          <linearGradient id="wave-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#f87171" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={`${path} L ${W},${H} L 0,${H} Z`} fill="url(#wave-fill)" />
        <path d={path} fill="none" stroke="#f87171" strokeWidth={1.5} strokeOpacity={0.85} />
        <line x1={W / 2} y1={H - 2} x2={W / 2} y2={6} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 3" />
        <circle cx={youX} cy={youY} r={7} fill="#C8FF00" opacity={0.18} />
        <circle cx={youX} cy={youY} r={3.5} fill="#C8FF00" stroke="#0a0a0a" strokeWidth={1} />
      </svg>
      <div className="flex justify-between mt-1 text-[9px] uppercase tracking-wider"
        style={{ color: 'rgba(255,255,255,0.3)' }}>
        <span style={{ color: '#C8FF00' }}>You are here</span>
        <span>Peak ~15 min</span>
        <span>Fades ~25 min</span>
      </div>
    </div>
  );
};

const AnchorWidget: React.FC<{ currentStreak: number }> = ({ currentStreak }) => (
  <div className="mx-4 mt-3 rounded-2xl p-4"
    style={{ background: 'linear-gradient(180deg, rgba(200,255,0,0.06) 0%, rgba(200,255,0,0) 100%)', border: '1px solid rgba(200,255,0,0.22)' }}>
    <p className="text-[9px] font-bold uppercase tracking-[0.2em] mb-2" style={{ color: 'rgba(200,255,0,0.65)' }}>
      Who you are now
    </p>
    <p className="text-[15px] font-bold leading-snug" style={{ color: '#fff' }}>
      You're <span style={{ color: '#C8FF00' }}>{currentStreak} day{currentStreak !== 1 ? 's' : ''}</span> into a reset.
      You're someone who breathes through urges, not someone who acts on them.
    </p>
    <div className="grid grid-cols-2 gap-2 mt-3">
      <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>If you act</p>
        <p className="text-[20px] font-black leading-none" style={{ color: '#f87171' }}>→ Day 0</p>
        <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Streak resets. {currentStreak > 0 ? `Day ${currentStreak} lost.` : ''}</p>
      </div>
      <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[9px] uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>To rebuild</p>
        <p className="text-[20px] font-black leading-none tabular-nums" style={{ color: '#fff' }}>~{currentStreak}d</p>
        <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Of work to recover what you have.</p>
      </div>
    </div>
  </div>
);

const SOS_ACTIONS = [
  { icon: Droplets, t: 'Splash cold water on your face', s: '2 minutes. Resets your nervous system fast.' },
  { icon: Zap,      t: '20 push-ups or a brisk walk',   s: 'Redirects dopamine to your prefrontal cortex.' },
  { icon: Wind,     t: 'Leave the room',                s: 'Change your environment. Break the cue chain.' },
  { icon: Heart,    t: 'Text someone who knows',         s: 'One message. Accountability is your shortcut out.' },
];

const ActionsWidget: React.FC = () => (
  <div className="mx-4 mt-3 space-y-2">
    <p className="text-[12px] font-bold mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
      If it's still here — do one thing
    </p>
    {SOS_ACTIONS.map(({ icon: Icon, t, s }) => (
      <div key={t} className="flex items-start gap-3 rounded-xl p-3"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          <Icon className="w-4 h-4" style={{ color: '#C8FF00' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold" style={{ color: '#fff' }}>{t}</p>
          <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'rgba(255,255,255,0.45)' }}>{s}</p>
        </div>
      </div>
    ))}
  </div>
);

// ─── Minimap Sub-components ───────────────────────────────────────────────────

const MomentumLine: React.FC<{ pts: number[] }> = ({ pts }) => {
  const W = 320, H = 64;
  const max = Math.max(...pts, 1);
  const stepX = W / (pts.length - 1);
  const ys = pts.map((v) => H - (v / max) * (H - 8) - 4);
  const xs = pts.map((_, i) => i * stepX);
  const linePath = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L${W},${H} L0,${H} Z`;
  const lastX = xs[xs.length - 1];
  const lastY = ys[ys.length - 1];
  const dips: number[] = [];
  for (let i = 1; i < pts.length; i++) if (pts[i] < pts[i - 1]) dips.push(i);
  const currentStreak = pts[pts.length - 1];

  return (
    <div className="px-4 pb-1 pt-1">
      <div className="rounded-xl overflow-hidden" style={{ background: 'radial-gradient(120% 80% at 90% 100%, rgba(200,255,0,0.05), transparent 60%)', padding: '12px 4px 6px' }}>
        <div className="flex items-baseline justify-between px-2 mb-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Momentum · last 90 days
          </span>
          <span className="text-[11px] font-bold" style={{ color: '#C8FF00' }}>
            ▲ {currentStreak} consecutive
          </span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 64 }}>
          <defs>
            <linearGradient id="mom-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#C8FF00" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#C8FF00" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="mom-line" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#5e7f00" />
              <stop offset="100%" stopColor="#C8FF00" />
            </linearGradient>
          </defs>
          <line x1={0} y1={H - 4} x2={W} y2={H - 4} stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
          <path d={fillPath} fill="url(#mom-fill)" />
          <path d={linePath} fill="none" stroke="url(#mom-line)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {dips.map((i, k) => (
            <circle key={k} cx={xs[i]} cy={ys[i]} r={2.4} fill="#f87171" stroke="#0a0a0a" strokeWidth={1} />
          ))}
          <circle cx={lastX} cy={lastY} r={6} fill="#C8FF00" opacity={0.18} />
          <circle cx={lastX} cy={lastY} r={3.2} fill="#C8FF00" stroke="#0a0a0a" strokeWidth={1.2} />
        </svg>
      </div>
    </div>
  );
};

const DowBars: React.FC<{ dowPct: number[]; hardestDowIdx: number }> = ({ dowPct, hardestDowIdx }) => {
  return (
    <div className="px-4 pt-3 pb-1" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8 }}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Consistency by day · last 60d
        </span>
        <span className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Weakest: <span style={{ color: '#FAC775', fontWeight: 700 }}>
            {DOW_FULL_MON[hardestDowIdx]}s ({dowPct[hardestDowIdx]}%)
          </span>
        </span>
      </div>
      <div className="grid gap-1.5 items-end" style={{ gridTemplateColumns: 'repeat(7,1fr)', height: 44 }}>
        {dowPct.map((pct, i) => {
          const isHardest = i === hardestDowIdx;
          const h = Math.max(8, (pct / 100) * 44);
          return (
            <div key={i} className="relative flex items-end rounded-t-sm" style={{ height: '100%', background: 'rgba(255,255,255,0.04)', borderRadius: '4px 4px 2px 2px', overflow: 'hidden' }}>
              <div
                className="w-full relative"
                style={{
                  height: h,
                  borderRadius: '4px 4px 2px 2px',
                  background: isHardest
                    ? 'linear-gradient(180deg,#FAC775 0%,#c89940 100%)'
                    : 'linear-gradient(180deg,#C8FF00 0%,#96CC00 100%)',
                }}>
                <span
                  className="absolute text-[8.5px] font-bold tabular-nums"
                  style={{
                    top: h < 18 ? -12 : 3,
                    left: 0, right: 0,
                    textAlign: 'center',
                    color: h < 18 ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.7)',
                  }}>
                  {pct}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="grid mt-1.5 gap-1.5" style={{ gridTemplateColumns: 'repeat(7,1fr)' }}>
        {DOW_LABELS_MON.map((d, i) => (
          <span key={i} className="text-center text-[9px] font-bold"
            style={{ color: i === hardestDowIdx ? '#FAC775' : 'rgba(255,255,255,0.25)' }}>
            {d}
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── Component ────────────────────────────────────────────────────────────────

export const DopamineTracker: React.FC = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<DopamineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showSOS, setShowSOS] = useState(false);
  const [sosTimer, setSosTimer] = useState<number | null>(null);
  const sosIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [checkinStep, setCheckinStep] = useState<'status' | 'details'>('status');
  const [pendingStatus, setPendingStatus] = useState<'success' | 'relapse' | null>(null);
  const [pendingUrge, setPendingUrge] = useState(2);
  const [pendingNote, setPendingNote] = useState('');
  const [pendingTriggers, setPendingTriggers] = useState<string[]>([]);
  const [pendingHelped, setPendingHelped] = useState<string[]>([]);

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [showAllLog, setShowAllLog] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayEntry = entries.find((e) => e.date === today);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getDopamineEntries(user.id)
      .then(setEntries)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  const startSosTimer = () => {
    setSosTimer(15 * 60);
    sosIntervalRef.current = setInterval(() => {
      setSosTimer((t) => {
        if (t === null || t <= 1) {
          if (sosIntervalRef.current) clearInterval(sosIntervalRef.current);
          return null;
        }
        return t - 1;
      });
    }, 1000);
  };
  useEffect(() => () => { if (sosIntervalRef.current) clearInterval(sosIntervalRef.current); }, []);

  const openCheckinForDate = (dateStr: string) => {
    const existing = entries.find((e) => e.date === dateStr);
    if (existing) {
      setPendingStatus(existing.status);
      setPendingUrge(existing.urge);
      setPendingNote(existing.note || '');
      setPendingTriggers(existing.triggers ?? []);
      setPendingHelped(existing.helped_by ?? []);
      setCheckinStep('details');
    } else {
      setCheckinStep('status');
      setPendingStatus(null);
      setPendingUrge(2);
      setPendingNote('');
      setPendingTriggers([]);
      setPendingHelped([]);
    }
    setEditingDate(dateStr);
  };

  const closeCheckin = () => {
    setEditingDate(null);
    setCheckinStep('status');
    setPendingStatus(null);
    setPendingUrge(2);
    setPendingNote('');
    setPendingTriggers([]);
    setPendingHelped([]);
  };

  const toggleTag = (list: string[], setList: (v: string[]) => void, tag: string) => {
    setList(list.includes(tag) ? list.filter((t) => t !== tag) : [...list, tag]);
  };

  const submitCheckin = useCallback(async () => {
    if (!pendingStatus || !editingDate || !user) return;
    setSaving(true);
    try {
      const saved = await upsertDopamineEntry(user.id, {
        date: editingDate,
        status: pendingStatus,
        urge: pendingUrge,
        note: pendingNote.trim() || undefined,
        triggers: pendingTriggers,
        helped_by: pendingHelped,
      });
      setEntries((prev) => {
        const without = prev.filter((e) => e.date !== editingDate);
        return [...without, saved].sort((a, b) => a.date.localeCompare(b.date));
      });
      closeCheckin();
    } catch {
      // keep modal open
    } finally {
      setSaving(false);
    }
  }, [pendingStatus, editingDate, user, pendingUrge, pendingNote, pendingTriggers, pendingHelped]);

  const deleteEntry = useCallback(async () => {
    if (!editingDate || !user) return;
    setDeleting(true);
    try {
      await deleteDopamineEntry(user.id, editingDate);
      setEntries((prev) => prev.filter((e) => e.date !== editingDate));
      closeCheckin();
    } catch {
      // keep modal open
    } finally {
      setDeleting(false);
    }
  }, [editingDate, user]);

  const stats = useMemo(() => computeStats(entries), [entries]);
  const momentumPts = useMemo(() => computeMomentumPts(entries), [entries]);
  const milestone = getMilestone(stats.current);
  const nextMilestone = getNextMilestone(stats.current);
  const hasDowData = stats.dowPct.some((p) => p > 0) && entries.length >= 5;

  const canGoNext = getMonth(viewMonth) !== getMonth(new Date()) || getYear(viewMonth) !== getYear(new Date());

  const gridCells = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const gridEnd   = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((day) => {
      const d = format(day, 'yyyy-MM-dd');
      const entry = entries.find((e) => e.date === d);
      const inMonth = getMonth(day) === getMonth(viewMonth) && getYear(day) === getYear(viewMonth);
      return {
        date: d, entry,
        isToday: d === today,
        isFuture: d > today,
        inMonth,
      };
    });
  }, [entries, today, viewMonth]);

  const weeks = useMemo(() => {
    const w: typeof gridCells[] = [];
    for (let i = 0; i < gridCells.length; i += 7) w.push(gridCells.slice(i, i + 7));
    return w;
  }, [gridCells]);

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const editingEntry = editingDate ? entries.find((e) => e.date === editingDate) : undefined;
  const editingDateLabel = editingDate
    ? (editingDate === today ? 'Today' : format(parseISO(editingDate), 'EEE, MMM d'))
    : '';

  const closeSOS = () => {
    setShowSOS(false);
    setSosTimer(null);
    if (sosIntervalRef.current) clearInterval(sosIntervalRef.current);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Streak hero ── */}
      <div className="rounded-2xl p-5 space-y-4" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Row 1: label + streak number + SOS */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Dopamine Reset</p>
            <div className="flex items-baseline gap-2">
              <span className="text-[52px] font-black leading-none tabular-nums" style={{ color: '#fff' }}>{stats.current}</span>
              <span className="text-[15px] font-semibold" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {stats.current === 1 ? 'day strong' : 'days strong'}
              </span>
            </div>
            {milestone && (
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
                style={{ background: 'rgba(200,255,0,0.1)', border: '1px solid rgba(200,255,0,0.22)', color: '#C8FF00' }}>
                <Flame className="w-3 h-3" /> Day {milestone.days} unlocked
              </div>
            )}
          </div>
          <button onClick={() => setShowSOS(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12px] font-bold transition-all active:scale-95"
            style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
            <ShieldAlert className="w-3.5 h-3.5" /> SOS
          </button>
        </div>

        {/* Coach message */}
        <div className="rounded-xl px-3.5 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            "{getCoachMessage(stats.current)}"
          </p>
        </div>

        {/* What you've unlocked (current milestone benefit) */}
        {milestone && (
          <div className="flex items-start gap-3 rounded-xl px-3.5 py-3"
            style={{ background: 'rgba(200,255,0,0.05)', border: '1px solid rgba(200,255,0,0.12)' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#C8FF00' }} />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'rgba(200,255,0,0.5)' }}>What you've unlocked</p>
              <p className="text-[12px] leading-snug" style={{ color: 'rgba(255,255,255,0.6)' }}>{milestone.benefit}</p>
            </div>
          </div>
        )}

        {/* Goal progress */}
        {nextMilestone && (
          <div className="rounded-xl px-3.5 py-3.5 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>Your Goal</p>
                <p className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>Day {nextMilestone.days}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{nextMilestone.benefit.split('.')[0]}</p>
              </div>
              <div className="text-right">
                <p className="text-[28px] font-black tabular-nums leading-none" style={{ color: '#C8FF00' }}>
                  {Math.round((stats.current / nextMilestone.days) * 100)}
                  <span className="text-[14px] font-bold">%</span>
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>there</p>
              </div>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, (stats.current / nextMilestone.days) * 100)}%`, background: 'linear-gradient(90deg,#C8FF00,#96CC00)' }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {stats.current} done
              </span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'rgba(200,255,0,0.7)' }}>
                {nextMilestone.days - stats.current} day{nextMilestone.days - stats.current !== 1 ? 's' : ''} to go
              </span>
            </div>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Best',     value: `${stats.best}d`,                                    sub: 'streak' },
            { label: 'Rate',     value: stats.successRate != null ? `${stats.successRate}%` : '—', sub: '30-day' },
            { label: 'Avg Urge', value: stats.avgUrge ?? '—',                                sub: '/ 5' },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-[9px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{s.label}</p>
              <p className="text-[20px] font-black tabular-nums leading-none" style={{ color: 'rgba(255,255,255,0.85)' }}>{s.value}</p>
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.25)' }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Log button */}
        <button onClick={() => openCheckinForDate(today)}
          className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
          style={{ background: todayEntry?.status === 'success' ? '#C8FF00' : todayEntry?.status === 'relapse' ? '#f87171' : '#C8FF00' }}>
          {todayEntry
            ? (todayEntry.status === 'success'
              ? <><CheckCircle2 className="w-4 h-4" /> Today: Strong — Edit</>
              : <><Heart className="w-4 h-4" /> Today logged — Edit</>)
            : <><Target className="w-4 h-4" /> Log Today</>}
        </button>
      </div>

      {/* ── Pattern Insights ── */}
      {entries.length >= 5 && (stats.topTrigger || stats.topHelper || stats.hardestDay) && (
        <div className="rounded-2xl p-4" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4" style={{ color: '#C8FF00' }} />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.4)' }}>Your Patterns</p>
          </div>
          <div className="space-y-2">
            {stats.topTrigger && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.12)' }}>
                <XCircle className="w-3.5 h-3.5 shrink-0" style={{ color: '#f87171' }} />
                <div>
                  <p className="text-[11px] font-bold" style={{ color: '#f87171' }}>Most common trigger: {stats.topTrigger}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Be extra mindful when you feel this way</p>
                </div>
              </div>
            )}
            {stats.topHelper && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(200,255,0,0.06)', border: '1px solid rgba(200,255,0,0.12)' }}>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: '#C8FF00' }} />
                <div>
                  <p className="text-[11px] font-bold" style={{ color: '#C8FF00' }}>What helps you most: {stats.topHelper}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Your proven strategy — use it first</p>
                </div>
              </div>
            )}
            {stats.hardestDay && (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(250,199,117,0.06)', border: '1px solid rgba(250,199,117,0.12)' }}>
                <TrendingUp className="w-3.5 h-3.5 shrink-0" style={{ color: '#FAC775' }} />
                <div>
                  <p className="text-[11px] font-bold" style={{ color: '#FAC775' }}>Hardest day: {stats.hardestDay}</p>
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Plan ahead — be extra prepared on {stats.hardestDay}s</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Minimap Card ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg,#16191F 0%,#111419 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>

        {/* Minimap header + month nav */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div>
            <span className="text-[14px] font-bold" style={{ color: '#fff', letterSpacing: '-0.01em' }}>
              Minimap{' '}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
              your reset
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
              className="w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ChevronLeft className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.6)' }} />
            </button>
            <span className="text-[12px] font-bold px-2" style={{ color: '#fff', letterSpacing: '-0.01em' }}>
              {format(viewMonth, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => canGoNext && setViewMonth((m) => addMonths(m, 1))}
              disabled={!canGoNext}
              className="w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all disabled:opacity-20"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <ChevronRight className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.6)' }} />
            </button>
          </div>
        </div>

        {/* Momentum line chart */}
        {!loading && entries.length > 0 && <MomentumLine pts={momentumPts} />}

        {/* Day-of-week column headers */}
        <div className="grid grid-cols-7 px-4 mb-1.5 mt-2">
          {DAY_LABELS.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold uppercase tracking-wider py-1"
              style={{ color: i >= 5 ? 'rgba(250,199,117,0.5)' : 'rgba(255,255,255,0.25)' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1.5 px-4">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="rounded-xl animate-pulse" style={{ aspectRatio: '1', background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 px-4">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1.5">
                {week.map((cell, di) => {
                  const isClickable = !cell.isFuture && cell.inMonth;
                  const isWeekend = di >= 5;
                  const bg = cell.entry ? getEntryColor(cell.entry)
                    : isWeekend ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.035)';

                  return (
                    <motion.button
                      key={di}
                      type="button"
                      disabled={!isClickable}
                      onClick={() => isClickable && openCheckinForDate(cell.date)}
                      whileTap={isClickable ? { scale: 0.82 } : undefined}
                      whileHover={isClickable ? { scale: 1.06 } : undefined}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className="relative flex items-center justify-center rounded-xl"
                      style={{
                        aspectRatio: '1',
                        background: !cell.inMonth ? 'transparent' : bg,
                        border: cell.isToday
                          ? `2px solid ${TODAY_BORDER}`
                          : !cell.inMonth ? 'none'
                          : cell.entry ? '1px solid rgba(0,0,0,0.2)'
                          : '1px dashed rgba(255,255,255,0.1)',
                        opacity: !cell.inMonth ? 0.15 : cell.isFuture ? 0.3 : 1,
                        cursor: isClickable ? 'pointer' : 'default',
                      }}
                    >
                      <span
                        className="text-[10.5px] font-bold leading-none select-none tabular-nums"
                        style={{
                          color: cell.entry
                            ? (cell.isToday && (cell.entry.status === 'success' || cell.entry.status === 'relapse')
                              ? 'rgba(0,0,0,0.85)'
                              : cell.entry.status === 'success' ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.75)')
                            : cell.isToday ? TODAY_BORDER
                            : cell.inMonth ? 'rgba(255,255,255,0.4)'
                            : 'rgba(255,255,255,0.2)',
                        }}
                      >
                        {format(parseISO(cell.date), 'd')}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Day-of-week bars */}
        {!loading && hasDowData && (
          <DowBars dowPct={stats.dowPct} hardestDowIdx={stats.hardestDowIdx} />
        )}

        {/* Stat strip — 4 stats */}
        <div className="grid grid-cols-4 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { lb: 'Now',   vv: `${stats.current}`, unit: 'd', sub: 'streak', lime: true },
            { lb: 'Best',  vv: `${stats.best}`,    unit: 'd', sub: 'ever',   lime: false },
            { lb: 'Rate',  vv: stats.successRate != null ? `${stats.successRate}` : '—', unit: stats.successRate != null ? '%' : '', sub: '30 day', lime: false },
            { lb: 'Clean', vv: `${stats.totalClean}`, unit: '',  sub: 'total',  gold: true },
          ].map((s, i, arr) => (
            <div key={s.lb} className="text-center py-3"
              style={{ borderRight: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] mb-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {s.lb}
              </p>
              <p className="text-[18px] font-black leading-none tabular-nums"
                style={{ color: (s as any).lime ? '#C8FF00' : (s as any).gold ? '#FAC775' : '#fff', letterSpacing: '-0.03em' }}>
                {s.vv}<small className="text-[10px] font-semibold ml-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.unit}</small>
              </p>
              <p className="text-[9px] mt-1 uppercase tracking-[0.06em]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {s.sub}
              </p>
            </div>
          ))}
        </div>

        {/* Legend — full urge scale */}
        <div className="flex items-center justify-center gap-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-[3px]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.15)' }} />
            <span className="text-[9.5px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Empty</span>
          </div>
          <div className="flex items-center gap-1">
            {SUCCESS_COLORS.slice(1).map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-[3px]" style={{ background: c }} />
            ))}
            <span className="text-[9.5px] ml-1" style={{ color: 'rgba(255,255,255,0.3)' }}>Strong (easier→harder)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-[3px]" style={{ background: RELAPSE_COLOR }} />
            <span className="text-[9.5px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Struggle</span>
          </div>
        </div>
      </div>

      {/* ── Recent log ── */}
      {entries.length > 0 && (() => {
        const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
        const visible = showAllLog ? sorted : sorted.slice(0, 3);
        return (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(160deg,#16191F 0%,#111419 100%)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.35)' }}>Recent Log</p>
              {sorted.length > 3 && (
                <button onClick={() => setShowAllLog((v) => !v)}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all active:scale-95"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                  {showAllLog ? 'Show less' : `··· ${sorted.length - 3} more`}
                </button>
              )}
            </div>
            {visible.map((e, i) => (
              <button
                key={e.date}
                onClick={() => openCheckinForDate(e.date)}
                className="w-full flex items-start gap-3 px-5 py-3 text-left active:bg-white/5 transition-colors"
                style={{ borderTop: i === 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.04)' }}
              >
                <div className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                  style={{ background: e.status === 'success' ? (SUCCESS_COLORS[e.urge] ?? '#C8FF00') : RELAPSE_COLOR }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {format(parseISO(e.date), 'EEE, MMM d')}
                  </p>
                  {(e.triggers ?? []).length > 0 && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(248,113,113,0.7)' }}>
                      Triggers: {e.triggers!.join(', ')}
                    </p>
                  )}
                  {(e.helped_by ?? []).length > 0 && (
                    <p className="text-[10px] mt-0.5" style={{ color: 'rgba(200,255,0,0.6)' }}>
                      Helped: {e.helped_by!.join(', ')}
                    </p>
                  )}
                  {e.note && <p className="text-[11px] truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{e.note}</p>}
                </div>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5"
                  style={e.status === 'success'
                    ? { background: 'rgba(200,255,0,0.1)', color: '#C8FF00', border: '1px solid rgba(200,255,0,0.2)' }
                    : { background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}>
                  {e.status === 'success' ? '✓ Strong' : '✗ Struggled'}
                </span>
              </button>
            ))}
          </div>
        );
      })()}

      {/* ── Check-in modal ── */}
      <AnimatePresence>
        {editingDate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}>
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] overflow-y-auto no-scrollbar pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{ background: '#111419', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh' }}>

              <div className="w-9 h-1 rounded-full mx-auto mt-4 mb-5 opacity-30" style={{ background: '#fff' }} />
              <div className="flex items-center justify-between px-5 mb-5">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] mb-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    {editingEntry ? 'Edit Entry' : 'Add Entry'}
                  </p>
                  <p className="text-[17px] font-bold" style={{ color: '#fff' }}>{editingDateLabel}</p>
                </div>
                <button onClick={closeCheckin}
                  className="h-8 w-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <X className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                </button>
              </div>

              {checkinStep === 'status' ? (
                <div className="px-5 space-y-3 pb-5">
                  <p className="text-[13px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>How was this day?</p>
                  <button
                    onClick={() => { setPendingStatus('success'); setCheckinStep('details'); }}
                    className="w-full py-4 rounded-2xl text-[16px] font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                    style={{ background: 'rgba(200,255,0,0.12)', border: '2px solid rgba(200,255,0,0.3)', color: '#C8FF00' }}>
                    <CheckCircle2 className="w-5 h-5" /> I stayed strong
                  </button>
                  <button
                    onClick={() => { setPendingStatus('relapse'); setPendingUrge(5); setCheckinStep('details'); }}
                    className="w-full py-4 rounded-2xl text-[15px] font-bold flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                    style={{ background: 'rgba(248,113,113,0.08)', border: '2px solid rgba(248,113,113,0.2)', color: '#f87171' }}>
                    <Heart className="w-5 h-5" /> I struggled today
                  </button>
                  <p className="text-[11px] text-center pt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    Honesty is the foundation of recovery. No judgment here.
                  </p>
                </div>
              ) : (
                <div className="px-5 space-y-5 pb-5">
                  {/* Status indicator */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                    style={pendingStatus === 'success'
                      ? { background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.2)' }
                      : { background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                    {pendingStatus === 'success'
                      ? <CheckCircle2 className="w-4 h-4" style={{ color: '#C8FF00' }} />
                      : <Heart className="w-4 h-4" style={{ color: '#f87171' }} />}
                    <span className="text-[13px] font-semibold" style={{ color: pendingStatus === 'success' ? '#C8FF00' : '#f87171' }}>
                      {pendingStatus === 'success' ? 'Stayed strong' : 'Struggled today'}
                    </span>
                    <button onClick={() => setCheckinStep('status')} className="ml-auto text-[11px]"
                      style={{ color: 'rgba(255,255,255,0.35)' }}>Change</button>
                  </div>

                  {/* Self-compassion message on relapse */}
                  {pendingStatus === 'relapse' && (
                    <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(250,199,117,0.06)', border: '1px solid rgba(250,199,117,0.15)' }}>
                      <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(250,199,117,0.85)' }}>
                        <span className="font-bold">This is part of recovery</span> — not a failure. Research shows self-compassion (not shame) is what actually breaks the cycle. You logged it honestly. That takes courage.
                      </p>
                    </div>
                  )}

                  {/* Urge level — for success */}
                  {pendingStatus === 'success' && (
                    <div>
                      <p className="text-[12px] font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Urge level — <span style={{ color: '#C8FF00' }}>{URGE_LABELS[pendingUrge]}</span>
                      </p>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((u) => (
                          <button key={u} onClick={() => setPendingUrge(u)}
                            className="flex-1 py-3 rounded-xl text-[14px] font-black transition-all active:scale-95"
                            style={pendingUrge === u
                              ? { background: SUCCESS_COLORS[u], color: '#000', border: 'none' }
                              : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            {u}
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-between mt-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        <span>Easy day</span><span>Hard won</span>
                      </div>
                    </div>
                  )}

                  {/* Triggers */}
                  <div>
                    <p className="text-[12px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                      {pendingStatus === 'success' ? 'What triggered the urge? (optional)' : 'What triggered it?'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TRIGGER_OPTIONS.map((tag) => {
                        const sel = pendingTriggers.includes(tag);
                        return (
                          <button key={tag} onClick={() => toggleTag(pendingTriggers, setPendingTriggers, tag)}
                            className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95"
                            style={sel
                              ? { background: 'rgba(248,113,113,0.2)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171' }
                              : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* What helped — for success */}
                  {pendingStatus === 'success' && (
                    <div>
                      <p className="text-[12px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.4)' }}>What helped you resist?</p>
                      <div className="flex flex-wrap gap-1.5">
                        {HELPED_OPTIONS.map((tag) => {
                          const sel = pendingHelped.includes(tag);
                          return (
                            <button key={tag} onClick={() => toggleTag(pendingHelped, setPendingHelped, tag)}
                              className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all active:scale-95"
                              style={sel
                                ? { background: 'rgba(200,255,0,0.15)', border: '1px solid rgba(200,255,0,0.35)', color: '#C8FF00' }
                                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' }}>
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Note */}
                  <div>
                    <p className="text-[12px] font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Reflection (optional)</p>
                    <textarea
                      value={pendingNote}
                      onChange={(e) => setPendingNote(e.target.value)}
                      placeholder={pendingStatus === 'success'
                        ? 'What kept you going? Any thoughts to remember...'
                        : 'What happened? Be honest with yourself — no one else reads this.'}
                      rows={2}
                      className="w-full rounded-xl px-3 py-2.5 text-[13px] resize-none focus:outline-none"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', caretColor: '#C8FF00' }}
                    />
                  </div>

                  <button onClick={submitCheckin} disabled={saving || deleting}
                    className="w-full py-3.5 rounded-xl text-[14px] font-bold text-black active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: pendingStatus === 'success' ? '#C8FF00' : '#f87171' }}>
                    {saving ? 'Saving…' : editingEntry ? 'Update Entry' : 'Save Entry'}
                  </button>

                  {editingEntry && (
                    <button onClick={deleteEntry} disabled={deleting || saving}
                      className="w-full py-3 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.18)', color: '#f87171' }}>
                      <Trash2 className="w-4 h-4" />
                      {deleting ? 'Removing…' : 'Remove This Entry'}
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SOS Modal — redesigned ── */}
      <AnimatePresence>
        {showSOS && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end justify-center"
            style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}>
            <motion.div initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full max-w-[480px] rounded-t-[24px] overflow-y-auto no-scrollbar pb-[max(28px,env(safe-area-inset-bottom))]"
              style={{
                background: 'radial-gradient(80% 50% at 50% 0%, rgba(248,113,113,0.15), transparent 55%), radial-gradient(70% 50% at 50% 100%, rgba(200,255,0,0.07), transparent 55%), #0d0f13',
                border: '1px solid rgba(248,113,113,0.2)',
                maxHeight: '92vh',
              }}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#f87171', boxShadow: '0 0 0 0 rgba(248,113,113,0.6)' }} />
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: '#f87171' }}>SOS · urge spike</p>
                </div>
                <button onClick={closeSOS}
                  className="h-7 w-7 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <X className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.5)' }} />
                </button>
              </div>

              {/* Hero text */}
              <div className="text-center px-6 pb-2">
                <h2 className="text-[26px] font-bold leading-tight" style={{ color: '#fff', letterSpacing: '-0.025em' }}>
                  Ride the wave.
                </h2>
                <p className="text-[13px] mt-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  An urge is a wave, not a command. Breathe with the circle. Don't move. It will pass.
                </p>
              </div>

              {/* Breathing pacer */}
              <BreathPacer />

              {/* Urge wave visualization */}
              <UrgeWave />

              {/* Identity anchor */}
              <AnchorWidget currentStreak={stats.current} />

              {/* Action list */}
              <div className="mt-4">
                <ActionsWidget />
              </div>

              {/* Urge surfing timer */}
              <div className="mx-4 mt-4 rounded-2xl p-4" style={{ background: 'rgba(200,255,0,0.04)', border: '1px solid rgba(200,255,0,0.12)' }}>
                {sosTimer === null ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: '#C8FF00' }}>Urge Surfing Timer</p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Urges peak at 15 min then fade. Start the clock.</p>
                    </div>
                    <button onClick={startSosTimer}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold active:scale-95 transition-all"
                      style={{ background: 'rgba(200,255,0,0.15)', border: '1px solid rgba(200,255,0,0.3)', color: '#C8FF00' }}>
                      <Timer className="w-3.5 h-3.5" /> Start
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-[11px] mb-1" style={{ color: 'rgba(200,255,0,0.5)' }}>Ride it out — time remaining</p>
                    <p className="text-[36px] font-black tabular-nums" style={{ color: '#C8FF00' }}>
                      {String(Math.floor(sosTimer / 60)).padStart(2, '0')}:{String(sosTimer % 60).padStart(2, '0')}
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.25)' }}>Don't act. Just breathe and wait.</p>
                  </div>
                )}
              </div>

              <div className="px-4 mt-4 mb-2">
                <button onClick={closeSOS}
                  className="w-full py-3.5 rounded-xl text-[14px] font-bold active:scale-[0.98] transition-all"
                  style={{ background: 'rgba(200,255,0,0.1)', border: '1px solid rgba(200,255,0,0.2)', color: '#C8FF00' }}>
                  I rode the wave
                </button>
                <p className="text-[10px] text-center mt-3 leading-snug" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  No matter what happens next — you opened this page instead of acting. That's already a win.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

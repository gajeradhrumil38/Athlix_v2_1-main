import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { aiCoachFetch } from '../../lib/aiCoachFetch';
import { convertWeight, type WeightUnit } from '../../lib/units';
import { resolveExerciseInputType } from '../../lib/exerciseTypes';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Sparkles, X, Send, Loader2, Settings as SettingsIcon, Copy, Check, Plus, Minus, Trash2, ExternalLink, BarChart2, Menu, MessageSquarePlus, RotateCcw, Pencil } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format, subDays } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { DialPicker } from '../log/DialPicker';
import {
  getWorkouts,
  getPersonalRecords,
  logBodyWeight,
  upsertDopamineEntry,
  saveWorkout,
  saveTemplate,
  searchExerciseLibrary,
  type LocalWorkout,
  type LocalExercise,
  type LocalPersonalRecord,
  type LocalExerciseLibraryItem,
} from '../../lib/supabaseData';
import { getFoodScans } from '../../lib/foodData';
import type { FoodScan } from '../../features/food/types';
import { getRuns } from '../../features/running/utils/storage';
import type { SavedRun } from '../../features/running/utils/storage';
import { whoopService } from '../../features/whoop/services/whoopService';
import type { WhoopAllData } from '../../features/whoop/services/whoopService';
import {
  type WorkoutWithExercises,
  type StrainCostContext,
  type RecoveryContext,
  type InsightsContext,
  buildSystemPrompt,
  calDaysSince,
  parseSkincareStats,
} from '../../lib/aiCoach';
import { getStrainCostContext, getRecoveryContext, getInsightsContext, getTodayTrainingRecommendation, type TrainingRecommendation } from '../../features/recommendations/services/trainingRecommendation';
import { useAiCoachKey, DEFAULT_MODEL } from '../../hooks/useAiCoachKey';
import {
  type CoachGoal,
  type CoachMemory,
  getCoachMemory,
  addCoachGoal,
  addCoachFact,
  completeCoachGoal,
  recordCheckIn,
  coachStreak,
  syncCoachMemory,
} from '../../lib/coachMemory';
import { getTodayFeeling, setTodayFeeling } from '../../lib/dailyBriefing';
import type { ExerciseEntry, WorkoutState } from '../../pages/Log';
import {
  type ChatSession,
  type StoredChatMessage,
  getSessions,
  resolveActiveSession,
  startFreshSession,
  persistActiveMessages,
  setActiveSession,
  deleteSession,
} from '../../lib/coachSessions';

/* ── Per-set data type ────────────────────────────────────────────── */
interface SetEntry { reps: number; weight: number; }

/* ── Fetch last logged sets for an exercise (for pre-fill) ────────── */
async function getLastExerciseSets(userId: string, exerciseName: string): Promise<SetEntry[] | null> {
  try {
    const workouts = await getWorkouts(userId, { limit: 20, includeExercises: true });
    for (const w of (workouts || []) as any[]) {
      const ex = ((w.exercises as any[]) || []).find(
        (e: any) => e.name.toLowerCase() === exerciseName.toLowerCase(),
      );
      if (!ex) continue;
      if (Array.isArray(ex.completed_sets) && ex.completed_sets.length > 0) {
        return ex.completed_sets.map((s: any) => ({ reps: Number(s.reps) || 1, weight: Number(s.weight) || 0 }));
      }
      if (ex.sets > 0) {
        return Array.from({ length: ex.sets }, () => ({ reps: Number(ex.reps) || 1, weight: Number(ex.weight) || 0 }));
      }
    }
  } catch { /* non-fatal */ }
  return null;
}

const USAGE_STORAGE = 'athlix:api_usage';

// Fast, low-drama entrance for the coach's "done" cards (M3 standardSpatialFast
// — quick settle, no expressive bounce, right for routine UI).
const CARD_POP = {
  initial: { opacity: 0, y: 6, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { type: 'spring' as const, stiffness: 480, damping: 30 },
};
// Quick, slightly springy press for tappable chips (satisfying, ≤200ms feel).
const CHIP_TAP = { type: 'spring' as const, stiffness: 600, damping: 20 };
// Max conversation turns sent to API (keeps token usage low while preserving short-term memory)
const MAX_HISTORY = 12;

// Aurora gradient border CSS — injected once into <head>
const AURORA_CSS = `
  @property --ai-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
  @keyframes ai-spin { to { --ai-angle: 360deg; } }
  @keyframes ai-pulse-glow {
    0%,100% { opacity:1; box-shadow:0 0 5px rgba(200,255,0,0.5); }
    50%      { opacity:0.7; box-shadow:0 0 10px rgba(124,58,237,0.6); }
  }
  .ai-aurora-spin {
    background-image: linear-gradient(var(--bg-elevated,rgba(0,0,0,0.35)),var(--bg-elevated,rgba(0,0,0,0.35))),
      conic-gradient(from var(--ai-angle),#7c3aed,#2563eb,#C8FF00,#7c3aed);
    background-origin: border-box; background-clip: padding-box,border-box;
    animation: ai-spin 3s linear infinite;
  }
  .ai-aurora-static {
    background-image: linear-gradient(var(--bg-elevated,rgba(0,0,0,0.35)),var(--bg-elevated,rgba(0,0,0,0.35))),
      linear-gradient(135deg,#7c3aed,#2563eb,#C8FF00);
    background-origin: border-box; background-clip: padding-box,border-box;
  }
  .ai-online-dot {
    width:7px; height:7px; border-radius:50%; background:var(--accent,#C8FF00); flex-shrink:0;
    animation: ai-pulse-glow 2s ease-in-out infinite;
  }
  .ai-input-wrap { transition: border-color 0.15s; }
  .ai-input-wrap:focus-within { border-color: rgba(200,255,0,0.35) !important; }
`;

// ── Gemini function declarations (tool calling) ──────────────────────────────
const FUNCTION_DECLARATIONS = [
  {
    name: 'log_weight',
    description: "Log the user's body weight. Use when the user says their weight, e.g. 'my weight is 75', 'log 80kg', 'I weigh 170lbs today'.",
    parameters: {
      type: 'object',
      properties: {
        weight: { type: 'number', description: 'Body weight value as a number' },
        unit: { type: 'string', enum: ['kg', 'lbs'], description: "Unit of weight — 'kg' or 'lbs'. Default kg if not specified." },
        date: { type: 'string', description: "Date in YYYY-MM-DD format. Use today's date if not mentioned." },
      },
      required: ['weight'],
    },
  },
  {
    name: 'log_dopamine',
    description: "Log a dopamine / NoFap daily check-in. Use when user says things like 'I stayed clean today', 'relapsed today', 'I resisted the urge', 'logged a win for today'.",
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['success', 'relapse'], description: "'success' if they stayed clean / resisted urges, 'relapse' if they gave in" },
        urge: { type: 'number', description: 'Urge intensity 1–5. Only for success entries. Guess from context if not given (default 3).', minimum: 1, maximum: 5 },
        note: { type: 'string', description: 'Optional short note the user wants to record.' },
        date: { type: 'string', description: "Date in YYYY-MM-DD format. Default to today." },
      },
      required: ['status'],
    },
  },
  {
    name: 'log_exercise',
    description: "Log a specific exercise set. Use ONLY when the user explicitly provides BOTH sets AND reps (e.g. '3x10', '5 sets of 5', '4 sets 8 reps'). Examples: 'bench press 3x10 80kg', 'squats 5x5 100kg'. Always normalize typos (e.g. 'banch press' → 'Bench Press'). If weight not mentioned, use 0. IMPORTANT: If the user names an exercise but does NOT specify sets and reps, call show_exercise_form instead. For multiple exercises in one message, log the first one and tell the user to log the others one at a time.",
    parameters: {
      type: 'object',
      properties: {
        exercise_name: { type: 'string', description: 'Exercise name with typos corrected and properly capitalized (e.g. "Bench Press", "Squat", "Pull Up")' },
        sets: { type: 'number', description: 'Number of sets — only provide when explicitly stated by user' },
        reps: { type: 'number', description: 'Reps per set — only provide when explicitly stated by user' },
        weight: { type: 'number', description: 'Weight used. Use 0 for bodyweight exercises.' },
        unit: { type: 'string', enum: ['kg', 'lbs'], description: "Weight unit — default 'kg'" },
        date: { type: 'string', description: 'Date in YYYY-MM-DD format, defaults to today' },
      },
      required: ['exercise_name', 'sets', 'reps'],
    },
  },
  {
    name: 'show_exercise_form',
    description: "Show the user a fillable exercise log form. Use ONLY when: (1) user names a SPECIFIC exercise but does NOT give sets and reps, (2) the exercise intent is clear but details are missing. Pass exercise_name if you know which exercise. Do NOT use for weight or dopamine logging. Do NOT use for 'what should I train' / 'what should I do today' / general training-plan questions — those get a text answer built from WEEKLY VOLUME, MONTHLY VOLUME, and MUSCLE RECOVERY STATUS instead; only call this once the user names the exercise they want to log.",
    parameters: {
      type: 'object',
      properties: {
        exercise_name: { type: 'string', description: 'Exercise name to pre-fill, with typos corrected. Leave empty if unknown.' },
      },
      required: [],
    },
  },
  {
    name: 'navigate_to_log',
    description: "Open the workout logger page. Use when user says 'start a workout', 'let\\'s train', 'open the log', 'I want to log a session', 'take me to the workout page'.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'navigate_to_food',
    description: "Open the food scanner page. Use when user says 'log my meal', 'scan food', 'I want to track what I ate', 'food log', 'open food scanner'.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'navigate_to_run',
    description: "Open the GPS run tracker. Use when user says 'start a run', 'let\\'s go running', 'open the run tracker', 'I want to track my run'.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'set_goal',
    description: "Remember a fitness goal the user states they're working toward. Use when they say things like 'my goal is to bench 100kg', 'I want to hit a 5k under 25 min', 'trying to lose 5kg', 'want bigger arms'. Capture a structured target when there's a clear number.",
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Short natural-language goal, e.g. "Bench press 100kg" or "Run 5k under 25 min".' },
        metric: { type: 'string', enum: ['weight', 'e1rm', 'bodyweight', 'runs', 'sessions'], description: 'Optional: what the target measures.' },
        exercise: { type: 'string', description: 'Optional exercise name the goal is about, e.g. "Bench Press".' },
        target: { type: 'number', description: 'Optional numeric target value.' },
        unit: { type: 'string', description: "Optional unit for the target, e.g. 'kg', 'lbs', 'min'." },
      },
      required: ['text'],
    },
  },
  {
    name: 'remember',
    description: "Remember a durable preference, schedule, or constraint about the user so future coaching respects it. Use for things like 'I train Monday Wednesday Friday', 'I have a bad shoulder, no overhead pressing', 'I only have dumbbells', 'I'm vegetarian'. Do NOT use for one-off logging or transient state.",
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The durable fact to remember, phrased concisely in third person, e.g. "Trains Mon/Wed/Fri" or "Bad left shoulder — avoid overhead pressing".' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'complete_goal',
    description: "Mark a previously set goal as achieved. Use when the user says they hit a goal, e.g. 'I finally benched 100kg!', 'hit my 5k target'. Match against their active goals.",
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Words identifying which goal was achieved, e.g. "bench 100kg".' },
      },
      required: ['text'],
    },
  },
  {
    name: 'create_template',
    description: "Build and save a reusable workout template for the user. Use ONLY when they ask you to create/build/make/save an actual workout or plan they can DO (e.g. 'make me a push day', 'build a full-body dumbbell workout and save it', 'create a leg day'). Respect their remembered constraints (injuries, available equipment, schedule) and recovery status. Pick real exercises with sensible sets/reps. Do NOT use this for the generic 'what should I train today?' question — that stays a text answer.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short template name, e.g. "Push Day A", "Full-Body Dumbbell".' },
        exercises: {
          type: 'array',
          description: 'Ordered list of exercises in the workout.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Exercise name, properly capitalized (e.g. "Bench Press").' },
              muscle_group: { type: 'string', description: 'Primary muscle group, e.g. "Chest", "Back", "Legs".' },
              sets: { type: 'number', description: 'Number of sets (e.g. 3).' },
              reps: { type: 'number', description: 'Target reps per set (e.g. 8).' },
              weight: { type: 'number', description: 'Optional suggested weight; use 0 if unsure / bodyweight.' },
            },
            required: ['name', 'sets', 'reps'],
          },
        },
      },
      required: ['title', 'exercises'],
    },
  },
  {
    name: 'show_nutrition_summary',
    description: "Triggered when user asks about their diet, macros, calories, or food intake. Read the NUTRITION section already in your context and provide a data-driven response. Do NOT call this if no NUTRITION section exists in context.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'show_run_summary',
    description: "Triggered when user asks about their running, pace, distance, mileage, or cardio performance. Read the RUNNING section already in your context. Do NOT call this if no RUNNING section exists in context.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

const LOADING_PHASES = [
  'Reviewing your workout history…',
  'Checking muscle recovery status…',
  'Analyzing your progression…',
  'Formulating advice…',
];

interface ToolResult {
  success: boolean;
  message: string;
  suggestions?: string[];   // exercise name suggestions when not found
  showForm?: boolean;       // show inline exercise form
  formInitialName?: string; // pre-fill exercise name in form
  templateAction?: { id: string; title: string }; // coach built & saved a workout template
  loggedExercise?: { name: string; sets: number; reps: number; weight?: number; unit?: string };
  loggedStat?: LoggedStat;
}

interface LoggedStat { kind: 'weight' | 'checkin'; value: string; unit?: string; label: string; sub: string; good?: boolean }

type CoachChartKind = 'bar' | 'line' | 'ring' | 'donut';

interface CoachChartPoint {
  label: string;
  value: number;
  secondary?: number;
  trend?: number;   // fitted value from the least-squares trend line
  ma?: number;      // 3-point moving average (local smoother)
}

// Least-squares linear fit + R² (goodness of fit) + a 3-point moving average.
// R² gates whether we CLAIM a trend (only when the line actually fits), and the
// moving average is the honest smoother for noisy data a straight line can't
// describe. Needs ≥3 points. Signal over noise, per the dataviz playbook.
function computeTrend(data: CoachChartPoint[]): { data: CoachChartPoint[]; slope: number; r2: number } {
  const n = data.length;
  if (n < 3) return { data, slope: 0, r2: 0 };
  const ys = data.map((d) => d.value);
  const mx = (n - 1) / 2;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (ys[i] - my);
    den += (i - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += (ys[i] - (slope * i + intercept)) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  const ma = ys.map((_, i) => {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n - 1, i + 1);
    let s = 0;
    for (let j = lo; j <= hi; j++) s += ys[j];
    return Math.round((s / (hi - lo + 1)) * 10) / 10;
  });

  return {
    data: data.map((d, i) => ({ ...d, trend: Math.round((slope * i + intercept) * 10) / 10, ma: ma[i] })),
    slope,
    r2,
  };
}

interface CoachRing {
  label: string;
  value: number;
  max: number;
  color: string;
  display?: string;   // pre-formatted readout (e.g. "3/4", "72%")
}

interface CoachChart {
  kind: CoachChartKind;
  title: string;
  subtitle?: string;
  valueLabel: string;
  secondaryLabel?: string;
  color?: string;
  data: CoachChartPoint[];   // bar / line / donut
  rings?: CoachRing[];       // kind 'ring'
  centerValue?: string;      // ring / donut center headline
  centerLabel?: string;
  overlay?: 'trend' | 'ma'; // which smoother to draw on a line chart
  showPeak?: boolean;        // mark the peak/PR point on a line chart
}

interface Message {
  role: 'user' | 'model';
  text: string;
  thought?: string;
  action?: ToolResult;
  exerciseForm?: boolean;         // render inline exercise form
  exerciseFormInitialName?: string; // pre-fill exercise name
  chart?: CoachChart;
  suggestedChart?: CoachChart;
  templateAction?: { id: string; title: string };
  loggedExercise?: { name: string; sets: number; reps: number; weight?: number; unit?: string };
  loggedStat?: LoggedStat;
  logRouting?: { added: number; missing: string[] };
}

interface ApiUsage {
  total_tokens: number;
  total_requests: number;
  month_tokens: number;
  month_requests: number;
  month_key: string; // "YYYY-MM"
}

function trackTokenUsage(tokens: number): void {
  const monthKey = new Date().toISOString().slice(0, 7);
  const raw = localStorage.getItem(USAGE_STORAGE);
  const prev: ApiUsage = raw
    ? JSON.parse(raw)
    : { total_tokens: 0, total_requests: 0, month_tokens: 0, month_requests: 0, month_key: monthKey };
  const data: ApiUsage = {
    total_tokens: prev.total_tokens + tokens,
    total_requests: prev.total_requests + 1,
    month_tokens: prev.month_key === monthKey ? prev.month_tokens + tokens : tokens,
    month_requests: prev.month_key === monthKey ? prev.month_requests + 1 : 1,
    month_key: monthKey,
  };
  localStorage.setItem(USAGE_STORAGE, JSON.stringify(data));
}

const CHART_REQUEST_RE = /\b(chart|plot|graph|visual|visuali[sz]e|bar|line|trend|progression)\b/i;

// Softer signal: the user is clearly asking an analytical/"how am I doing" data
// question. When this matches we proactively show a chart even if they never
// said "plot" — the coach visualizes when it's genuinely useful.
const CHART_AUTO_RE = /\b(progress|progressing|trend|trending|improv\w*|getting (?:stronger|better|faster)|plateau\w*|over time|history|compare|comparison|how(?:'s| is| am| are)|last (?:week|month|\d+ days?)|this (?:week|month)|weekly|monthly|personal record|pr\b)\b/i;

const titleCase = (s: string) =>
  s.split(/\s+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');

const parseWorkoutDate = (date: string) => new Date(`${date}T00:00:00`);

function buildVolumeChart(workouts: WorkoutWithExercises[], text: string): CoachChart | undefined {
  const windowDays = /\b(month|monthly|28|4 week|four week)\b/i.test(text) ? 28 : 7;
  const setsByMuscle = new Map<string, number>();

  for (const w of workouts) {
    if (calDaysSince(w.date) > windowDays - 1) continue;
    for (const ex of w.exercises || []) {
      const muscle = titleCase(ex.muscle_group || 'Other');
      setsByMuscle.set(muscle, (setsByMuscle.get(muscle) || 0) + (Number(ex.sets) || 0));
    }
  }

  const data = Array.from(setsByMuscle.entries())
    .map(([label, value]) => ({ label, value }))
    .filter((p) => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  if (!data.length) return undefined;
  return {
    kind: 'bar',
    title: `${windowDays === 28 ? '28-Day' : 'Weekly'} Volume`,
    subtitle: 'Sets by muscle group',
    valueLabel: 'Sets',
    data,
  };
}

function findExerciseNameForChart(workouts: WorkoutWithExercises[], text: string): string | null {
  const names = new Map<string, string>();
  for (const w of workouts) {
    for (const ex of w.exercises || []) names.set(ex.name.toLowerCase(), ex.name);
  }
  const lower = text.toLowerCase();
  const exact = Array.from(names.values())
    .sort((a, b) => b.length - a.length)
    .find((name) => lower.includes(name.toLowerCase()));
  if (exact) return exact;

  const words = lower.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  const scored = Array.from(names.values()).map((name) => {
    const n = name.toLowerCase();
    const score = words.reduce((sum, word) => sum + (n.includes(word) ? 1 : 0), 0);
    return { name, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);

  return scored[0]?.name || null;
}

type ExerciseMetricKey = 'weight' | 'e1rm' | 'reps' | 'volume';

// Older sets are stored in the unit they were LOGGED in (kg or lbs), so a chart
// or aggregation that reads ex.weight raw and labels it in the display unit will
// show e.g. a 2.5kg set as "2.5 lbs". Normalise every set to ONE display unit up
// front so all downstream maths + labels are consistent and correct.
function normalizeWorkoutUnits(workouts: WorkoutWithExercises[], to: WeightUnit): WorkoutWithExercises[] {
  return workouts.map((w) => {
    if (!w.exercises || !w.exercises.length) return w;
    return {
      ...w,
      exercises: w.exercises.map((ex) => {
        const from: WeightUnit = ex.unit === 'kg' ? 'kg' : 'lbs';
        const weight = Number(ex.weight) || 0;
        if (from === to || weight <= 0) return ex.unit === to ? ex : { ...ex, unit: to };
        return { ...ex, weight: convertWeight(weight, from, to), unit: to };
      }),
    };
  });
}

// Pick the y-axis metric from the user's wording. Default is the heaviest set,
// the most intuitive "am I getting stronger" line — the query can switch it to
// estimated 1RM, total reps, or tonnage.
function pickExerciseMetric(text: string, unit: string): { key: ExerciseMetricKey; label: string; sub: string } {
  const t = text.toLowerCase();
  if (/\b(1rm|one[- ]?rep|estimated max|e1rm|1[- ]?rep max)\b/.test(t))
    return { key: 'e1rm', label: `${unit} est. 1RM`, sub: 'Estimated 1-rep max per session' };
  if (/\b(rep|reps|repetition)\b/.test(t))
    return { key: 'reps', label: 'reps', sub: 'Total reps per session' };
  if (/\b(volume|tonnage|total load|total weight)\b/.test(t))
    return { key: 'volume', label: `${unit} volume`, sub: 'Total volume: sets × reps × weight' };
  return { key: 'weight', label: unit, sub: 'Heaviest set per session' };
}

function buildExerciseVolumeChart(workouts: WorkoutWithExercises[], text: string, unit: string): CoachChart | undefined {
  const exerciseName = findExerciseNameForChart(workouts, text);
  if (!exerciseName) return undefined;

  const lowerName = exerciseName.toLowerCase();

  // Reps-only exercise (bodyweight / no load ever logged) → weight, est-1RM and
  // volume are all ~0 and meaningless. Track REPS instead: top reps per session
  // is the "am I getting stronger" signal for these.
  const allSets = workouts.flatMap((w) => (w.exercises || []).filter((ex) => ex.name.toLowerCase() === lowerName));
  const hasWeight = allSets.some((ex) => (Number(ex.weight) || 0) > 0);
  // A reps-only exercise (pull-ups, plank, yoga…) charts REPS, not weight — use
  // the exercise's canonical input type so a stray/optional weight can't flip it
  // to a meaningless weight plot. Also fall back to reps when nothing weighted
  // has been logged yet.
  const isRepsOnly = resolveExerciseInputType(exerciseName) === 'reps_only';
  const repsPeak = isRepsOnly || !hasWeight;
  const metric = repsPeak
    ? { key: 'reps' as ExerciseMetricKey, label: 'reps', sub: 'Top reps per session' }
    : pickExerciseMetric(text, unit);
  const isPeak = metric.key === 'weight' || metric.key === 'e1rm' || repsPeak;
  const points = new Map<string, number>();

  for (const w of [...workouts].sort((a, b) => parseWorkoutDate(a.date).getTime() - parseWorkoutDate(b.date).getTime())) {
    const matching = (w.exercises || []).filter((ex) => ex.name.toLowerCase() === lowerName);
    if (!matching.length) continue;

    let sessionValue = 0;
    for (const ex of matching) {
      const sets = Number(ex.sets) || 0;
      const reps = Number(ex.reps) || 0;
      const weight = Number(ex.weight) || 0;
      if (metric.key === 'weight') sessionValue = Math.max(sessionValue, weight);
      else if (metric.key === 'e1rm') sessionValue = Math.max(sessionValue, reps > 0 ? weight * (1 + reps / 30) : weight);
      else if (metric.key === 'reps') sessionValue = repsPeak ? Math.max(sessionValue, reps) : sessionValue + sets * reps;
      else sessionValue += sets * reps * weight;
    }
    if (sessionValue <= 0) continue;
    const prev = points.get(w.date);
    points.set(w.date, prev == null ? sessionValue : isPeak ? Math.max(prev, sessionValue) : prev + sessionValue);
  }

  const raw = Array.from(points.entries())
    .slice(-12)
    .map(([date, value]) => ({ label: format(parseWorkoutDate(date), 'MMM d'), value: Math.round(value * 10) / 10 }));

  if (raw.length < 2) return undefined;
  // Trend/MA + a CONFIDENCE-gated verdict: only claim a direction when the
  // straight line actually fits (R² ≥ 0.25). When it doesn't, the data is
  // noisy → draw the moving average instead and call it "variable".
  const { data, slope, r2 } = computeTrend(raw);
  const confident = raw.length >= 3 && r2 >= 0.25;
  const verdict = confident
    ? (slope > 0.05 ? ' · trending up ↑' : slope < -0.05 ? ' · trending down ↓' : ' · holding steady →')
    : (raw.length >= 4 ? ' · variable' : '');
  const overlay: CoachChart['overlay'] = confident ? 'trend' : raw.length >= 5 ? 'ma' : undefined;
  return {
    kind: 'line',
    title: exerciseName,
    subtitle: metric.sub + verdict,
    valueLabel: metric.label,
    data,
    overlay,
    showPeak: true,
  };
}

function buildLoggedWorkoutVolumeChart(workouts: WorkoutWithExercises[], unit: string): CoachChart | undefined {
  // Weighted volume (sets×reps×weight) reads near-zero for a bodyweight-heavy
  // block, making the chart useless. Detect that and switch the whole chart to
  // total REPS per day so it stays meaningful.
  let weightedSets = 0;
  let totalSets = 0;
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      const s = Number(ex.sets) || 1;
      totalSets += s;
      if ((Number(ex.weight) || 0) > 0) weightedSets += s;
    }
  }
  const repsMode = totalSets > 0 && weightedSets / totalSets < 0.5; // mostly bodyweight

  // Aggregate by DAY so two sessions on the same date don't produce two bars.
  const byDate = new Map<string, number>();
  for (const w of workouts) {
    const value = (w.exercises || []).reduce((sum, ex) => {
      const sets = Number(ex.sets) || 0;
      const reps = Number(ex.reps) || 0;
      const weight = Number(ex.weight) || 0;
      return sum + (repsMode ? sets * reps : sets * reps * weight);
    }, 0);
    if (value > 0) byDate.set(w.date, (byDate.get(w.date) || 0) + value);
  }

  const data = Array.from(byDate.entries())
    .sort(([a], [b]) => parseWorkoutDate(a).getTime() - parseWorkoutDate(b).getTime())
    .slice(-10)
    .map(([date, value]) => ({ label: format(parseWorkoutDate(date), 'MMM d'), value: Math.round(value) }));

  if (data.length < 2) return undefined;
  return {
    kind: 'bar',
    title: repsMode ? 'Training Reps' : 'Training Volume',
    subtitle: repsMode ? 'Total reps per day' : 'Total volume per day',
    valueLabel: repsMode ? 'reps' : `${unit} volume`,
    data,
  };
}

function buildNutritionChart(foodScans: FoodScan[], text: string): CoachChart | undefined {
  if (!foodScans.length) return undefined;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const recent = foodScans.filter((scan) => new Date(scan.scan_date) >= cutoff);
  if (!recent.length) return undefined;

  if (/\b(macro|protein|carb|fat)\b/i.test(text)) {
    const totals = recent.reduce(
      (acc, scan) => ({
        protein: acc.protein + (Number(scan.total_protein) || 0),
        carbs: acc.carbs + (Number(scan.total_carbs) || 0),
        fat: acc.fat + (Number(scan.total_fat) || 0),
      }),
      { protein: 0, carbs: 0, fat: 0 },
    );
    return {
      kind: 'bar',
      title: '7-Day Macros',
      subtitle: 'Logged food totals',
      valueLabel: 'g',
      data: [
        { label: 'Protein', value: Math.round(totals.protein) },
        { label: 'Carbs', value: Math.round(totals.carbs) },
        { label: 'Fat', value: Math.round(totals.fat) },
      ].filter((p) => p.value > 0),
    };
  }

  const daily = new Map<string, number>();
  for (const scan of recent) {
    const date = scan.scan_date.slice(0, 10);
    daily.set(date, (daily.get(date) || 0) + (Number(scan.total_calories) || 0));
  }
  const data = Array.from(daily.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ label: format(parseWorkoutDate(date), 'MMM d'), value: Math.round(value) }));

  if (!data.length) return undefined;
  return {
    kind: 'bar',
    title: 'Calories Logged',
    subtitle: 'Last 7 days',
    valueLabel: 'cal',
    data,
  };
}

function buildRunChart(runs: SavedRun[], text: string): CoachChart | undefined {
  const recent = [...runs].sort((a, b) => a.timestamp - b.timestamp).slice(-8);
  if (recent.length < 2) return undefined;

  const isPace = /\b(pace|speed)\b/i.test(text);
  return {
    kind: isPace ? 'line' : 'bar',
    title: isPace ? 'Running Pace' : 'Run Distance',
    subtitle: `Last ${recent.length} runs`,
    valueLabel: isPace ? 'min/km' : 'km',
    data: recent.map((run) => ({
      label: format(new Date(run.timestamp), 'MMM d'),
      value: Number((isPace ? run.pace : run.distance).toFixed(2)),
      secondary: isPace ? Number(run.distance.toFixed(2)) : undefined,
    })),
  };
}

// Apple-style ring / accent palette shared by rings + donut.
const VIZ_COLORS = ['#C8FF00', '#7c6cf5', '#38bdf8', '#fbbf24', '#f87171', '#4ade80'];
const recoveryColor = (v: number) => (v >= 67 ? '#4ade80' : v >= 34 ? '#fbbf24' : '#f87171');

// "How's my week" → a 2–3 ring snapshot (sessions, muscle balance, recovery),
// with overall completion in the center.
function buildWeeklyRingChart(workouts: WorkoutWithExercises[], whoopData: WhoopAllData | null): CoachChart | undefined {
  const week = workouts.filter((w) => calDaysSince(w.date) <= 6);
  const sessions = week.length;
  const muscles = new Set<string>();
  for (const w of week) for (const mg of (w.muscle_groups || [])) muscles.add(String(mg).toLowerCase());
  if (!sessions) return undefined;

  const SESSION_TARGET = 4;
  const MUSCLE_TARGET = 6;
  const rings: CoachRing[] = [
    { label: 'Sessions', value: sessions, max: SESSION_TARGET, color: VIZ_COLORS[0], display: `${sessions}/${SESSION_TARGET}` },
    { label: 'Muscle balance', value: muscles.size, max: MUSCLE_TARGET, color: VIZ_COLORS[1], display: `${muscles.size}/${MUSCLE_TARGET}` },
  ];
  const rec = whoopData?.recovery?.[0]?.recovery_score;
  if (typeof rec === 'number' && rec > 0) {
    rings.push({ label: 'Recovery', value: rec, max: 100, color: VIZ_COLORS[2], display: `${Math.round(rec)}%` });
  }
  const avgPct = Math.round(rings.reduce((s, r) => s + Math.min(1, r.value / r.max), 0) / rings.length * 100);
  return {
    kind: 'ring',
    title: 'This Week',
    subtitle: 'Training snapshot',
    valueLabel: '',
    data: [],
    rings,
    centerValue: `${avgPct}%`,
    centerLabel: 'on target',
  };
}

// Recovery / readiness → WHOOP recovery, sleep and strain rings.
function buildRecoveryRingChart(whoopData: WhoopAllData | null): CoachChart | undefined {
  const rec = whoopData?.recovery?.[0]?.recovery_score;
  const sleep = whoopData?.sleep?.[0]?.sleep_performance_percentage;
  const cyc = whoopData?.cycles?.[0] as Record<string, unknown> | undefined;
  const strain = (cyc?.strain_score ?? cyc?.day_strain) as number | undefined;

  const rings: CoachRing[] = [];
  if (typeof rec === 'number' && rec > 0) rings.push({ label: 'Recovery', value: rec, max: 100, color: recoveryColor(rec), display: `${Math.round(rec)}%` });
  if (typeof sleep === 'number' && sleep > 0) rings.push({ label: 'Sleep', value: sleep, max: 100, color: VIZ_COLORS[2], display: `${Math.round(sleep)}%` });
  if (typeof strain === 'number' && strain > 0) rings.push({ label: 'Strain', value: strain, max: 21, color: VIZ_COLORS[1], display: strain.toFixed(1) });
  if (!rings.length) return undefined;

  return {
    kind: 'ring',
    title: 'Recovery Today',
    subtitle: 'From WHOOP',
    valueLabel: '',
    data: [],
    rings,
    centerValue: typeof rec === 'number' ? `${Math.round(rec)}%` : undefined,
    centerLabel: 'recovery',
  };
}

// Macros → a composition donut (protein / carbs / fat) with total kcal center.
function buildMacroDonut(foodScans: FoodScan[]): CoachChart | undefined {
  if (!foodScans.length) return undefined;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const recent = foodScans.filter((s) => new Date(s.scan_date) >= cutoff);
  if (!recent.length) return undefined;

  const totals = recent.reduce(
    (acc, s) => ({
      protein: acc.protein + (Number(s.total_protein) || 0),
      carbs: acc.carbs + (Number(s.total_carbs) || 0),
      fat: acc.fat + (Number(s.total_fat) || 0),
    }),
    { protein: 0, carbs: 0, fat: 0 },
  );
  const data = [
    { label: 'Protein', value: Math.round(totals.protein) },
    { label: 'Carbs', value: Math.round(totals.carbs) },
    { label: 'Fat', value: Math.round(totals.fat) },
  ].filter((d) => d.value > 0);
  if (data.length < 2) return undefined;

  const kcal = Math.round(totals.protein * 4 + totals.carbs * 4 + totals.fat * 9);
  return {
    kind: 'donut',
    title: 'Macro Split',
    subtitle: 'Last 7 days',
    valueLabel: 'g',
    data,
    centerValue: kcal >= 1000 ? `${(kcal / 1000).toFixed(1)}k` : `${kcal}`,
    centerLabel: 'kcal',
  };
}

// Find a lift that's actually plateaued (top weight hasn't set a new peak in
// its recent sessions) so a "which exercises am I plateauing on?" question can
// show a RELEVANT trend, not a generic volume bar. Returns the most-logged such
// lift's name.
function findPlateauedExercise(workouts: WorkoutWithExercises[]): string | null {
  const byEx: Record<string, Map<string, number>> = {};
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      const wt = Number(ex.weight) || 0;
      if (wt <= 0) continue;
      const m = (byEx[ex.name] ||= new Map<string, number>());
      m.set(w.date, Math.max(m.get(w.date) || 0, wt));
    }
  }
  let best: { name: string; sessions: number } | null = null;
  for (const [name, perDate] of Object.entries(byEx)) {
    if (perDate.size < 3) continue;
    const series = [...perDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => e[1]);
    const last = series[series.length - 1];
    const priorMax = Math.max(...series.slice(0, -1));
    if (last <= priorMax && (!best || perDate.size > best.sessions)) best = { name, sessions: perDate.size };
  }
  return best?.name || null;
}

function buildCoachChart(
  text: string,
  workouts: WorkoutWithExercises[],
  foodScans: FoodScan[],
  recentRuns: SavedRun[],
  whoopData: WhoopAllData | null,
  unit: string,
): CoachChart | undefined {
  const explicit = CHART_REQUEST_RE.test(text);
  if (!explicit && !CHART_AUTO_RE.test(text)) return undefined;

  // 1. A specific exercise the user named → its progression line. This wins
  //    over everything so "plot my bench" is never hijacked by a ring.
  const exChart = buildExerciseVolumeChart(workouts, text, unit);
  if (exChart) return exChart;

  // 2. Nutrition composition → donut.
  if (/\b(macro|macros|protein|carb|fat|nutrition|diet)\b/i.test(text)) {
    return buildMacroDonut(foodScans) || buildNutritionChart(foodScans, text);
  }
  // 3. Running → run chart.
  if (/\b(run|running|pace|mileage|distance|cardio)\b/i.test(text)) {
    return buildRunChart(recentRuns, text);
  }
  // 4. Volume / training-load trend → bars (an explicit "plot my volume").
  if (/\b(volume|tonnage|training load|sets|workload|month|monthly|per (?:day|session)|logged)\b/i.test(text)) {
    return buildLoggedWorkoutVolumeChart(workouts, unit) || buildVolumeChart(workouts, text);
  }
  // 5. Recovery / readiness → rings (only when genuinely about recovery, and
  //    only if there's WHOOP data — otherwise fall through).
  if (/\b(recovery|recovered|readiness|ready to train|sleep|strain|hrv|whoop|fatigue|rest day)\b/i.test(text)) {
    const ring = buildRecoveryRingChart(whoopData);
    if (ring) return ring;
  }
  // 6. Weekly overview → rings.
  if (/\b(this week|weekly|overview|summary|how am i|how'?s my (?:week|training|progress)|consistency|on track|balance)\b/i.test(text)) {
    return buildWeeklyRingChart(workouts, whoopData) || buildVolumeChart(workouts, text);
  }
  if (/\b(food|calorie)\b/i.test(text)) {
    return buildNutritionChart(foodScans, text);
  }
  if (/\b(muscle)\b/i.test(text)) {
    return buildVolumeChart(workouts, text);
  }
  // 7. Plateau / stuck (no specific lift named) → show a genuinely plateaued
  //    lift's trend, so the chart matches the answer instead of generic volume.
  if (/\b(plateau|plateaus|plateauing|stuck|stall|stalling|not improving|no progress)\b/i.test(text)) {
    const p = findPlateauedExercise(workouts);
    if (p) return buildExerciseVolumeChart(workouts, p, unit);
  }

  // No specific, relevant chart mapped. Only fall back to a generic volume
  // trend when the user EXPLICITLY asked to "plot/chart/graph" — never auto-
  // attach an unrelated volume chart to an analytical question (e.g. "which
  // exercises am I plateauing on"), which just reads as noise under the answer.
  if (explicit) {
    return buildLoggedWorkoutVolumeChart(workouts, unit)
      || buildVolumeChart(workouts, text)
      || buildNutritionChart(foodScans, text)
      || buildRunChart(recentRuns, text);
  }
  return undefined;
}

function buildSuggestedCoachChart(
  text: string,
  workouts: WorkoutWithExercises[],
  foodScans: FoodScan[],
  recentRuns: SavedRun[],
  unit: string,
): CoachChart | undefined {
  if (/\b(food|nutrition|macro|protein|carb|fat|calorie|diet)\b/i.test(text)) {
    return buildNutritionChart(foodScans, text);
  }
  if (/\b(run|running|pace|mileage|distance|cardio)\b/i.test(text)) {
    return buildRunChart(recentRuns, text);
  }
  return buildExerciseVolumeChart(workouts, text, unit)
    || (/\b(volume|workout|session|log|logged|progress|trend|improv)/i.test(text)
      ? buildLoggedWorkoutVolumeChart(workouts, unit) || buildVolumeChart(workouts, text)
      : undefined);
}

// Deterministic one-line caption for a chart — used when the model call fails
// (rate-limit) so a "plot X" request still shows the chart with a real read of
// the trend instead of an error.
function chartCaption(chart: CoachChart): string {
  const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`);
  if ((chart.kind === 'line' || chart.kind === 'bar') && chart.data.length >= 2) {
    const first = chart.data[0].value;
    const last = chart.data[chart.data.length - 1].value;
    const arrow = last > first ? '📈' : last < first ? '📉' : '➡️';
    return `**${chart.title}**: ${fmt(first)} → ${fmt(last)} ${chart.valueLabel} ${arrow}`;
  }
  if (chart.kind === 'ring' && chart.centerValue) {
    return `Here's your **${chart.title}** — ${chart.centerValue} ${chart.centerLabel ?? ''}`.trim() + '.';
  }
  return `Here's your **${chart.title}**.`;
}

// Matches src/pages/Log.tsx's freeform-workout default (line ~222) — a
// workout logged through chat has no plan/title of its own, so it should
// get the same generic time-of-day name a freeform Log-page workout would,
// not the exercise's own name (which is what workout.title ended up as
// before this fix, e.g. a "Hammer Curl" workout literally titled
// "Hammer Curl" — confirmed live in the workouts table).
function defaultWorkoutTitle(): string {
  return new Date().getHours() < 12 ? 'Morning Workout' : 'Evening Workout';
}

/* ── Simple markdown → React (bold, bullets, newlines) ─────────────── */
interface ExRow { name: string; sets: string; reps: string; weight?: string; unit?: string }

// **bold** → <strong>, everything else plain.
function renderInline(line: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let rest = line;
  let key = 0;
  while (rest.length) {
    const m = rest.match(/\*\*(.+?)\*\*/);
    if (!m || m.index === undefined) { parts.push(rest); break; }
    if (m.index > 0) parts.push(rest.slice(0, m.index));
    parts.push(<strong key={`${keyBase}-${key++}`}>{m[1]}</strong>);
    rest = rest.slice(m.index + m[0].length);
  }
  return parts;
}

// Detect a workout-prescription line ("· Bench Press: 3×8 @ 80lbs", "Squat: 4
// sets of 5 reps at 100kg") so it can render as a clean row instead of dense
// prose. Requires a leading bullet or a "Name:" prefix to avoid eating normal
// sentences that happen to contain numbers.
function parseExerciseLine(line: string): ExRow | null {
  const hadBullet = /^\s*[-*•·]\s+/.test(line);
  const s = line.replace(/^\s*[-*•·]\s*/, '').replace(/\*\*/g, '').trim();
  if (!s) return null;
  const hasColon = /^[^:]{1,40}:\s*\S/.test(s);
  if (!hadBullet && !hasColon) return null;

  const sr = s.match(/(\d+)\s*(?:sets?|s)?\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?)/i)
    || s.match(/(\d+)\s*sets?\s+(?:of\s+)?(\d+(?:\s*[-–]\s*\d+)?)\s*reps?/i);
  if (!sr || sr.index === undefined) return null;

  const wm = s.match(/(?:@|at)\s*([\d.]+)\s*(kg|lbs?)\b/i) || s.match(/\b([\d.]+)\s*(kg|lbs?)\b/i);
  // The exercise name is the label before the colon ("Squat: aim for 3×5" →
  // "Squat"); fall back to the text before the numbers for bullet-only lines.
  let name = hasColon ? s.slice(0, s.indexOf(':')).trim() : s.slice(0, sr.index).replace(/[:\-–—]\s*$/, '').trim();
  if (!name) name = s.slice(0, sr.index).replace(/[:\-–—]\s*$/, '').trim();
  if (!name || name.length > 34 || /^\d/.test(name)) return null;

  return {
    name,
    sets: sr[1],
    reps: sr[2].replace(/\s+/g, ''),
    weight: wm ? wm[1] : undefined,
    unit: wm ? (/^lb/i.test(wm[2]) ? 'lb' : 'kg') : undefined,
  };
}

interface VolumeRow {
  muscle: string;
  sets: number;
  status?: 'within' | 'below' | 'above';
  min?: number;
  max?: number;
}

// Detect a weekly-volume line: "Legs: 13 sets (within the recommended 12–20
// sets/wk)". These read terribly as prose, so they get a compact range card.
// Guard against prescription lines (those carry reps / × / @ and belong to the
// exercise-card path).
function parseVolumeLine(line: string): VolumeRow | null {
  const s = line.replace(/^\s*[-*•·]\s*/, '').replace(/\*\*/g, '').trim();
  if (!s) return null;
  if (/\breps?\b/i.test(s) || /[x×]\s*\d/i.test(s) || /@/.test(s)) return null;

  const m = s.match(/^([A-Za-z][A-Za-z /&-]{1,22}):\s*(\d+)\s*sets?\b/i);
  if (!m) return null;
  const muscle = m[1].trim();
  const sets = parseInt(m[2], 10);

  const rangeM = s.match(/(\d+)\s*[-–]\s*(\d+)\s*sets/i);
  const min = rangeM ? parseInt(rangeM[1], 10) : undefined;
  const max = rangeM ? parseInt(rangeM[2], 10) : undefined;

  const statusM = s.match(/\b(within|below|under|above|over)\b/i);
  let status: VolumeRow['status'];
  if (statusM) {
    const w = statusM[1].toLowerCase();
    status = w === 'below' || w === 'under' ? 'below' : w === 'above' || w === 'over' ? 'above' : 'within';
  } else if (min != null && max != null) {
    status = sets < min ? 'below' : sets > max ? 'above' : 'within';
  }
  return { muscle, sets, status, min, max };
}

const VOLUME_STATUS_COLOR: Record<NonNullable<VolumeRow['status']>, string> = {
  within: '#C8FF00',
  below: '#fbbf24',
  above: '#38bdf8',
};

const VolumeBlock: React.FC<{ rows: VolumeRow[] }> = ({ rows }) => (
  <div
    className="my-2 overflow-hidden"
    style={{ borderRadius: 14, background: 'var(--bg-base)', border: '1px solid var(--border)' }}
  >
    {rows.map((r, i) => {
      const color = r.status ? VOLUME_STATUS_COLOR[r.status] : 'var(--text-secondary)';
      const domainMax = r.max != null ? Math.max(r.max * 1.25, r.sets * 1.1) : r.sets * 1.2;
      const pct = (v: number) => Math.max(0, Math.min(100, (v / domainMax) * 100));
      return (
        <div key={i} style={{ padding: '10px 13px', borderTop: i ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
          <div className="flex items-center justify-between mb-1.5 gap-3">
            <span className="text-[12.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{r.muscle}</span>
            <span className="shrink-0 text-[12.5px] font-bold tabular-nums" style={{ color }}>
              {r.sets}<span className="text-[10px] font-medium ml-1" style={{ color: 'var(--text-muted)' }}>sets</span>
            </span>
          </div>
          <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}>
            {r.min != null && r.max != null && (
              <div
                style={{ position: 'absolute', top: 0, bottom: 0, left: `${pct(r.min)}%`, width: `${pct(r.max) - pct(r.min)}%`, background: 'rgba(200,255,0,0.16)', borderRadius: 999 }}
              />
            )}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${pct(r.sets)}%`, background: color, opacity: 0.5, borderRadius: 999 }} />
            <div style={{ position: 'absolute', top: -1, height: 8, width: 3, left: `calc(${pct(r.sets)}% - 1.5px)`, background: color, borderRadius: 2 }} />
          </div>
          {r.min != null && r.max != null && (
            <p className="mt-1 text-[9.5px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
              target {r.min}–{r.max}{r.status && r.status !== 'within' ? ` · ${r.status}` : ''}
            </p>
          )}
        </div>
      );
    })}
  </div>
);

type WeightMap = Record<string, { weight: number; unit: string }>;

// One exercise in the logger's visual language. When the move is weighted, both
// weight + reps cells fill the card; when the coach gave no weight we fill it
// from the user's last logged weight for that lift ("· last"). Bodyweight moves
// (no weight anywhere) collapse to a compact single row so there's no big empty
// box.
// Tiny inline trend line (zero-dependency SVG) for a lift's recent history —
// green if the latest beats the first, red if it's dropped.
const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length < 3) return null;
  const w = 44;
  const h = 15;
  const pad = 1.5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((v - min) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const color = values[values.length - 1] >= values[0] ? '#C8FF00' : '#f87171';
  return (
    <svg width={w} height={h} className="shrink-0" style={{ opacity: 0.85 }} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const ExercisePlanCard: React.FC<{ row: ExRow; index?: number; done?: boolean; lastWeight?: { weight: number; unit: string }; spark?: number[] }> = ({ row, index, done, lastWeight, spark }) => {
  const weightVal = row.weight ?? (lastWeight ? String(lastWeight.weight) : undefined);
  const unit = (row.unit ?? lastWeight?.unit ?? 'lb').toUpperCase();
  const fromHistory = !row.weight && !!lastWeight;
  const showSpark = !done && spark && spark.length >= 3;

  const IndexPill = (
    <span
      className="rounded-lg px-2 py-[3px] text-[10px] font-bold tracking-[0.14em] uppercase shrink-0 tabular-nums"
      style={done
        ? { border: '1px solid rgba(200,255,0,0.28)', color: 'var(--accent)', background: 'transparent' }
        : { background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
    >
      {done ? 'Logged' : String(index ?? 1).padStart(2, '0')}
    </span>
  );

  // Bodyweight → compact single row (name left, big reps right).
  if (!weightVal) {
    return (
      <div className="relative overflow-hidden rounded-2xl border" style={{ background: 'var(--bg-base)', borderColor: done ? 'rgba(200,255,0,0.16)' : 'var(--border)' }}>
        <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--accent)', opacity: done ? 1 : 0.5 }} />
        <div className="flex items-center gap-3 px-4 py-3 pl-5">
          {IndexPill}
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{row.name}</p>
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase mt-0.5" style={{ color: 'var(--text-muted)' }}>{row.sets} sets · bodyweight</p>
          </div>
          {showSpark && <Sparkline values={spark!} />}
          <div className="flex flex-col items-end shrink-0">
            <span className="font-victory tabular-nums text-[28px] leading-none font-black" style={{ color: 'var(--text-primary)' }}>{row.reps}</span>
            <span className="mt-1 text-[9px] font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--text-secondary)' }}>reps</span>
          </div>
        </div>
      </div>
    );
  }

  // Weighted → two cells fill the card.
  return (
    <div className="relative overflow-hidden rounded-2xl border" style={{ background: 'var(--bg-base)', borderColor: done ? 'rgba(200,255,0,0.16)' : 'var(--border)' }}>
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--accent)', opacity: done ? 1 : 0.5 }} />
      <div className="flex items-center justify-between px-4 pt-2.5 pb-2 pl-5 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {IndexPill}
          <span className="text-[14px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>{row.name}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {showSpark && <Sparkline values={spark!} />}
          {done
            ? <Check className="w-4 h-4 shrink-0" style={{ color: 'var(--accent)' }} />
            : <span className="text-[10px] font-semibold tracking-[0.08em] uppercase tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>{row.sets} sets</span>}
        </div>
      </div>
      <div className="flex items-stretch border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <div className="flex-1 flex flex-col items-center justify-center py-2.5" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
          <span className="font-victory tabular-nums text-[26px] leading-none font-black" style={{ color: 'var(--text-primary)' }}>{weightVal}</span>
          <span className="mt-1.5 text-[10px] font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--text-secondary)' }}>
            {unit}{fromHistory && <span style={{ color: 'var(--text-muted)', letterSpacing: 0 }}> · last</span>}
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center py-2.5">
          <span className="font-victory tabular-nums text-[26px] leading-none font-black" style={{ color: 'var(--text-primary)' }}>{row.reps}</span>
          <span className="mt-1.5 text-[10px] font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--text-secondary)' }}>reps</span>
        </div>
      </div>
    </div>
  );
};

const ExercisePlanBlock: React.FC<{ rows: ExRow[]; weights?: WeightMap; sparks?: Record<string, number[]> }> = ({ rows, weights, sparks }) => (
  <div className="my-2 space-y-2">
    {rows.map((r, i) => (
      <ExercisePlanCard key={i} row={r} index={i + 1} lastWeight={weights?.[r.name.toLowerCase()]} spark={sparks?.[r.name.toLowerCase()]} />
    ))}
  </div>
);

// A logged body-weight / check-in shown as a "done" card in the same visual
// language as the set card — instead of a thin green text line.
const StatConfirmCard: React.FC<{ stat: LoggedStat }> = ({ stat }) => {
  const done = stat.kind === 'weight' || stat.good !== false;
  const accent = done ? 'var(--accent)' : 'var(--text-muted)';
  return (
    <div
      className="relative overflow-hidden rounded-2xl border"
      style={{ background: 'var(--bg-base)', borderColor: done ? 'rgba(200,255,0,0.16)' : 'var(--border)' }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      <div className="flex items-center gap-3 px-4 py-3 pl-5">
        <span
          className="rounded-lg px-2 py-[3px] text-[10px] font-bold tracking-[0.14em] uppercase shrink-0"
          style={{ border: `1px solid ${done ? 'rgba(200,255,0,0.28)' : 'var(--border)'}`, color: accent }}
        >
          Logged
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>{stat.label}</p>
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase mt-0.5" style={{ color: 'var(--text-muted)' }}>{stat.sub}</p>
        </div>
        {stat.kind === 'weight' ? (
          <div className="flex flex-col items-end shrink-0">
            <span className="font-victory tabular-nums text-[28px] leading-none font-black" style={{ color: 'var(--text-primary)' }}>{stat.value}</span>
            <span className="mt-1 text-[9px] font-bold tracking-[0.16em] uppercase" style={{ color: 'var(--text-secondary)' }}>{(stat.unit || '').toUpperCase()}</span>
          </div>
        ) : (
          <span className="shrink-0 leading-none" style={{ fontSize: 26 }}>{stat.value}</span>
        )}
      </div>
    </div>
  );
};

// Render coach text, promoting consecutive exercise prescriptions into a tidy
// plan block and leaving prose as-is.
function renderText(raw: string, weights?: WeightMap, sparks?: Record<string, number[]>): React.ReactNode[] {
  const lines = raw.split('\n');
  const out: React.ReactNode[] = [];
  let exGroup: ExRow[] = [];
  let volGroup: VolumeRow[] = [];
  let txtGroup: string[] = [];
  let bk = 0;

  const flushTxt = () => {
    if (!txtGroup.length) return;
    const arr = txtGroup;
    const k = bk++;
    out.push(
      <p key={`t${k}`} style={{ margin: 0 }}>
        {arr.map((l, i) => (
          <React.Fragment key={i}>
            {renderInline(l, `t${k}-${i}`)}
            {i < arr.length - 1 && <br />}
          </React.Fragment>
        ))}
      </p>,
    );
    txtGroup = [];
  };
  const flushEx = () => {
    if (!exGroup.length) return;
    out.push(<ExercisePlanBlock key={`e${bk++}`} rows={exGroup} weights={weights} sparks={sparks} />);
    exGroup = [];
  };
  const flushVol = () => {
    if (!volGroup.length) return;
    out.push(<VolumeBlock key={`v${bk++}`} rows={volGroup} />);
    volGroup = [];
  };

  for (const line of lines) {
    const ex = parseExerciseLine(line);
    if (ex) { flushTxt(); flushVol(); exGroup.push(ex); continue; }
    const vol = parseVolumeLine(line);
    if (vol) { flushTxt(); flushEx(); volGroup.push(vol); continue; }
    flushEx();
    flushVol();
    txtGroup.push(line);
  }
  flushEx();
  flushVol();
  flushTxt();
  return out;
}

/* ── Context-aware suggestions ──────────────────────────────────────── */
function getSuggestions(
  workouts: WorkoutWithExercises[],
  foodScans: FoodScan[],
  recentRuns: SavedRun[],
): string[] {
  const trainedToday = workouts.some((w) => calDaysSince(w.date) === 0);
  const hasFood = foodScans.length > 0;
  const hasRuns = recentRuns.length > 0;

  if (trainedToday) {
    return [
      hasFood ? "How are my macros looking today?" : 'My weight today is 78 kg',
      'I stayed clean today',
      'Any recovery tips for what I trained?',
      hasRuns ? 'How is my running pace improving?' : 'What should I focus on next session?',
    ];
  }
  if (workouts.length > 3) {
    return [
      'Log my weight as 75 kg',
      hasFood ? "Am I hitting my protein goals?" : 'I stayed strong today',
      'Which exercises am I plateauing on?',
      hasRuns ? "How's my weekly mileage?" : "How's my weekly volume looking?",
    ];
  }
  return [
    'My weight today is 80 kg',
    'I stayed clean today',
    'What should I train today?',
    hasRuns ? 'Analyse my recent runs' : 'Give me a beginner plan.',
  ];
}

function mostFrequentExerciseName(workouts: WorkoutWithExercises[]): string | null {
  const counts = new Map<string, { name: string; n: number }>();
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      const key = ex.name.toLowerCase();
      const cur = counts.get(key) || { name: ex.name, n: 0 };
      cur.n += 1;
      counts.set(key, cur);
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.n - a.n)[0]?.name || null;
}

// Follow-up question chips shown under an ongoing chat. They react to the topic
// of the last exchange, then fall back to broadly useful prompts — always
// grounded in what data the user actually has.
function buildFollowUps(
  messages: Message[],
  workouts: WorkoutWithExercises[],
  foodScans: FoodScan[],
  recentRuns: SavedRun[],
  whoopData: WhoopAllData | null,
): string[] {
  if (!messages.length) return [];
  const lastModel = [...messages].reverse().find((m) => m.role === 'model')?.text?.toLowerCase() || '';
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.text?.toLowerCase() || '';
  const ctx = `${lastModel} ${lastUser}`;
  const top = mostFrequentExerciseName(workouts);
  const hasFood = foodScans.length > 0;
  const hasRuns = recentRuns.length > 0;
  const hasWhoop = !!whoopData;

  const out: string[] = [];
  const push = (q: string) => { if (q && !out.includes(q)) out.push(q); };

  // Topic-aware, based on what the last messages were about
  if (/\b(run|running|pace|mile|distance|cardio)\b/.test(ctx) && hasRuns) {
    push('Plot my run pace'); push('How do I run faster?');
  }
  if (/\b(protein|carb|fat|calorie|macro|nutrition|food|eat|diet)\b/.test(ctx) && hasFood) {
    push('Plot my macros this week'); push('Am I eating enough protein?');
  }
  if (/\b(recovery|sleep|strain|hrv|readiness|whoop|rest)\b/.test(ctx) && hasWhoop) {
    push('Should I train hard today?'); push("How's my recovery trending?");
  }
  if (top && ctx.includes(top.toLowerCase())) {
    push(`Plot my ${top} progress`); push(`Plot my ${top} 1RM`);
  }

  // General fill — the usual next things a lifter wants to know
  push('How am I doing this week?');
  push('What should I train today?');
  if (top) push(`How's my ${top} progressing?`);
  push('Which muscle am I neglecting?');
  if (hasFood) push("How's my macro split?");
  if (hasRuns) push("How's my running trending?");
  if (hasWhoop) push("How's my recovery?");

  return out.slice(0, 6);
}

export interface GoalProgress { current: number; target: number; pct: number; unit: string; }

function bestWeightForExercise(workouts: WorkoutWithExercises[], prs: LocalPersonalRecord[], name: string): number {
  const low = name.toLowerCase();
  let best = 0;
  const pr = prs.find((p) => p.exercise_name.toLowerCase() === low);
  if (pr?.best_weight) best = Number(pr.best_weight) || 0;
  for (const w of workouts) for (const ex of w.exercises || []) {
    if (ex.name.toLowerCase() === low) best = Math.max(best, Number(ex.weight) || 0);
  }
  return best;
}

function bestE1rmForExercise(workouts: WorkoutWithExercises[], name: string): number {
  const low = name.toLowerCase();
  let best = 0;
  for (const w of workouts) for (const ex of w.exercises || []) {
    if (ex.name.toLowerCase() !== low) continue;
    const weight = Number(ex.weight) || 0;
    const reps = Number(ex.reps) || 0;
    best = Math.max(best, reps > 0 ? weight * (1 + reps / 30) : weight);
  }
  return best;
}

// Turn a structured goal into a live progress reading from the user's own logged
// data. Only "more is better" goals get a bar — bodyweight is skipped because we
// can't tell loss from gain from the target alone.
function computeGoalProgress(
  goal: CoachGoal,
  workouts: WorkoutWithExercises[],
  prs: LocalPersonalRecord[],
  recentRuns: SavedRun[],
  profile: any,
): GoalProgress | null {
  if (goal.target == null || goal.target <= 0) return null;
  const unit = goal.unit || profile?.unit_preference || '';
  let current = 0;
  if (goal.metric === 'runs') current = recentRuns.length;
  else if (goal.metric === 'sessions') current = workouts.filter((w) => calDaysSince(w.date) <= 6).length;
  else if (goal.metric === 'bodyweight') return null;
  else if (goal.exercise) {
    current = goal.metric === 'e1rm'
      ? bestE1rmForExercise(workouts, goal.exercise)
      : bestWeightForExercise(workouts, prs, goal.exercise);
  } else return null;

  if (!current) return null;
  const pct = Math.max(0, Math.min(100, Math.round((current / goal.target) * 100)));
  return { current: Math.round(current * 10) / 10, target: goal.target, pct, unit };
}

function sessionDateLabel(dateStr: string): string {
  const today = format(new Date(), 'yyyy-MM-dd');
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yest = format(y, 'yyyy-MM-dd');
  if (dateStr === today) return 'Today';
  if (dateStr === yest) return 'Yesterday';
  try { return format(new Date(`${dateStr}T00:00:00`), 'EEE, MMM d'); } catch { return dateStr; }
}

/* ── Execute a Gemini function call against Supabase ───────────────── */
async function executeTool(
  userId: string,
  name: string,
  args: Record<string, unknown>,
  navigate: ReturnType<typeof useNavigate>,
): Promise<ToolResult> {
  const today = format(new Date(), 'yyyy-MM-dd');

  if (name === 'log_weight') {
    const weight = Number(args.weight);
    const unit = (args.unit as 'kg' | 'lbs') || 'kg';
    const date = (args.date as string) || today;
    await logBodyWeight(userId, { date, weight, unit });
    return {
      success: true,
      message: `${weight} ${unit} logged${date === today ? ' for today' : ` for ${date}`}`,
      loggedStat: { kind: 'weight', value: String(weight), unit, label: 'Body weight', sub: date === today ? 'Logged today' : `Logged for ${date}` },
    };
  }

  if (name === 'log_dopamine') {
    const status = args.status as 'success' | 'relapse';
    const urge = Number(args.urge ?? 3);
    const note = (args.note as string) || '';
    const date = (args.date as string) || today;
    await upsertDopamineEntry(userId, { date, status, urge, note: note || undefined });
    const label = status === 'success' ? 'Stayed strong' : 'Check-in logged';
    return {
      success: true,
      message: `${label}${date === today ? ' for today' : ` for ${date}`}`,
      loggedStat: { kind: 'checkin', value: status === 'success' ? '💪' : '📝', label, sub: date === today ? 'Daily check-in · today' : `Check-in · ${date}`, good: status === 'success' },
    };
  }

  if (name === 'log_exercise') {
    const rawName = (args.exercise_name as string) || '';
    const sets = Math.max(1, Number(args.sets) || 1);
    const reps = Math.max(1, Number(args.reps) || 1);
    const weight = Math.max(0, Math.min(9999, Number(args.weight ?? 0)));
    const unit = (args.unit as 'kg' | 'lbs') || 'kg';
    const date = (args.date as string) || today;

    // Fuzzy-search the library (handles remaining typos the AI missed)
    const matches = await searchExerciseLibrary(userId, rawName);

    if (matches.length === 0) {
      // Nothing close — give broader suggestions from first word
      const fallback = await searchExerciseLibrary(userId, rawName.split(' ')[0] || rawName);
      return {
        success: false,
        message: `"${rawName}" not found in your exercise library.`,
        suggestions: fallback.slice(0, 6).map((e: LocalExerciseLibraryItem) => e.name),
      };
    }

    const best = matches[0];
    const completedSets = Array.from({ length: sets }, () => ({ reps, weight, unit }));
    await saveWorkout(userId, {
      title: defaultWorkoutTitle(),
      date,
      duration_minutes: 0,
      exercises: [{ name: best.name, muscle_group: best.muscle_group, exercise_db_id: best.id || null, completed_sets: completedSets }],
    });

    window.dispatchEvent(new CustomEvent('athlix:workout-logged'));
    return {
      success: true,
      message: `${best.name} logged${date === today ? ' for today' : ` for ${date}`}`,
      loggedExercise: { name: best.name, sets, reps, weight: weight > 0 ? weight : undefined, unit },
    };
  }

  if (name === 'show_exercise_form') {
    return { success: true, message: '', showForm: true, formInitialName: (args.exercise_name as string) || '' };
  }

  if (name === 'navigate_to_log') {
    navigate('/log');
    return { success: true, message: 'Opening workout logger…' };
  }

  if (name === 'navigate_to_food') {
    navigate('/food/history');
    return { success: true, message: 'Opening food scanner…' };
  }

  if (name === 'navigate_to_run') {
    navigate('/run');
    return { success: true, message: 'Starting run tracker…' };
  }

  if (name === 'set_goal') {
    const text = (args.text as string) || '';
    if (!text.trim()) return { success: false, message: 'No goal to save.' };
    addCoachGoal(userId, {
      text,
      metric: args.metric as CoachGoal['metric'],
      exercise: (args.exercise as string) || undefined,
      target: args.target != null ? Number(args.target) : undefined,
      unit: (args.unit as string) || undefined,
    });
    return { success: true, message: `Goal saved: ${text}` };
  }

  if (name === 'remember') {
    const fact = (args.fact as string) || '';
    if (!fact.trim()) return { success: false, message: 'Nothing to remember.' };
    addCoachFact(userId, fact);
    return { success: true, message: `Got it — I'll remember that.` };
  }

  if (name === 'complete_goal') {
    const text = (args.text as string) || '';
    completeCoachGoal(userId, text);
    return { success: true, message: `Nice work — goal marked complete.` };
  }

  if (name === 'create_template') {
    const title = ((args.title as string) || 'Coach Plan').trim();
    const rawExercises = Array.isArray(args.exercises) ? args.exercises : [];
    if (!rawExercises.length) return { success: false, message: 'No exercises to save.' };

    const exercises = rawExercises.slice(0, 12).map((ex: any, i: number) => ({
      name: String(ex.name || '').trim() || `Exercise ${i + 1}`,
      muscle_group: (ex.muscle_group as string) || null,
      default_sets: Math.max(1, Math.min(20, Number(ex.sets) || 3)),
      default_reps: Math.max(1, Math.min(100, Number(ex.reps) || 10)),
      default_weight: Math.max(0, Math.min(9999, Number(ex.weight) || 0)),
      exercise_db_id: null,
      order_index: i,
    }));

    const templateId = await saveTemplate(userId, { title, exercises });
    window.dispatchEvent(new CustomEvent('athlix:template-saved'));
    return {
      success: true,
      message: `Saved **${title}** — ${exercises.length} exercise${exercises.length === 1 ? '' : 's'}.`,
      templateAction: { id: String(templateId || ''), title },
    };
  }

  if (name === 'show_nutrition_summary') {
    return { success: true, message: '' };
  }

  if (name === 'show_run_summary') {
    return { success: true, message: '' };
  }

  return { success: false, message: `Unknown tool: ${name}` };
}

/* ── API Key first-launch setup modal ───────────────────────────── */
const GEMINI_DOCS_URL = 'https://aistudio.google.com/app/apikey';

const ApiKeySetupModal: React.FC<{ onDone: () => void; onSave: (apiKey: string, model: string) => Promise<{ success: boolean; error?: string }> }> = ({ onDone, onSave }) => {
  const [key, setKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showWhy, setShowWhy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 2) setTimeout(() => inputRef.current?.focus(), 80);
  }, [step]);

  const validate = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setError('Paste your API key first.'); return; }
    setValidating(true);
    setError('');
    const result = await onSave(trimmed, DEFAULT_MODEL);
    setValidating(false);
    if (!result.success) {
      setError(result.error || 'Invalid key — check and try again.');
      return;
    }
    setStep(3);
    setTimeout(onDone, 1200);
  };

  return (
    <div
      className="flex flex-col h-full p-6 gap-5"
      style={{ fontFamily: 'var(--font-body, Inter, sans-serif)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="ai-aurora-static flex items-center justify-center rounded-lg"
          style={{ width: 36, height: 36, border: '1.5px solid transparent' }}>
          <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-[15px] font-bold text-white">Set up AI Coach</p>
          <p className="text-[12px] text-white/40">Free · 1 min setup</p>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 flex flex-col gap-4">

        {/* Step 1 */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: step === 1 ? 'var(--bg-elevated)' : 'transparent', border: '1px solid var(--border)' }}
        >
          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: step > 1 ? 'var(--accent)' : 'var(--bg-surface)', color: step > 1 ? '#000' : 'var(--text-secondary)' }}>
            {step > 1 ? <Check className="w-3 h-3" /> : '1'}
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-white/90">Get your free Gemini key</p>
            <p className="text-[12px] text-white/40 mt-0.5">No credit card · Free tier: 1,500 req/day</p>
            {step === 1 && (
              <a
                href={GEMINI_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition-colors"
                style={{ background: 'var(--accent)', color: '#000' }}
                onClick={() => setStep(2)}
              >
                Open Google AI Studio <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {/* Step 2 */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: step === 2 ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${step === 2 ? 'rgba(200,255,0,0.25)' : 'var(--border)'}`,
            opacity: step < 2 ? 0.4 : 1,
          }}
        >
          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: step > 2 ? 'var(--accent)' : 'var(--bg-surface)', color: step > 2 ? '#000' : 'var(--text-secondary)' }}>
            {step > 2 ? <Check className="w-3 h-3" /> : '2'}
          </span>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-white/90">Paste your key</p>
            {step >= 2 && (
              <>
                <input
                  ref={inputRef}
                  type="password"
                  value={key}
                  onChange={(e) => { setKey(e.target.value); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && validate()}
                  placeholder="AIza…"
                  className="mt-2 w-full h-9 rounded-lg px-3 text-[13px] text-white/90 outline-none placeholder:text-white/20"
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}
                />
                {error && <p className="mt-1.5 text-[12px] text-red-400">{error}</p>}
                <button
                  onClick={validate}
                  disabled={validating}
                  className="mt-2 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold disabled:opacity-50 transition-colors"
                  style={{ background: 'var(--accent)', color: '#000' }}
                >
                  {validating ? <><Loader2 className="w-3 h-3 animate-spin" /> Validating…</> : 'Confirm key'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Step 3 */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{
            background: step === 3 ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${step === 3 ? 'rgba(200,255,0,0.4)' : 'var(--border)'}`,
            opacity: step < 3 ? 0.4 : 1,
          }}
        >
          <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold"
            style={{ background: step === 3 ? 'var(--accent)' : 'var(--bg-surface)', color: step === 3 ? '#000' : 'var(--text-secondary)' }}>
            {step === 3 ? <Check className="w-3 h-3" /> : '3'}
          </span>
          <div>
            <p className="text-[13px] font-semibold text-white/90">
              {step === 3 ? '🎉 Ready! Opening coach…' : 'Done — chat opens automatically'}
            </p>
          </div>
        </div>
      </div>

      {/* Why accordion */}
      <div>
        <button
          onClick={() => setShowWhy((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] text-white/30 hover:text-white/50 transition-colors"
        >
          {showWhy ? '▾' : '▸'} Why do I need this?
        </button>
        {showWhy && (
          <p className="mt-2 text-[12px] text-white/40 leading-relaxed">
            Your key is stored securely on our server, tied to your account — it never sits in your
            browser after this step. You can remove it anytime in Settings, or revoke it directly at
            aistudio.google.com.
          </p>
        )}
      </div>
    </div>
  );
};

// "What should I train today?" is the coach's highest-value question and it
// shouldn't ride on the rate-limitable LLM — the deterministic engine already
// computes an explainable plan. Detect the intent and answer from it directly.
function isWhatToTrainIntent(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (t.length > 90) return false; // a long message is a real conversation, not this quick ask
  const trainWord = /\b(train|training|workout|work out|lift|do|exercise|hit|gym)\b/;
  const todayWord = /\b(today|now|this morning|tonight|right now)\b/;
  const askWord = /\b(what|which|should|recommend|suggest|plan|tell me)\b/;
  if (/\bwhat (should i|to|do i) (train|do|lift|workout|hit)\b/.test(t)) return true;
  if (/\b(train|workout|training) (for )?today\b/.test(t)) return true;
  if (/\b(what'?s|whats) (my|the) (plan|workout|training)\b/.test(t)) return true;
  if (/\bwhich muscle/.test(t) && (todayWord.test(t) || askWord.test(t))) return true;
  return askWord.test(t) && trainWord.test(t) && todayWord.test(t);
}

const REC_TIER_WORD: Record<string, string> = { green: 'ready to push', yellow: 'controlled', red: 'recovery-focused', unknown: 'estimated readiness' };

function formatTrainingAnswer(rec: TrainingRecommendation): string {
  const tier = REC_TIER_WORD[rec.readiness_tier] ?? rec.readiness_tier;
  const lines: string[] = [];
  lines.push(`**${rec.title}** — ${rec.intensity}, ${tier}.`);
  if (rec.muscles?.length) lines.push(`\n**Focus:** ${rec.muscles.join(' · ')}`);
  const why = (rec.reasons ?? []).slice(0, 2).map((r) => `• ${r.label}: ${r.detail}`).join('\n');
  if (why) lines.push(`\n${why}`);
  const plan = (rec.exercises ?? []).map((e) => `• ${e.name} — ${e.sets}×${e.reps}`).join('\n');
  if (plan) lines.push(`\n**Suggested work:**\n${plan}`);
  const ins = rec.strain_insight;
  if (ins && ins.blend_weight >= 0.4) {
    lines.push(`\nYour last session cost ${ins.actual_strain} strain vs ~${ins.expected_strain} expected — ${ins.verdict}.`);
  }
  lines.push(`\n_From your readiness, training load, and muscle recovery (${Math.round((rec.confidence ?? 0) * 100)}% confidence). Tap the Train Today card to start it._`);
  return lines.join('\n');
}

/* ── Main AiChat component ─────────────────────────────────────────── */
export const AiChat: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingHandoffText, setPendingHandoffText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [workouts, setWorkouts] = useState<WorkoutWithExercises[]>([]);
  // Every weight the coach reasons about (charts, prompt, plan prefill) is
  // normalised to the user's display unit, so kg-logged sets never surface as lbs.
  const displayUnit: WeightUnit = profile?.unit_preference === 'kg' ? 'kg' : 'lbs';
  const normWorkouts = useMemo(() => normalizeWorkoutUnits(workouts, displayUnit), [workouts, displayUnit]);
  const [prs, setPrs] = useState<LocalPersonalRecord[]>([]);
  const [foodScans, setFoodScans] = useState<FoodScan[]>([]);
  const [recentRuns, setRecentRuns] = useState<SavedRun[]>([]);
  const [whoopData, setWhoopData] = useState<WhoopAllData | null>(null);
  const [skincareStats, setSkincareStats] = useState<{ weekPercent: number; streak: number } | null>(null);
  const [strainCost, setStrainCost] = useState<StrainCostContext | null>(null);
  const [recovery, setRecovery] = useState<RecoveryContext | null>(null);
  const [insights, setInsights] = useState<InsightsContext | null>(null);
  const [memory, setMemory] = useState<CoachMemory>(() => getCoachMemory(null));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { hasKey, model, save: saveAiCoachKey } = useAiCoachKey();
  // Always-current mirror of hasKey. The athlix:open-ai listener is registered
  // once ([] deps) and would otherwise capture hasKey from the first render
  // (null), forcing the setup modal on EVERY reopen even after a key is saved.
  const hasKeyRef = useRef(hasKey);
  useEffect(() => { hasKeyRef.current = hasKey; }, [hasKey]);
  const [streamingText, setStreamingText] = useState('');

  // Load the coach's memory for the signed-in user (local mirror first for an
  // instant paint, then reconcile with the cloud row so it follows across
  // devices), and keep it in sync when a tool writes to the store.
  useEffect(() => {
    const load = () => setMemory(getCoachMemory(user?.id));
    load();
    if (user?.id) syncCoachMemory(user.id).then(setMemory).catch(() => {});
    window.addEventListener('athlix:coach-memory', load);
    return () => window.removeEventListener('athlix:coach-memory', load);
  }, [user?.id]);

  /* ── Chat sessions: resume the active session on mount (a fresh one per
     day), persist messages into it, and keep past days browsable via the
     history menu. AiChat unmounts on every immersive route change, so this
     also restores the conversation when reopening. ───────────────────── */
  const hydratedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || hydratedForUser.current === user.id) return;
    hydratedForUser.current = user.id;
    const active = resolveActiveSession(user.id);
    setActiveSessionId(active.id);
    if (active.messages.length) setMessages(active.messages as unknown as Message[]);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !activeSessionId) return;
    persistActiveMessages(user.id, activeSessionId, messages as unknown as StoredChatMessage[]);
  }, [messages, user?.id, activeSessionId]);

  /* ── Load all data sources once chat opens ───────────────────────── */
  useEffect(() => {
    if (!open || dataReady || !user?.id) return;
    const load = async () => {
      // Pull a full window from the server so charts/trends reflect all the
      // user's data, not just the last handful of sessions.
      const startDate = format(subDays(new Date(), 180), 'yyyy-MM-dd');
      const [workoutRes, prRes, foodRes, whoopRes, strainRes, recoveryRes, insightsRes] = await Promise.allSettled([
        getWorkouts(user.id, { startDate, limit: 500, includeExercises: true }),
        getPersonalRecords(user.id),
        getFoodScans(user.id, 0, 90),
        whoopService.fetchAll('day').catch(() => null),
        getStrainCostContext().catch(() => null),
        getRecoveryContext().catch(() => null),
        getInsightsContext().catch(() => null),
      ]);

      if (workoutRes.status === 'fulfilled') setWorkouts((workoutRes.value as WorkoutWithExercises[]) || []);
      if (prRes.status === 'fulfilled') setPrs((prRes.value as LocalPersonalRecord[]) || []);
      if (foodRes.status === 'fulfilled') setFoodScans((foodRes.value as { scans: FoodScan[] }).scans || []);
      if (whoopRes.status === 'fulfilled' && whoopRes.value) setWhoopData(whoopRes.value as WhoopAllData);
      if (strainRes.status === 'fulfilled') setStrainCost(strainRes.value as StrainCostContext | null);
      if (recoveryRes.status === 'fulfilled') setRecovery(recoveryRes.value as RecoveryContext | null);
      if (insightsRes.status === 'fulfilled') setInsights(insightsRes.value as InsightsContext | null);

      // Runs and skincare are synchronous (localStorage) — always safe
      setRecentRuns(getRuns());
      setSkincareStats(parseSkincareStats());

      setDataReady(true);
    };
    load();
  }, [open, user?.id, dataReady]);

  /* ── Scroll behaviour ─────────────────────────────────────────────── */
  // On open: jump straight to the most recent message (no visible scroll from
  // the top of the conversation).
  useEffect(() => {
    if (open) requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }));
  }, [open]);
  // While open: smoothly follow new messages / streaming.
  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [messages, loading]);

  /* ── Focus input when modal opens ───────────────────────────────── */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 320);
  }, [open]);

  const close = () => setOpen(false);

  const openChat = () => {
    // Read hasKeyRef, not hasKey: this runs from the once-registered
    // athlix:open-ai listener whose closure captured hasKey=null. Only a
    // DEFINITE "no key" (false, not the null loading state) shows setup, so a
    // saved key never re-triggers it on reopen.
    setShowKeySetup(hasKeyRef.current === false);
    setOpen(true);
  };

  // Inject aurora CSS once
  useEffect(() => {
    if (document.getElementById('athlix-ai-aurora-css')) return;
    const el = document.createElement('style');
    el.id = 'athlix-ai-aurora-css';
    el.textContent = AURORA_CSS;
    document.head.appendChild(el);
  }, []);

  // Allow sidebar / other components to open the chat via a custom event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ seedMessages?: Message[]; seedText?: string }>).detail;
      openChat();
      if (detail?.seedMessages?.length) {
        setMessages((prev) => (prev.length ? prev : detail.seedMessages!));
      }
      if (detail?.seedText) {
        setPendingHandoffText(detail.seedText);
      }
    };
    window.addEventListener('athlix:open-ai', handler);
    return () => window.removeEventListener('athlix:open-ai', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cycle through loading phase labels while waiting for Gemini
  useEffect(() => {
    if (!loading) { setLoadingPhase(0); return; }
    const id = setInterval(() => setLoadingPhase((p) => (p + 1) % LOADING_PHASES.length), 2200);
    return () => clearInterval(id);
  }, [loading]);

  /* ── Send message to Gemini via the server proxy, streaming the reply ── */
  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading || !hasKey) return;

      const userMsg: Message = { role: 'user', text };
      const history = [...messages, userMsg];
      setMessages(history);
      setInput('');
      setLoading(true);
      setStreamingText('');
      // Engaging with the coach counts toward the daily streak.
      setMemory(recordCheckIn(user?.id));

      // "What should I train today?" → answer from the deterministic engine, no
      // LLM call, so this key question never hits a token-per-minute rate limit
      // ("coach is busy"). Falls through to the LLM only if the engine has nothing.
      if (isWhatToTrainIntent(text)) {
        try {
          const rec = await getTodayTrainingRecommendation(false);
          if (rec) {
            setMessages((prev) => [...prev, { role: 'model', text: formatTrainingAnswer(rec) }]);
            setLoading(false);
            return;
          }
        } catch { /* engine unavailable — fall through to the LLM below */ }
      }

      // Charts are computed client-side from logged data — they do NOT need the
      // LLM. Declared out here so if the model call rate-limits, the catch can
      // still show the chart (the whole point of a "plot X" request).
      let responseChart: CoachChart | undefined;
      let suggestedChart: CoachChart | undefined;

      try {
        const systemPrompt = buildSystemPrompt(profile, normWorkouts, prs, foodScans, recentRuns, whoopData, skincareStats, 'chat', getCoachMemory(user?.id), strainCost, recovery, insights);
        // Route the chart off the user's CURRENT message only — not the whole
        // recent window — so words from earlier turns (e.g. the coach mentioning
        // "recovery") don't hijack a fresh "plot my volume" request.
        const chartIntentText = text;
        responseChart = buildCoachChart(
          chartIntentText,
          normWorkouts,
          foodScans,
          recentRuns,
          whoopData,
          displayUnit,
        );
        suggestedChart = responseChart ? undefined : buildSuggestedCoachChart(
          chartIntentText,
          normWorkouts,
          foodScans,
          recentRuns,
          displayUnit,
        );

        // Explicit "plot / chart / show me the trend" request → the chart is
        // fully computed from local data, so render it INSTANTLY with a
        // deterministic caption and skip the model entirely: zero tokens, zero
        // latency, never rate-limited. (Analytical questions like "how am I
        // doing" still go to the model with the chart attached.)
        if (responseChart && CHART_REQUEST_RE.test(text)) {
          setStreamingText('');
          setMessages((prev) => [...prev, { role: 'model', text: chartCaption(responseChart!), chart: responseChart }]);
          return;
        }

        const trimmedHistory = history.slice(-MAX_HISTORY);
        const geminiContents = trimmedHistory.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

        const buildBody = (contents: object[], targetModel: string, stream: boolean) => ({
          model: targetModel,
          stream,
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ function_declarations: FUNCTION_DECLARATIONS }],
          generationConfig: {
            temperature: 1,
            maxOutputTokens: 2048,
            // No "thinking" tokens — the coach's answers are short and grounded
            // in the system context, so thinking just burns tokens + latency.
            ...(/^gemini-2\.5/.test(targetModel) && { thinkingConfig: { thinkingBudget: 0 } }),
          },
        });

        const isOverloaded = (status: number, msg: string) =>
          status === 503 || status === 429 && msg.includes('quota') === false ||
          msg.toLowerCase().includes('high demand') ||
          msg.toLowerCase().includes('overloaded') ||
          msg.toLowerCase().includes('try again');

        const FALLBACK_MODEL = 'gemini-2.5-flash';
        const RETRY_DELAYS = [1200, 2500]; // ms between attempts

        // Shared retry/fallback-model policy: given a way to make one
        // attempt, retries transient overloads with backoff and falls back
        // to a lighter model, or throws a special-cased error for quota/
        // invalid-key/no-key. Used by BOTH the initial request and the
        // tool-result follow-up request, so neither leg loses resilience —
        // by the time the follow-up runs, executeTool() has already
        // mutated data (logged a set, etc.), so a bare unretried failure
        // there would show an error even though the action succeeded.
        const fetchWithRetry = async (makeRequest: (targetModel: string) => Promise<Response>): Promise<Response> => {
          for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
            const targetModel = attempt < RETRY_DELAYS.length ? model : FALLBACK_MODEL;
            const res = await makeRequest(targetModel);
            if (res.ok) return res;

            const errBody = await res.clone().json().catch(() => ({}));
            const errMsg: string = errBody?.error?.message || `Request failed (${res.status})`;

            if (res.status === 400 && errBody?.error?.code === 'NO_KEY') {
              throw new Error('INVALID_KEY: No AI provider is available. Set GROQ_API_KEY on the server (recommended), or add a personal Gemini key in Settings.');
            }
            if (res.status === 429 && errMsg.includes('quota')) {
              throw new Error('QUOTA: Your API key\'s project has billing enabled, which sets the free tier limit to 0.\n\nFix: Go to aistudio.google.com/app/apikey → "Create API key in new project" (no billing) → paste the new key in Settings.');
            }
            if (res.status === 400 && errMsg.includes('API_KEY')) {
              throw new Error('INVALID_KEY: Your API key is invalid. Check it in Settings.');
            }
            if (isOverloaded(res.status, errMsg) && attempt < RETRY_DELAYS.length) {
              await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
              continue;
            }
            throw new Error(errMsg);
          }
          throw new Error('All retry attempts failed.');
        };

        const streamWithRetry = (contents: object[]): Promise<Response> =>
          fetchWithRetry((targetModel) => aiCoachFetch('/api/ai-coach/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBody(contents, targetModel, true)),
          }));

        // Non-streaming request through the proxy — used only for the short
        // tool-result follow-up turn, which doesn't need live token rendering.
        const generateOnce = async (contents: object[]): Promise<any> => {
          const res = await fetchWithRetry((targetModel) => aiCoachFetch('/api/ai-coach/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildBody(contents, targetModel, false)),
          }));
          return res.json();
        };

        // Read Gemini's SSE stream, concatenating text deltas live and
        // capturing a function-call part if the model calls a tool instead
        // of replying with text (tool calls arrive as one complete part,
        // not incrementally, so there's nothing to stream for that case).
        const consumeStream = async (
          res: Response,
          onTextDelta: (accumulated: string) => void,
        ): Promise<{ text: string; thought: string; functionCall?: { name: string; args: Record<string, unknown> }; usageTokens: number }> => {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let accumulated = '';
          let accumulatedThought = '';
          let functionCall: { name: string; args: Record<string, unknown> } | undefined;
          let usageTokens = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data:')) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;
              let chunk: any;
              try { chunk = JSON.parse(jsonStr); } catch { continue; }

              if (chunk?.usageMetadata?.totalTokenCount) usageTokens = chunk.usageMetadata.totalTokenCount;

              const parts: Array<{ text?: string; thought?: boolean; functionCall?: { name: string; args: Record<string, unknown> } }> =
                chunk?.candidates?.[0]?.content?.parts || [];
              for (const p of parts) {
                if (p.functionCall) functionCall = p.functionCall;
                if (p.text && p.thought) accumulatedThought += p.text;
                if (p.text && !p.thought) {
                  accumulated += p.text;
                  onTextDelta(accumulated);
                }
              }
            }
          }
          return { text: accumulated, thought: accumulatedThought, functionCall, usageTokens };
        };

        const res = await streamWithRetry(geminiContents);
        const { text: streamedText, thought, functionCall, usageTokens } = await consumeStream(res, setStreamingText);
        trackTokenUsage(usageTokens);

        // ── Function call branch ─────────────────────────────────────────
        if (functionCall && user?.id) {
          const { name: toolName, args: toolArgs } = functionCall;
          let toolResult: ToolResult;
          try {
            toolResult = await executeTool(user.id, toolName, toolArgs, navigate);
          } catch (e: any) {
            toolResult = { success: false, message: e.message || 'Action failed' };
          }
          // Memory-writing tools update the persisted store — reflect it in the UI.
          if (toolName === 'set_goal' || toolName === 'remember' || toolName === 'complete_goal') {
            setMemory(getCoachMemory(user.id));
          }

          if (toolResult.showForm) {
            setStreamingText('');
            setMessages((prev) => [...prev, {
              role: 'model',
              text: toolResult.formInitialName
                ? `Fill in the details for **${toolResult.formInitialName}**:`
                : "Here's a quick form to log your exercise:",
              exerciseForm: true,
              exerciseFormInitialName: toolResult.formInitialName || '',
            }]);
            return;
          }

          const followUpContents = [
            ...geminiContents,
            { role: 'model', parts: [{ functionCall }] },
            { role: 'user', parts: [{ functionResponse: { name: toolName, response: toolResult } }] },
          ];
          const data2 = await generateOnce(followUpContents);
          trackTokenUsage(data2?.usageMetadata?.totalTokenCount ?? 0);

          const finalParts: Array<{ text?: string; thought?: boolean }> = data2?.candidates?.[0]?.content?.parts || [];
          const aiText2 = finalParts.filter((p) => !p.thought).map((p) => p.text).join('').trim() || 'Done!';

          setStreamingText('');
          setMessages((prev) => [...prev, { role: 'model', text: aiText2, action: toolResult, chart: responseChart, suggestedChart, templateAction: toolResult.templateAction, loggedExercise: toolResult.loggedExercise, loggedStat: toolResult.loggedStat }]);
          return;
        }

        // ── Normal text response branch ──────────────────────────────────
        setStreamingText('');
        setMessages((prev) => [...prev, {
          role: 'model',
          text: streamedText.trim() || '(no response)',
          thought: thought || undefined,
          chart: responseChart,
          suggestedChart,
        }]);
      } catch (err: any) {
        setStreamingText('');
        // A chart was already computed client-side — show it regardless of the
        // model failing, so "plot X" always works even when we're rate-limited.
        if (responseChart) {
          setMessages((prev) => [...prev, { role: 'model', text: chartCaption(responseChart!), chart: responseChart }]);
          return;
        }
        const raw: string = err?.message || 'Something went wrong.';
        const isRateLimit = /rate limit|too many requests|tokens per minute|\bTPM\b|try again in/i.test(raw);
        const display = isRateLimit
          ? "⏳ The coach is busy right now — give it a few seconds and tap send again."
          : raw.startsWith('QUOTA:')
            ? raw.replace('QUOTA:', '⚠️ Quota issue —')
            : raw.startsWith('INVALID_KEY:')
              ? raw.replace('INVALID_KEY:', '🔑 Invalid key —')
              : `⚠️ ${raw}`;
        setMessages((prev) => [...prev, { role: 'model', text: display }]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, hasKey, model, profile, workouts, normWorkouts, displayUnit, prs, foodScans, recentRuns, whoopData, skincareStats, strainCost, recovery, insights, messages, user?.id, navigate],
  );

  // Actually send a hand-off question once the seeded insight message has
  // landed in `messages` — deferred to its own effect (rather than called
  // directly in the listener above) so `send()` closes over the just-updated
  // `messages` state instead of a stale pre-seed value.
  useEffect(() => {
    if (!pendingHandoffText) return;
    const text = pendingHandoffText;
    setPendingHandoffText(null);
    send(text);
  }, [pendingHandoffText, send]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      toast.success('Copied!');
      setTimeout(() => setCopiedIdx(null), 2000);
    });
  };

  // Load a past message back into the input so the user can tweak it and resend.
  const handleEditMessage = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => inputRef.current?.focus(), 40);
  }, []);

  const handlePlotSuggestion = useCallback((idx: number) => {
    setMessages((prev) => prev.map((m, i) => (
      i === idx && m.suggestedChart
        ? { ...m, chart: m.suggestedChart, suggestedChart: undefined }
        : m
    )));
  }, []);

  // Daily check-in: record the feeling (tunes today's briefing), mark the
  // streak, and let the coach react to it.
  const handleCheckIn = useCallback((feeling: string) => {
    setTodayFeeling(feeling);
    setMemory(recordCheckIn(user?.id));
    send(`Quick check-in — I'm feeling ${feeling} today. What should I do?`);
  }, [send, user?.id]);

  const handleCompleteGoal = useCallback((id: string) => {
    setMemory(completeCoachGoal(user?.id, id));
    toast.success('Goal completed 🎉');
  }, [user?.id]);

  // Start a coach-built template — open the logger's plan sheet where the new
  // template is ready to pick.
  const handleStartTemplate = useCallback(() => {
    close();
    navigate('/log?plan=1');
  }, [close, navigate]);

  // "Add to today's log" → only REAL system exercises (matched against the
  // exercise library) go into the live draft, with their canonical name +
  // muscle group + db id so they track properly. Unknown names the coach may
  // have invented are NOT added as broken entries — the user is routed to the
  // exercise creator instead. Matched exercises are never lost in the process.
  const handleAddPlanToLog = useCallback(async (rows: ExRow[]) => {
    if (!user?.id || !rows.length) return;
    const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const num = (s?: string) => { const n = parseInt(s || '', 10); return Number.isFinite(n) ? n : 0; };
    const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const lastWeightFor = (name: string): number => {
      const low = name.toLowerCase();
      for (const w of [...workouts].sort((a, b) => parseWorkoutDate(b.date).getTime() - parseWorkoutDate(a.date).getTime())) {
        for (const ex of w.exercises || []) {
          if (ex.name.toLowerCase() === low && (Number(ex.weight) || 0) > 0) return Number(ex.weight);
        }
      }
      return 0;
    };

    // Resolve every coach exercise against the library — matched vs unknown.
    const matched: { row: ExRow; lib: LocalExerciseLibraryItem }[] = [];
    const missing: string[] = [];
    for (const r of rows.slice(0, 12)) {
      let lib: LocalExerciseLibraryItem | undefined;
      try {
        const results = await searchExerciseLibrary(user.id, r.name);
        const top = results[0];
        if (top) {
          const a = normName(r.name);
          const b = normName(top.name);
          // Accept a confident match: identical, or one name contains the other
          // (e.g. coach "Row" → library "Barbell Row").
          if (a && b && (a === b || a.includes(b) || b.includes(a))) lib = top;
        }
      } catch { /* treat as missing */ }
      if (lib) matched.push({ row: r, lib }); else missing.push(r.name);
    }

    // Build/append the live draft from the matched (real) exercises only.
    if (matched.length) {
      const newExercises: ExerciseEntry[] = matched.map(({ row, lib }) => {
        const setCount = Math.max(1, Math.min(10, num(row.sets) || 3));
        const reps = Math.max(1, num(row.reps) || 10);
        const weight = Math.max(0, Number(row.weight) || lastWeightFor(lib.name));
        return {
          id: uid(),
          name: lib.name,
          muscleGroup: lib.muscle_group || '',
          exercise_db_id: lib.exercise_db_id || lib.id || undefined,
          sets: Array.from({ length: setCount }, () => ({
            id: uid(),
            weight: weight > 0 ? weight : null,
            reps,
            done: false,
            planned_weight: weight > 0 ? weight : null,
            planned_reps: reps,
          })),
        };
      });

      const DRAFT_KEY = 'athlix_active_workout';
      const now = Date.now();
      let draft: WorkoutState | null = null;
      try {
        const raw = sessionStorage.getItem(DRAFT_KEY);
        const parsed = raw ? (JSON.parse(raw) as WorkoutState) : null;
        if (parsed && Array.isArray(parsed.exercises) && typeof parsed.startTime === 'number' && now - parsed.startTime < 8 * 60 * 60 * 1000) {
          draft = parsed;
        }
      } catch { /* ignore corrupt draft */ }
      if (draft) {
        draft.exercises = [...draft.exercises, ...newExercises];
      } else {
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, '0');
        const local = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
        draft = { title: '', startTime: now, startAt: local, endAt: local, elapsedSeconds: 0, exercises: newExercises, notes: '' };
      }
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
    }

    // Happy path — everything matched → straight into the logger.
    if (!missing.length) {
      toast.success('Draft ready — opening logger');
      close();
      navigate('/log?direct=1');
      return;
    }

    // Some/all unknown → stay in chat with a clear message + create route, so
    // nothing broken is logged and the matched ones aren't lost.
    setMessages((prev) => [...prev, {
      role: 'model',
      text: matched.length
        ? `Added **${matched.length}** to your log draft. But **${missing.join('**, **')}** ${missing.length === 1 ? "isn't" : "aren't"} in your exercise library — create ${missing.length === 1 ? 'it' : 'them'} so they track properly.`
        : `**${missing.join('**, **')}** ${missing.length === 1 ? "isn't" : "aren't"} in your exercise library yet. Create ${missing.length === 1 ? 'it' : 'them'} first, then add the plan.`,
      logRouting: { added: matched.length, missing },
    }]);
  }, [user?.id, workouts, close, navigate]);

  const handleOpenLogger = useCallback(() => { close(); navigate('/log?direct=1'); }, [close, navigate]);
  const handleCreateMissing = useCallback(() => { close(); navigate('/log?add=1'); }, [close, navigate]);

  /* ── Chat session history ─────────────────────────────────────────── */
  const handleShowHistory = useCallback(() => {
    setSessions(getSessions(user?.id));
    setShowHistory(true);
  }, [user?.id]);

  const handleNewSession = useCallback(() => {
    const fresh = startFreshSession(user?.id);
    setActiveSessionId(fresh.id);
    setMessages([]);
    setShowHistory(false);
  }, [user?.id]);

  const handleOpenSession = useCallback((id: string) => {
    const s = getSessions(user?.id).find((x) => x.id === id);
    if (!s) return;
    setActiveSession(user?.id, id);
    setActiveSessionId(id);
    setMessages(s.messages as unknown as Message[]);
    setShowHistory(false);
  }, [user?.id]);

  const handleDeleteSession = useCallback((id: string) => {
    deleteSession(user?.id, id);
    setSessions(getSessions(user?.id));
    if (id === activeSessionId) handleNewSession();
  }, [user?.id, activeSessionId, handleNewSession]);

  // Live progress toward each active goal, computed from logged data.
  const goalProgress: Record<string, GoalProgress> = {};
  for (const g of memory.goals) {
    if (g.done) continue;
    const p = computeGoalProgress(g, workouts, prs, recentRuns, profile);
    if (p) goalProgress[g.id] = p;
  }

  // Most-recent logged weight per exercise, so a prescribed weighted move with
  // no weight can still show a real number ("· last") instead of an empty box.
  const exerciseWeights: WeightMap = {};
    for (const w of [...normWorkouts].sort((a, b) => parseWorkoutDate(b.date).getTime() - parseWorkoutDate(a.date).getTime())) {
      for (const ex of w.exercises || []) {
        const key = ex.name.toLowerCase();
        const weight = Number(ex.weight) || 0;
        if (weight > 0 && !exerciseWeights[key]) exerciseWeights[key] = { weight, unit: ex.unit || 'lb' };
      }
    }

    // Per-exercise mini history for inline sparklines on plan cards: top value per
    // session (weight if it's a weighted lift, else reps), oldest→newest, last 8.
    const exerciseSparks: Record<string, number[]> = {};
    {
      const byEx: Record<string, { weighted: boolean; perDate: Map<string, number> }> = {};
      for (const w of normWorkouts) {
        for (const ex of w.exercises || []) {
          const key = ex.name.toLowerCase();
          const weight = Number(ex.weight) || 0;
          const reps = Number(ex.reps) || 0;
          const rec = (byEx[key] ||= { weighted: false, perDate: new Map() });
          if (weight > 0) rec.weighted = true;
          const v = weight > 0 ? weight : reps;
          rec.perDate.set(w.date, Math.max(rec.perDate.get(w.date) || 0, v));
        }
      }
      for (const [key, { perDate }] of Object.entries(byEx)) {
        const series = [...perDate.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((e) => e[1]).slice(-8);
        if (series.length >= 3) exerciseSparks[key] = series;
      }
    }

  // A measurable goal is only completed once the LOGGED work actually reaches
  // its target — never on creation, never by a premature tap. Reconciles when
  // workouts/PRs load or change.
  useEffect(() => {
    if (!user?.id) return;
    let changed = false;
    for (const g of memory.goals) {
      if (g.done) continue;
      const p = computeGoalProgress(g, workouts, prs, recentRuns, profile);
      if (p && p.pct >= 100) {
        completeCoachGoal(user.id, g.id);
        toast.success(`Goal achieved — ${g.text} 🎉`);
        changed = true;
      }
    }
    if (changed) setMemory(getCoachMemory(user.id));
  }, [workouts, prs, recentRuns, memory.goals, user?.id, profile]);

  /* ── Direct exercise log (from form submit) ─────────────────────── */
  const handleLogExercise = useCallback(async (name: string, sets: SetEntry[], unit: 'kg' | 'lbs') => {
    if (!user?.id) return;
    try {
      const matches = await searchExerciseLibrary(user.id, name);
      const best = matches[0];
      const exerciseName = best?.name || name;
      const completedSets = sets.map((s) => ({ reps: s.reps, weight: s.weight, unit }));
      await saveWorkout(user.id, {
        title: defaultWorkoutTitle(),
        date: format(new Date(), 'yyyy-MM-dd'),
        duration_minutes: 0,
        exercises: [{
          name: exerciseName,
          muscle_group: best?.muscle_group || undefined,
          exercise_db_id: (best as any)?.id || null,
          completed_sets: completedSets,
        }],
      });
      window.dispatchEvent(new CustomEvent('athlix:workout-logged'));
      const summary = `${exerciseName} — ${sets.length} set${sets.length !== 1 ? 's' : ''} logged`;
      setMessages((prev) => [...prev, {
        role: 'model' as const,
        text: `Done! ${summary}`,
        action: { success: true, message: summary },
      }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, {
        role: 'model' as const,
        text: `Couldn't log that — ${e?.message || 'unknown error'}`,
        action: { success: false, message: e?.message || 'unknown error' },
      }]);
    }
  }, [user?.id]);

  /* ── Show pre-filled form (from suggestion chip tap) ────────────── */
  const handleShowFormWithName = useCallback((name: string) => {
    setMessages((prev) => [...prev, {
      role: 'model' as const,
      text: name ? `Fill in the details for **${name}**:` : "Here's a quick form to log your exercise:",
      exerciseForm: true,
      exerciseFormInitialName: name,
    }]);
  }, []);

  /* ── FAB button removed — AI is now triggered from the top header on every page ── */

  /* ── Chat panel (shared mobile + desktop) ──────────────────────────── */
  const chatPanel = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-[198] backdrop-blur-sm"
            onClick={close}
          />

          {/* Mobile: slide up sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="md:hidden fixed bottom-0 left-0 right-0 z-[200] flex flex-col lg-sheet"
            style={{
              height: '82vh',
              borderRadius: '20px 20px 0 0',
              border: '1px solid rgba(255,255,255,0.13)',
              borderBottom: 'none',
            }}
          >
            {/* Drag pill */}
            <div className="lg-handle" />
            {showKeySetup ? (
              <ApiKeySetupModal onDone={() => setShowKeySetup(false)} onSave={saveAiCoachKey} />
            ) : (
              <ChatContent
                hasKey={!!hasKey}
                messages={messages}
                suggestions={getSuggestions(workouts, foodScans, recentRuns)}
                followUps={buildFollowUps(messages, workouts, foodScans, recentRuns, whoopData)}
                memory={memory}
                streak={coachStreak(memory, workouts)}
                todayFeeling={getTodayFeeling()}
                goalProgress={goalProgress}
                exerciseWeights={exerciseWeights}
                exerciseSparks={exerciseSparks}
                sessions={sessions}
                showHistory={showHistory}
                activeSessionId={activeSessionId}
                onAddPlanToLog={handleAddPlanToLog}
                onCheckIn={handleCheckIn}
                onCompleteGoal={handleCompleteGoal}
                onStartTemplate={handleStartTemplate}
                onOpenLogger={handleOpenLogger}
                onCreateMissing={handleCreateMissing}
                onShowHistory={handleShowHistory}
                onNewSession={handleNewSession}
                onOpenSession={handleOpenSession}
                onCloseHistory={() => setShowHistory(false)}
                onDeleteSession={handleDeleteSession}
                input={input}
                loading={loading}
                loadingPhase={loadingPhase}
                streamingText={streamingText}
                copiedIdx={copiedIdx}
                inputRef={inputRef}
                bottomRef={bottomRef}
                onInput={setInput}
                onKey={handleKey}
                onSend={() => send()}
                onSuggest={(q) => send(q)}
                onLogExercise={handleLogExercise}
                onShowFormWithName={handleShowFormWithName}
                onClose={close}
                onGoSettings={() => { close(); navigate('/settings'); }}
                onCopy={handleCopy}
                onEditMessage={handleEditMessage}
                onPlotSuggestion={handlePlotSuggestion}
              />
            )}
          </motion.div>

          {/* Desktop: centered modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2 }}
            className="hidden md:flex fixed z-[200] flex-col lg-nav"
            style={{
              width: 420,
              height: 600,
              bottom: 32,
              right: 32,
              borderRadius: 20,
              border: '1px solid rgba(255,255,255,0.10)',
              borderLeft: '1px solid rgba(255,255,255,0.10)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            }}
          >
            {showKeySetup ? (
              <ApiKeySetupModal onDone={() => setShowKeySetup(false)} onSave={saveAiCoachKey} />
            ) : (
              <ChatContent
                hasKey={!!hasKey}
                messages={messages}
                suggestions={getSuggestions(workouts, foodScans, recentRuns)}
                followUps={buildFollowUps(messages, workouts, foodScans, recentRuns, whoopData)}
                memory={memory}
                streak={coachStreak(memory, workouts)}
                todayFeeling={getTodayFeeling()}
                goalProgress={goalProgress}
                exerciseWeights={exerciseWeights}
                exerciseSparks={exerciseSparks}
                sessions={sessions}
                showHistory={showHistory}
                activeSessionId={activeSessionId}
                onAddPlanToLog={handleAddPlanToLog}
                onCheckIn={handleCheckIn}
                onCompleteGoal={handleCompleteGoal}
                onStartTemplate={handleStartTemplate}
                onOpenLogger={handleOpenLogger}
                onCreateMissing={handleCreateMissing}
                onShowHistory={handleShowHistory}
                onNewSession={handleNewSession}
                onOpenSession={handleOpenSession}
                onCloseHistory={() => setShowHistory(false)}
                onDeleteSession={handleDeleteSession}
                input={input}
                loading={loading}
                loadingPhase={loadingPhase}
                streamingText={streamingText}
                copiedIdx={copiedIdx}
                inputRef={inputRef}
                bottomRef={bottomRef}
                onInput={setInput}
                onKey={handleKey}
                onSend={() => send()}
                onSuggest={(q) => send(q)}
                onLogExercise={handleLogExercise}
                onShowFormWithName={handleShowFormWithName}
                onClose={close}
                onGoSettings={() => { close(); navigate('/settings'); }}
                onCopy={handleCopy}
                onEditMessage={handleEditMessage}
                onPlotSuggestion={handlePlotSuggestion}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return <>{chatPanel}</>;
};

const CHART_ACCENT = '#C8FF00';

// Concentric Apple-style rings (SVG stroke-dasharray), animated on mount, with
// a legend beside them. Same idiom as the app's ThreeRingHero / HealthRings.
const CoachRingCard: React.FC<{ chart: CoachChart }> = ({ chart }) => {
  // Cap at two rings — three concentric rings are hard to read and their center
  // text gets cramped. Two keeps them legible with a clear center readout.
  const rings = (chart.rings || []).slice(0, 2);
  if (!rings.length) return null;
  const size = 150;
  const cx = size / 2;
  const stroke = 13;
  const gap = 5;

  return (
    <div
      className="mt-2 flex flex-col items-center"
      style={{ borderRadius: 16, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}
    >
      <p className="self-start text-[10px] font-medium uppercase mb-3" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
        {chart.title}
      </p>

      {/* Ring first — centered, with the headline reading inside */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {rings.map((ring, i) => {
            const r = (size / 2 - stroke / 2) - i * (stroke + gap);
            const circ = 2 * Math.PI * r;
            const pct = Math.max(0, Math.min(1, ring.value / ring.max));
            return (
              <g key={i}>
                <circle cx={cx} cy={cx} r={r} fill="none" stroke={ring.color} strokeOpacity={0.14} strokeWidth={stroke} />
                <motion.circle
                  cx={cx} cy={cx} r={r}
                  fill="none"
                  stroke={ring.color}
                  strokeWidth={stroke}
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  initial={{ strokeDashoffset: circ }}
                  animate={{ strokeDashoffset: circ * (1 - pct) }}
                  transition={{ duration: 1.1, ease: 'easeOut', delay: i * 0.12 }}
                />
              </g>
            );
          })}
        </svg>
        {chart.centerValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[22px] font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              {chart.centerValue}
            </span>
            {chart.centerLabel && (
              <span className="text-[9px] uppercase mt-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                {chart.centerLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Labels below — full width so nothing truncates */}
      <div className="w-full mt-3.5 space-y-2">
        {rings.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 999, background: r.color }} />
            <span className="flex-1 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{r.label}</span>
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
              {r.display ?? `${Math.round((r.value / r.max) * 100)}%`}
            </span>
          </div>
        ))}
      </div>

      {chart.subtitle && (
        <p className="self-start text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>{chart.subtitle}</p>
      )}
    </div>
  );
};

// Composition donut (macros) with a legend + center total.
const CoachDonutCard: React.FC<{ chart: CoachChart }> = ({ chart }) => {
  if (!chart.data.length) return null;
  const total = chart.data.reduce((s, d) => s + d.value, 0) || 1;
  const tooltipStyle: React.CSSProperties = {
    background: 'rgba(18,20,24,0.92)', backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: 'var(--text-primary)',
    fontSize: 11, padding: '6px 10px',
  };

  return (
    <div
      className="mt-2"
      style={{ borderRadius: 16, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', padding: '14px 16px' }}
    >
      <p className="text-[10px] font-medium uppercase mb-2" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
        {chart.title}
      </p>
      <div className="flex items-center gap-3">
        <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chart.data}
                dataKey="value"
                nameKey="label"
                innerRadius={42}
                outerRadius={60}
                paddingAngle={2}
                stroke="none"
                startAngle={90}
                endAngle={-270}
              >
                {chart.data.map((_, i) => <Cell key={i} fill={VIZ_COLORS[i % VIZ_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(v: unknown, n: unknown) => [`${Number(v).toLocaleString()} ${chart.valueLabel}`, String(n)]} />
            </PieChart>
          </ResponsiveContainer>
          {chart.centerValue && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[17px] font-bold tabular-nums leading-none" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {chart.centerValue}
              </span>
              {chart.centerLabel && (
                <span className="text-[8.5px] uppercase mt-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                  {chart.centerLabel}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 space-y-2.5">
          {chart.data.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="shrink-0" style={{ width: 9, height: 9, borderRadius: 999, background: VIZ_COLORS[i % VIZ_COLORS.length] }} />
              <span className="flex-1 text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>{d.label}</span>
              <span className="text-[12px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {d.value}{chart.valueLabel} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {Math.round((d.value / total) * 100)}%</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      {chart.subtitle && (
        <p className="text-[10px] mt-3" style={{ color: 'rgba(255,255,255,0.3)' }}>{chart.subtitle}</p>
      )}
    </div>
  );
};

const CoachChartCard: React.FC<{ chart: CoachChart }> = ({ chart }) => {
  if (chart.kind === 'ring') return <CoachRingCard chart={chart} />;
  if (chart.kind === 'donut') return <CoachDonutCard chart={chart} />;
  if (!chart.data.length) return null;

  const accent = chart.color || CHART_ACCENT;
  const gradientId = React.useId();
  const values = chart.data.map((d) => d.value);
  const peak = Math.max(...values);
  const peakPoint = chart.data.find((d) => d.value === peak);
  const headline = chart.kind === 'line' ? values[values.length - 1] : peak;

  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${Math.round(n)}`;

  const tooltipStyle: React.CSSProperties = {
    background: 'rgba(18,20,24,0.92)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10,
    color: 'var(--text-primary)',
    fontSize: 11,
    padding: '6px 10px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
  };
  const axisTick = { fill: 'rgba(255,255,255,0.32)', fontSize: 10 } as const;
  // Thin out x labels so they never overlap: aim for at most ~6 visible ticks.
  const xInterval = chart.data.length > 7 ? Math.ceil(chart.data.length / 6) : 0;
  // Tight, "nice" y-max just above the peak so bars fill the height (no big
  // dead zone above the tallest bar) while ticks stay round.
  const yNiceMax = (() => {
    const m = Math.max(peak, 1);
    const magHalf = Math.pow(10, Math.floor(Math.log10(m))) / 2;
    return Math.max(magHalf, Math.ceil((m * 1.1) / magHalf) * magHalf);
  })();

  return (
    <div
      className="mt-2 overflow-hidden"
      style={{
        width: '100%',
        minWidth: 240,
        borderRadius: 16,
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div className="px-4 pt-3.5 pb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="text-[10px] font-medium uppercase leading-tight truncate"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}
          >
            {chart.title}
          </p>
          {chart.subtitle && (
            <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.30)' }}>
              {chart.subtitle}
            </p>
          )}
        </div>
        <div className="text-right shrink-0 leading-none">
          <span className="text-[20px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {fmt(headline)}
          </span>
          <span className="text-[9px] ml-1" style={{ color: 'var(--text-muted)' }}>
            {chart.valueLabel}
          </span>
        </div>
      </div>
      <div style={{ width: '100%', height: 176, padding: '4px 6px 6px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart.kind === 'line' ? (
            <ComposedChart data={chart.data} margin={{ top: 10, right: 14, bottom: 8, left: -8 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} dy={4} interval={xInterval} minTickGap={10} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={46} tickFormatter={fmt} domain={[0, yNiceMax]} />
              <Tooltip
                contentStyle={tooltipStyle}
                separator=""
                cursor={{ stroke: 'rgba(255,255,255,0.14)', strokeWidth: 1 }}
                formatter={(value: unknown, name: unknown) => name === 'trend' ? [] : [`${Number(value).toLocaleString()} ${chart.valueLabel}`, '']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={accent}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgba(18,20,24,1)', fill: accent }}
              />
              {chart.overlay === 'trend' && (
                <Line type="linear" dataKey="trend" stroke="rgba(255,255,255,0.42)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} />
              )}
              {chart.overlay === 'ma' && (
                <Line type="monotone" dataKey="ma" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} strokeDasharray="3 3" dot={false} activeDot={false} isAnimationActive={false} />
              )}
              {chart.showPeak && peakPoint && (
                <ReferenceDot
                  x={peakPoint.label}
                  y={peakPoint.value}
                  r={3.5}
                  fill={accent}
                  stroke="rgba(18,20,24,1)"
                  strokeWidth={2}
                  label={{ value: fmt(peakPoint.value), position: 'top', fill: 'rgba(255,255,255,0.6)', fontSize: 9 }}
                />
              )}
            </ComposedChart>
          ) : (
            <BarChart data={chart.data} margin={{ top: 10, right: 10, bottom: 8, left: -8 }} barCategoryGap="16%">
              <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} dy={4} interval={xInterval} minTickGap={10} />
              <YAxis tick={axisTick} axisLine={false} tickLine={false} width={46} tickFormatter={fmt} domain={[0, yNiceMax]} />
              <Tooltip
                contentStyle={tooltipStyle}
                separator=""
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                formatter={(value: unknown) => [`${Number(value).toLocaleString()} ${chart.valueLabel}`, '']}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={46}>
                {chart.data.map((d, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={accent}
                    fillOpacity={d.value >= peak ? 1 : 0.28}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

/* ── Inline exercise quick-log form ───────────────────────────────── */
const ExerciseQuickForm: React.FC<{
  initialName?: string;
  onSubmit: (name: string, sets: SetEntry[], unit: 'kg' | 'lbs') => Promise<void>;
  loading: boolean;
  setLoading: (v: boolean) => void;
}> = ({ initialName = '', onSubmit, loading, setLoading }) => {
  const { user, profile } = useAuth();
  // Follows the app-wide weight unit (set in Settings); defaults to lbs.
  const defaultUnit = ((profile?.unit_preference as 'kg' | 'lbs') || 'lbs');

  const [name, setName] = useState(initialName);
  const [sets, setSets] = useState<SetEntry[]>([{ reps: 10, weight: 0 }]);
  const [unit] = useState<'kg' | 'lbs'>(defaultUnit);
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [weightError, setWeightError] = useState(false);

  // Live exercise search
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const searchTimer = useRef<number | null>(null);

  // DialPicker state — which set row is being edited
  const [dialOpen, setDialOpen] = useState(false);
  const [dialSetIdx, setDialSetIdx] = useState(0);

  // Pre-fill from last logged entry for this exercise
  const prefillFromLast = useCallback(async (exerciseName: string) => {
    if (!user?.id || !exerciseName.trim()) return;
    const last = await getLastExerciseSets(user.id, exerciseName);
    if (last && last.length > 0) setSets(last);
  }, [user?.id]);

  useEffect(() => {
    if (initialName) prefillFromLast(initialName);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameChange = (v: string) => {
    setName(v);
    setNameError(false);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (!v.trim() || !user?.id) { setSearchResults([]); return; }
    searchTimer.current = window.setTimeout(async () => {
      const results = await searchExerciseLibrary(user.id!, v);
      setSearchResults(results.slice(0, 5).map((e: LocalExerciseLibraryItem) => e.name));
    }, 280);
  };

  const selectSuggestion = (s: string) => {
    setName(s);
    setSearchResults([]);
    prefillFromLast(s);
  };

  const updateSet = (i: number, patch: Partial<SetEntry>) => {
    setSets((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    setWeightError(false);
  };

  const addSet = () => {
    const last = sets[sets.length - 1] ?? { reps: 10, weight: 0 };
    setSets((prev) => [...prev, { ...last }]);
  };

  const removeSet = (i: number) => {
    if (sets.length <= 1) return;
    setSets((prev) => prev.filter((_, idx) => idx !== i));
  };

  const openDial = (i: number) => { setDialSetIdx(i); setDialOpen(true); };

  const handleSubmit = async () => {
    let err = false;
    if (!name.trim()) { setNameError(true); err = true; }
    if (sets.some((s) => s.weight <= 0)) { setWeightError(true); err = true; }
    if (err || loading) return;
    setLoading(true);
    try {
      await onSubmit(name.trim(), sets, unit);
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (dismissed) return (
    <div className="px-3 py-2 rounded-xl text-[11px]" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}>
      Form dismissed
    </div>
  );

  if (done) return (
    <div className="px-3 py-2.5 rounded-xl text-[12px] font-semibold" style={{ background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.22)', color: '#C8FF00' }}>
      ✓ Exercise logged!
    </div>
  );

  return (
    <>
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: `1px solid ${nameError || weightError ? 'rgba(248,113,113,0.4)' : 'var(--border)'}` }}>
        {/* Header */}
        <div className="px-3 pt-3 pb-2 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" style={{ color: 'var(--accent)' }} />
            <span className="text-[11px] font-bold" style={{ color: 'var(--accent)' }}>Log Exercise</span>
          </div>
          <button onClick={() => setDismissed(true)} className="w-5 h-5 flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
            <X className="w-3 h-3" />
          </button>
        </div>

        <div className="p-3 space-y-3">
          {/* Exercise name + live search */}
          <div className="relative">
            <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: nameError ? '#f87171' : 'rgba(255,255,255,0.35)' }}>
              {nameError ? 'Exercise name is required' : 'Exercise name'}
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Bench Press"
              className="w-full text-[13px] px-2.5 py-2 rounded-lg outline-none"
              style={{
                background: 'rgba(255,255,255,0.06)',
                border: `1px solid ${nameError ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.1)'}`,
                color: 'var(--text-primary)',
                caretColor: '#C8FF00',
              }}
            />
            {/* Search suggestions dropdown */}
            {searchResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 rounded-lg overflow-hidden z-10" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
                {searchResults.map((s) => (
                  <button
                    key={s}
                    onMouseDown={() => selectSuggestion(s)}
                    className="w-full text-left px-3 py-2 text-[12px] transition-colors"
                    style={{ color: 'var(--text-primary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Column headers */}
          <div className="grid items-center gap-2" style={{ gridTemplateColumns: '32px 1fr 1fr auto' }}>
            <div />
            <span className="text-[10px] font-bold uppercase tracking-wider text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>Reps</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-center" style={{ color: weightError ? '#f87171' : 'rgba(255,255,255,0.35)' }}>
              {weightError ? 'Required!' : `Weight (${unit})`}
            </span>
            <div />
          </div>

          {/* Per-set rows */}
          <div className="space-y-2">
            {sets.map((s, i) => (
              <div key={i} className="grid items-center gap-2" style={{ gridTemplateColumns: '32px 1fr 1fr auto' }}>
                {/* Set label */}
                <span className="text-[11px] font-bold text-center" style={{ color: 'rgba(255,255,255,0.35)' }}>{i + 1}</span>

                {/* Reps stepper */}
                <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }}>
                  <button onClick={() => updateSet(i, { reps: Math.max(1, s.reps - 1) })} className="px-2.5 py-2 text-[15px] active:bg-white/10" style={{ color: 'rgba(255,255,255,0.4)' }}>−</button>
                  <span className="flex-1 text-center text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{s.reps}</span>
                  <button onClick={() => updateSet(i, { reps: Math.min(50, s.reps + 1) })} className="px-2.5 py-2 text-[15px] active:bg-white/10" style={{ color: 'rgba(255,255,255,0.4)' }}>+</button>
                </div>

                {/* Weight — tap to open dial */}
                <button
                  onClick={() => openDial(i)}
                  className="py-2 rounded-lg text-[13px] font-bold text-center active:scale-[0.97] transition-all"
                  style={{
                    background: s.weight > 0 ? 'rgba(200,255,0,0.08)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${s.weight > 0 ? 'rgba(200,255,0,0.25)' : weightError ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)'}`,
                    color: s.weight > 0 ? '#C8FF00' : 'rgba(255,255,255,0.3)',
                  }}
                >
                  {s.weight > 0 ? `${s.weight}` : 'Tap'}
                </button>

                {/* Remove row */}
                <button
                  onClick={() => removeSet(i)}
                  disabled={sets.length <= 1}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-all disabled:opacity-20"
                  style={{ color: 'rgba(248,113,113,0.6)' }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Add set */}
          <button
            onClick={addSet}
            className="w-full py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-[0.98]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px dashed rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)' }}
          >
            + Add Set
          </button>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            className="w-full py-2.5 rounded-lg text-[13px] font-bold text-black active:scale-[0.98] transition-all disabled:opacity-40"
            style={{ background: '#C8FF00' }}
          >
            {loading ? 'Logging…' : `Log ${sets.length} Set${sets.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* DialPicker — full-screen weight picker */}
      {dialOpen && (
        <DialPicker
          title="Weight"
          fieldKind="weight"
          inputType="weight_reps"
          initialValue={sets[dialSetIdx]?.weight || 0}
          weightUnit={unit}
          onClose={() => setDialOpen(false)}
          onConfirm={(v) => { updateSet(dialSetIdx, { weight: v }); setDialOpen(false); }}
        />
      )}
    </>
  );
};

/* ── Inner chat content (shared between mobile sheet + desktop modal) ─ */
interface ChatContentProps {
  hasKey: boolean;
  messages: Message[];
  suggestions: string[];
  followUps: string[];
  memory: CoachMemory;
  streak: number;
  todayFeeling: string | null;
  goalProgress: Record<string, GoalProgress>;
  exerciseWeights: WeightMap;
  exerciseSparks: Record<string, number[]>;
  sessions: ChatSession[];
  showHistory: boolean;
  activeSessionId: string | null;
  onAddPlanToLog: (rows: ExRow[]) => void;
  onCheckIn: (feeling: string) => void;
  onCompleteGoal: (id: string) => void;
  onStartTemplate: () => void;
  onOpenLogger: () => void;
  onCreateMissing: () => void;
  onShowHistory: () => void;
  onNewSession: () => void;
  onOpenSession: (id: string) => void;
  onCloseHistory: () => void;
  onDeleteSession: (id: string) => void;
  input: string;
  loading: boolean;
  loadingPhase: number;
  streamingText: string;
  copiedIdx: number | null;
  inputRef: React.RefObject<HTMLInputElement>;
  bottomRef: React.RefObject<HTMLDivElement>;
  onInput: (v: string) => void;
  onKey: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
  onSuggest: (q: string) => void;
  onLogExercise: (name: string, sets: SetEntry[], unit: 'kg' | 'lbs') => Promise<void>;
  onShowFormWithName: (name: string) => void;
  onClose: () => void;
  onGoSettings: () => void;
  onCopy: (text: string, idx: number) => void;
  onEditMessage: (text: string) => void;
  onPlotSuggestion: (idx: number) => void;
}

const ChatContent: React.FC<ChatContentProps> = ({
  hasKey, messages, suggestions, followUps, memory, streak, todayFeeling, goalProgress, exerciseWeights, exerciseSparks,
  sessions, showHistory, activeSessionId, input, loading, loadingPhase, streamingText, copiedIdx,
  inputRef, bottomRef, onCheckIn, onCompleteGoal, onStartTemplate, onAddPlanToLog,
  onOpenLogger, onCreateMissing,
  onShowHistory, onNewSession, onOpenSession, onCloseHistory, onDeleteSession,
  onInput, onKey, onSend, onSuggest, onLogExercise, onShowFormWithName,
  onClose, onGoSettings, onCopy, onEditMessage, onPlotSuggestion,
}) => {
  const [expandedThought, setExpandedThought] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const activeGoals = memory.goals.filter((g) => !g.done);

  // Context-aware actions from the coach's latest reply: if it laid out
  // exercises, offer to add them to today's log and to plot the main lift.
  const lastModelMsg = [...messages].reverse().find((m) => m.role === 'model');
  const planRows: ExRow[] = lastModelMsg
    ? (lastModelMsg.text.split('\n').map(parseExerciseLine).filter(Boolean) as ExRow[])
    : [];
  const planTopExercise = planRows[0]?.name;

  return (
  <>
    {/* Header */}
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-2.5">
        {/* Avatar with aurora gradient border */}
        <div
          className="ai-aurora-static flex items-center justify-center shrink-0"
          style={{ width: 36, height: 36, borderRadius: 8, border: '1.5px solid transparent' }}
        >
          <Sparkles className="w-[18px] h-[18px]" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-[15px] font-bold text-[var(--text-primary)] leading-tight">Athlix AI</p>
          <div className="flex items-center gap-[5px] mt-[1px]">
            <div className="ai-online-dot" />
            <p className="text-[11px] leading-tight" style={{ color: 'var(--text-muted)' }}>Ready to coach</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onShowHistory}
          title="Chat history"
          className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          style={{ borderRadius: 8 }}
        >
          <Menu className="w-4 h-4" />
        </button>
        {messages.length > 0 && (
          <button
            onClick={onNewSession}
            title="New chat"
            className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            style={{ borderRadius: 8 }}
          >
            <MessageSquarePlus className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          style={{ borderRadius: 8 }}
        >
          <X className="w-[15px] h-[15px]" />
        </button>
      </div>
    </div>

    {/* No API key state */}
    {!hasKey ? (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
        <div
          className="ai-aurora-static flex items-center justify-center"
          style={{ width: 64, height: 64, borderRadius: 8, border: '1.5px solid transparent' }}
        >
          <Sparkles className="w-8 h-8" style={{ color: 'var(--accent)' }} />
        </div>
        <div>
          <p className="text-[17px] font-bold text-[var(--text-primary)]">Set up AI Coach</p>
          <p className="mt-1.5 text-[13px] leading-relaxed max-w-[260px]" style={{ color: 'var(--text-muted)' }}>
            Add your Gemini API key in Settings to enable personalized fitness coaching.
          </p>
        </div>
        <button
          onClick={onGoSettings}
          className="h-11 px-5 text-[13px] font-bold flex items-center gap-2"
          style={{ background: 'var(--accent)', color: '#000', borderRadius: 8, border: 'none' }}
        >
          <SettingsIcon className="w-4 h-4" />
          Go to Settings
        </button>
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Get a free key at{' '}
          <span style={{ color: '#818cf8' }}>aistudio.google.com</span>
        </p>
      </div>
    ) : (
      <>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col px-1 pt-4 pb-1">
              {/* Compact hero */}
              <div className="flex flex-col items-center text-center mb-5">
                <div
                  className="ai-aurora-static flex items-center justify-center mb-2.5"
                  style={{ width: 46, height: 46, borderRadius: 10, border: '1.5px solid transparent' }}
                >
                  <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
                </div>
                <p className="text-[16px] font-bold mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Your AI fitness coach
                </p>
                {streak >= 1 ? (
                  <span
                    className="inline-flex items-center gap-1.5"
                    style={{ padding: '4px 10px', borderRadius: 999, background: 'rgba(200,255,0,0.10)', border: '1px solid rgba(200,255,0,0.22)', color: '#C8FF00', fontSize: 11.5, fontWeight: 700 }}
                  >
                    🔥 {streak}-day streak
                  </span>
                ) : (
                  <p className="text-[12.5px] leading-relaxed max-w-[260px]" style={{ color: 'var(--text-secondary)' }}>
                    Ask about training, or log something — weight, a set, anything.
                  </p>
                )}
              </div>

              {/* Daily check-in */}
              {!todayFeeling && (
                <div className="w-full mb-4">
                  <p className="text-[11px] text-center mb-2" style={{ color: 'var(--text-muted)' }}>
                    How are you feeling today?
                  </p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    {[['Fresh', '💪'], ['Good', '🙂'], ['Tired', '😮‍💨'], ['Sore', '🥵']].map(([f, e]) => (
                      <button
                        key={f}
                        onClick={() => onCheckIn(f.toLowerCase())}
                        className="transition-all active:scale-95"
                        style={{
                          padding: '8px 13px',
                          borderRadius: 12,
                          background: 'var(--bg-elevated)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                          fontSize: 12.5,
                          fontWeight: 500,
                        }}
                      >
                        {e} {f}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active goals */}
              {activeGoals.length > 0 && (
                <div className="w-full mb-5">
                  <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>Your goals</p>
                  <div className="space-y-1.5">
                    {activeGoals.map((g) => {
                      const prog = goalProgress[g.id];
                      return (
                      <div
                        key={g.id}
                        style={{
                          padding: '9px 11px',
                          borderRadius: 10,
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.07)',
                        }}
                      >
                        <div className="flex items-center gap-2.5">
                          {prog ? (
                            // Measurable goal — completes automatically once logged
                            // work hits the target. Non-interactive target marker.
                            <span
                              title="Completes when your logged sets hit the target"
                              className="shrink-0 flex items-center justify-center"
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 999,
                                border: `1.5px solid ${prog.pct >= 100 ? '#C8FF00' : 'rgba(200,255,0,0.35)'}`,
                                background: 'transparent',
                              }}
                            >
                              <span style={{ width: 6, height: 6, borderRadius: 999, background: prog.pct >= 100 ? '#C8FF00' : 'rgba(200,255,0,0.35)' }} />
                            </span>
                          ) : (
                            <button
                              onClick={() => onCompleteGoal(g.id)}
                              title="Mark complete"
                              className="shrink-0 flex items-center justify-center transition-colors"
                              style={{
                                width: 18,
                                height: 18,
                                borderRadius: 999,
                                border: '1.5px solid var(--text-muted)',
                                background: 'transparent',
                              }}
                            >
                              <Check className="w-2.5 h-2.5" style={{ color: 'var(--text-muted)' }} />
                            </button>
                          )}
                          <span className="flex-1 text-[12.5px]" style={{ color: 'var(--text-primary)' }}>
                            {g.text}
                            {prog == null && g.target != null && (
                              <span style={{ color: 'var(--text-muted)' }}> · {g.target}{g.unit || ''}</span>
                            )}
                          </span>
                          {prog && (
                            <span className="shrink-0 text-[11px] font-bold tabular-nums" style={{ color: prog.pct >= 100 ? '#C8FF00' : 'var(--text-secondary)' }}>
                              {prog.pct}%
                            </span>
                          )}
                        </div>
                        {prog && (
                          <div className="mt-2 pl-[28px]">
                            <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${prog.pct}%`,
                                  height: '100%',
                                  borderRadius: 999,
                                  background: prog.pct >= 100 ? '#C8FF00' : 'linear-gradient(90deg, rgba(200,255,0,0.55), #C8FF00)',
                                  transition: 'width 0.5s ease',
                                }}
                              />
                            </div>
                            <p className="mt-1 text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                              {prog.current}{prog.unit ? ` ${prog.unit}` : ''} / {prog.target}{prog.unit ? ` ${prog.unit}` : ''}
                            </p>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Starter prompts — one scannable column */}
              <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>Try asking</p>
              <div className="space-y-1.5">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => onSuggest(q)}
                    className="w-full flex items-center gap-2.5 text-left transition-colors active:scale-[0.99]"
                    style={{
                      padding: '11px 13px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      color: 'var(--text-primary)',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)', opacity: 0.7 }} />
                    <span className="flex-1">{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Chat bubbles */}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.role === 'model' && (
                <div
                  className="ai-aurora-static flex items-center justify-center shrink-0"
                  style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid transparent', marginTop: 2 }}
                >
                  <Sparkles className="w-[11px] h-[11px]" style={{ color: 'var(--accent)' }} />
                </div>
              )}
              <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Coach thinking — collapsible, shown before the reply */}
                {m.role === 'model' && m.thought && (
                  <div className="mb-0.5">
                    <button
                      onClick={() => setExpandedThought(expandedThought === i ? null : i)}
                      className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 transition-colors"
                      style={{
                        borderRadius: 6,
                        background: 'rgba(124,58,237,0.08)',
                        color: 'rgba(124,58,237,0.8)',
                        border: '1px solid rgba(124,58,237,0.2)',
                      }}
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      Coach's reasoning
                      <span className="ml-0.5 opacity-60">{expandedThought === i ? '▲' : '▼'}</span>
                    </button>
                    {expandedThought === i && (
                      <div
                        className="mt-1.5 px-3 py-2.5 text-[11px] leading-relaxed whitespace-pre-wrap"
                        style={{
                          borderRadius: 8,
                          background: 'rgba(124,58,237,0.05)',
                          border: '1px solid rgba(124,58,237,0.15)',
                          color: 'var(--text-secondary)',
                          maxHeight: 220,
                          overflowY: 'auto',
                        }}
                      >
                        {m.thought}
                      </div>
                    )}
                  </div>
                )}
                {/* Logged exercise — the same set card as the logger, marked done */}
                {m.role === 'model' && m.loggedExercise && (
                  <motion.div className="mb-1" initial={CARD_POP.initial} animate={CARD_POP.animate} transition={CARD_POP.transition}>
                    <ExercisePlanCard
                      done
                      row={{
                        name: m.loggedExercise.name,
                        sets: String(m.loggedExercise.sets),
                        reps: String(m.loggedExercise.reps),
                        weight: m.loggedExercise.weight != null ? String(m.loggedExercise.weight) : undefined,
                        unit: m.loggedExercise.unit,
                      }}
                    />
                  </motion.div>
                )}

                {/* Logged weight / check-in — a proper done card in the logger's language */}
                {m.role === 'model' && m.loggedStat && (
                  <motion.div className="mb-1" initial={CARD_POP.initial} animate={CARD_POP.animate} transition={CARD_POP.transition}>
                    <StatConfirmCard stat={m.loggedStat} />
                  </motion.div>
                )}

                {/* Action confirmation card — skipped when a richer logged card shows it */}
                {m.role === 'model' && m.action && m.action.message && !m.loggedExercise && !m.loggedStat && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 mb-1"
                    style={{
                      borderRadius: 8,
                      background: m.action.success ? 'rgba(200,255,0,0.08)' : 'rgba(248,113,113,0.08)',
                      border: `1px solid ${m.action.success ? 'rgba(200,255,0,0.22)' : 'rgba(248,113,113,0.22)'}`,
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{m.action.success ? '✓' : '✗'}</span>
                    <span className="text-[12px] font-semibold" style={{ color: m.action.success ? '#C8FF00' : '#f87171' }}>
                      {m.action.message}
                    </span>
                  </div>
                )}

                {/* Exercise suggestions — tapping opens pre-filled form */}
                {m.role === 'model' && m.action?.suggestions && m.action.suggestions.length > 0 && (
                  <div className="mb-1">
                    <p className="text-[10px] mb-1.5 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Did you mean one of these?
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.action.suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => onShowFormWithName(s)}
                          className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg active:scale-95 transition-all"
                          style={{
                            background: 'rgba(200,255,0,0.08)',
                            border: '1px solid rgba(200,255,0,0.25)',
                            color: '#C8FF00',
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Main reply bubble */}
                {!m.exerciseForm && (
                  <div
                    className="text-[13px] leading-[1.55] word-break"
                    style={{
                      padding: '10px 13px',
                      background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)',
                      color: m.role === 'user' ? '#000' : 'var(--text-primary)',
                      fontWeight: m.role === 'user' ? 500 : 400,
                      borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      border: m.role === 'model' ? '1px solid var(--border)' : 'none',
                      wordBreak: 'break-word',
                    }}
                  >
                    {renderText(m.text, exerciseWeights, exerciseSparks)}
                  </div>
                )}

                {m.role === 'model' && m.chart && (
                  <CoachChartCard chart={m.chart} />
                )}

                {m.role === 'model' && m.templateAction && (
                  <button
                    type="button"
                    onClick={onStartTemplate}
                    className="self-start inline-flex items-center gap-1.5 mt-1.5 transition-all active:scale-95"
                    style={{
                      padding: '8px 13px',
                      borderRadius: 10,
                      background: 'var(--accent)',
                      border: 'none',
                      color: '#000',
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Start workout
                  </button>
                )}

                {/* Log-routing actions: some exercises weren't in the library */}
                {m.role === 'model' && m.logRouting && (
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {m.logRouting.added > 0 && (
                      <button
                        type="button"
                        onClick={onOpenLogger}
                        className="inline-flex items-center gap-1.5 transition-all active:scale-95"
                        style={{ padding: '8px 13px', borderRadius: 10, background: 'var(--accent)', border: 'none', color: '#000', fontSize: 12.5, fontWeight: 700 }}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Open logger
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onCreateMissing}
                      className="inline-flex items-center gap-1.5 transition-all active:scale-95"
                      style={{ padding: '8px 13px', borderRadius: 10, background: 'rgba(200,255,0,0.08)', border: '1px solid rgba(200,255,0,0.22)', color: '#C8FF00', fontSize: 12.5, fontWeight: 700 }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create in logger
                    </button>
                  </div>
                )}

                {m.role === 'model' && !m.chart && m.suggestedChart && (
                  <button
                    type="button"
                    onClick={() => onPlotSuggestion(i)}
                    className="self-start inline-flex items-center gap-1.5 transition-all active:scale-95"
                    style={{
                      padding: '6px 9px',
                      borderRadius: 8,
                      background: 'rgba(200,255,0,0.08)',
                      border: '1px solid rgba(200,255,0,0.22)',
                      color: '#C8FF00',
                      fontSize: 11,
                      fontWeight: 700,
                    }}
                  >
                    <BarChart2 className="w-3 h-3" />
                    Show {m.suggestedChart.title.toLowerCase()}
                  </button>
                )}

                {/* Inline exercise form */}
                {m.role === 'model' && m.exerciseForm && (
                  <ExerciseQuickForm
                    initialName={m.exerciseFormInitialName || ''}
                    onSubmit={onLogExercise}
                    loading={formLoading}
                    setLoading={setFormLoading}
                  />
                )}

                {m.role === 'model' && !m.exerciseForm && (
                  <div className="self-start flex items-center gap-3">
                    <button
                      onClick={() => onCopy(m.text, i)}
                      title="Copy response"
                      className="flex items-center gap-1 transition-colors"
                      style={{ padding: '2px 4px', borderRadius: 4, fontSize: 10, color: copiedIdx === i ? 'var(--accent)' : 'var(--text-muted)', background: 'none', border: 'none' }}
                    >
                      {copiedIdx === i
                        ? <><Check className="w-[11px] h-[11px]" /> Copied</>
                        : <><Copy className="w-[11px] h-[11px]" /> Copy</>}
                    </button>
                    {(() => {
                      let userText = '';
                      for (let j = i - 1; j >= 0; j--) { if (messages[j].role === 'user') { userText = messages[j].text; break; } }
                      return userText ? (
                        <button
                          onClick={() => onSuggest(userText)}
                          title="Ask again"
                          className="flex items-center gap-1 transition-colors"
                          style={{ padding: '2px 4px', borderRadius: 4, fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none' }}
                        >
                          <RotateCcw className="w-[11px] h-[11px]" /> Retry
                        </button>
                      ) : null;
                    })()}
                  </div>
                )}

                {m.role === 'user' && !loading && (
                  <button
                    onClick={() => onEditMessage(m.text)}
                    title="Edit & resend"
                    className="self-end flex items-center gap-1 transition-colors"
                    style={{ padding: '2px 4px', borderRadius: 4, fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none' }}
                  >
                    <Pencil className="w-[11px] h-[11px]" /> Edit
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator, or live-streaming reply once tokens start arriving */}
          {loading && !streamingText && (
            <div className="flex gap-2 justify-start">
              <div
                className="ai-aurora-static flex items-center justify-center shrink-0"
                style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid transparent', marginTop: 2 }}
              >
                <Sparkles className="w-[11px] h-[11px]" style={{ color: 'var(--accent)' }} />
              </div>
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px 14px 14px 4px',
                  padding: 0,
                }}
              >
                <div className="flex flex-col gap-1.5 px-3.5 py-2.5">
                  <p className="text-[11px] animate-pulse" style={{ color: 'var(--text-muted)' }}>
                    {LOADING_PHASES[loadingPhase]}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="block rounded-full animate-bounce"
                        style={{ width: 6, height: 6, background: 'var(--text-muted)', animationDelay: `${d * 0.15}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {loading && streamingText && (
            <div className="flex gap-2 justify-start">
              <div
                className="ai-aurora-static flex items-center justify-center shrink-0"
                style={{ width: 26, height: 26, borderRadius: 8, border: '1.5px solid transparent', marginTop: 2 }}
              >
                <Sparkles className="w-[11px] h-[11px]" style={{ color: 'var(--accent)' }} />
              </div>
              <div
                className="text-[13px] leading-[1.55] word-break"
                style={{
                  padding: '10px 13px',
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-primary)',
                  borderRadius: '14px 14px 14px 4px',
                  border: '1px solid var(--border)',
                  wordBreak: 'break-word',
                  maxWidth: '78%',
                }}
              >
                {renderText(streamingText, exerciseWeights, exerciseSparks)}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Action + follow-up chips — scroll horizontally. Actions (add to log,
            plot the lift) come first when the coach just laid out a plan. */}
        {messages.length > 0 && !loading && (planRows.length > 0 || followUps.length > 0) && (
          <div
            className="hide-scrollbar shrink-0 flex gap-2 overflow-x-auto"
            style={{
              padding: '8px 12px 2px',
              WebkitOverflowScrolling: 'touch',
              scrollSnapType: 'x proximity',
            }}
          >
            {planRows.length > 0 && (
              <motion.button
                onClick={() => onAddPlanToLog(planRows)}
                whileTap={{ scale: 0.92 }}
                transition={CHIP_TAP}
                className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors"
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#000',
                  fontSize: 12.5,
                  fontWeight: 700,
                  scrollSnapAlign: 'start',
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Add to today's log
              </motion.button>
            )}
            {planTopExercise && (
              <motion.button
                onClick={() => onSuggest(`Show my ${planTopExercise} progress`)}
                whileTap={{ scale: 0.92 }}
                transition={CHIP_TAP}
                className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 transition-colors"
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  background: 'rgba(200,255,0,0.08)',
                  border: '1px solid rgba(200,255,0,0.22)',
                  color: '#C8FF00',
                  fontSize: 12.5,
                  fontWeight: 600,
                  scrollSnapAlign: 'start',
                }}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                {planTopExercise} trend
              </motion.button>
            )}
            {followUps.map((q) => (
              <button
                key={q}
                onClick={() => onSuggest(q)}
                className="shrink-0 whitespace-nowrap transition-all active:scale-95"
                style={{
                  padding: '9px 14px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.045)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'var(--text-primary)',
                  fontSize: 12.5,
                  fontWeight: 500,
                  scrollSnapAlign: 'start',
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div
          className="shrink-0 flex gap-2 items-center"
          style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 12px',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          }}
        >
          <div
            className="ai-input-wrap flex-1 flex items-center"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '0 12px',
              height: 44,
            }}
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => onInput(e.target.value)}
              onKeyDown={onKey}
              disabled={loading}
              placeholder="Ask or log — 'bench 3×10 80kg', 'weight 75kg'…"
              className="flex-1 text-[14px] outline-none"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="flex items-center justify-center shrink-0 disabled:opacity-35 active:scale-95 transition-all"
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              cursor: 'pointer',
            }}
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#000' }} />
              : <Send className="w-4 h-4" style={{ color: '#000' }} />}
          </button>
        </div>
      </>
    )}

    {/* Chat history overlay — browse past days' sessions */}
    {showHistory && (
      <div className="absolute inset-0 z-[210] flex flex-col" style={{ background: 'var(--bg-base)' }}>
        <div
          className="flex items-center justify-between shrink-0"
          style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <button
              onClick={onCloseHistory}
              className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
              style={{ borderRadius: 8 }}
            >
              <X className="w-[15px] h-[15px]" />
            </button>
            <p className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Chat history</p>
          </div>
          <button
            onClick={onNewSession}
            className="inline-flex items-center gap-1.5 active:scale-95 transition-all"
            style={{
              padding: '7px 12px',
              borderRadius: 10,
              background: 'var(--accent)',
              color: '#000',
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            New chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
          {sessions.filter((s) => s.messages.length > 0).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2" style={{ color: 'var(--text-muted)' }}>
              <Menu className="w-6 h-6 opacity-40" />
              <p className="text-[12.5px]">No past chats yet.</p>
              <p className="text-[11px] text-center max-w-[220px]">A new session starts each day — your history will show up here.</p>
            </div>
          ) : (
            sessions.filter((s) => s.messages.length > 0).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-1"
                style={{
                  borderRadius: 12,
                  background: s.id === activeSessionId ? 'rgba(200,255,0,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${s.id === activeSessionId ? 'rgba(200,255,0,0.22)' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                <button
                  onClick={() => onOpenSession(s.id)}
                  className="flex-1 text-left min-w-0"
                  style={{ padding: '10px 12px', background: 'none', border: 'none' }}
                >
                  <p className="text-[12.5px] font-medium truncate" style={{ color: s.id === activeSessionId ? '#C8FF00' : 'var(--text-primary)' }}>
                    {s.title}
                  </p>
                  <p className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {sessionDateLabel(s.date)} · {s.messages.length} message{s.messages.length === 1 ? '' : 's'}
                  </p>
                </button>
                <button
                  onClick={() => onDeleteSession(s.id)}
                  title="Delete chat"
                  className="shrink-0 w-8 h-8 mr-1 flex items-center justify-center text-[var(--text-muted)] hover:text-[#f87171] transition-colors"
                  style={{ borderRadius: 8, background: 'none', border: 'none' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    )}
  </>
  );
};

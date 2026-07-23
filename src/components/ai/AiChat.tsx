import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, Loader2, Settings as SettingsIcon, RotateCcw, Copy, Check, Plus, Minus, Trash2, ExternalLink } from 'lucide-react';
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
  buildSystemPrompt,
  calDaysSince,
  parseSkincareStats,
} from '../../lib/aiCoach';

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

const GEMINI_KEY_STORAGE = 'athlix:gemini_api_key';
const GEMINI_MODEL_STORAGE = 'athlix:gemini_model';
const USAGE_STORAGE = 'athlix:api_usage';
const DEFAULT_MODEL = 'gemini-2.5-flash'; // free tier: 5 RPM, 250K tokens/min
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
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
    description: "Show the user a fillable exercise log form. Use when: (1) user names an exercise but does NOT give sets and reps, (2) the exercise intent is clear but details are missing. Pass exercise_name if you know which exercise. Do NOT use for weight or dopamine logging.",
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
}

interface Message {
  role: 'user' | 'model';
  text: string;
  thought?: string;
  action?: ToolResult;
  exerciseForm?: boolean;         // render inline exercise form
  exerciseFormInitialName?: string; // pre-fill exercise name
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

/* ── Simple markdown → React (bold, bullets, newlines) ─────────────── */
function renderText(raw: string) {
  return raw.split('\n').map((line, li) => {
    const parts: React.ReactNode[] = [];
    let rest = line;
    let key = 0;
    while (rest.length) {
      const m = rest.match(/\*\*(.+?)\*\*/);
      if (!m || m.index === undefined) {
        parts.push(rest);
        break;
      }
      if (m.index > 0) parts.push(rest.slice(0, m.index));
      parts.push(<strong key={key++}>{m[1]}</strong>);
      rest = rest.slice(m.index + m[0].length);
    }
    return (
      <span key={li}>
        {parts}
        {li < raw.split('\n').length - 1 && <br />}
      </span>
    );
  });
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
    return { success: true, message: `${weight} ${unit} logged${date === today ? ' for today' : ` for ${date}`}` };
  }

  if (name === 'log_dopamine') {
    const status = args.status as 'success' | 'relapse';
    const urge = Number(args.urge ?? 3);
    const note = (args.note as string) || '';
    const date = (args.date as string) || today;
    await upsertDopamineEntry(userId, { date, status, urge, note: note || undefined });
    const label = status === 'success' ? 'Stayed strong' : 'Check-in logged';
    return { success: true, message: `${label}${date === today ? ' for today' : ` for ${date}`}` };
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
      title: best.name,
      date,
      duration_minutes: 0,
      exercises: [{ name: best.name, muscle_group: best.muscle_group, exercise_db_id: best.id || null, completed_sets: completedSets }],
    });

    window.dispatchEvent(new CustomEvent('athlix:workout-logged'));
    const weightStr = weight > 0 ? ` @ ${weight}${unit}` : '';
    return { success: true, message: `${best.name} — ${sets}×${reps}${weightStr} logged${date === today ? ' for today' : ` for ${date}`}` };
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

const ApiKeySetupModal: React.FC<{ onDone: () => void }> = ({ onDone }) => {
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
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${trimmed}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }], generationConfig: { maxOutputTokens: 1 } }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg: string = (body as any)?.error?.message || `Error ${res.status}`;
        setError(msg.includes('API_KEY') || res.status === 400 ? 'Invalid key — check and try again.' : msg);
        return;
      }
      localStorage.setItem(GEMINI_KEY_STORAGE, trimmed);
      setStep(3);
      setTimeout(onDone, 1200);
    } catch {
      setError('Could not reach Gemini. Check your connection.');
    } finally {
      setValidating(false);
    }
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
            Your key is stored only on this device — never sent to Athlix servers. All AI requests go
            directly from your browser to Google's Gemini API. You can revoke it anytime at aistudio.google.com.
          </p>
        )}
      </div>
    </div>
  );
};

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
  const [prs, setPrs] = useState<LocalPersonalRecord[]>([]);
  const [foodScans, setFoodScans] = useState<FoodScan[]>([]);
  const [recentRuns, setRecentRuns] = useState<SavedRun[]>([]);
  const [whoopData, setWhoopData] = useState<WhoopAllData | null>(null);
  const [skincareStats, setSkincareStats] = useState<{ weekPercent: number; streak: number } | null>(null);
  const [showKeySetup, setShowKeySetup] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
  const model = localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_MODEL;

  /* ── Load all data sources once chat opens ───────────────────────── */
  useEffect(() => {
    if (!open || dataReady || !user?.id) return;
    const load = async () => {
      const startDate = format(subDays(new Date(), 90), 'yyyy-MM-dd');
      const [workoutRes, prRes, foodRes, whoopRes] = await Promise.allSettled([
        getWorkouts(user.id, { startDate, limit: 20, includeExercises: true }),
        getPersonalRecords(user.id),
        getFoodScans(user.id, 0, 14),
        whoopService.fetchAll('day').catch(() => null),
      ]);

      if (workoutRes.status === 'fulfilled') setWorkouts((workoutRes.value as WorkoutWithExercises[]) || []);
      if (prRes.status === 'fulfilled') setPrs((prRes.value as LocalPersonalRecord[]) || []);
      if (foodRes.status === 'fulfilled') setFoodScans((foodRes.value as { scans: FoodScan[] }).scans || []);
      if (whoopRes.status === 'fulfilled' && whoopRes.value) setWhoopData(whoopRes.value as WhoopAllData);

      // Runs and skincare are synchronous (localStorage) — always safe
      setRecentRuns(getRuns());
      setSkincareStats(parseSkincareStats());

      setDataReady(true);
    };
    load();
  }, [open, user?.id, dataReady]);

  /* ── Auto-scroll to latest message ───────────────────────────────── */
  useEffect(() => {
    if (open) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
  }, [messages, open, loading]);

  /* ── Focus input when modal opens ───────────────────────────────── */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 320);
  }, [open]);

  const close = () => setOpen(false);

  const openChat = () => {
    const key = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
    if (!key) { setShowKeySetup(true); setOpen(true); }
    else { setShowKeySetup(false); setOpen(true); }
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

  /* ── Send message to Gemini ───────────────────────────────────────── */
  const send = useCallback(
    async (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || loading || !apiKey) return;

      const userMsg: Message = { role: 'user', text };
      const history = [...messages, userMsg];
      setMessages(history);
      setInput('');
      setLoading(true);

      try {
        const systemPrompt = buildSystemPrompt(profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats);

        // Only send the last MAX_HISTORY messages to keep prompt tokens low
        const trimmedHistory = history.slice(-MAX_HISTORY);

        const geminiContents = trimmedHistory.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

        // Build the Gemini request body (no google_search — can't mix with function_declarations)
        const buildBody = (contents: object[], targetModel: string) => ({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          tools: [{ function_declarations: FUNCTION_DECLARATIONS }],
          generationConfig: {
            temperature: 1,
            maxOutputTokens: 2048,
            ...(/^gemini-2\.5/.test(targetModel) && { thinkingConfig: { thinkingBudget: 1024 } }),
          },
        });

        // Returns true when the error is a transient server-side overload
        const isOverloaded = (status: number, msg: string) =>
          status === 503 || status === 429 && msg.includes('quota') === false ||
          msg.toLowerCase().includes('high demand') ||
          msg.toLowerCase().includes('overloaded') ||
          msg.toLowerCase().includes('try again');

        // Retry with backoff, then fall back to gemini-1.5-flash if primary is overloaded
        const FALLBACK_MODEL = 'gemini-1.5-flash';
        const RETRY_DELAYS = [1200, 2500]; // ms between attempts

        const fetchWithRetry = async (contents: object[]): Promise<Response> => {
          for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
            const targetModel = attempt < RETRY_DELAYS.length ? model : FALLBACK_MODEL;
            const res = await fetch(`${GEMINI_BASE}/${targetModel}:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(buildBody(contents, targetModel)),
            });
            if (res.ok) return res;

            const errBody = await res.clone().json().catch(() => ({}));
            const errMsg: string = errBody?.error?.message || `Request failed (${res.status})`;

            // Non-retryable errors — throw immediately
            if (res.status === 429 && errMsg.includes('quota')) {
              throw new Error('QUOTA: Your API key\'s project has billing enabled, which sets the free tier limit to 0.\n\nFix: Go to aistudio.google.com/app/apikey → "Create API key in new project" (no billing) → paste the new key in Settings.');
            }
            if (res.status === 400 && errMsg.includes('API_KEY')) {
              throw new Error('INVALID_KEY: Your API key is invalid. Check it in Settings.');
            }

            // Retryable overload errors
            if (isOverloaded(res.status, errMsg) && attempt < RETRY_DELAYS.length) {
              await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
              continue;
            }

            // Last attempt failed — throw
            throw new Error(errMsg);
          }
          throw new Error('All retry attempts failed.');
        };

        const res = await fetchWithRetry(geminiContents);
        const data = await res.json();
        trackTokenUsage(data?.usageMetadata?.totalTokenCount ?? 0);

        const rawParts: Array<{ text?: string; thought?: boolean; functionCall?: { name: string; args: Record<string, unknown> } }> =
          data?.candidates?.[0]?.content?.parts || [];

        // ── Function call branch ─────────────────────────────────────────
        const fnCallPart = rawParts.find((p) => p.functionCall);
        if (fnCallPart?.functionCall && user?.id) {
          const { name: toolName, args: toolArgs } = fnCallPart.functionCall;
          let toolResult: ToolResult;
          try {
            toolResult = await executeTool(user.id, toolName, toolArgs, navigate);
          } catch (e: any) {
            toolResult = { success: false, message: e.message || 'Action failed' };
          }

          // show_exercise_form: render inline form immediately, skip Gemini follow-up entirely
          if (toolResult.showForm) {
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

          // Send function result back to Gemini for a natural-language reply
          const followUpContents = [
            ...geminiContents,
            { role: 'model', parts: [{ functionCall: fnCallPart.functionCall }] },
            { role: 'user', parts: [{ functionResponse: { name: toolName, response: toolResult } }] },
          ];
          const res2 = await fetchWithRetry(followUpContents);
          const data2 = await res2.json();
          trackTokenUsage(data2?.usageMetadata?.totalTokenCount ?? 0);

          const finalParts: Array<{ text?: string; thought?: boolean }> =
            data2?.candidates?.[0]?.content?.parts || [];

          const aiText2 = finalParts.filter((p) => !p.thought).map((p) => p.text).join('').trim() || 'Done!';

          setMessages((prev) => [...prev, {
            role: 'model',
            text: aiText2,
            action: toolResult,
          }]);
          return;
        }

        // ── Normal text response branch ──────────────────────────────────
        const thought = rawParts.filter((p) => p.thought).map((p) => p.text).join('').trim();
        const aiText = rawParts.filter((p) => !p.thought).map((p) => p.text).join('').trim() || '(no response)';
        setMessages((prev) => [...prev, { role: 'model', text: aiText, thought: thought || undefined }]);
      } catch (err: any) {
        const raw: string = err?.message || 'Something went wrong.';
        const display = raw.startsWith('QUOTA:')
          ? raw.replace('QUOTA:', '⚠️ Quota issue —')
          : raw.startsWith('INVALID_KEY:')
            ? raw.replace('INVALID_KEY:', '🔑 Invalid key —')
            : `⚠️ ${raw}`;
        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            text: display,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, apiKey, model, profile, workouts, prs, foodScans, recentRuns, whoopData, skincareStats, messages],
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

  /* ── Direct exercise log (from form submit) ─────────────────────── */
  const handleLogExercise = useCallback(async (name: string, sets: SetEntry[], unit: 'kg' | 'lbs') => {
    if (!user?.id) return;
    try {
      const matches = await searchExerciseLibrary(user.id, name);
      const best = matches[0];
      const exerciseName = best?.name || name;
      const completedSets = sets.map((s) => ({ reps: s.reps, weight: s.weight, unit }));
      await saveWorkout(user.id, {
        title: exerciseName,
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
              <ApiKeySetupModal onDone={() => setShowKeySetup(false)} />
            ) : (
              <ChatContent
                apiKey={apiKey}
                messages={messages}
                suggestions={getSuggestions(workouts, foodScans, recentRuns)}
                input={input}
                loading={loading}
                loadingPhase={loadingPhase}
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
                onClear={() => setMessages([])}
                onCopy={handleCopy}
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
              <ApiKeySetupModal onDone={() => setShowKeySetup(false)} />
            ) : (
              <ChatContent
                apiKey={apiKey}
                messages={messages}
                suggestions={getSuggestions(workouts, foodScans, recentRuns)}
                input={input}
                loading={loading}
                loadingPhase={loadingPhase}
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
                onClear={() => setMessages([])}
                onCopy={handleCopy}
              />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return <>{chatPanel}</>;
};

/* ── Inline exercise quick-log form ───────────────────────────────── */
const ExerciseQuickForm: React.FC<{
  initialName?: string;
  onSubmit: (name: string, sets: SetEntry[], unit: 'kg' | 'lbs') => Promise<void>;
  loading: boolean;
  setLoading: (v: boolean) => void;
}> = ({ initialName = '', onSubmit, loading, setLoading }) => {
  const { user, profile } = useAuth();
  const defaultUnit = ((profile?.unit_preference as 'kg' | 'lbs') || 'kg');

  const [name, setName] = useState(initialName);
  const [sets, setSets] = useState<SetEntry[]>([{ reps: 10, weight: 0 }]);
  const [unit, setUnit] = useState<'kg' | 'lbs'>(defaultUnit);
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

          {/* Unit toggle */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.35)' }}>Unit</span>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              {(['kg', 'lbs'] as const).map((u) => (
                <button key={u} onClick={() => setUnit(u)}
                  className="px-3 py-1.5 text-[11px] font-bold transition-all"
                  style={{ background: unit === u ? '#C8FF00' : 'transparent', color: unit === u ? '#000' : 'rgba(255,255,255,0.4)' }}>
                  {u}
                </button>
              ))}
            </div>
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
  apiKey: string;
  messages: Message[];
  suggestions: string[];
  input: string;
  loading: boolean;
  loadingPhase: number;
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
  onClear: () => void;
  onCopy: (text: string, idx: number) => void;
}

const ChatContent: React.FC<ChatContentProps> = ({
  apiKey, messages, suggestions, input, loading, loadingPhase, copiedIdx,
  inputRef, bottomRef,
  onInput, onKey, onSend, onSuggest, onLogExercise, onShowFormWithName,
  onClose, onGoSettings, onClear, onCopy,
}) => {
  const [expandedThought, setExpandedThought] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState(false);

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
        {messages.length > 0 && (
          <button
            onClick={onClear}
            title="Clear chat"
            className="w-8 h-8 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
            style={{ borderRadius: 8 }}
          >
            <RotateCcw className="w-3.5 h-3.5" />
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
    {!apiKey ? (
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
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-0 px-5" style={{ minHeight: '60%' }}>
              {/* Aurora icon */}
              <div
                className="ai-aurora-static flex items-center justify-center"
                style={{ width: 52, height: 52, borderRadius: 8, border: '1.5px solid transparent', marginBottom: 14 }}
              >
                <Sparkles className="w-[22px] h-[22px]" style={{ color: 'var(--accent)' }} />
              </div>
              <p className="text-[17px] font-bold text-center mb-[6px]" style={{ color: 'var(--text-primary)' }}>
                Your AI fitness coach
              </p>
              <p className="text-[13px] text-center leading-relaxed mb-6 max-w-[260px]" style={{ color: 'var(--text-secondary)' }}>
                Ask about training, or tell me to log something — weight, check-in, anything.
              </p>
              {/* 2-col chip grid */}
              <div className="w-full grid grid-cols-2 gap-2">
                {suggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => onSuggest(q)}
                    className="text-left transition-all"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: 1.4,
                    }}
                  >
                    {q}
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
                {/* Action confirmation card */}
                {m.role === 'model' && m.action && m.action.message && (
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
                    {renderText(m.text)}
                  </div>
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
                  <button
                    onClick={() => onCopy(m.text, i)}
                    title="Copy response"
                    className="self-start flex items-center gap-1 transition-colors"
                    style={{
                      padding: '2px 4px',
                      borderRadius: 4,
                      fontSize: 10,
                      color: copiedIdx === i ? 'var(--accent)' : 'var(--text-muted)',
                      background: 'none',
                      border: 'none',
                    }}
                  >
                    {copiedIdx === i
                      ? <><Check className="w-[11px] h-[11px]" /> Copied</>
                      : <><Copy className="w-[11px] h-[11px]" /> Copy</>}
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
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
          <div ref={bottomRef} />
        </div>

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
  </>
  );
};

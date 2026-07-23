import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getWorkouts, getPersonalRecords } from '../../lib/supabaseData';
import type { FoodScan } from '../../features/food/types';
import { getRuns } from '../../features/running/utils/storage';
import { whoopService } from '../../features/whoop/services/whoopService';
import { buildSystemPrompt, parseSkincareStats, type WorkoutWithExercises } from '../../lib/aiCoach';
import type { WorkoutComparison } from '../../lib/supabaseData';

const GEMINI_KEY_STORAGE = 'athlix:gemini_api_key';
const GEMINI_MODEL_STORAGE = 'athlix:gemini_model';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODEL = 'gemini-1.5-flash';
const TEASER_AUTO_DISMISS_MS = 20_000;
const ANALYZING_TIMEOUT_MS = 10_000;
const COOLDOWN_MS = 60_000;

interface FinishedStats {
  durationMinutes: number;
  totalVolume: number;
  totalSets: number;
  unit: 'kg' | 'lbs';
  exerciseNames: string[];
}

interface GoalUpdate {
  exerciseName: string;
  achieved: boolean;
  targetWeight: number;
  targetReps: number;
  unit: string;
  currentBestWeight: number;
  currentBestReps: number;
}

interface WorkoutFinishedDetail {
  stats: FinishedStats;
  realPrCount: number;
  goalUpdates: GoalUpdate[];
  comparison: WorkoutComparison | null;
}

type PillState = 'idle' | 'analyzing' | 'teaser' | 'drawer' | 'no-key';

function buildInsightPrompt(detail: WorkoutFinishedDetail): string {
  const { stats, realPrCount, goalUpdates, comparison } = detail;
  const parts: string[] = [
    `I just finished this workout: ${stats.exerciseNames.join(', ')}. Duration: ${stats.durationMinutes} min, total volume: ${stats.totalVolume}${stats.unit}, total sets: ${stats.totalSets}.`,
  ];
  if (realPrCount > 0) parts.push(`I hit ${realPrCount} new personal record${realPrCount !== 1 ? 's' : ''} this session.`);
  if (comparison) {
    const dir = comparison.volumeDelta >= 0 ? 'up' : 'down';
    parts.push(
      `Compared to my last similar session (${comparison.previousTitle} on ${comparison.previousDate}): volume is ${dir} ${Math.abs(Math.round(comparison.volumeDelta))}${stats.unit}, sets delta ${comparison.setsDelta}, duration delta ${comparison.durationDeltaMinutes} min.`,
    );
  } else {
    parts.push('This is the first time I\'ve logged this particular workout, so there\'s no direct comparison.');
  }
  const achievedGoals = goalUpdates.filter((g) => g.achieved);
  const inProgressGoals = goalUpdates.filter((g) => !g.achieved);
  if (achievedGoals.length) {
    parts.push(`I just hit my goal on: ${achievedGoals.map((g) => `${g.exerciseName} (${g.targetWeight}${g.unit} x ${g.targetReps})`).join(', ')}.`);
  }
  if (inProgressGoals.length) {
    parts.push(
      `Still working toward: ${inProgressGoals.map((g) => `${g.exerciseName} — best today ${g.currentBestWeight}${g.unit} x ${g.currentBestReps}, target ${g.targetWeight}${g.unit} x ${g.targetReps}`).join('; ')}.`,
    );
  }
  parts.push('Give me a short, encouraging take (2-3 sentences) and one concrete, evidence-based suggestion for today or tomorrow — factor in my recovery status and recent training load if that data is available to you. Address me by first name.');
  return parts.join(' ');
}

export const PostWorkoutCoachPill: React.FC = () => {
  const { user, profile } = useAuth();
  const [state, setState] = useState<PillState>('idle');
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const [drawerInput, setDrawerInput] = useState('');
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const requestIdRef = useRef(0);
  const lastFiredAtRef = useRef(0);

  const runInsight = useCallback(async (detail: WorkoutFinishedDetail) => {
    if (!user?.id) return;

    const now = Date.now();
    if (now - lastFiredAtRef.current < COOLDOWN_MS) return;
    lastFiredAtRef.current = now;

    const myRequestId = ++requestIdRef.current;

    setState('analyzing');
    setFeedback(null);

    const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
    if (!apiKey) {
      if (myRequestId === requestIdRef.current) setState('no-key');
      return;
    }

    const model = localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_MODEL;
    const timeoutId = setTimeout(() => {
      if (myRequestId === requestIdRef.current) setState((s) => (s === 'analyzing' ? 'idle' : s));
    }, ANALYZING_TIMEOUT_MS);

    try {
      const [workoutsRes, prsRes, whoopRes] = await Promise.allSettled([
        getWorkouts(user.id, { limit: 20, includeExercises: true }),
        getPersonalRecords(user.id),
        whoopService.fetchAll('day').catch(() => null),
      ]);
      const workouts = (workoutsRes.status === 'fulfilled' ? workoutsRes.value : []) as WorkoutWithExercises[];
      const prs = prsRes.status === 'fulfilled' ? prsRes.value : [];
      const whoopData = whoopRes.status === 'fulfilled' ? whoopRes.value : null;

      const systemPrompt = buildSystemPrompt(profile, workouts, prs, [] as FoodScan[], getRuns(), whoopData as any, parseSkincareStats());
      const userTurn = buildInsightPrompt(detail);

      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 400,
          ...(/^gemini-2\.5/.test(model) && { thinkingConfig: { thinkingBudget: 512 } }),
        },
      };

      let res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        res = await fetch(`${GEMINI_BASE}/${FALLBACK_MODEL}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, generationConfig: { temperature: 0.8, maxOutputTokens: 400 } }),
        });
      }
      if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);

      const data = await res.json();
      const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text).join('').trim();
      if (!text) throw new Error('Empty response');

      clearTimeout(timeoutId);
      if (myRequestId !== requestIdRef.current) return;

      setMessage(text);
      setState('teaser');

      clearDismissTimer();
      dismissTimerRef.current = setTimeout(() => setState((s) => (s === 'teaser' ? 'idle' : s)), TEASER_AUTO_DISMISS_MS);
    } catch {
      clearTimeout(timeoutId);
      if (myRequestId === requestIdRef.current) setState('idle');
    }
  }, [user?.id, profile, clearDismissTimer]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WorkoutFinishedDetail>).detail;
      if (detail) runInsight(detail);
    };
    window.addEventListener('athlix:workout-finished', handler);
    return () => window.removeEventListener('athlix:workout-finished', handler);
  }, [runInsight]);

  useEffect(() => () => clearDismissTimer(), [clearDismissTimer]);

  const openDrawer = () => {
    clearDismissTimer();
    setState('drawer');
  };

  const handOffToChat = (seedText: string) => {
    setState('idle');
    window.dispatchEvent(new CustomEvent('athlix:open-ai', {
      detail: { seedMessages: [{ role: 'model', text: message }, ...(seedText ? [{ role: 'user', text: seedText }] : [])] },
    }));
  };

  if (state === 'idle') return null;

  const firstName = (profile?.full_name || 'there').split(' ')[0];

  return (
    <div className="fixed z-[110]" style={{ right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 148px)' }}>
      <AnimatePresence mode="wait">
        {state === 'analyzing' && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-2 h-11 pl-3 pr-4 rounded-full shadow-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="flex items-center justify-center w-6 h-6 rounded-full"
              style={{ background: 'var(--accent)' }}
            >
              <Sparkles className="w-3.5 h-3.5 text-black" />
            </motion.span>
            <span className="text-[12px] font-semibold" style={{ color: 'var(--text-secondary)' }}>Analyzing…</span>
          </motion.div>
        )}

        {state === 'teaser' && (
          <motion.button
            key="teaser"
            type="button"
            onClick={openDrawer}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-2 max-w-[280px] h-11 pl-3 pr-4 rounded-full shadow-lg text-left cursor-pointer"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full shrink-0" style={{ background: 'var(--accent)' }}>
              <Sparkles className="w-3.5 h-3.5 text-black" />
            </span>
            <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {firstName} · {message.slice(0, 60)}…
            </span>
          </motion.button>
        )}

        {state === 'no-key' && (
          <motion.button
            key="no-key"
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('athlix:open-ai'))}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="flex items-center gap-2 h-11 pl-3 pr-4 rounded-full shadow-lg cursor-pointer"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Set up AI Coach for workout insights</span>
          </motion.button>
        )}

        {state === 'drawer' && (
          <motion.div
            key="drawer"
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96 }}
            className="w-[320px] max-w-[calc(100vw-32px)] rounded-2xl shadow-2xl overflow-hidden"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>AI Coach</span>
              </div>
              <button type="button" onClick={() => setState('idle')} className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {message}
            </div>
            <div className="flex items-center gap-2 px-4 pb-2">
              <button type="button" onClick={() => setFeedback('up')} className="cursor-pointer" style={{ color: feedback === 'up' ? 'var(--accent)' : 'var(--text-muted)' }}>
                <ThumbsUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => setFeedback('down')} className="cursor-pointer" style={{ color: feedback === 'down' ? '#f87171' : 'var(--text-muted)' }}>
                <ThumbsDown className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 p-3" style={{ borderTop: '1px solid var(--border)' }}>
              <input
                type="text"
                value={drawerInput}
                onChange={(e) => setDrawerInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && drawerInput.trim()) handOffToChat(drawerInput.trim()); }}
                placeholder="Ask AI anything…"
                className="flex-1 h-9 rounded-lg px-3 text-[12px] focus:outline-none"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                onClick={() => handOffToChat(drawerInput.trim())}
                className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0 cursor-pointer"
                style={{ background: 'var(--accent)', color: '#000' }}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Sparkles } from 'lucide-react';
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
const ANALYZING_TIMEOUT_MS = 10_000;
const COOLDOWN_MS = 60_000;
const COLLAPSED_AUTO_DISMISS_MS = 30_000;
const TYPE_CHAR_MS = 24;

// Vertical anchor shared by the FAB / bar / drawer so switching between them
// never jumps — matches this app's existing bottom-nav clearance convention.
const DOCK_BOTTOM = 'calc(env(safe-area-inset-bottom) + 88px)';

const KEYFRAMES = `
@keyframes pwcp-fabPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(90,110,255,0.35); } 50% { box-shadow: 0 0 0 8px rgba(90,110,255,0); } }
@keyframes pwcp-sparklePulse { 0%,100% { opacity:0.85; transform: scale(1); } 50% { opacity:1; transform: scale(1.08); } }
@keyframes pwcp-borderChase { to { transform: rotate(360deg); } }
@keyframes pwcp-cursorBlink { 0%,49% { opacity:1; } 50%,100% { opacity:0; } }
`;

// Same "Athlix AI" badge treatment used everywhere else this app shows the AI
// Coach (AiChat.tsx's header: dark fill + a static purple->blue->lime gradient
// border, via the layered-background-image border trick, rather than a solid
// gradient fill) — kept self-contained here instead of depending on AiChat's
// injected .ai-aurora-static class, since this pill can render on routes where
// AiChat itself isn't mounted.
const aiBadgeStyle = (size: number, radius: number): React.CSSProperties => ({
  width: size,
  height: size,
  borderRadius: radius,
  border: '1.5px solid transparent',
  backgroundImage: 'linear-gradient(#161a20, #161a20), linear-gradient(135deg,#7c3aed,#2563eb,#C8FF00)',
  backgroundOrigin: 'border-box',
  backgroundClip: 'padding-box, border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

const AI_ACCENT = 'var(--accent, #C8FF00)';

type View = 'closed' | 'analyzing' | 'typing' | 'collapsed' | 'expanded' | 'no-key';

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
  parts.push(
    'Give me a short, encouraging take (2-3 sentences) grounded in the specific numbers above — reference at least one real number I gave you (volume, a delta, a rep count) rather than generic praise. Then one concrete, evidence-based suggestion for today or tomorrow, factoring in my recovery status and recent training load if that data is available to you. Address me by first name. Do not use markdown formatting (no **bold**, no bullet points) — plain sentences only.',
  );
  return parts.join(' ');
}

export const PostWorkoutCoachPill: React.FC = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const isImmersiveRoute = location.pathname === '/log' || location.pathname.startsWith('/run');

  const [view, setView] = useState<View>('closed');
  const [message, setMessage] = useState('');
  const [typedText, setTypedText] = useState('');
  const [typingDone, setTypingDone] = useState(false);

  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const requestIdRef = useRef(0);
  const lastFiredAtRef = useRef(0);

  useEffect(() => {
    if (document.getElementById('pwcp-keyframes')) return;
    const el = document.createElement('style');
    el.id = 'pwcp-keyframes';
    el.textContent = KEYFRAMES;
    document.head.appendChild(el);
  }, []);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  const startTyping = useCallback((full: string) => {
    setTypedText('');
    setTypingDone(false);
    setView('typing');
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    let i = 0;
    typeTimerRef.current = setInterval(() => {
      i++;
      setTypedText(full.slice(0, i));
      if (i >= full.length) {
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
        setTypingDone(true);
        setTimeout(() => {
          setView('collapsed');
          clearDismissTimer();
          dismissTimerRef.current = setTimeout(() => setView((v) => (v === 'collapsed' ? 'closed' : v)), COLLAPSED_AUTO_DISMISS_MS);
        }, 550);
      }
    }, TYPE_CHAR_MS);
  }, [clearDismissTimer]);

  const runInsight = useCallback(async (detail: WorkoutFinishedDetail) => {
    if (!user?.id) return;

    const now = Date.now();
    if (now - lastFiredAtRef.current < COOLDOWN_MS) return;
    lastFiredAtRef.current = now;

    const myRequestId = ++requestIdRef.current;

    setView('analyzing');

    const apiKey = localStorage.getItem(GEMINI_KEY_STORAGE)?.trim() || '';
    if (!apiKey) {
      if (myRequestId === requestIdRef.current) setView('no-key');
      return;
    }

    const model = localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_MODEL;
    const timeoutId = setTimeout(() => {
      if (myRequestId === requestIdRef.current) setView((v) => (v === 'analyzing' ? 'closed' : v));
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

      const systemPrompt = buildSystemPrompt(profile, workouts, prs, [] as FoodScan[], getRuns(), whoopData as any, parseSkincareStats(), 'insight');
      const userTurn = buildInsightPrompt(detail);

      const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
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
          body: JSON.stringify({ ...body, generationConfig: { temperature: 0.8, maxOutputTokens: 1024 } }),
        });
      }
      if (!res.ok) {
        const errBody = await res.clone().json().catch(() => ({}));
        throw new Error(`Gemini request failed (${res.status}): ${(errBody as any)?.error?.message || 'unknown error'}`);
      }

      const data = await res.json();
      const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text).join('').trim().replace(/\*\*/g, '');
      if (!text) throw new Error(`Empty response — finishReason: ${data?.candidates?.[0]?.finishReason || 'unknown'}`);

      clearTimeout(timeoutId);
      if (myRequestId !== requestIdRef.current) return;

      setMessage(text);
      startTyping(text);
    } catch (err) {
      console.warn('Post-workout AI insight failed:', err);
      clearTimeout(timeoutId);
      if (myRequestId === requestIdRef.current) setView('closed');
    }
  }, [user?.id, profile, startTyping]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WorkoutFinishedDetail>).detail;
      if (detail) runInsight(detail);
    };
    window.addEventListener('athlix:workout-finished', handler);
    return () => window.removeEventListener('athlix:workout-finished', handler);
  }, [runInsight]);

  useEffect(() => () => {
    clearDismissTimer();
    if (typeTimerRef.current) clearInterval(typeTimerRef.current);
  }, [clearDismissTimer]);

  const openFab = () => {
    // Tapping the idle FAB always opens the real AI Coach conversation —
    // it should never re-surface the one-off post-workout insight bar
    // instead of the actual ongoing chat.
    window.dispatchEvent(new CustomEvent('athlix:open-ai'));
  };

  const barClick = () => {
    if (view === 'collapsed') {
      clearDismissTimer();
      setView('expanded');
    } else if (view === 'no-key') {
      window.dispatchEvent(new CustomEvent('athlix:open-ai'));
    }
  };

  const closeToClosed = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    clearDismissTimer();
    setView('closed');
  };

  const [drawerInput, setDrawerInput] = useState('');
  const handOffToChat = (seedText: string) => {
    setView('closed');
    window.dispatchEvent(new CustomEvent('athlix:open-ai', {
      detail: { seedMessages: [{ role: 'model', text: message }], seedText: seedText || undefined },
    }));
  };

  if (typeof document === 'undefined') return null;
  if (view === 'closed' && isImmersiveRoute) return null;

  const firstName = (profile?.full_name || 'there').split(' ')[0];
  const displayText = view === 'analyzing' ? 'Analyzing…' : view === 'typing' ? typedText : message;
  const showBar = view === 'analyzing' || view === 'typing' || view === 'collapsed' || view === 'no-key';
  const barChasing = view === 'analyzing' || view === 'typing';
  const barNarrow = view === 'analyzing';

  return createPortal(
    <>
      {/* Idle FAB — mobile only, matches the AI-entry-point button it replaces (desktop keeps the sidebar link) */}
      {view === 'closed' && !isImmersiveRoute && (
        <button
          type="button"
          onClick={openFab}
          aria-label="AI Coach"
          className="md:hidden fixed z-[110]"
          style={{
            ...aiBadgeStyle(56, 16),
            right: 20,
            bottom: DOCK_BOTTOM,
            cursor: 'pointer',
            animation: 'pwcp-fabPulse 2.4s ease-in-out infinite',
          }}
        >
          <Sparkles className="w-6 h-6" style={{ color: AI_ACCENT }} strokeWidth={1.75} />
        </button>
      )}

      {/* Analyzing → typing → collapsed: one persistent bar that morphs continuously */}
      <AnimatePresence>
        {showBar && (
          <motion.div
            key="bar"
            onClick={barClick}
            initial={{ opacity: 0, scale: 0.85, y: 12 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              right: barNarrow ? 20 : 25,
              width: barNarrow ? 170 : 340,
            }}
            exit={{ opacity: 0, scale: 0.85, y: 12 }}
            transition={{ right: { duration: 0.5, ease: [0.22, 0.8, 0.25, 1] }, width: { duration: 0.5, ease: [0.22, 0.8, 0.25, 1] }, default: { type: 'spring', damping: 22, stiffness: 320 } }}
            className="fixed z-[110]"
            style={{
              boxSizing: 'border-box',
              bottom: DOCK_BOTTOM,
              maxWidth: 'calc(100vw - 32px)',
              background: '#161a20',
              border: '1px solid rgba(111,92,245,0.3)',
              borderRadius: 20,
              padding: 12,
              display: 'flex',
              alignItems: barNarrow ? 'center' : 'flex-start',
              gap: 10,
              cursor: view === 'collapsed' || view === 'no-key' ? 'pointer' : 'default',
              boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
            }}
          >
            <span style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
              {barChasing && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 10,
                    pointerEvents: 'none',
                    background: 'conic-gradient(from 0deg, transparent 0deg, #7c6cf5 90deg, #3f6df0 180deg, transparent 280deg, transparent 360deg)',
                    animation: 'pwcp-borderChase 1.6s linear infinite',
                  }}
                />
              )}
              <span
                style={{
                  ...aiBadgeStyle(26, 8),
                  position: 'absolute',
                  inset: 3,
                  boxShadow: '0 0 0 2px #161a20',
                  animation: view === 'analyzing' ? 'pwcp-sparklePulse 1.1s ease-in-out infinite' : 'none',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: AI_ACCENT }} strokeWidth={1.75} />
              </span>
            </span>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'normal',
                wordBreak: 'break-word',
                color: '#f0f0f0',
                fontSize: 13,
                lineHeight: 1.35,
                fontWeight: 500,
              }}
            >
              {view === 'no-key' ? 'Set up AI Coach for workout insights' : displayText}
              {view === 'typing' && !typingDone && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 2,
                    height: 14,
                    background: '#5b7cf0',
                    marginLeft: 2,
                    verticalAlign: 'middle',
                    animation: 'pwcp-cursorBlink 0.8s step-end infinite',
                  }}
                />
              )}
            </div>
            {view !== 'analyzing' && (
              <button
                type="button"
                onClick={closeToClosed}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8a8a8a',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 4,
                  flexShrink: 0,
                  opacity: view === 'collapsed' || view === 'no-key' ? 1 : 0,
                  pointerEvents: view === 'collapsed' || view === 'no-key' ? 'auto' : 'none',
                  transition: 'opacity 0.3s ease',
                }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Expanded drawer — grows from the same docked position */}
      <AnimatePresence>
        {view === 'expanded' && (
          <motion.div
            key="drawer"
            initial={{ opacity: 0, scale: 0.4, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.4, y: 12 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="fixed z-[110]"
            style={{
              right: 16,
              width: 'min(420px, calc(100vw - 32px))',
              bottom: `calc(${DOCK_BOTTOM} - 4px)`,
              maxHeight: 480,
              background: '#161a20',
              border: '1px solid rgba(120,140,255,0.3)',
              borderRadius: 20,
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              onClick={closeToClosed}
              className="cursor-pointer"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid #2a2f3a' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={aiBadgeStyle(34, 10)}>
                  <Sparkles className="w-[18px] h-[18px]" style={{ color: AI_ACCENT }} strokeWidth={1.75} />
                </span>
                <span style={{ color: '#f0f0f0', fontWeight: 700, fontSize: 15 }}>AI Coach</span>
              </div>
              <button type="button" onClick={closeToClosed} className="cursor-pointer" style={{ background: 'none', border: 'none', color: '#8a8a8a', padding: 4 }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div style={{ padding: 14, overflowY: 'auto', color: '#e4e4e4', fontSize: 14.5, lineHeight: 1.55 }}>
              {message}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px 12px', borderTop: '1px solid #2a2f3a' }}>
              <input
                type="text"
                value={drawerInput}
                onChange={(e) => setDrawerInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && drawerInput.trim()) handOffToChat(drawerInput.trim()); }}
                placeholder="Ask AI anything…"
                style={{ flex: 1, background: '#1e1e1e', border: '1px solid #2a2a2a', borderRadius: 10, padding: '10px 12px', color: '#f0f0f0', fontSize: 13, outline: 'none' }}
              />
              <button
                type="button"
                onClick={() => handOffToChat(drawerInput.trim())}
                className="cursor-pointer"
                style={{ width: 38, height: 38, borderRadius: 10, background: '#C8FF00', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <Send className="w-4 h-4" style={{ color: '#0a0a0a' }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>,
    document.body,
  );
};

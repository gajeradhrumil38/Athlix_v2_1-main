import React, { useCallback, useEffect, useRef, useState } from 'react';
import { aiCoachFetch } from '../../lib/aiCoachFetch';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Send, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getWorkouts, getPersonalRecords } from '../../lib/supabaseData';
import type { FoodScan } from '../../features/food/types';
import { getRuns } from '../../features/running/utils/storage';
import { whoopService, whoopWindowRange } from '../../features/whoop/services/whoopService';
import { getFoodScans } from '../../lib/foodData';
import { buildSystemPrompt, parseSkincareStats, type WorkoutWithExercises } from '../../lib/aiCoach';
import { getCoachMemory } from '../../lib/coachMemory';
import type { WorkoutComparison } from '../../lib/supabaseData';
import { useAiCoachKey } from '../../hooks/useAiCoachKey';
import { buildBriefingPrompt, buildFallbackBriefing, getCachedBriefing, setCachedBriefing, getTodayFeeling } from '../../lib/dailyBriefing';
import { COACH_CONTEXTS, contextFiredToday, markContextFired } from '../../lib/contextCoach';

const FALLBACK_MODEL = 'gemini-2.5-flash';
const ANALYZING_TIMEOUT_MS = 10_000;
const COOLDOWN_MS = 60_000;
const COLLAPSED_AUTO_DISMISS_MS = 30_000;
// The daily briefing / contextual notes return to the idle FAB faster than the
// post-workout insight — they're passing "here's your day / here's this page",
// not something to dwell on.
const BRIEFING_DISMISS_MS = 7_000;
const CONTEXT_DISMISS_MS = 8_000;
// Don't fire another contextual pill within this window — browsing around fast
// shouldn't stack pills.
const CONTEXT_COOLDOWN_MS = 60_000;
const TYPE_CHAR_MS = 24;

// Vertical anchor shared by the FAB / bar / drawer so switching between them
// never jumps — matches this app's existing bottom-nav clearance convention.
const DOCK_BOTTOM = 'calc(env(safe-area-inset-bottom) + 88px)';

const KEYFRAMES = `
@keyframes pwcp-fabGlow { 0%,100% { box-shadow: 0 8px 24px rgba(0,0,0,0.35); } 50% { box-shadow: 0 10px 30px rgba(0,0,0,0.4), 0 0 14px rgba(200,255,0,0.13); } }
@keyframes pwcp-sparklePulse { 0%,100% { opacity:0.9; transform: scale(1); } 50% { opacity:1; transform: scale(1.06); } }
@keyframes pwcp-borderFlow { 0% { background-position: 0% 50%; } 100% { background-position: -300% 50%; } }
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
  // Plain mono hairline over a frosted translucent fill — quiet and
  // Apple-material; the only colour is the accent sparkle inside.
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(20,22,28,0.78)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
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

// Deterministic, no-API-call summary — used whenever Gemini fails or times
// out, so the pill always resolves to a real reply instead of silently
// closing after "Analyzing…".
function buildFallbackInsight(detail: WorkoutFinishedDetail, firstName: string): string {
  const { stats, realPrCount, comparison } = detail;
  const opener = realPrCount > 0
    ? `Nice work ${firstName} — ${realPrCount} new PR${realPrCount !== 1 ? 's' : ''} this session.`
    : comparison
      ? `Solid session ${firstName} — volume ${comparison.volumeDelta >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(comparison.volumeDelta))}${stats.unit} vs your last similar workout.`
      : `Good session ${firstName} — ${stats.totalSets} sets across ${stats.exerciseNames.length} exercise${stats.exerciseNames.length !== 1 ? 's' : ''} logged.`;
  return `${opener} ${stats.durationMinutes} min, ${stats.totalVolume}${stats.unit} total volume.`;
}

export const PostWorkoutCoachPill: React.FC = () => {
  const { user, profile } = useAuth();
  const location = useLocation();
  const isImmersiveRoute = location.pathname === '/log' || location.pathname.startsWith('/run');
  const { hasKey, model } = useAiCoachKey();

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

  const startTyping = useCallback((full: string, dismissMs: number = COLLAPSED_AUTO_DISMISS_MS) => {
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
          // Auto-return to the idle FAB after `dismissMs` (unless the user
          // taps it first, which clears this and expands the drawer).
          dismissTimerRef.current = setTimeout(() => setView((v) => (v === 'collapsed' ? 'closed' : v)), dismissMs);
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

    if (!hasKey) {
      if (myRequestId === requestIdRef.current) setView('no-key');
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYZING_TIMEOUT_MS);

    try {
      const [workoutsRes, prsRes, whoopRes, foodRes] = await Promise.allSettled([
        getWorkouts(user.id, { limit: 20, includeExercises: true }),
        getPersonalRecords(user.id),
        whoopService.fetchAll('day').catch(() => null),
        getFoodScans(user.id, 0, 90).then((r) => r.scans).catch(() => [] as FoodScan[]),
      ]);
      const workouts = (workoutsRes.status === 'fulfilled' ? workoutsRes.value : []) as WorkoutWithExercises[];
      const prs = prsRes.status === 'fulfilled' ? prsRes.value : [];
      const whoopData = whoopRes.status === 'fulfilled' ? whoopRes.value : null;
      const food = (foodRes.status === 'fulfilled' ? foodRes.value : []) as FoodScan[];

      const systemPrompt = buildSystemPrompt(profile, workouts, prs, food, getRuns(), whoopData as any, parseSkincareStats(), 'insight', getCoachMemory(user.id));
      const userTurn = buildInsightPrompt(detail);

      // Thinking disabled: this is a short 2-3 sentence summary, not a
      // reasoning task, and thinking tokens count against the same
      // maxOutputTokens budget — skipping it keeps this fast and reliable.
      const buildBody = (targetModel: string) => ({
        model: targetModel,
        stream: false,
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1024,
          ...(/^gemini-2\.5/.test(targetModel) && { thinkingConfig: { thinkingBudget: 0 } }),
        },
      });

      let res = await aiCoachFetch('/api/ai-coach/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(model)),
        signal: controller.signal,
      });
      if (!res.ok) {
        res = await aiCoachFetch('/api/ai-coach/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBody(FALLBACK_MODEL)),
          signal: controller.signal,
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
      console.warn('Post-workout AI insight failed, using fallback summary:', err);
      clearTimeout(timeoutId);
      if (myRequestId !== requestIdRef.current) return;
      const firstName = (profile?.full_name || 'there').split(' ')[0];
      const fallback = buildFallbackInsight(detail, firstName);
      setMessage(fallback);
      startTyping(fallback);
    }
  }, [user?.id, profile, startTyping, hasKey, model]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WorkoutFinishedDetail>).detail;
      if (detail) runInsight(detail);
    };
    window.addEventListener('athlix:workout-finished', handler);
    return () => window.removeEventListener('athlix:workout-finished', handler);
  }, [runInsight]);

  // ── Proactive coach (daily briefing + contextual page notes) ────────────────
  // Both ride the SAME pill as the post-workout insight (analyzing → typed
  // reply → collapsed bar you can tap to reply). deliverCoachMessage does the
  // shared work: gather full context, generate for a given user turn, always
  // resolve to a message (a deterministic fallback if the model call fails).
  const deliverCoachMessage = useCallback(async (
    userTurn: string,
    dismissMs: number,
    onShown?: (text: string) => void,
  ) => {
    if (!user?.id || !hasKey) return;
    const myRequestId = ++requestIdRef.current;
    setView('analyzing');

    // Gather context FIRST, untimed — the 28-day WHOOP fetch can be slow on a
    // cold cache and would otherwise eat the generate's abort budget.
    const { start, end } = whoopWindowRange(28);
    const [wRes, pRes, whoopRes, fRes] = await Promise.allSettled([
      getWorkouts(user.id, { limit: 25, includeExercises: true }),
      getPersonalRecords(user.id),
      whoopService.fetchAll('month', start, end).catch(() => null),
      getFoodScans(user.id, 0, 90).then((r) => r.scans).catch(() => [] as FoodScan[]),
    ]);
    if (myRequestId !== requestIdRef.current) return;
    const workouts = (wRes.status === 'fulfilled' ? wRes.value : []) as WorkoutWithExercises[];
    const prs = pRes.status === 'fulfilled' ? pRes.value : [];
    const whoopData = whoopRes.status === 'fulfilled' ? whoopRes.value : null;
    const food = (fRes.status === 'fulfilled' ? fRes.value : []) as FoodScan[];
    const firstName = (profile?.full_name || 'there').split(' ')[0];
    const fallback = buildFallbackBriefing(firstName, workouts, whoopData);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ANALYZING_TIMEOUT_MS);
    try {
      const systemPrompt = buildSystemPrompt(profile, workouts, prs, food, getRuns(), whoopData as any, parseSkincareStats(), 'insight', getCoachMemory(user.id));
      const buildBody = (targetModel: string) => ({
        model: targetModel,
        stream: false,
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 320,
          ...(/^gemini-2\.5/.test(targetModel) && { thinkingConfig: { thinkingBudget: 0 } }),
        },
      });

      let res = await aiCoachFetch('/api/ai-coach/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody(model)), signal: controller.signal });
      if (!res.ok) res = await aiCoachFetch('/api/ai-coach/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody(FALLBACK_MODEL)), signal: controller.signal });
      if (!res.ok) throw new Error(`Gemini request failed (${res.status})`);

      const data = await res.json();
      const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => !p.thought).map((p) => p.text).join('').trim().replace(/\*\*/g, '');
      if (!text) throw new Error('Empty response');

      clearTimeout(timeoutId);
      if (myRequestId !== requestIdRef.current) return;
      onShown?.(text);
      setMessage(text);
      startTyping(text, dismissMs);
    } catch (err) {
      console.warn('Coach message failed, using fallback:', err);
      clearTimeout(timeoutId);
      if (myRequestId !== requestIdRef.current) return;
      onShown?.(fallback);
      setMessage(fallback);
      startTyping(fallback, dismissMs); // smooth flow: never close silently
    }
  }, [user?.id, profile, hasKey, model, startTyping]);

  // Live mirror of `view` so the contextual effect can check "is a pill already
  // up?" without re-running every time the view morphs.
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const lastPillFiredRef = useRef(0);

  // Daily briefing — surfaces on EVERY app open/refresh (once per mount),
  // shortly after the app settles. Uses the per-period cache: instant + free
  // if this time-of-day's note already exists, otherwise generates it. So it
  // always appears, is time-appropriate, but only spends a request a few times
  // a day.
  const briefingTriedRef = useRef(false);
  useEffect(() => {
    if (briefingTriedRef.current) return;
    if (!hasKey || !user?.id || isImmersiveRoute) return;
    briefingTriedRef.current = true;
    const cached = getCachedBriefing();
    const t = setTimeout(() => {
      if (viewRef.current !== 'closed') return; // a workout insight is already up
      lastPillFiredRef.current = Date.now();
      if (cached?.text) {
        setMessage(cached.text);
        startTyping(cached.text, BRIEFING_DISMISS_MS);
      } else {
        void deliverCoachMessage(
          buildBriefingPrompt((profile?.full_name || 'there').split(' ')[0], getTodayFeeling()),
          BRIEFING_DISMISS_MS,
          (text) => setCachedBriefing(text),
        );
      }
    }, 1600);
    return () => clearTimeout(t);
  }, [hasKey, user?.id, isImmersiveRoute, profile, deliverCoachMessage, startTyping]);

  // Contextual notes — landing on a data page proactively pops the relevant
  // "how's the past, what's next" note (once per context per day, cooldown-
  // throttled, never over an already-open pill).
  useEffect(() => {
    if (!hasKey || !user?.id || isImmersiveRoute) return;
    if (viewRef.current !== 'closed') return;
    const ctx = COACH_CONTEXTS.find((c) => c.matches(location.pathname));
    if (!ctx || contextFiredToday(ctx.id)) return;
    if (Date.now() - lastPillFiredRef.current < CONTEXT_COOLDOWN_MS) return;
    const t = setTimeout(() => {
      if (viewRef.current !== 'closed') return;
      lastPillFiredRef.current = Date.now();
      markContextFired(ctx.id);
      void deliverCoachMessage(ctx.userTurn, CONTEXT_DISMISS_MS);
    }, 1200);
    return () => clearTimeout(t);
  }, [location.pathname, hasKey, user?.id, isImmersiveRoute, deliverCoachMessage]);

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

  // A page can hide the coach pill while it shows its OWN full-screen overlay
  // (e.g. Run History's run-detail) so the FAB doesn't float on top of it —
  // dispatch `athlix:coach-overlay` with { open }.
  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    const h = (e: Event) => setOverlayOpen(!!(e as CustomEvent<{ open?: boolean }>).detail?.open);
    window.addEventListener('athlix:coach-overlay', h);
    return () => window.removeEventListener('athlix:coach-overlay', h);
  }, []);

  const [drawerInput, setDrawerInput] = useState('');
  const handOffToChat = (seedText: string) => {
    setView('closed');
    window.dispatchEvent(new CustomEvent('athlix:open-ai', {
      detail: { seedMessages: [{ role: 'model', text: message }], seedText: seedText || undefined },
    }));
  };

  if (typeof document === 'undefined') return null;
  if (view === 'closed' && isImmersiveRoute) return null;
  if (overlayOpen) return null; // a page has a full-screen overlay up — stay out of its way

  const firstName = (profile?.full_name || 'there').split(' ')[0];
  const displayText = view === 'analyzing' ? 'Analyzing…' : view === 'typing' ? typedText : message;
  const showBar = view === 'analyzing' || view === 'typing' || view === 'collapsed' || view === 'no-key';
  const barChasing = view === 'analyzing' || view === 'typing';
  const barNarrow = view === 'analyzing';

  return createPortal(
    <>
      {/* Idle FAB — mobile only (desktop keeps the sidebar link). Springs in/out
          smoothly; a soft, slow breathing glow instead of the hard pulse. */}
      <AnimatePresence>
        {view === 'closed' && !isImmersiveRoute && (
          <motion.button
            key="fab"
            type="button"
            onClick={openFab}
            aria-label="AI Coach"
            className="md:hidden fixed z-[110]"
            initial={{ opacity: 0, scale: 0.5, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 12 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            whileTap={{ scale: 0.88 }}
            style={{
              ...aiBadgeStyle(56, 16),
              right: 20,
              bottom: DOCK_BOTTOM,
              cursor: 'pointer',
              animation: 'pwcp-fabGlow 3.2s ease-in-out infinite',
            }}
          >
            <Sparkles className="w-6 h-6" style={{ color: AI_ACCENT }} strokeWidth={1.75} />
          </motion.button>
        )}
      </AnimatePresence>

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
              // Frosted-glass material with a hairline edge + inner top
              // highlight + soft depth — the Apple "material over content" look.
              background: 'rgba(20,22,28,0.72)',
              backdropFilter: 'blur(24px) saturate(1.6)',
              WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
              border: '1px solid rgba(255,255,255,0.10)',
              borderRadius: 22,
              padding: 13,
              display: 'flex',
              alignItems: barNarrow ? 'center' : 'flex-start',
              gap: 11,
              cursor: view === 'collapsed' || view === 'no-key' ? 'pointer' : 'default',
              boxShadow: '0 12px 40px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)',
            }}
          >
            <span style={{ position: 'relative', width: 32, height: 32, flexShrink: 0 }}>
              <span
                style={{
                  ...aiBadgeStyle(26, 9),
                  position: 'absolute',
                  inset: 3,
                  animation: view === 'analyzing' ? 'pwcp-sparklePulse 1.1s ease-in-out infinite' : 'none',
                }}
              >
                <Sparkles className="w-3.5 h-3.5" style={{ color: AI_ACCENT }} strokeWidth={1.75} />
              </span>
              {barChasing && (
                // Gradient border that FLOWS in place — the colours drift
                // through the whole rounded border (animated background-
                // position) rather than a highlight circulating around it,
                // which read as a rectangle sweeping on the rounded shape. The
                // mask leaves only a ~1.25px ring at border-radius 9.
                <div
                  style={{
                    position: 'absolute',
                    inset: 3,
                    borderRadius: 9,
                    pointerEvents: 'none',
                    background: 'linear-gradient(90deg, #C8FF00, #8b7bf5, #5b8cf0, #C8FF00, #8b7bf5)',
                    backgroundSize: '300% 100%',
                    WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                    WebkitMaskComposite: 'xor',
                    mask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                    maskComposite: 'exclude',
                    padding: 1.25,
                    animation: 'pwcp-borderFlow 2.4s linear infinite',
                  }}
                />
              )}
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
                color: 'rgba(255,255,255,0.92)',
                fontSize: 13,
                lineHeight: 1.4,
                fontWeight: 450,
                letterSpacing: '-0.01em',
              }}
            >
              {view === 'no-key' ? 'Set up AI Coach for workout insights' : displayText}
              {view === 'typing' && !typingDone && (
                <span
                  style={{
                    display: 'inline-block',
                    width: 2,
                    height: 14,
                    background: AI_ACCENT,
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

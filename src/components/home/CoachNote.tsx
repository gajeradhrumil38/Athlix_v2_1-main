import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAiCoachKey } from '../../hooks/useAiCoachKey';
import { aiCoachFetch } from '../../lib/aiCoachFetch';
import { getWorkouts, getPersonalRecords } from '../../lib/supabaseData';
import { getRuns } from '../../features/running/utils/storage';
import { whoopService, whoopWindowRange } from '../../features/whoop/services/whoopService';
import { getFoodScans } from '../../lib/foodData';
import { buildSystemPrompt, parseSkincareStats, type WorkoutWithExercises } from '../../lib/aiCoach';
import type { FoodScan } from '../../features/food/types';
import {
  buildBriefingPrompt, getCachedBriefing, setCachedBriefing, getTodayFeeling, setTodayFeeling,
} from '../../lib/dailyBriefing';

const FALLBACK_MODEL = 'gemini-1.5-flash';
const FEELINGS = ['Fresh', 'Good', 'Sore', 'Tired'] as const;

// idle → nothing yet; analyzing → generating (thinking dots); typing → the
// coach "writes" the note character by character; done → static.
type Phase = 'idle' | 'analyzing' | 'typing' | 'done';

const COACH_NOTE_CSS = `
@keyframes cn-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
.cn-cursor { display:inline-block; width:2px; height:0.95em; margin-left:2px; background:var(--accent); vertical-align:-2px; border-radius:1px; animation:cn-blink 0.85s steps(1,end) infinite; }
@keyframes cn-dot { 0%,80%,100%{opacity:0.2} 40%{opacity:1} }
.cn-dots i { font-style:normal; animation:cn-dot 1.2s infinite; }
.cn-dots i:nth-child(2){ animation-delay:0.2s; }
.cn-dots i:nth-child(3){ animation-delay:0.4s; }
`;

const greetingWord = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

const CoachAvatar = () => (
  <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg,#7c3aed,#2563eb)' }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C8FF00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" /></svg>
  </div>
);

// The proactive "Coach's Note" — a trainer-style daily briefing on the home
// page. Instant from a per-day cache; only generates once a day (or after the
// note is invalidated by logging / a feeling change), so opening the app is
// fast and doesn't spend a request every time.
export const CoachNote: React.FC = () => {
  const { user, profile } = useAuth();
  const { hasKey, model } = useAiCoachKey();
  const [text, setText] = useState<string | null>(() => getCachedBriefing()?.text ?? null);
  const [typed, setTyped] = useState<string>(() => getCachedBriefing()?.text ?? '');
  // Cached note = already "said" → show it whole (done). No cache = it'll be
  // freshly written, so it types in.
  const [phase, setPhase] = useState<Phase>(() => (getCachedBriefing()?.text ? 'done' : 'idle'));
  const [feeling, setFeeling] = useState<string | null>(() => getTodayFeeling());
  const genRef = useRef(0);

  useEffect(() => {
    if (document.getElementById('coach-note-css')) return;
    const el = document.createElement('style');
    el.id = 'coach-note-css';
    el.textContent = COACH_NOTE_CSS;
    document.head.appendChild(el);
  }, []);

  const generate = useCallback(async () => {
    if (!user?.id || !hasKey) return;
    const myGen = ++genRef.current;
    setPhase('analyzing');
    try {
      const { start, end } = whoopWindowRange(28); // 4 weeks → real load/cardiac metrics
      const [wRes, pRes, whoopRes, fRes] = await Promise.allSettled([
        getWorkouts(user.id, { limit: 25, includeExercises: true }),
        getPersonalRecords(user.id),
        whoopService.fetchAll('month', start, end).catch(() => null),
        getFoodScans(user.id).then((r) => r.scans).catch(() => [] as FoodScan[]),
      ]);
      const workouts = (wRes.status === 'fulfilled' ? wRes.value : []) as WorkoutWithExercises[];
      const prs = pRes.status === 'fulfilled' ? pRes.value : [];
      const whoop = whoopRes.status === 'fulfilled' ? whoopRes.value : null;
      const food = (fRes.status === 'fulfilled' ? fRes.value : []) as FoodScan[];

      const sys = buildSystemPrompt(profile, workouts, prs, food, getRuns(), whoop as any, parseSkincareStats(), 'insight');
      const userTurn = buildBriefingPrompt(profile?.full_name?.split(' ')[0] || 'there', getTodayFeeling());

      const buildBody = (m: string) => ({
        model: m,
        stream: false,
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: userTurn }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 512,
          ...(/^gemini-2\.5/.test(m) && { thinkingConfig: { thinkingBudget: 0 } }),
        },
      });

      let res = await aiCoachFetch('/api/ai-coach/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody(model)) });
      if (!res.ok) res = await aiCoachFetch('/api/ai-coach/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody(FALLBACK_MODEL)) });
      if (!res.ok) throw new Error('generation failed');

      const data = await res.json();
      const parts: Array<{ text?: string; thought?: boolean }> = data?.candidates?.[0]?.content?.parts || [];
      const out = parts.filter((p) => !p.thought).map((p) => p.text).join('').trim().replace(/\*\*/g, '');
      if (myGen !== genRef.current) return;
      if (out) { setText(out); setCachedBriefing(out); setTyped(''); setPhase('typing'); }
      else { setPhase('done'); } // empty result — fall back to any existing text or hide
    } catch {
      if (myGen === genRef.current) setPhase('done');
    }
  }, [user?.id, profile, hasKey, model]);

  // Typewriter — TIME-based via requestAnimationFrame, not a fixed per-tick
  // char count. Frame-rate independent, so it reads smoothly (no pairs-of-
  // chars stutter), and the number shown is derived from elapsed time each
  // frame (never drifts). Honours reduced-motion by showing the note at once.
  useEffect(() => {
    if (phase !== 'typing' || !text) return;
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(text);
      setPhase('done');
      return;
    }
    const CHARS_PER_SEC = 62; // brisk but readable
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const n = Math.min(text.length, Math.floor(((now - start) / 1000) * CHARS_PER_SEC));
      setTyped(text.slice(0, n));
      if (n >= text.length) { setPhase('done'); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase, text]);

  useEffect(() => {
    if (getCachedBriefing()?.text) return; // already have today's — instant, no network
    if (hasKey && user?.id) void generate();
  }, [hasKey, user?.id, generate]);

  const pickFeeling = (f: string) => { setTodayFeeling(f); setFeeling(f); void generate(); };
  const openChat = () => window.dispatchEvent(new CustomEvent('athlix:open-ai'));

  if (!hasKey) return null;
  // Show while thinking or once there's a note; hide if a generation produced
  // nothing and there's no cached note.
  if (phase !== 'analyzing' && !text) return null;

  const name = profile?.full_name?.split(' ')[0] || 'there';

  return (
    <div className="rounded-2xl overflow-hidden animate-card-enter" style={{ background: 'linear-gradient(160deg, var(--bg-surface) 0%, var(--bg-elevated) 100%)', border: '1px solid var(--border)' }}>
      <button onClick={openChat} className="w-full text-left px-4 pt-4 pb-3 active:opacity-80 transition-opacity">
        <div className="flex items-center gap-2.5 mb-2.5">
          <CoachAvatar />
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.1 }}>{greetingWord()}, {name}</p>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>
              {phase === 'analyzing' ? 'Coach is thinking' : phase === 'typing' ? 'Coach is writing' : "Coach's note"}
            </p>
          </div>
        </div>

        {phase === 'analyzing' ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Reading your recovery, volume &amp; plan<span className="cn-dots"><i>.</i><i>.</i><i>.</i></span>
          </p>
        ) : (
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
            {phase === 'typing' ? (
              <>
                <span>{typed}</span>
                <span className="cn-cursor" />
                {/* Ghost the not-yet-typed remainder so the paragraph reserves
                    its full size up front — the layout never reflows and words/
                    punctuation never jump lines while it types. */}
                <span aria-hidden="true" style={{ opacity: 0 }}>{(text ?? '').slice(typed.length)}</span>
              </>
            ) : (
              text
            )}
          </p>
        )}
      </button>

      {/* How are you feeling? — feeds the next briefing */}
      <div className="px-4 pb-3.5 pt-1 flex items-center gap-1.5" style={{ borderTop: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginRight: 2 }}>Feeling</span>
        {FEELINGS.map((f) => {
          const active = feeling === f;
          return (
            <button
              key={f}
              onClick={() => pickFeeling(f)}
              className="rounded-full px-2.5 py-1 transition-all active:scale-95"
              style={{
                fontSize: 11, fontWeight: 700,
                background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                color: active ? '#000' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {f}
            </button>
          );
        })}
      </div>
    </div>
  );
};

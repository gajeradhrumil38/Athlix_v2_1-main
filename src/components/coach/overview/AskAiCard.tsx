import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../../../config/icons';
import {
  askTraineeAi, briefRequest, cacheBrief, markVisit, readCachedBrief, TraineeAiError, type AiTurn,
} from '../../../lib/traineeAi';
import { parseAiAnswer } from '../../../lib/traineeAiVisuals';
import { computeSignals, type Signal } from '../../../lib/traineeSignals';
import { AiVisual } from './AiVisual';
import type { TraineeDashboard } from '../../../lib/coachData';
import { ASK_TRAINEE_AI_EVENT, TONE, WidgetCard, tile } from './Widget';

// Ask AI about this trainee. It speaks first: a short daily brief grounded in
// signals the app computes itself, then question chips built from those same
// signals. Other Overview cards can send a question here ("Ask about this").

const FALLBACK_CHIPS = ['How was this week?', 'Show strength progress', 'Muscle balance', 'Any red flags?'];
const LEVEL_COLOR: Record<Signal['level'], string> = { high: TONE.bad, warn: TONE.warn, good: TONE.good };

// "- " lines become a tidy list; anything else stays a paragraph.
const AnswerText: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1.5 text-[13px] leading-relaxed text-[var(--text-primary)]">
    {text.split('\n').filter((l) => l.trim()).map((l, i) => {
      const bullet = /^\s*[-•*]\s+/.test(l);
      return bullet ? (
        <p key={i} className="flex gap-2"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: 'var(--purple)' }} /><span>{l.replace(/^\s*[-•*]\s+/, '')}</span></p>
      ) : <p key={i}>{l}</p>;
    })}
  </div>
);

const Answer: React.FC<{ raw: string; dash: TraineeDashboard }> = ({ raw, dash }) => {
  const { text, visuals } = parseAiAnswer(raw);
  return (
    <div className="space-y-2">
      {text && <AnswerText text={text} />}
      {visuals.map((v, vi) => <AiVisual key={vi} visual={v} dash={dash} />)}
    </div>
  );
};

const errorText = (e: unknown) => {
  const code = e instanceof TraineeAiError ? e.code : 'PROVIDER_ERROR';
  return {
    code,
    text: code === 'NO_KEY' ? 'Add an AI key in Settings to use Ask AI.'
      : code === 'RATE_LIMITED' ? 'The AI is busy right now — try again in a minute.'
      : "Couldn't get an answer. Try again.",
  };
};

export const AskAiCard: React.FC<{ dash: TraineeDashboard; plans?: { id: string; title: string }[] }> = ({ dash, plans = [] }) => {
  const first = dash.name.split(' ')[0] || dash.name;
  const key = dash.link.trainee_id ?? dash.link.id;
  const signals = useMemo(() => computeSignals(dash, plans), [dash, plans]);

  const [brief, setBrief] = useState<string | null>(() => readCachedBrief(key));
  const [briefBusy, setBriefBusy] = useState(false);
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  const [usedChips, setUsedChips] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const briefAbortRef = useRef<AbortController | null>(null);
  const lastVisitRef = useRef<string | null>(null);
  const briefStartedRef = useRef(false);

  useEffect(() => () => { abortRef.current?.abort(); briefAbortRef.current?.abort(); }, []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const runBrief = async () => {
    briefAbortRef.current?.abort();
    const ctrl = new AbortController();
    briefAbortRef.current = ctrl;
    setBriefBusy(true);
    setError(null);
    try {
      const text = await askTraineeAi(dash, [{ role: 'user', text: briefRequest(first, signals.map((s) => s.fact), lastVisitRef.current) }], ctrl.signal);
      setBrief(text);
      cacheBrief(key, text);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(errorText(e));
    } finally {
      if (briefAbortRef.current === ctrl) setBriefBusy(false);
    }
  };

  // One brief per trainee per day — cached, so revisiting costs nothing.
  useEffect(() => {
    if (briefStartedRef.current) return;
    briefStartedRef.current = true;
    lastVisitRef.current = markVisit(key);
    if (!brief && dash.workouts.shared) runBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ask = async (question: string, grounding?: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const turn: AiTurn = grounding ? { role: 'user', text: `${q}\n(App note: ${grounding})`, display: q } : { role: 'user', text: q };
    const history: AiTurn[] = [...turns, turn];
    setTurns(history);
    setDraft('');
    setError(null);
    setBusy(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      // The brief rides along as context so follow-ups can refer to it.
      const context: AiTurn[] = brief ? [{ role: 'user', text: "Today's brief?" }, { role: 'model', text: brief }] : [];
      const answer = await askTraineeAi(dash, [...context, ...history.slice(-6)], ctrl.signal);
      setTurns((t) => [...t, { role: 'model', text: answer }]);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(errorText(e));
    } finally {
      if (abortRef.current === ctrl) setBusy(false);
    }
  };

  // "Ask about this" from any other Overview card.
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    const handler = (e: Event) => {
      const q = (e as CustomEvent<{ question?: string }>).detail?.question;
      if (!q) return;
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      askRef.current(q);
    };
    window.addEventListener(ASK_TRAINEE_AI_EVENT, handler);
    return () => window.removeEventListener(ASK_TRAINEE_AI_EVENT, handler);
  }, []);

  const chips = (signals.length
    ? signals.map((s) => ({ id: s.id, label: s.chip, color: LEVEL_COLOR[s.level], grounding: s.fact }))
    : FALLBACK_CHIPS.map((q) => ({ id: q, label: q, color: undefined as string | undefined, grounding: undefined as string | undefined }))
  ).filter((c) => !usedChips.has(c.id)).slice(0, 4);

  return (
    <div ref={rootRef}>
      <WidgetCard title="Ask AI" tone="var(--purple)" icon="AICoach" meta={`about ${first}`}
        right={dash.workouts.shared ? (
          <button type="button" onClick={runBrief} disabled={briefBusy} aria-label="Refresh brief" title="Refresh brief"
            className="h-7 px-2.5 rounded-full text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
            style={tile()}>
            {briefBusy ? 'Updating…' : 'Refresh'}
          </button>
        ) : undefined}>

        {/* Today's brief */}
        {(brief || briefBusy) && (
          <div className="mb-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">Today's brief</p>
            {briefBusy && !brief ? (
              <div className="space-y-2" aria-label="Writing brief">
                {[92, 80, 86].map((w) => <div key={w} className="h-3 rounded-full animate-pulse" style={{ width: `${w}%`, background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)' }} />)}
              </div>
            ) : brief ? <div style={{ opacity: briefBusy ? 0.5 : 1 }}><Answer raw={brief} dash={dash} /></div> : null}
          </div>
        )}
        {!brief && !briefBusy && turns.length === 0 && (
          <p className="text-[13px] text-[var(--text-secondary)] mb-3">Ask anything about {first}'s training — answers use only what they share.</p>
        )}

        {turns.length > 0 && (
          <div ref={listRef} className="max-h-[520px] overflow-y-auto -mx-1 px-1 mb-3 space-y-2 pt-2" style={{ borderTop: brief ? '1px solid color-mix(in srgb, var(--text-primary) 6%, transparent)' : undefined }}>
            {turns.map((t, i) => (
              t.role === 'user' ? (
                <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[13px] font-medium text-[var(--text-primary)]"
                  style={tile('var(--purple)')}>{t.display ?? t.text}</p>
              ) : <Answer key={i} raw={t.text} dash={dash} />
            ))}
            {busy && (
              <p className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
                <span className="animate-spin"><AppIcon name="Spinner" size="sm" /></span> Reading {first}'s data…
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-[12px] mb-2" style={{ color: 'var(--yellow)' }}>
            {error.text}{error.code === 'NO_KEY' && <> <Link to="/settings" className="underline">Settings</Link></>}
          </p>
        )}

        {/* Questions worked out from the data — tap to ask. */}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {chips.map((c) => (
              <button key={c.id} type="button" disabled={busy}
                onClick={() => { setUsedChips((u) => new Set(u).add(c.id)); ask(c.label, c.grounding); }}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-opacity hover:opacity-80 disabled:opacity-40 text-left"
                style={tile()}>
                {c.color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} />}
                {c.label}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); ask(draft); }} className="flex items-end gap-2 rounded-2xl p-1.5 pl-2" style={tile()}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(draft); } }}
            rows={1}
            placeholder={turns.length ? 'Ask a follow-up…' : `Ask about ${first}…`}
            aria-label={`Ask AI about ${first}`}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none max-h-28"
            style={{ border: 'none', boxShadow: 'none', minHeight: 32, height: 32 }}
            onInput={(e) => { const t = e.currentTarget; t.style.height = '32px'; t.style.height = `${Math.min(t.scrollHeight, 112)}px`; }}
          />
          <button type="submit" disabled={busy || !draft.trim()} aria-label="Send"
            className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition-opacity disabled:opacity-30"
            style={{ background: 'var(--purple)', color: '#000' }}>
            <AppIcon name="Send" size="sm" />
          </button>
        </form>
      </WidgetCard>
    </div>
  );
};

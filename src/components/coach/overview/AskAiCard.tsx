import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppIcon } from '../../../config/icons';
import { askTraineeAi, TraineeAiError, type AiTurn } from '../../../lib/traineeAi';
import type { TraineeDashboard } from '../../../lib/coachData';
import { WidgetCard, tile } from './Widget';

// Ask AI about this trainee, inside the Overview — quick questions as chips,
// or type your own. Answers come only from what the trainee shares.
const QUICK = ['How is progress going?', 'What should I program next?', 'Any red flags?'];

export const AskAiCard: React.FC<{ dash: TraineeDashboard }> = ({ dash }) => {
  const first = dash.name.split(' ')[0] || dash.name;
  const [turns, setTurns] = useState<AiTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ code: string; text: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: AiTurn[] = [...turns, { role: 'user', text: q }];
    setTurns(history);
    setDraft('');
    setError(null);
    setBusy(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      // Last few turns only — enough for follow-ups, keeps the request small.
      const answer = await askTraineeAi(dash, history.slice(-6), ctrl.signal);
      setTurns((t) => [...t, { role: 'model', text: answer }]);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const code = e instanceof TraineeAiError ? e.code : 'PROVIDER_ERROR';
      setError({
        code,
        text: code === 'NO_KEY' ? 'Add an AI key in Settings to ask questions.'
          : code === 'RATE_LIMITED' ? 'The AI is busy right now — try again in a minute.'
          : "Couldn't get an answer. Try again.",
      });
    } finally {
      if (abortRef.current === ctrl) setBusy(false);
    }
  };

  return (
    <WidgetCard title="Ask AI" tone="var(--purple)" icon="AICoach" meta={`about ${first}`}>
      {turns.length > 0 && (
        <div ref={listRef} className="max-h-[320px] overflow-y-auto -mx-1 px-1 mb-3 space-y-2">
          {turns.map((t, i) => (
            t.role === 'user' ? (
              <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 text-[13px] font-medium text-[var(--text-primary)]"
                style={tile('var(--purple)')}>{t.text}</p>
            ) : (
              <p key={i} className="max-w-[95%] text-[13px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">{t.text}</p>
            )
          ))}
          {busy && (
            <p className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]">
              <span className="animate-spin"><AppIcon name="Spinner" size="sm" /></span> Reading {first}'s data…
            </p>
          )}
        </div>
      )}

      {turns.length === 0 && (
        <p className="text-[13px] text-[var(--text-secondary)] mb-3">Ask anything about {first}'s training — answers use only what they share.</p>
      )}

      {error && (
        <p className="text-[12px] mb-2" style={{ color: 'var(--yellow)' }}>
          {error.text}{error.code === 'NO_KEY' && <> <Link to="/settings" className="underline">Settings</Link></>}
        </p>
      )}

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => ask(q)} disabled={busy}
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-[var(--text-primary)] transition-opacity hover:opacity-80 disabled:opacity-40"
              style={tile()}>
              {q}
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
  );
};

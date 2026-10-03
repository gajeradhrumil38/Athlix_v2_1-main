import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CenterModal } from '../shared/CenterModal';
import { askTraineeAi, recapRequest } from '../../lib/traineeAi';
import { buildRecap, fallbackRecap, recapFacts } from '../../lib/sessionRecap';
import { updateCoachNotes } from '../../lib/coachLinks';
import type { TraineeDashboard } from '../../lib/coachData';
import type { WorkoutState } from '../../pages/Log';

// After a coach saves a session: what happened vs last time, any PRs, and a
// ready-to-send note for the trainee (AI-written from those numbers, with a
// plain fallback). The coach copies it or files it in their notes.
interface Props { open: boolean; dash: TraineeDashboard; workout: WorkoutState | null; onDone: () => void }

export const SessionRecapModal: React.FC<Props> = ({ open, dash, workout, onDone }) => {
  const first = dash.name.split(' ')[0] || dash.name;
  const recap = useMemo(() => (workout ? buildRecap(workout, dash) : null), [workout, dash]);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || !recap) return;
    setMessage(null);
    setSaved(false);
    let cancelled = false;
    askTraineeAi(dash, [{ role: 'user', text: recapRequest(first, recapFacts(recap)) }])
      .then((t) => { if (!cancelled) setMessage(t); })
      .catch(() => { if (!cancelled) setMessage(fallbackRecap(first, recap)); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recap]);

  if (!recap) return null;
  const volDelta = recap.prevVolume ? Math.round(((recap.volume - recap.prevVolume) / recap.prevVolume) * 100) : null;

  const saveToNotes = async () => {
    if (!message) return;
    const stamp = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const next = `${dash.coachNotes.trim() ? `${dash.coachNotes.trimEnd()}\n\n` : ''}Session · ${stamp}: ${message}`;
    const res = await updateCoachNotes(dash.link.id, next);
    if (!res.ok) { toast.error(res.error || 'Could not save notes.'); return; }
    setSaved(true);
    toast.success('Saved to coach notes');
  };

  return (
    <CenterModal open={open} onClose={onDone} zIndex={90}>
      <div className="solid-panel w-full max-w-[420px] rounded-[24px] p-5 max-h-[86vh] overflow-y-auto" style={{ border: '1px solid var(--border)' }}>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--green)' }}>Session saved ✓</p>
        <h2 className="mt-1 text-[22px] font-bold text-[var(--text-primary)] leading-tight">{first}'s recap</h2>

        {recap.prs.length > 0 && (
          <p className="mt-3 rounded-2xl px-3 py-2 text-[13px] font-bold" style={{ background: 'color-mix(in srgb, var(--pr-gold) 14%, transparent)', color: 'var(--pr-gold)' }}>
            🏆 New PR{recap.prs.length > 1 ? 's' : ''}: {recap.prs.join(', ')}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' }}>
            <p className="font-victory text-[24px] font-black leading-none text-[var(--text-primary)]">{recap.sets}</p>
            <p className="text-[11px] font-semibold text-[var(--text-secondary)] mt-1">Sets</p>
          </div>
          <div className="rounded-2xl px-3 py-2.5" style={{ background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)' }}>
            <p className="font-victory text-[24px] font-black leading-none text-[var(--text-primary)]">{recap.volume.toLocaleString()}<span className="text-[11px] font-bold text-[var(--text-secondary)] ml-1">LB</span></p>
            <p className="text-[11px] font-semibold text-[var(--text-secondary)] mt-1">
              Volume{volDelta != null && <span style={{ color: volDelta >= 0 ? 'var(--green)' : 'var(--red)' }}> · {volDelta >= 0 ? '▲' : '▼'} {Math.abs(volDelta)}% vs last</span>}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {recap.exercises.map((e) => {
            const d = e.prev ? e.top.weight - e.prev.weight : null;
            return (
              <div key={e.name} className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate font-semibold text-[var(--text-primary)]">{e.pr && '🏆 '}{e.name}</span>
                <span className="shrink-0 tabular-nums text-[var(--text-secondary)]">
                  {e.top.weight ? `${e.top.weight} × ${e.top.reps}` : `${e.top.reps} reps`}
                  {d != null && d !== 0 && <span className="font-bold" style={{ color: d > 0 ? 'var(--green)' : 'var(--red)' }}> {d > 0 ? '+' : ''}{d}</span>}
                  {e.prev == null && <span className="text-[var(--text-muted)]"> · new</span>}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl p-3" style={{ background: 'color-mix(in srgb, var(--purple) 9%, transparent)' }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--purple)' }}>Message to {first}</p>
          {message == null ? (
            <div className="mt-2 space-y-2">{[90, 75, 82].map((w) => <div key={w} className="h-3 rounded-full animate-pulse" style={{ width: `${w}%`, background: 'color-mix(in srgb, var(--text-primary) 8%, transparent)' }} />)}</div>
          ) : (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">{message}</p>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" disabled={!message}
            onClick={() => message && navigator.clipboard?.writeText(message).then(() => toast.success('Copied')).catch(() => toast.error('Copy failed'))}
            className="h-11 rounded-2xl text-[13px] font-bold disabled:opacity-40" style={{ background: 'var(--purple)', color: '#000' }}>Copy</button>
          <button type="button" disabled={!message || saved} onClick={saveToNotes}
            className="h-11 rounded-2xl text-[13px] font-semibold text-[var(--text-primary)] disabled:opacity-50" style={{ background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)' }}>
            {saved ? 'Saved ✓' : 'Save to notes'}
          </button>
          <button type="button" onClick={onDone}
            className="h-11 rounded-2xl text-[13px] font-bold" style={{ background: 'var(--accent)', color: '#000' }}>Done</button>
        </div>
      </div>
    </CenterModal>
  );
};

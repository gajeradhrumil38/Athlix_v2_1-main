import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AppIcon } from '../../config/icons';
import { CenterModal } from '../shared/CenterModal';
import type { TraineeDashboard } from '../../lib/coachData';
import type { AssignedPlan } from '../../lib/assignedPlans';
import { getWorkoutDisplayTitle } from '../../lib/workoutTitle';
import { planDayOptions, readCoachDraft, writeCoachDraft, type CoachLogDraft, type CoachLogStart } from '../../lib/coachLog';

interface OptionsProps {
  dash: TraineeDashboard;
  plans: AssignedPlan[];
  draft: CoachLogDraft | null;
  onPick: (start: CoachLogStart) => void;
  onDiscardDraft: () => void;
}

// The ways a coach can start logging: resume, repeat the trainee's last
// session, an assigned plan day, or blank. Everything comes from data the
// trainee page already has, so choosing is instant.
export const CoachLogStartOptions: React.FC<OptionsProps> = ({ dash, plans, draft, onPick, onDiscardDraft }) => {
  const last = dash.workouts.shared ? dash.workouts.data[0] : undefined;
  const lastCount = last ? new Set((last.exercises || []).map((e) => e.name)).size : 0;
  return (
    <div className="space-y-2.5">
      {draft && (
        <StartCard
          icon="History"
          title="Resume unsaved session"
          sub={`${draft.workout.exercises.length} exercise${draft.workout.exercises.length === 1 ? '' : 's'} in progress`}
          accent
          onClick={() => onPick({ kind: 'resume' })}
          onDismiss={onDiscardDraft}
        />
      )}
      {last && (
        <StartCard
          icon="Duplicate"
          title="Repeat last session"
          sub={`${getWorkoutDisplayTitle(last) || 'Workout'} · ${format(new Date(`${last.date}T00:00:00`), 'EEE, MMM d')} · ${lastCount} exercise${lastCount === 1 ? '' : 's'}`}
          accent={!draft}
          onClick={() => onPick({ kind: 'repeat' })}
        />
      )}
      {planDayOptions(plans).map((o) => (
        <StartCard
          key={o.key}
          icon="Clipboard"
          title={o.label}
          sub={`Assigned plan · ${o.exs.length} exercise${o.exs.length === 1 ? '' : 's'} as prescribed`}
          onClick={() => onPick({ kind: 'plan', planId: o.plan.id, day: o.day })}
        />
      ))}
      <StartCard icon="Plus" title="Start blank" sub="Pick several exercises at once — each prefills from their last time" onClick={() => onPick({ kind: 'blank' })} />
    </div>
  );
};

interface ModalProps { open: boolean; onClose: () => void; traineeId: string; dash: TraineeDashboard; plans: AssignedPlan[] }

// "+ Log" popup on the trainee page. Picking hands the choice to the logger
// route, which builds the session from cached data — no loading screen.
export const CoachLogStartModal: React.FC<ModalProps> = ({ open, onClose, traineeId, dash, plans }) => {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<CoachLogDraft | null>(null);
  useEffect(() => { if (open) setDraft(readCoachDraft(traineeId)); }, [open, traineeId]);

  const pick = (start: CoachLogStart) => {
    onClose();
    navigate(`/coach/trainee/${traineeId}/log`, { state: { start } });
  };
  const discard = () => {
    if (!window.confirm('Discard the unsaved session?')) return;
    writeCoachDraft(traineeId, null);
    setDraft(null);
  };

  return (
    <CenterModal open={open} onClose={onClose}>
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-bold text-[var(--text-primary)] leading-tight">Log a session</h2>
          <p className="text-[14px] text-[var(--text-muted)] mt-0.5 truncate">For {dash.name} · pick a starting point</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 h-9 w-9 rounded-full flex items-center justify-center"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
          <AppIcon name="Close" size="sm" />
        </button>
      </div>
      <div className="px-5 pb-5 overflow-y-auto">
        <CoachLogStartOptions dash={dash} plans={plans} draft={draft} onPick={pick} onDiscardDraft={discard} />
      </div>
    </CenterModal>
  );
};

const StartCard: React.FC<{
  icon: 'History' | 'Duplicate' | 'Clipboard' | 'Plus';
  title: string;
  sub: string;
  accent?: boolean;
  onClick: () => void;
  onDismiss?: () => void;
}> = ({ icon, title, sub, accent, onClick, onDismiss }) => (
  <div className="relative">
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl px-4 py-3.5 flex items-center gap-3.5 text-left active:scale-[0.99] transition-transform"
      style={{ background: 'var(--bg-elevated)', border: `1px solid ${accent ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--border)'}` }}
    >
      <span className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl"
        style={accent ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-base)', color: 'var(--accent)' }}>
        <AppIcon name={icon} size="md" />
      </span>
      <div className="min-w-0 flex-1 pr-6">
        <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{title}</p>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5 truncate">{sub}</p>
      </div>
      {!onDismiss && <AppIcon name="Forward" size="sm" />}
    </button>
    {onDismiss && (
      <button type="button" onClick={onDismiss} aria-label="Discard draft"
        className="absolute top-1/2 -translate-y-1/2 right-3 h-8 w-8 rounded-lg flex items-center justify-center" style={{ color: '#ff8080' }}>
        <AppIcon name="Trash" size="sm" />
      </button>
    )}
  </div>
);

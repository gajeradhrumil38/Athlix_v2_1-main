import React from 'react';
import { AppIcon } from '../../../config/icons';
import type { AssignedPlan } from '../../../lib/assignedPlans';
import { planProgress } from '../../../lib/planProgress';
import { CoachPlanCardView } from '../../home/CoachPlanCardView';

interface Props {
  plan: AssignedPlan;
  coachName: string | null;
  traineeName: string;
  message: string;
  onMessage: (v: string) => void;
  busy: boolean;
  error: string;
  isEdit: boolean;
  onBack: () => void;
  onSend: () => void;
}

// Step 3 of Assign: exactly what the trainee will see on Home, plus an
// optional message, before anything is sent.
export const AssignPreviewStep: React.FC<Props> = ({ plan, coachName, traineeName, message, onMessage, busy, error, isEdit, onBack, onSend }) => (
  <div className="space-y-3">
    <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">What {traineeName} will see</p>
    <CoachPlanCardView plan={{ ...plan, notes: message.trim() || null }} coachName={coachName} progress={planProgress(plan, [])} preview />
    <textarea value={message} onChange={(e) => onMessage(e.target.value)} rows={2}
      placeholder={`Message to ${traineeName} (optional)`}
      className="w-full rounded-2xl px-4 py-3 text-[14px] outline-none resize-none"
      style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
    {error && <p className="text-[14px]" style={{ color: '#ff8080' }}>{error}</p>}
    <div className="flex gap-2">
      <button type="button" onClick={onBack} disabled={busy}
        className="h-14 px-5 rounded-2xl font-semibold text-[15px] text-[var(--text-secondary)] flex items-center gap-1" style={{ background: 'var(--bg-elevated)' }}>
        <AppIcon name="Back" size="sm" /> Edit
      </button>
      <button type="button" onClick={onSend} disabled={busy}
        className="flex-1 h-14 rounded-2xl font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-40"
        style={{ background: 'var(--accent)', color: '#000' }}>
        {busy ? <AppIcon name="Spinner" size="md" /> : isEdit ? 'Save changes' : `Send to ${traineeName}`}
      </button>
    </div>
  </div>
);

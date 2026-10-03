import React, { useMemo, useState } from 'react';
import { AppIcon } from '../../../config/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { getTemplates } from '../../../lib/supabaseData';
import type { TraineeWorkout } from '../../../lib/coachData';
import { PLAN_SPLITS } from '../../../config/planSplits';
import { lastSetLookup, starterFromRecent, starterFromSplit, starterFromTemplate, type PlanStarter } from '../../../lib/planStarters';

interface Props { traineeName: string; traineeWorkouts: TraineeWorkout[]; onPick: (starter: PlanStarter | null) => void; }

// Step 1 of Assign: start from something sensible instead of an empty form.
export const AssignStartStep: React.FC<Props> = ({ traineeName, traineeWorkouts, onPick }) => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[] | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const lastSetFor = useMemo(() => lastSetLookup(traineeWorkouts), [traineeWorkouts]);
  const recent = useMemo(() => starterFromRecent(traineeWorkouts, traineeName), [traineeWorkouts, traineeName]);

  const openTemplates = async () => {
    if (!user) return;
    setLoadingTemplates(true);
    try { setTemplates(await getTemplates(user.id)); } catch { setTemplates([]); } finally { setLoadingTemplates(false); }
  };

  if (templates) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setTemplates(null)} className="text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-1 mb-1">
          <AppIcon name="Back" size="sm" /> Starting points
        </button>
        {templates.length === 0 ? (
          <p className="text-[14px] text-[var(--text-muted)] text-center py-6">No templates yet. Use “Save as template” in the ⋯ menu while building a plan.</p>
        ) : templates.map((t) => (
          <StartCard key={t.id} icon="Duplicate" title={t.title || 'Template'} sub={`${t.template_exercises?.length ?? 0} exercises`} onClick={() => onPick(starterFromTemplate(t))} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-[13px] text-[var(--text-muted)]">Pick a starting point — you can change anything after.</p>
      <StartCard
        icon="History"
        title="Based on their recent training"
        sub={recent ? `${recent.days.length} day${recent.days.length === 1 ? '' : 's'} from the last 2 weeks, with their weights` : 'No sessions in the last 2 weeks'}
        disabled={!recent}
        accent
        onClick={() => recent && onPick(recent)}
      />
      <div className="grid grid-cols-3 gap-2">
        {PLAN_SPLITS.map((s) => (
          <button key={s.key} type="button" onClick={() => onPick(starterFromSplit(s, lastSetFor))}
            className="glass-card px-3 py-3 text-left active:scale-[0.98] transition-transform">
            <p className="text-[14px] font-bold text-[var(--text-primary)] leading-tight">{s.name}</p>
            <p className="text-[11px] text-[var(--text-muted)] mt-1">{s.blurb}</p>
          </button>
        ))}
      </div>
      <StartCard icon="Duplicate" title="From my templates" sub={loadingTemplates ? 'Loading…' : 'Reuse a plan you saved'} onClick={openTemplates} />
      <StartCard icon="Plus" title="Blank" sub="Add exercises yourself" onClick={() => onPick(null)} />
    </div>
  );
};

const StartCard: React.FC<{ icon: 'History' | 'Duplicate' | 'Plus'; title: string; sub: string; accent?: boolean; disabled?: boolean; onClick: () => void }> = ({ icon, title, sub, accent, disabled, onClick }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className="w-full glass-card px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform disabled:opacity-45"
    style={accent && !disabled ? { borderColor: 'color-mix(in srgb, var(--accent) 45%, transparent)' } : undefined}>
    <span className="shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl"
      style={accent && !disabled ? { background: 'var(--accent)', color: '#000' } : { background: 'var(--bg-elevated)', color: 'var(--accent)' }}>
      <AppIcon name={icon} size="md" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-semibold text-[var(--text-primary)] truncate">{title}</span>
      <span className="block text-[12px] text-[var(--text-muted)] truncate">{sub}</span>
    </span>
  </button>
);

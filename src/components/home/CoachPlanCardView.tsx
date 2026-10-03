import React, { useState } from 'react';
import { AppIcon } from '../../config/icons';
import { groupByDay, type AssignedPlan } from '../../lib/assignedPlans';
import type { PlanProgress } from '../../lib/planProgress';

// The trainee's "From your coach" card. Purely presentational so the coach's
// Assign "Preview & send" step can render exactly what the trainee will see.
interface Props {
  plan: AssignedPlan;
  coachName: string | null;
  progress: PlanProgress;
  preview?: boolean;
  otherPlansCount?: number;
  onStart?: (dayLabel: string) => void;
  onOpenPlan?: () => void;
  onSwitch?: () => void;
}

const dayName = (label: string, i: number) => label || `Day ${i + 1}`;

export const CoachPlanCardView: React.FC<Props> = ({ plan, coachName, progress, preview, otherPlansCount = 0, onStart, onOpenPlan, onSwitch }) => {
  const [pickingDay, setPickingDay] = useState(false);
  const groups = groupByDay(plan.exercises);
  const isMulti = groups.length > 1;
  const nextIdx = Math.max(0, groups.findIndex(([label]) => label === progress.nextDay));
  const [nextLabel, nextExercises] = groups[nextIdx] ?? ['', plan.exercises];
  const shown = nextExercises.slice(0, 4);
  const doneTodayIdx = progress.doneTodayDay != null ? groups.findIndex(([l]) => l === progress.doneTodayDay) : -1;

  return (
    <div className="glass-card px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onOpenPlan} disabled={preview} className="min-w-0 text-left">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            From {coachName || 'your coach'}
          </p>
          <p className="text-[18px] font-bold text-[var(--text-primary)] leading-tight truncate mt-0.5">{plan.title}</p>
        </button>
        {otherPlansCount > 0 && !preview && (
          <button type="button" onClick={onSwitch} className="shrink-0 text-[13px] font-semibold text-[var(--accent)]">
            Switch
          </button>
        )}
      </div>

      {plan.notes && <p className="text-[13px] text-[var(--text-secondary)] mt-2 leading-snug">{plan.notes}</p>}

      {isMulti && (
        <div className="flex gap-1.5 mt-3 overflow-x-auto no-scrollbar">
          {groups.map(([label], i) => {
            const day = progress.days[i];
            const isNext = i === nextIdx;
            return (
              <span key={i} className="shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold flex items-center gap-1"
                style={isNext
                  ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' }
                  : { background: 'var(--bg-elevated)', color: day?.doneRecently ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid transparent' }}>
                {day?.doneRecently && <AppIcon name="Check" size="sm" />}
                {dayName(label, i)}
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-3">
        {progress.doneToday ? (
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">
            {isMulti && doneTodayIdx >= 0 ? `${dayName(groups[doneTodayIdx][0], doneTodayIdx)} done today ✓` : 'Done today ✓'}
            {isMulti && <span className="text-[var(--text-muted)] font-medium"> · Next: {dayName(nextLabel, nextIdx)}</span>}
          </p>
        ) : (
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">
            {isMulti ? `Today: ${dayName(nextLabel, nextIdx)}` : 'Today'}
            {!isMulti && progress.sessionsThisWeek > 0 && (
              <span className="text-[var(--text-muted)] font-medium"> · Done {progress.sessionsThisWeek}× this week</span>
            )}
          </p>
        )}
        <div className="mt-2 space-y-1.5">
          {shown.map((e, i) => (
            <div key={i}>
              <p className="text-[13px] text-[var(--text-secondary)] flex justify-between gap-2">
                <span className="truncate text-[var(--text-primary)]">{e.name}</span>
                <span className="shrink-0 tabular-nums">{e.default_sets} × {e.default_reps}{e.default_weight ? ` @ ${e.default_weight} lb` : ''}</span>
              </p>
              {e.note && <p className="text-[12px] leading-snug" style={{ color: 'var(--accent)' }}>{e.note}</p>}
            </div>
          ))}
          {nextExercises.length > shown.length && (
            <p className="text-[12px] text-[var(--text-muted)]">+{nextExercises.length - shown.length} more</p>
          )}
        </div>
      </div>

      {!preview && (
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={() => onStart?.(nextLabel)}
            className="flex-1 h-12 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-1.5"
            style={progress.doneToday
              ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
              : { background: 'var(--accent)', color: '#000' }}>
            <AppIcon name="Plus" size="sm" />
            {progress.doneToday ? 'Train again' : `Start ${isMulti ? dayName(nextLabel, nextIdx) : 'workout'}`}
          </button>
          {isMulti && (
            <button type="button" onClick={() => setPickingDay(true)}
              className="h-12 px-4 rounded-2xl font-semibold text-[14px] text-[var(--text-secondary)]"
              style={{ background: 'var(--bg-elevated)' }}>
              Other day
            </button>
          )}
        </div>
      )}

      {pickingDay && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(3,5,9,0.9)' }} onClick={() => setPickingDay(false)}>
          <div className="w-full max-w-md rounded-t-3xl p-5" onClick={(ev) => ev.stopPropagation()}
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <p className="text-[18px] font-bold text-[var(--text-primary)] mb-3">Pick a day</p>
            <div className="space-y-2">
              {groups.map(([label, exs], i) => (
                <button key={i} type="button" onClick={() => { setPickingDay(false); onStart?.(label); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-left" style={{ background: 'var(--bg-elevated)' }}>
                  <span className="text-[15px] font-semibold text-[var(--text-primary)]">{dayName(label, i)}</span>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {progress.days[i]?.doneRecently ? 'Done this week ✓ · ' : ''}{exs.length} exercises
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Check } from 'lucide-react';
import type { Set } from '../../pages/Log';

interface SetRowField {
  field: 'weight' | 'reps';
  label: string;
  value: number | null;
  displayValue: string;
}

interface SetRowProps {
  index: number;
  set: Set;
  primary: SetRowField;
  secondary?: SetRowField | null;
  onOpenDial: (field: 'weight' | 'reps') => void;
  onAdjust: (field: 'weight' | 'reps', delta: number) => void;
  onMarkDone: () => void;
  weightUnit?: string;
  // Narrower boxes for cards (Home / coach session card) where two full-size
  // value boxes would squeeze the digits.
  compact?: boolean;
  // Optional effort rating for a finished set — shown only when provided.
  onSetRpe?: (rpe: number | null) => void;
}

const RPE_CHOICES = [6, 7, 8, 9, 10];

const ValueBox: React.FC<{
  field: SetRowField;
  isDone: boolean;
  step: number;
  onTap: () => void;
  onAdjust: (delta: number) => void;
  compact?: boolean;
}> = ({ field, isDone, step, onTap, onAdjust, compact = false }) => {
  const stepLabel = Number.isInteger(step) ? `${step}` : step % 1 === 0.5 ? `${step}` : `${step}`;

  return (
    <div
      className={`relative flex ${compact ? 'h-[68px]' : 'h-[82px]'} w-full overflow-hidden rounded-xl border transition-colors duration-200`}
      style={compact
        // Compact (session cards): a soft fill that blends into the card, no outline.
        ? { background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)', borderColor: 'transparent' }
        : { background: 'var(--bg-base)', borderColor: isDone ? 'rgba(200,255,0,0.12)' : 'var(--border)' }}
    >
      {/* shimmer line */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

      {/* − button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAdjust(-step); }}
        className={`flex h-full ${compact ? 'w-[34px]' : 'w-[48px]'} shrink-0 flex-col items-center justify-center gap-0.5 active:bg-white/[0.04] transition-colors`}
        style={{ color: 'var(--text-muted)', borderRight: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="text-[22px] font-light leading-none select-none">−</span>
        <span className="text-[9px] font-semibold leading-none opacity-50 select-none">{stepLabel}</span>
      </button>

      {/* Center — tap to open full dial */}
      <button
        type="button"
        onClick={onTap}
        className="flex flex-1 min-w-0 flex-col items-center justify-center gap-[3px]"
      >
        <div className={`font-victory tabular-nums ${compact ? 'text-[26px]' : 'text-[34px]'} leading-none font-black text-[var(--text-primary)]`}>
          {field.displayValue}
        </div>
        <div className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--text-secondary)]">
          {field.label}
        </div>
      </button>

      {/* + button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAdjust(step); }}
        className={`flex h-full ${compact ? 'w-[34px]' : 'w-[48px]'} shrink-0 flex-col items-center justify-center gap-0.5 active:bg-white/[0.04] transition-colors`}
        // Compact (session cards): neutral, so the card isn't lime everywhere.
        style={{ color: compact ? 'var(--text-primary)' : 'var(--accent)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span className="text-[22px] font-light leading-none select-none">+</span>
        <span className="text-[9px] font-semibold leading-none opacity-50 select-none">{stepLabel}</span>
      </button>
    </div>
  );
};

export const SetRow: React.FC<SetRowProps> = ({
  index,
  set,
  primary,
  secondary,
  onOpenDial,
  onAdjust,
  onMarkDone,
  weightUnit = 'lbs',
  compact = false,
  onSetRpe,
}) => {
  const [rpeOpen, setRpeOpen] = React.useState(false);
  const weightStep = weightUnit === 'kg' ? 1.25 : 2.5;
  const repsStep = 1;

  const stepFor = (field: 'weight' | 'reps') => (field === 'weight' ? weightStep : repsStep);

  const hasPlanned =
    (set.planned_weight != null && set.planned_weight > 0) ||
    (set.planned_reps != null && set.planned_reps > 0);

  const plannedLabel = hasPlanned
    ? [
        set.planned_weight != null && set.planned_weight > 0
          ? `${set.planned_weight}${weightUnit}`
          : null,
        set.planned_reps != null && set.planned_reps > 0
          ? `${set.planned_reps} reps`
          : null,
      ]
        .filter(Boolean)
        .join(' × ')
    : null;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border transition-all duration-200"
      style={compact
        ? { background: set.done ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'color-mix(in srgb, var(--text-primary) 3%, transparent)', borderColor: 'transparent' }
        : { background: 'var(--bg-base)', borderColor: set.done ? 'rgba(200,255,0,0.12)' : 'var(--border)' }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-300"
        style={{ background: set.done ? 'var(--accent)' : 'var(--border)' }}
      />

      {/* Header row */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 pl-5">
        <div className="flex items-center gap-2">
          <div
            className="rounded-lg px-2 py-[3px] text-[10px] font-bold tracking-[0.14em] uppercase transition-colors duration-200"
            style={
              set.done
                ? { border: '1px solid rgba(200,255,0,0.28)', color: 'var(--accent)', background: 'transparent' }
                : { background: compact ? 'color-mix(in srgb, var(--text-primary) 6%, transparent)' : 'var(--bg-elevated)', color: 'var(--text-secondary)' }
            }
          >
            Set {index}
          </div>
          {set.done && !onSetRpe && (
            <span
              className="text-[10px] font-semibold tracking-[0.08em] uppercase"
              style={{ color: 'rgba(200,255,0,0.70)' }}
            >
              Done
            </span>
          )}
          {set.done && onSetRpe && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setRpeOpen((o) => !o); }}
              aria-label={set.rpe ? `Effort RPE ${set.rpe}, change` : 'Rate effort (RPE)'}
              className="rounded-lg px-2 py-[3px] text-[10px] font-bold tracking-[0.08em] uppercase transition-colors"
              style={set.rpe
                ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)', color: 'var(--accent)' }
                : { background: 'color-mix(in srgb, var(--text-primary) 6%, transparent)', color: 'var(--text-secondary)' }}>
              {set.rpe ? `RPE ${set.rpe}` : '+ RPE'}
            </button>
          )}
          {!set.done && plannedLabel && (
            <span className="text-[10px] font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
              Target: {plannedLabel}
            </span>
          )}
        </div>

        <button
          onClick={onMarkDone}
          aria-label={set.done ? `Mark set ${index} incomplete` : `Mark set ${index} complete`}
          className="h-10 w-10 rounded-lg border flex items-center justify-center transition-all duration-200 active:scale-95"
          style={
            set.done
              ? {
                  background: 'rgba(200,255,0,0.10)',
                  borderColor: 'rgba(200,255,0,0.50)',
                  color: 'var(--accent)',
                }
              : {
                  background: compact ? 'color-mix(in srgb, var(--text-primary) 6%, transparent)' : 'var(--bg-elevated)',
                  borderColor: compact ? 'transparent' : 'var(--border)',
                  color: compact ? 'var(--text-secondary)' : 'var(--text-muted)',
                }
          }
        >
          <Check className="w-4 h-4" />
        </button>
      </div>

      {/* RPE picker — one tap per set, then it folds away. */}
      {set.done && onSetRpe && rpeOpen && (
        <div className="flex items-center gap-1.5 px-4 pb-2 pl-5" role="group" aria-label="How hard was it? RPE">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)] mr-0.5">Effort</span>
          {RPE_CHOICES.map((v) => (
            <button key={v} type="button" onClick={(e) => { e.stopPropagation(); onSetRpe(set.rpe === v ? null : v); setRpeOpen(false); }}
              className="h-8 min-w-[34px] rounded-lg text-[13px] font-bold tabular-nums transition-colors"
              style={set.rpe === v
                ? { background: 'var(--accent)', color: '#000' }
                : { background: 'color-mix(in srgb, var(--text-primary) 7%, transparent)', color: 'var(--text-primary)' }}>
              {v}
            </button>
          ))}
        </div>
      )}

      {/* Value boxes with steppers */}
      <div className={`grid gap-2 px-3 pb-3 pl-4 ${secondary ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <ValueBox
          field={primary}
          isDone={set.done}
          step={stepFor(primary.field)}
          onTap={() => onOpenDial(primary.field)}
          onAdjust={(delta) => onAdjust(primary.field, delta)}
          compact={compact}
        />
        {secondary && (
          <ValueBox
            field={secondary}
            isDone={set.done}
            step={stepFor(secondary.field)}
            onTap={() => onOpenDial(secondary.field)}
            onAdjust={(delta) => onAdjust(secondary.field, delta)}
            compact={compact}
          />
        )}
      </div>
    </div>
  );
};

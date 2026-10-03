import React from 'react';
import { AppIcon } from '../../../config/icons';
import { haptics } from '../../../lib/haptics';

export type DialField = 'sets' | 'reps' | 'weight' | 'rest';
export const formatRest = (v: number) => `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;

interface RowData { name: string; sets: number; reps: number; weight: number; rest: number; note: string; }

interface Props {
  row: RowData;
  index: number;
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: () => void;
  onChange: (field: DialField, value: number) => void;
  onNote: (value: string) => void;
  onOpenDial: (field: DialField) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

// One line by default ("Bench Press · 3 × 10 · 135 lb"); tap to adjust.
// Keeps an 8-exercise program scannable instead of 32 steppers on screen.
export const PlanExerciseRow: React.FC<Props> = ({ row, index, expanded, isFirst, isLast, onToggle, onChange, onNote, onOpenDial, onMove, onRemove }) => {
  const [noteOpen, setNoteOpen] = React.useState(!!row.note);
  return (
    <div className="rounded-2xl" style={{ background: 'var(--bg-elevated)' }}>
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-3 text-left">
        <span className="shrink-0 w-5 text-center text-[12px] font-bold text-[var(--text-muted)]">{index + 1}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-[var(--text-primary)] truncate">{row.name}</span>
          <span className="block text-[12px] text-[var(--text-muted)] tabular-nums">
            {row.sets} × {row.reps}{row.weight ? ` · ${row.weight} lb` : ''} · {formatRest(row.rest)} rest{row.note ? ' · note' : ''}
          </span>
        </span>
        <span className={`shrink-0 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}><AppIcon name="ExpandDown" size="sm" /></span>
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <div className="grid grid-cols-2 gap-2">
            <PrescribeTile label="Sets" value={row.sets} min={1} max={20} step={1} onChange={(v) => onChange('sets', v)} onOpenDial={() => onOpenDial('sets')} />
            <PrescribeTile label="Reps" value={row.reps} min={1} max={100} step={1} onChange={(v) => onChange('reps', v)} onOpenDial={() => onOpenDial('reps')} />
            <PrescribeTile label="Weight" value={row.weight} min={0} max={2000} step={5} unit="lb" onChange={(v) => onChange('weight', v)} onOpenDial={() => onOpenDial('weight')} />
            <PrescribeTile label="Rest" value={row.rest} min={0} max={600} step={15} formatValue={formatRest} onChange={(v) => onChange('rest', v)} onOpenDial={() => onOpenDial('rest')} />
          </div>
          {noteOpen ? (
            <input value={row.note} onChange={(e) => onNote(e.target.value)} autoFocus={!row.note}
              placeholder="Coaching note — tempo, RPE, cue…"
              className="w-full h-10 mt-2 rounded-xl px-3 text-[13px] outline-none"
              style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} />
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="mt-2 text-[12px] font-semibold text-[var(--accent)]">+ Add note</button>
          )}
          <div className="flex items-center justify-end gap-1 mt-2">
            <button type="button" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move up"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] disabled:opacity-25 rotate-180">
              <AppIcon name="ExpandDown" size="sm" />
            </button>
            <button type="button" onClick={() => onMove(1)} disabled={isLast} aria-label="Move down"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-secondary)] disabled:opacity-25">
              <AppIcon name="ExpandDown" size="sm" />
            </button>
            <button type="button" onClick={onRemove} aria-label="Remove"
              className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ color: '#ff8080' }}>
              <AppIcon name="Trash" size="sm" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const PrescribeTile: React.FC<{
  label: string; value: number; min: number; max: number; step: number; unit?: string;
  formatValue?: (v: number) => string; onChange: (v: number) => void; onOpenDial: () => void;
}> = ({ label, value, min, max, step, unit, formatValue, onChange, onOpenDial }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const bump = (d: number) => { haptics.tick(); onChange(clamp(value + d * step)); };
  return (
    <div className="relative flex h-[60px] w-full overflow-hidden rounded-xl border" style={{ background: 'var(--bg-base)', borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => bump(-1)} disabled={value <= min} aria-label={`Decrease ${label}`}
        className="flex h-full w-[38px] shrink-0 items-center justify-center disabled:opacity-30"
        style={{ color: 'var(--text-muted)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[20px] font-light leading-none select-none">−</span>
      </button>
      <button type="button" onClick={onOpenDial} aria-label={`Set ${label}`} className="flex flex-1 min-w-0 flex-col items-center justify-center gap-[2px]">
        <span className="flex items-baseline gap-1">
          <span className="font-victory tabular-nums text-[22px] leading-none font-black text-[var(--text-primary)]">{formatValue ? formatValue(value) : value}</span>
          {unit && <span className="text-[11px] font-semibold text-[var(--text-muted)]">{unit}</span>}
        </span>
        <span className="text-[9px] font-bold tracking-[0.16em] uppercase text-[var(--text-secondary)]">{label}</span>
      </button>
      <button type="button" onClick={() => bump(1)} disabled={value >= max} aria-label={`Increase ${label}`}
        className="flex h-full w-[38px] shrink-0 items-center justify-center disabled:opacity-30"
        style={{ color: 'var(--accent)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <span className="text-[20px] font-light leading-none select-none">+</span>
      </button>
    </div>
  );
};

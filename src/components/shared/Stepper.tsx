import React from 'react';
import { haptics } from '../../lib/haptics';

// Standard themed numeric stepper (− value +) used across the app's build/prescribe
// surfaces. Big tap targets, clamped to [min,max], optional unit suffix. Editable
// center value so power users can type instead of tapping.
interface Props {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export const Stepper: React.FC<Props> = ({ label, value, onChange, min = 0, max = 999, step = 1, unit }) => {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const bump = (d: number) => { haptics.tick(); onChange(clamp(value + d * step)); };

  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--text-muted)] mb-1 px-0.5">{label}</label>
      <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
          className="h-11 w-10 shrink-0 flex items-center justify-center text-[22px] leading-none text-[var(--text-secondary)] active:bg-[var(--bg-elevated)] disabled:opacity-30"
        >
          −
        </button>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => { const n = Number(e.target.value.replace(/[^\d.]/g, '')); if (!Number.isNaN(n)) onChange(clamp(n)); }}
          className="flex-1 min-w-0 h-11 text-center text-[16px] font-semibold outline-none bg-transparent text-[var(--text-primary)]"
        />
        {unit && <span className="pr-1 text-[12px] text-[var(--text-muted)] shrink-0">{unit}</span>}
        <button
          type="button"
          onClick={() => bump(1)}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
          className="h-11 w-10 shrink-0 flex items-center justify-center text-[20px] leading-none text-[var(--text-secondary)] active:bg-[var(--bg-elevated)] disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
};

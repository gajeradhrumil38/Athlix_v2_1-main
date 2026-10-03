import React from 'react';
import { AppIcon, type IconName } from '../../../config/icons';

// One visual language for every card on the coach's trainee Overview: the
// same shell, header, number style and empty state. Each data card has an
// identity colour (its `tone`) that tints the title, the number's unit, the
// chart and the plot grid — the card background itself stays neutral.

// Identity colours per kind of data (theme variables; charts use palette hex).
export const IDENTITY = {
  load: 'var(--accent)',
  weight: 'var(--ring-volume)',
  records: 'var(--pr-gold)',
  consistency: 'var(--green)',
  plans: 'var(--purple)',
} as const;

// Semantic tones, all theme variables.
export const TONE = {
  accent: 'var(--accent)',
  good: 'var(--green)',
  warn: 'var(--yellow)',
  bad: 'var(--red)',
  info: 'var(--ring-volume)',
} as const;

// Inner surfaces blend into the card: a faint light (or identity-tinted) fill,
// no border. --bg-elevated is 35% black, which read as a hole cut in the card.
export const tile = (tint?: string): React.CSSProperties => ({
  background: tint
    ? `color-mix(in srgb, ${tint} 8%, transparent)`
    : 'color-mix(in srgb, var(--text-primary) 4.5%, transparent)',
});

// A soft glow of the card's identity colour from the top-left corner — depth
// from tone rather than lines.
export const glow = (tone?: string): React.CSSProperties =>
  tone ? { backgroundImage: `radial-gradient(130% 90% at 0% 0%, color-mix(in srgb, ${tone} 11%, transparent), transparent 55%)` } : {};

// Any card can hand a question to the Ask AI card on the same page.
export const ASK_TRAINEE_AI_EVENT = 'athlix:ask-trainee-ai';
export const askTraineeAiAbout = (question: string) =>
  window.dispatchEvent(new CustomEvent(ASK_TRAINEE_AI_EVENT, { detail: { question } }));

interface WidgetCardProps {
  title: string;
  // Identity colour for the title/icon. Omit for neutral cards (notes, lists).
  tone?: string;
  icon?: IconName;
  // Small qualifier after the title, e.g. "last 7 days" or "lb".
  meta?: string;
  // Controls on the right of the header (kept clear of the drag handle).
  right?: React.ReactNode;
  // A question for Ask AI — shows a small sparkle button in the header.
  ask?: string;
  // Lists that run edge to edge (rows with their own padding).
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const WidgetCard: React.FC<WidgetCardProps> = ({ title, tone, icon, meta, right, ask, flush = false, className = '', children }) => (
  <section className={`glass-card overflow-hidden ${flush ? '' : 'p-4'} ${className}`} style={glow(tone)}>
    {/* pr-9 keeps the header clear of the Overview's drag handle (top-right). */}
    <header className={`flex items-center justify-between gap-2 pr-9 ${flush ? 'px-4 pt-4 pb-3' : 'mb-3'}`}>
      <div className="flex items-center gap-1.5 min-w-0">
        {icon && <span className="shrink-0" style={{ color: tone ?? 'var(--text-secondary)' }}><AppIcon name={icon} size="sm" /></span>}
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] truncate" style={{ color: tone ?? 'var(--text-secondary)' }}>{title}</h3>
        {meta && <span className="text-[11px] text-[var(--text-secondary)] opacity-70 truncate">· {meta}</span>}
      </div>
      {(right || ask) && (
        <div className="shrink-0 flex items-center gap-1.5">
          {right}
          {ask && (
            <button type="button" onClick={() => askTraineeAiAbout(ask)} aria-label={`Ask AI: ${ask}`} title="Ask AI about this"
              className="h-7 w-7 rounded-full flex items-center justify-center transition-opacity opacity-70 hover:opacity-100"
              style={{ color: 'var(--purple)', background: 'color-mix(in srgb, var(--purple) 10%, transparent)' }}>
              <AppIcon name="AICoach" size="sm" />
            </button>
          )}
        </div>
      )}
    </header>
    {children}
  </section>
);

// Headline number: display font, tabular figures, unit beside it.
export const BigNumber: React.FC<{ value: React.ReactNode; unit?: string; size?: 'lg' | 'md' | 'sm'; color?: string; unitColor?: string }> = ({ value, unit, size = 'lg', color, unitColor }) => {
  const px = size === 'lg' ? 'text-[36px]' : size === 'md' ? 'text-[26px]' : 'text-[19px]';
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span className={`font-victory ${px} leading-none font-black`} style={{ color: color ?? 'var(--text-primary)' }}>{value}</span>
      {unit && <span className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: unitColor ?? 'var(--text-secondary)' }}>{unit}</span>}
    </span>
  );
};

// Small labelled stat used inside cards ("Sessions 3").
export const StatLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-semibold text-[var(--text-secondary)] mt-1.5">{children}</p>
);

// One empty state for "not shared", "no data yet" and "nothing assigned".
export const EmptyState: React.FC<{ icon?: IconName; text: string; action?: React.ReactNode }> = ({ icon = 'Activity', text, action }) => (
  <div className="flex flex-col items-center text-center gap-2 py-6">
    <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-[var(--text-secondary)]" style={{ background: 'var(--bg-elevated)' }}>
      <AppIcon name={icon} size="sm" />
    </span>
    <p className="text-[13px] text-[var(--text-secondary)] max-w-[240px] leading-snug">{text}</p>
    {action}
  </div>
);

// Delta like "▲ 12% vs last" in the good/bad tone.
export const Delta: React.FC<{ pct: number | null; suffix?: string }> = ({ pct, suffix = 'vs last' }) => {
  if (pct == null) return null;
  const tone = pct > 0 ? TONE.good : pct < 0 ? TONE.bad : 'var(--text-secondary)';
  return (
    <span className="text-[12px] font-semibold" style={{ color: tone }}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : '—'} {Math.abs(pct)}% <span className="text-[var(--text-secondary)] font-medium">{suffix}</span>
    </span>
  );
};

/**
 * Centralised muscle-group → CSS variable mapping.
 *
 * Always use these strings in inline `color` / `background` / `border` styles
 * so the palette stays in sync with the design tokens defined in index.css.
 *
 * Usage:
 *   style={{ color: MUSCLE_COLOR['Chest'] }}
 *   style={{ background: `color-mix(in srgb, ${MUSCLE_COLOR['Chest']} 12%, transparent)` }}
 */
export const MUSCLE_COLOR: Record<string, string> = {
  Chest:      'var(--chest)',
  Back:       'var(--back)',
  Legs:       'var(--legs)',
  Shoulders:  'var(--shoulders)',
  Core:       'var(--core)',
  Biceps:     'var(--biceps)',
  Triceps:    'var(--triceps)',
  Arms:       'var(--biceps)',
  Cardio:     'var(--cardio)',
  Glutes:     'var(--glutes)',
  Forearms:   'var(--forearms)',
  Yoga:       'var(--yoga)',
  Mobility:   'var(--mobility)',
  'Full Body':'var(--text-secondary)',
};

/** Fallback color for unknown muscle groups */
export const MUSCLE_COLOR_FALLBACK = 'var(--text-muted)';

/** Resolve colour with fallback in one call */
export const muscleColor = (group: string): string =>
  MUSCLE_COLOR[group] ?? MUSCLE_COLOR_FALLBACK;

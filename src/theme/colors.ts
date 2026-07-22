// ╔══════════════════════════════════════════════════════════════════════╗
// ║  ATHLIX  —  COLOUR PALETTE                                           ║
// ║  This is the SINGLE file you edit to change any colour in the app.   ║
// ║  Every value here becomes a CSS variable that all components use.     ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
//  HOW IT WORKS
//  ─────────────────────────────────────────────────────────────────────
//  1. Edit any hex value below.
//  2. Save the file — Vite hot-reloads instantly.
//  3. applyTheme() (called in main.tsx) writes every value as a CSS
//     custom property on <html> before React renders.
//  4. Every component references var(--token), so your change
//     propagates everywhere automatically.
//
//  TOKENS USED IN COMPONENTS
//  ─────────────────────────────────────────────────────────────────────
//  var(--bg-base)        var(--text-primary)    var(--accent)
//  var(--bg-surface)     var(--text-secondary)  var(--accent-dim)
//  var(--bg-elevated)    var(--text-muted)       var(--accent-glow)
//  var(--bg-hover)       var(--border)           var(--border-subtle)
//  var(--chest)          var(--back)             var(--legs)
//  var(--shoulders)      var(--core)             var(--biceps)
//  var(--triceps)        var(--cardio)
//  var(--green)          var(--yellow)           var(--red)
//  var(--pr-gold)        var(--purple)
//  var(--ring-volume)    var(--ring-recovery)    var(--ring-strain)
// ─────────────────────────────────────────────────────────────────────

export const palette = {

  // ── Backgrounds ────────────────────────────────────────────────────
  // Layered from darkest (page root) to lightest (raised surfaces).
  bgBase:      '#030508',                    // app root / page background
  bgSurface:   'rgba(255, 255, 255, 0.05)', // glass cards, bottom sheets, panels
  bgElevated:  'rgba(0, 0, 0, 0.35)',       // inputs, inner cards, raised rows
  bgHover:     'rgba(255, 255, 255, 0.09)', // hover / tapped state

  // ── Borders ────────────────────────────────────────────────────────
  border:        'rgba(255, 255, 255, 0.10)', // glass card border
  borderSubtle:  'rgba(255, 255, 255, 0.05)', // hairline dividers inside surfaces

  // ── Text ───────────────────────────────────────────────────────────
  textPrimary:   '#e8edf3',   // headings, numbers, primary labels
  textSecondary: '#8692a4',   // subheadings, meta labels
  textMuted:     '#3a4a60',   // placeholders, disabled, very quiet info

  // ── Accent ─────────────────────────────────────────────────────────
  // Change this ONE value to re-brand the app (buttons, active states,
  // focus rings, progress bars, PR badges, etc.)
  accent:      '#C8FF00',              // lime green — primary brand colour
  accentDim:   'rgba(200, 255, 0, 0.12)',  // tinted backgrounds behind accent text
  accentGlow:  'rgba(200, 255, 0, 0.30)',  // glow shadows on FAB / rings

  // ── Metric rings (Home & Progress hero) ────────────────────────────
  ringVolume:   '#4FC3F7',   // blue   — volume ring
  ringRecovery: '#FFD54F',   // yellow — recovery ring
  ringStrain:   '#C8FF00',   // lime   — strain ring (mirrors accent)

  // ── Muscle groups ──────────────────────────────────────────────────
  // Used in workout cards, calendar bars, muscle map, progress charts.
  chest:      '#F09595',   // pink-red
  back:       '#5DCAA5',   // sage green
  legs:       '#EF9F27',   // orange
  shoulders:  '#AFA9EC',   // lavender
  core:       '#ff7a59',   // coral
  biceps:     '#85B7EB',   // steel blue
  triceps:    '#AFA9EC',   // lavender (same shade as shoulders)
  cardio:     '#ff7a59',   // coral (same shade as core)

  // ── Status / semantic colours ──────────────────────────────────────
  green:    '#4ade80',   // success states, active indicators
  yellow:   '#FFD54F',   // warnings, recovery ring
  red:      '#f87171',   // errors, delete actions
  prGold:   '#FAC775',   // personal-record badge
  purple:   '#a78bfa',   // AI coach, weekly summary widget

  // ── Special UI ─────────────────────────────────────────────────────
  // These appear only in specific components but are listed here so
  // you can change them without hunting through component files.
  heartRate:      '#19CCF0',   // live heart-rate display (Progress page)
  aiGradientFrom: '#7c3aed',   // AI Coach icon gradient — start (purple)
  aiGradientTo:   '#2563eb',   // AI Coach icon gradient — end  (blue)

  // ── Liquid Glass materials ──────────────────────────────────────────
  lgNavBg:   'rgba(28, 28, 32, 0.78)',  // nav bar / tab bar background
  lgSheetBg: 'rgba(18, 18, 24, 0.90)', // bottom sheets / modals

} as const;

export type PaletteKey = keyof typeof palette;

// ── CSS token map ───────────────────────────────────────────────────
// Maps each palette key to the var(--token) name used in components.
const CSS_TOKENS: Record<PaletteKey, string> = {
  bgBase:         '--bg-base',
  bgSurface:      '--bg-surface',
  bgElevated:     '--bg-elevated',
  bgHover:        '--bg-hover',
  border:         '--border',
  borderSubtle:   '--border-subtle',
  textPrimary:    '--text-primary',
  textSecondary:  '--text-secondary',
  textMuted:      '--text-muted',
  accent:         '--accent',
  accentDim:      '--accent-dim',
  accentGlow:     '--accent-glow',
  ringVolume:     '--ring-volume',
  ringRecovery:   '--ring-recovery',
  ringStrain:     '--ring-strain',
  chest:          '--chest',
  back:           '--back',
  legs:           '--legs',
  shoulders:      '--shoulders',
  core:           '--core',
  biceps:         '--biceps',
  triceps:        '--triceps',
  cardio:         '--cardio',
  green:          '--green',
  yellow:         '--yellow',
  red:            '--red',
  prGold:         '--pr-gold',
  purple:         '--purple',
  heartRate:      '--heart-rate',
  aiGradientFrom: '--ai-gradient-from',
  aiGradientTo:   '--ai-gradient-to',
  lgNavBg:        '--lg-nav-bg',
  lgSheetBg:      '--lg-sheet-bg',
};

/**
 * Write every palette value as a CSS custom property on <html>.
 * Call once in main.tsx before ReactDOM.render().
 *
 * Optionally pass overrides to apply a partial palette swap at runtime:
 *   applyTheme({ accent: '#FF6B00' })  // swap lime → orange
 */
export function applyTheme(overrides?: Partial<typeof palette>): void {
  const merged = { ...palette, ...overrides };
  const root = document.documentElement;
  for (const key of Object.keys(CSS_TOKENS) as PaletteKey[]) {
    root.style.setProperty(CSS_TOKENS[key], merged[key]);
  }
}

# Athlix Design System

**Athlix** is a mobile-first fitness-tracking app — *"Track. Recover. Perform."* It's a workout logger and training-intelligence dashboard: you log lifts set-by-set, and Athlix turns that into Apple-Fitness-style metric rings (Volume / Recovery / Strain), a muscle-map heatmap, AI "Train Next" suggestions, PR tracking, streaks, and weekly goals. Secondary surfaces cover running, food scanning, skincare routines, a calendar, and a WHOOP integration. It ships as a PWA: a Next.js marketing/auth shell wraps a Vite + React dashboard (mounted in an iframe) that does the heavy lifting.

This design system is the distilled, reusable expression of that product — tokens, components, foundation specimens, and a full app UI-kit recreation — so you can design new Athlix surfaces, mocks, and prototypes that look and feel native to the brand.

---

## Sources

Everything here was reverse-engineered from the real product. If you have access, explore them to build with higher fidelity:

- **Codebase (attached):** `AthlixV2.1-1/` — Next.js auth/marketing shell (`app/`) + the Vite dashboard source under the GitHub repo's `src/`. The built dashboard ships at `public/legacy-app/`.
- **GitHub:** [`gajeradhrumil38/Athlix_v2_1`](https://github.com/gajeradhrumil38/Athlix_v2_1) — the authoritative source. The dashboard lives in `src/` (pages: `Home`, `Log`, `Progress`, `Calendar`, `Settings`, `Auth`, plus `features/{running,food,skincare,whoop}`). **The single source of truth for colour is `src/theme/colors.ts`**; the type/radius/animation system is in `src/index.css`. Browse the repo to recreate any screen faithfully.

> The compiler-generated files (`_ds_bundle.js`, `_ds_manifest.json`, `_adherence.oxlintrc.json`) are produced automatically — never edit them.

---

## Content fundamentals

How Athlix writes copy:

- **Voice — a sharp training partner, not a drill sergeant or a cheerleader.** Direct, motivating, data-backed. *"Track. Recover. Perform."* · *"Push-heavy week — 18 chest sets vs 6 back sets."* · *"Legs are 70% of your muscle mass."*
- **Second person, imperative.** It talks to *you* and tells you what to do: *"What do you train for?"*, *"Pick the activity that best describes you."*, *"Keep pushing your limits."* First person is rare.
- **Sentence case everywhere** in running copy and buttons (*"Start Workout"*, *"View History"*, *"Finish setup"*). **ALL-CAPS is reserved for micro-labels** — eyebrows and tags only: `TRAIN NEXT`, `WEEKLY GOAL`, `VOLUME`, `SET 3`, `PRIORITY`, `PR`.
- **Numbers are the hero.** Copy is terse so the data stands out. Reasons are one short clause: *"Last pull session 4 days ago"*, *"+12% vs last week"*.
- **Encouraging, never preachy.** Empty states reassure (*"All muscle groups covered this week"*, *"Rest up or add an optional session"*). Errors are plain and kind (*"Incorrect email or password. Try again."*).
- **No emoji in the product UI.** (A handful appear only in the onboarding sport-picker — 🏃🚴🏊🏋️ — treat those as legacy, not the system.) Iconography carries meaning instead.
- **Tags are abbreviations.** `Incline DB`, `kg`/`lbs`, `24:18`. Tight, scannable, gym-native.

---

## Visual foundations

- **Mood: dark, athletic, electric.** A near-black **blue-tinted** canvas (`#0a0c10`) with one shocking **lime** accent (`#C8FF00`). The lime is used *surgically* — one primary action per view, active states, focus rings, progress fills, ring glows. Everything else is restrained greys and muscle hues.
- **Layered surfaces.** Four background tiers go darkest→lightest as elevation rises: base `#0a0c10` → surface `#121720` (cards) → elevated `#1a2030` (inputs, inner rows) → hover `#1e2638`. Borders are a hairline `#1e2638`.
- **Colour beyond the accent:** a per-**muscle-group** palette (chest pink-red, back sage, legs orange, shoulders lavender, core coral…) tags workouts, calendar bars, and the muscle map. Three **metric-ring** hues (volume blue, recovery yellow, strain lime). Status = green/yellow/red, PR = gold, AI = a purple→blue gradient (the *only* gradient in the system).
- **Type:** **Inter** for all UI (dense, mobile-first — 9–15px is the working range, page titles 24px). **VictoryStriker**, a condensed athletic face, for big numerals only — weights, reps, ring scores, volume, always `tabular-nums`. **Bebas Neue** for the `ATHLIX` marketing wordmark (lime, wide-tracked). Micro-labels are 9–10px, 700 weight, `letter-spacing: 0.16em`, uppercase.
- **Radii are responsive** via `clamp()` — smaller on phones, capped on desktop. Buttons/inputs ~9–12px, cards ~14–18px, bottom sheets ~18–24px, pills fully round.
- **Cards:** `bg-surface` fill, 1px `--border`, large radius, *no* shadow by default — elevation reads from the lighter fill. Add `--shadow-surface` (`0 8px 24px rgba(3,8,18,.3)`) only for floating/glass cards. The eyebrow-header pattern (tiny uppercase label top-left + lime action top-right) is everywhere.
- **The lime glow is the signature effect.** Active nav items, the FAB, completed sets, trained-day bars, and ring strokes all carry `box-shadow: 0 0 10px rgba(200,255,0,.30)` or a lime `text-shadow`. Used sparingly, it's what makes Athlix feel "on".
- **Backgrounds** are flat dark — no photography, no textures. Occasional faint lime radial "blob" glows (6% opacity, heavy blur) behind auth/hero areas, and a 4%-opacity grid pattern on the desktop auth panel. Glass = `backdrop-filter: blur(20–24px)` on sticky headers and the bottom nav over a semi-transparent base.
- **Motion is quick and physical.** iOS easing `cubic-bezier(.4,0,.2,1)`. Cards fade-and-rise in (`cardEnter`, 0.4s, staggered by `animationDelay`). Rings and bars animate their fill (1–1.5s ease-out). Press state = `scale(0.97)` shrink on every button/tab; tabs bump to `scale(1.1)` on tap. Today's pulse-ring and skeleton shimmer loops exist but decorative loops are otherwise avoided.
- **Hover** (desktop): elevated surfaces lighten to `--bg-hover` and lift 1px with a soft coloured glow (blue by default, lime/`subtle` variants); ghost items gain an elevated fill; lime primary darkens to `#b0e000`.
- **Layout:** mobile content is a single `max-width: 480px` column; a fixed 54px glass top header, a 64px glass bottom tab-bar (Home · Progress · Calendar · Run · Settings), and a lime FAB above it. Desktop swaps to a 240px sidebar rail.

---

## Iconography

- **[Lucide](https://lucide.dev) is the icon system** — the entire app uses it through a central `AppIcon` registry. **2px stroke**, `currentColor`, standardized sizes **16 / 20 / 24 / 32** (sm/md/lg/xl). Outline style, never filled.
- Canonical glyphs: `home`, `activity`, `calendar`, `footprints` (Run), `settings`, `plus` (Log/FAB), `trending-up` (Progress), `history` (Timeline), `dumbbell`, `trophy` (PR), `sparkles` (AI), `flame`/`zap` (streak), `check`, `chevron-left/right`, `utensils` (Food).
- **Load it from CDN:** `<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js">` then `lucide.createIcons()` — or `lucide-react` in React. Use `data-lucide="<name>"` on an `<i>`. The foundation card *Brand → App icon & iconography* shows the set live.
- The **app icon** is a lime `A` (Bebas/Arial-Black) on a dark rounded square; the **wordmark** is `ATHLIX` in Bebas Neue. `assets/favicon.svg` is the source mark.
- **No emoji** as UI icons. The AI Coach uses a small purple→blue gradient chip behind a white `sparkles`.
- Exercise illustrations are external **OpenTraining** line-art PNGs (black stroke on white) — a few are in `assets/exercises/`; the full set is in the codebase at `public/assets/opentraining/`.

---

## What's in here — index

**Root**
- `styles.css` — the single entry point consumers link. `@import`s the token files + base reset only.
- `tokens/` — `fonts.css` · `colors.css` · `typography.css` · `radius.css` (+ spacing/layout) · `effects.css` (shadows, glows, keyframes) · `base.css` (reset).
- `assets/` — `fonts/VictoryStrikerSans.otf`, `favicon.svg`, `exercises/` (sample OpenTraining line-art).
- `SKILL.md` — Agent-Skills-compatible entry point.

**Components** (`window.AthlixDesignSystem_093a3a.<Name>`)
- `components/core/` — **Button**, **Badge**, **SegmentControl**, **Toggle**, **Input**, **Card**.
- `components/fitness/` — **StatRing**, **ProgressBar**, **StatTile**.
- Each ships a `.jsx`, `.d.ts` (props), and `.prompt.md` (usage). Cards in each dir demo every variant.

**Foundation cards** (`guidelines/`) — Colors (surfaces, accent, text, rings, muscles, status), Type (display, UI scale, micro-labels), Spacing (radius, shadows/glow, scale), Brand (wordmark, app icon). These populate the Design System tab.

**UI kit** (`ui_kits/app/`) — `index.html` + `screens.jsx`: an interactive phone-framed recreation of the real app. Sign in → Home dashboard (rings, quick-stats, weekly goal, Train Next, today card, AI summary) → tap the FAB into an **Active Workout** (set rows with steppers), and the bottom nav into **Progress** (volume hero, bar chart, muscle load, PRs) and **Settings**. Also registered as a Starting Point.

---

## Working with this system

- **Always link `styles.css`** so tokens resolve. Reference colours/spacing as `var(--token)` — never hardcode hex.
- **Use the muscle palette and ring hues** for anything training-related; reserve lime for the single primary action and active states.
- **Big numbers → VictoryStriker + tabular-nums.** Labels → Inter, uppercase, tracked.
- **Compose the primitives** rather than rebuilding them; the UI kit shows how screens layer on top of `Card`, `StatRing`, `Badge`, etc.

### Caveats / fidelity notes
- Fonts: **VictoryStriker** is the real local brand font (copied in). **Inter** and **Bebas Neue** load from Google Fonts — visually identical to production. No substitutions were needed.
- The UI kit is a *cosmetic* recreation (mock data, simplified interactions) — it prioritizes pixel-feel over the app's real data/logic. Charts (muscle map SVG, radar, calendar heatmap) are represented with the system's bar/ring vocabulary rather than reproduced pixel-for-pixel.

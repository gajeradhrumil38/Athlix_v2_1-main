---
name: material-motion
description: "Material Design 3 motion system — easing curves, duration tokens, and M3 Expressive spring physics. Reference when animating UI transitions, button/component state changes, page/screen transitions, or choosing between spring vs duration+easing animation in this app (Framer Motion). Topics: easing, duration, spring, damping, stiffness, transition, animation, motion design, container transform, shape morph."
---

# Material Design 3 Motion

Reference for animating UI in this app (Framer Motion). Grounded in Material
Design 3's public motion spec — sourced via web search since `m3.material.io`
is JS-rendered and not directly fetchable; values cross-checked across
multiple independent sources (design-token repos, Android/Compose docs).

## Why this exists

Learned the hard way in this session: guessing spring `stiffness`/`damping`
values for a button morph animation took three attempts to get right, and
even then produced a "sliding sideways" artifact from flex siblings
resizing independently. Material's spec exists precisely to skip that
guesswork — it names specific curves/springs for specific situations, with
exact numeric values. Use this file before hand-tuning a `transition` object
from scratch.

## The three principles

Material states motion should be:

- **Informative** — highlights relationships between elements, what's
  actionable, and the outcome of an action. Motion should teach the user
  something about the UI's structure, not just look nice.
- **Focused** — draws attention to what matters without distracting from
  it. If an animation competes with the content for attention, it's wrong.
- **Expressive** — celebrates moments and adds character, but only where
  appropriate (see spring damping below — this is where M3 Expressive's
  bouncier springs come in, deliberately reserved for "hero moments").

## Two motion systems: pick one per situation

### 1. Duration + easing curves (the "standard" system)

Use for: property-only changes (color, opacity) and small/quick
micro-interactions (ripples, icon toggles, simple fades). No spatial
movement — nothing changing position, size, or shape.

**Easing curves** (as CSS `cubic-bezier` / Framer Motion `ease` arrays):

| Curve | cubic-bezier | Use for |
|---|---|---|
| `standard` | `(0.2, 0, 0, 1)` | Default for most UI transitions |
| `standard-decelerate` | `(0, 0, 0, 1)` | Elements entering the screen |
| `standard-accelerate` | `(0.3, 0, 1, 1)` | Elements exiting the screen |
| `emphasized` | `(0.2, 0, 0, 1)` | Large/prominent transitions, general case |
| `emphasized-decelerate` | `(0.05, 0.7, 0.1, 1)` | A shape/container arriving at its final state (e.g. a **container transform** — one shape morphing into a differently-sized/positioned one) |
| `emphasized-accelerate` | `(0.3, 0, 0.8, 0.15)` | A shape/container leaving/collapsing |

**Duration tokens** (ms) — pick based on how much is changing, not by feel:

| Tier | Values | Use for |
|---|---|---|
| Short | 50, 100, 150, 200 | Small utility transitions (icon toggle, ripple), and **all interactive controls** — buttons, toggles, tabs should never feel sluggish to respond to |
| Medium | 250, 300, 350, 400 | Standard container/element transitions |
| Long | 450, 500 | Complex or large-surface transitions (full-screen, large container transforms) |

### 2. Spring physics (M3 Expressive — the newer default for spatial motion)

Use for: anything changing **position, size, orientation, or shape**
("spatial" motion) where a physical, springy feel reads better than a fixed
curve — this supersedes duration+easing for most spatial cases in M3
Expressive. Property-only changes (just color/opacity, no movement) still
use the "Effects" springs below, not the standard easing curves.

A spring is defined by **stiffness** (how fast it resolves) and **damping**
(how fast the bounce settles — lower damping = more overshoot/bounce).
Framer Motion's `{ type: 'spring', stiffness, damping }` maps directly onto
these.

**Spatial tokens** (position/size/shape changes — allowed to overshoot):

| Token | Damping | Stiffness | Feel |
|---|---|---|---|
| `standardSpatialFast` | 0.9 | 1400 | Quick, minimal overshoot |
| `standardSpatialDefault` | 0.9 | 700 | Default spatial motion |
| `standardSpatialSlow` | 0.9 | 300 | Deliberate, large-surface motion |
| `expressiveSpatialFast` | 0.6 | 800 | Noticeable bounce, quick |
| `expressiveSpatialDefault` | 0.8 | 380 | Noticeable bounce — reserve for hero moments/key interactions, not routine UI |
| `expressiveSpatialSlow` | 0.8 | 200 | Noticeable bounce, slow |

**Effects tokens** (color/opacity — no movement) have their own fast/
default/slow tier too, distinct from spatial — don't reuse a spatial
spring for a pure color fade.

The standard tier (damping 0.9 throughout) is the safe default for regular
UI. The expressive tier's lower damping (0.6–0.8) is what produces visible
overshoot/bounce — genuinely reserve that for moments meant to feel
delightful/branded, not for every button press, or it reads as sloppy
rather than expressive.

## Practical decision tree

1. **Is anything moving, resizing, or changing shape?**
   - No (just color/opacity) → use an Effects spring, or a short-duration
     `standard` ease for something this simple.
   - Yes → go to 2.
2. **Is it a routine interactive control (button, toggle, tab)?**
   - Yes → keep it fast (short duration tier, ≤200ms) and low-drama —
     `standardSpatialFast`/`Default`, not the expressive tier.
3. **Is it one shape/container literally morphing into a different
   shape/size (a "container transform")?**
   - Yes, and it's a deliberate, rare, "hero" transition → duration+easing
     with `emphasized-decelerate`, medium/long duration tier.
   - Yes, but it's a routine UI element (not a hero moment) → **reconsider
     the shape-morph entirely first.** Learned this directly in this
     session: a button that changes size/shape on every state toggle is
     inherently harder to get feeling smooth than a fixed-size button
     whose *content* slides/crossfades instead (`AnimatePresence`,
     `mode="wait"`, absolutely-positioned content inside a fixed-size,
     `overflow: hidden` container). If it's not a genuine hero moment,
     the fixed-size-content-slide pattern is usually the better call, not
     just the easier one.
4. **Multiple sibling elements changing layout at the same time?**
   - Coordinate them (Framer Motion's `LayoutGroup`) rather than letting
     each animate independently — independent FLIP calculations on
     interdependent flex siblings can drift out of sync frame-to-frame,
     which reads as sliding/drifting rather than a clean resize. Better
     still: avoid the situation by not having multiple things resize at
     once (see point 3).

## Applying this in Framer Motion

```tsx
// Standard easing + duration (property-only change)
<motion.div
  animate={{ opacity: 1 }}
  transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }} // standard
/>

// Emphasized decelerate (a genuine container transform / hero moment)
<motion.div
  layout
  transition={{ type: 'tween', ease: [0.05, 0.7, 0.1, 1], duration: 0.4 }}
/>

// M3 Expressive spring (spatial, hero moment — sparingly)
<motion.div
  animate={{ scale: 1.1 }}
  transition={{ type: 'spring', stiffness: 380, damping: 0.8 * 100 }}
  // note: Framer Motion's damping is NOT the 0-1 damping ratio M3 tokens
  // use — it's an absolute value roughly in the same range as stiffness.
  // Convert by treating the M3 ratio as a starting point and tuning by
  // eye, or use Framer Motion's own `dampingRatio`-free defaults and only
  // borrow the *stiffness* number directly.
/>

// Fixed-size content slide (routine control, state changes shape/label)
<button style={{ position: 'relative', overflow: 'hidden' }}>
  <AnimatePresence mode="wait" initial={false}>
    <motion.span
      key={currentState}
      initial={{ x: 18, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -18, opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      style={{ position: 'absolute', inset: 0 }}
    >
      {label}
    </motion.span>
  </AnimatePresence>
</button>
```

## Sources

- [Motion – Material Design 3](https://m3.material.io/styles/motion/overview/how-it-works) (the page this skill was requested from — JS-rendered, not directly fetchable; principles above sourced via search-result excerpts of this page)
- [Easing and duration – Material Design 3](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)
- [M3 Expressive: New Motion System](https://m3.material.io/blog/m3-expressive-motion-theming)
- [Compose Material 3 Expressive (spring token values)](https://zoewave.medium.com/compose-material-3-expressive-89f4147df5b8)
- [material-components-android Motion.md](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)

Values were corroborated across at least two independent sources each; flag
if a future check against the live M3 site finds a discrepancy.

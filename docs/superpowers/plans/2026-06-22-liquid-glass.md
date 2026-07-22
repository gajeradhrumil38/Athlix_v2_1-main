# Liquid Glass Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Apple's iOS 26 Liquid Glass material system across the entire Athlix app — navigation chrome, bottom sheets, modals, sticky headers, and content cards — without touching any functionality.

**Architecture:** Three material tiers: (1) Nav material for fixed chrome elements (tab bar, header, sidebar) with heavy blur+saturation, (2) Sheet material for bottom sheets and modals with thick glass, (3) Card material for content surfaces with lighter blur. CSS utility classes defined once in `index.css`, applied inline/via className across components. No functionality changes — only `className`, `style`, and CSS token edits.

**Tech Stack:** React 18 + TypeScript + Tailwind CSS v4 + CSS custom properties

---

## Apple Liquid Glass Spec Reference

Sourced from WWDC 2025 (iOS 26 / visionOS 2):

```
NAV MATERIAL    bg: rgba(28,28,32,0.78)  blur: blur(40px) saturate(1.8)  border: rgba(255,255,255,0.14)
SHEET MATERIAL  bg: rgba(18,18,24,0.90)  blur: blur(50px) saturate(2.0)  border: rgba(255,255,255,0.15) top only
CARD MATERIAL   bg: rgba(255,255,255,0.05) blur: blur(20px) saturate(1.4) border: rgba(255,255,255,0.10)
INPUT MATERIAL  bg: rgba(0,0,0,0.28)     blur: blur(8px)                  border: rgba(255,255,255,0.12)
SPECULAR        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08)
SHEET HANDLE   width:36px height:4px radius:99px bg:rgba(255,255,255,0.20)
```

Rules:
- Content scrolls BEHIND glass nav (overflow works through backdrop-filter)
- No glass-on-glass nesting (don't put glass cards inside glass sheets)
- Background MUST be non-solid for backdrop-filter to show anything — body must be `#030508` with radial gradient
- `background-attachment: fixed` on body so ambient glow stays fixed while content scrolls

---

## Files Modified

| File | Change |
|------|--------|
| `src/index.css` | Glass material classes, fix skeleton, body bg-attachment, global card backdrop |
| `src/theme/colors.ts` | Add `lgNav`, `lgSheet` background tokens |
| `src/components/layout/Layout.tsx` | Nav, header, sidebar, toast glass materials |
| `src/components/ai/AiChat.tsx` | Drawer sheet material + handle |
| `src/components/log/FinishSheet.tsx` | Sheet container glass material |
| `src/components/log/PlanTodaySheet.tsx` | Sheet container glass material |
| `src/components/log/QuickStartSheet.tsx` | Sheet container glass material |
| `src/components/log/WeightRepsModal.tsx` | Modal glass material |
| `src/components/log/ExercisePicker.tsx` | Picker panel glass material |
| `src/pages/Calendar.tsx` | Sticky header hardcoded color fix |
| `src/pages/Progress.tsx` | Sticky header glass material |
| `src/pages/Home.tsx` | Date navigator header glass material |

---

## Task 1: CSS Foundation — Glass Materials + Global Fixes

**Files:**
- Modify: `src/index.css`
- Modify: `src/theme/colors.ts`

### What this task does:
Defines the three glass material utility classes (`.lg-nav`, `.lg-sheet`, `.lg-card`), fixes the skeleton shimmer (broken since `--bg-surface` became transparent), adds `background-attachment: fixed` to body so the ambient glow stays fixed, and applies a global backdrop-filter rule to all bordered card divs.

- [ ] **Step 1: Add glass tokens to `src/theme/colors.ts`**

Open `src/theme/colors.ts`. After the `aiGradientTo` line, add two new palette entries AND update the `CSS_TOKENS` map:

```typescript
// In the palette object, add after aiGradientTo:
  lgNavBg:    'rgba(28, 28, 32, 0.78)',    // heavy nav material
  lgSheetBg:  'rgba(18, 18, 24, 0.90)',    // thick sheet/modal material
```

Then in `CSS_TOKENS`, add:
```typescript
  lgNavBg:    '--lg-nav-bg',
  lgSheetBg:  '--lg-sheet-bg',
```

Then update the TypeScript type (it's `as const`, so add the type export if it breaks — it won't).

- [ ] **Step 2: Update CSS fallback values in `:root`** in `src/index.css`

Inside `@layer base { :root { ... } }`, after `--border-subtle`, add:

```css
    /* ── Liquid Glass materials ───────────────────────── */
    --lg-nav-bg:   rgba(28, 28, 32, 0.78);
    --lg-sheet-bg: rgba(18, 18, 24, 0.90);
```

- [ ] **Step 3: Add `background-attachment: fixed` to body** in `src/index.css`

Find the `body { ... }` block and add one line:

```css
  body {
    background-color: var(--bg-base);
    background-attachment: fixed;   /* ← add this — glow stays fixed while content scrolls */
    background-image:
      radial-gradient(ellipse 480px 520px at 105% 50%, rgba(26, 53, 88, 0.50) 0%, transparent 70%),
      radial-gradient(ellipse 300px 300px at 0% 80%, rgba(14, 30, 58, 0.30) 0%, transparent 60%);
    /* ... rest unchanged */
  }
```

- [ ] **Step 4: Add `.lg-nav`, `.lg-sheet` utility classes** in `@layer utilities` section of `src/index.css`

After the `.glass-surface` rule in the `@layer base` block, in `@layer utilities` add:

```css
  /* ── Liquid Glass: Navigation material (tab bars, headers, sidebar) ── */
  .lg-nav {
    background: var(--lg-nav-bg);
    backdrop-filter: blur(40px) saturate(1.8) brightness(1.06);
    -webkit-backdrop-filter: blur(40px) saturate(1.8) brightness(1.06);
    border-color: rgba(255, 255, 255, 0.14);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.08) inset;
  }

  /* ── Liquid Glass: Sheet / Modal material (bottom sheets, drawers) ── */
  .lg-sheet {
    background: var(--lg-sheet-bg);
    backdrop-filter: blur(50px) saturate(2.0) brightness(1.04);
    -webkit-backdrop-filter: blur(50px) saturate(2.0) brightness(1.04);
    box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.12) inset;
  }

  /* ── Liquid Glass: Sheet drag handle ── */
  .lg-handle {
    width: 36px;
    height: 4px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.20);
    margin: 10px auto 0;
    flex-shrink: 0;
  }
```

- [ ] **Step 5: Fix skeleton shimmer** in `@layer utilities` of `src/index.css`

The skeleton used `var(--bg-surface)` and `var(--bg-elevated)` — both now transparent. Replace with explicit dark values:

Find:
```css
  .skeleton {
    background: linear-gradient(
      90deg,
      var(--bg-surface) 25%,
      var(--bg-elevated) 50%,
      var(--bg-surface) 75%
    );
```

Replace with:
```css
  .skeleton {
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.04) 25%,
      rgba(255, 255, 255, 0.09) 50%,
      rgba(255, 255, 255, 0.04) 75%
    );
```

- [ ] **Step 6: Add global backdrop-filter rule for content cards** in `src/index.css` inside `@layer base`

After the `.glass-surface` rule, add:

```css
  /* Global liquid glass: all bordered rounded div cards get light backdrop blur */
  /* This avoids touching 70+ component files individually */
  div:where(
    [class~="rounded-xl"],
    [class~="rounded-2xl"],
    [class~="rounded-3xl"]
  ):where([class~="border"]) {
    backdrop-filter: blur(16px) saturate(1.3);
    -webkit-backdrop-filter: blur(16px) saturate(1.3);
  }
  /* Stronger specular for elements that explicitly declare glass-card */
  div.glass-card {
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45), 0 1px 0 rgba(255,255,255,0.07) inset;
  }
```

- [ ] **Step 7: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 8: Commit**

```bash
git add src/index.css src/theme/colors.ts
git commit -m "style: add liquid glass CSS material system (lg-nav, lg-sheet, skeleton fix)"
```

---

## Task 2: Layout Chrome — Nav, Header, Sidebar, Toasts

**Files:**
- Modify: `src/components/layout/Layout.tsx`

### What this task does:
Applies `.lg-nav` to the desktop sidebar, mobile header, and bottom nav pill. Updates toast background to use glass. FAB stays solid accent (Apple spec: CTAs use solid fill, not glass).

- [ ] **Step 1: Update desktop sidebar** (`src/components/layout/Layout.tsx`)

Find the `<aside>` element (line ~120). Replace its `style` prop:

```tsx
<aside
  className="hidden md:flex flex-col w-60 shrink-0 border-r lg-nav"
  style={{
    borderRightColor: 'rgba(255, 255, 255, 0.10)',
  }}
>
```

- [ ] **Step 2: Update mobile header** (`src/components/layout/Layout.tsx`)

Find the `<header>` element for mobile top header (~line 175). Replace its `style` prop:

```tsx
<header
  className="md:hidden fixed top-0 left-0 right-0 z-[90] lg-nav"
  style={{
    paddingTop: 'env(safe-area-inset-top)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.10)',
  }}
>
```

- [ ] **Step 3: Update bottom tab nav pill** (`src/components/layout/Layout.tsx`)

Find the `<div className="flex h-[62px]...">` inside the floating nav. Replace its `style` prop to use `.lg-nav` class + remove the inline background:

```tsx
<div
  className="flex h-[62px] w-full items-center justify-around px-2 rounded-[31px] lg-nav"
  style={{
    border: '1px solid rgba(255, 255, 255, 0.14)',
    boxShadow: '0 2px 24px rgba(0,0,0,0.60)',
  }}
>
```

- [ ] **Step 4: Update Toaster styles** (`src/components/layout/Layout.tsx`)

Find the `<Toaster>` component's `toastOptions.style` (~line 320). Replace:

```tsx
style: {
  background: 'rgba(28, 28, 32, 0.92)',
  backdropFilter: 'blur(40px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
  color: 'var(--text-primary)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: '14px',
  fontSize: '14px',
  fontWeight: 500,
  padding: '10px 14px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.08) inset',
},
```

- [ ] **Step 5: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/components/layout/Layout.tsx
git commit -m "style: apply lg-nav material to sidebar, header, tab bar, toasts"
```

---

## Task 3: Bottom Sheets — FinishSheet, PlanTodaySheet, QuickStartSheet

**Files:**
- Modify: `src/components/log/FinishSheet.tsx`
- Modify: `src/components/log/PlanTodaySheet.tsx`
- Modify: `src/components/log/QuickStartSheet.tsx`

### What this task does:
Bottom sheets currently use `bg-[var(--bg-base)]` (solid `#030508`) which completely blocks the background. Apply `.lg-sheet` material so content blurs through.

- [ ] **Step 1: Update FinishSheet container** (`src/components/log/FinishSheet.tsx:72`)

Find:
```tsx
className="w-full max-w-[480px] bg-[var(--bg-base)] rounded-t-[24px] flex flex-col border-t border-[var(--border)]"
```

Replace:
```tsx
className="w-full max-w-[480px] lg-sheet rounded-t-[24px] flex flex-col"
style={{ borderTop: '1px solid rgba(255, 255, 255, 0.14)' }}
```

Note: `style` needs to be added as a prop to this div. Check the surrounding JSX — if the div already has a `style` prop, merge it.

- [ ] **Step 2: Update FinishSheet footer strip** (`src/components/log/FinishSheet.tsx:154`)

Find:
```tsx
<div className="p-6 border-t border-[var(--border)] bg-[var(--bg-base)]">
```

Replace:
```tsx
<div className="p-6" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
```

- [ ] **Step 3: Add `.lg-handle` to FinishSheet**

Find the drag handle inside FinishSheet (look for a `w-10 h-1` or similar pill element near the top). If it exists, update it:
```tsx
<div className="lg-handle" />
```

If no handle exists, add one as the **first child** inside the sheet container div:
```tsx
<div className="lg-handle" />
```

- [ ] **Step 4: Update PlanTodaySheet container** (`src/components/log/PlanTodaySheet.tsx:584`)

Find:
```tsx
className="w-full max-w-[480px] flex flex-col rounded-t-[24px]"
```

Replace (and ensure it has a `style` prop or add it inline):
```tsx
className="w-full max-w-[480px] flex flex-col rounded-t-[24px] lg-sheet"
style={{ borderTop: '1px solid rgba(255, 255, 255, 0.14)' }}
```

Also find the drag handle in PlanTodaySheet (look for `bg-[var(--text-muted)]` pill div) and replace:
```tsx
<div className="lg-handle" />
```

- [ ] **Step 5: Update QuickStartSheet container** (`src/components/log/QuickStartSheet.tsx:125`)

Find:
```tsx
className="w-full max-w-[480px] rounded-t-[20px] flex flex-col border-t border-[var(--border)]"
```

Replace:
```tsx
className="w-full max-w-[480px] rounded-t-[24px] flex flex-col lg-sheet"
style={{ borderTop: '1px solid rgba(255, 255, 255, 0.14)' }}
```

Also update its drag handle:
```tsx
<div className="lg-handle" />
```

- [ ] **Step 6: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/components/log/FinishSheet.tsx src/components/log/PlanTodaySheet.tsx src/components/log/QuickStartSheet.tsx
git commit -m "style: apply liquid glass sheet material to bottom sheets"
```

---

## Task 4: Sheets — WeightRepsModal, ExercisePicker, AiChat

**Files:**
- Modify: `src/components/log/WeightRepsModal.tsx`
- Modify: `src/components/log/ExercisePicker.tsx`
- Modify: `src/components/ai/AiChat.tsx`

- [ ] **Step 1: Update WeightRepsModal containers** (`src/components/log/WeightRepsModal.tsx`)

Find all `rounded-t-[24px]` sheet containers. There are two overlapping sheets at lines ~740 and ~845 and ~925:

Pattern to find and update:
```tsx
// Each sheet container — find by rounded-t-[24px] + p-5
className="w-full max-w-[480px] rounded-t-[24px] p-5 ..."
```

For each, add `lg-sheet` to className and add `style={{ borderTop: '1px solid rgba(255,255,255,0.14)' }}`. Example:
```tsx
className="w-full max-w-[480px] rounded-t-[24px] p-5 pb-[max(28px,env(safe-area-inset-bottom))] lg-sheet"
style={{ borderTop: '1px solid rgba(255,255,255,0.14)' }}
```

Also at line ~1417, the center modal:
```tsx
className="w-full max-w-[340px] rounded-2xl p-5 lg-sheet"
style={{ border: '1px solid rgba(255,255,255,0.14)' }}
```

- [ ] **Step 2: Update ExercisePicker panel** (`src/components/log/ExercisePicker.tsx`)

Find the root container of the picker panel (typically a `fixed bottom-0` or `absolute` positioned div). Apply `lg-sheet` material to the outermost container that has the picker background.

Search for: `bg-[var(--bg-base)]` or `bg-[var(--bg-surface)]` on the picker's root container. Replace that className to add `lg-sheet`.

- [ ] **Step 3: Update AiChat drawer** (`src/components/ai/AiChat.tsx:1161–1174`)

Find the mobile sheet container:
```tsx
className="md:hidden fixed bottom-0 left-0 right-0 z-[200] flex flex-col"
style={{
  height: '82vh',
  borderRadius: '16px 16px 0 0',
  background: 'var(--bg-surface)',
  borderTop: '1px solid var(--border)',
  borderLeft: '1px solid var(--border)',
  borderRight: '1px solid var(--border)',
}}
```

Replace `style`:
```tsx
className="md:hidden fixed bottom-0 left-0 right-0 z-[200] flex flex-col lg-sheet"
style={{
  height: '82vh',
  borderRadius: '20px 20px 0 0',
  border: '1px solid rgba(255,255,255,0.14)',
  borderBottom: 'none',
}}
```

Then find the drag pill handle right after this div:
```tsx
<div style={{ width: 36, height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.15)', margin: '10px auto 0', flexShrink: 0 }} />
```

Replace with:
```tsx
<div className="lg-handle" />
```

- [ ] **Step 4: Update AiChat desktop sidebar panel** (`src/components/ai/AiChat.tsx`)

Find the desktop panel container (the `md:flex` / `md:block` version). Apply `.lg-nav` material since it's a side panel:
```tsx
// Find the desktop container and add lg-nav to className
// Also set border: '1px solid rgba(255,255,255,0.12)'
```

- [ ] **Step 5: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/components/log/WeightRepsModal.tsx src/components/log/ExercisePicker.tsx src/components/ai/AiChat.tsx
git commit -m "style: apply liquid glass sheet material to modals and AI chat drawer"
```

---

## Task 5: Page Sticky Headers

**Files:**
- Modify: `src/pages/Calendar.tsx`
- Modify: `src/pages/Progress.tsx`
- Modify: `src/pages/Home.tsx`

### What this task does:
Sticky headers currently use hardcoded `rgba(10,12,16,...)` (old color) or solid `var(--bg-base)`. Update them to use nav glass material, always on — Apple's spec says nav glass is always active (content scrolls behind it permanently).

- [ ] **Step 1: Update Calendar sticky header** (`src/pages/Calendar.tsx:1368–1374`)

Find:
```tsx
<div
  className="sticky top-0 z-20 scroll-fade-header"
  style={{
    background: isScrolled ? 'rgba(10,12,16,0.92)' : 'var(--bg-base)',
    backdropFilter: isScrolled ? 'blur(14px)' : 'none',
    WebkitBackdropFilter: isScrolled ? 'blur(14px)' : 'none',
    transition: 'background 0.25s ease, backdrop-filter 0.25s ease',
  }}
>
```

Replace:
```tsx
<div
  className="sticky top-0 z-20 scroll-fade-header lg-nav"
  style={{
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    transition: 'opacity 0.2s ease',
  }}
>
```

Also update the `scroll-fade-header` variable if it appears anywhere as `--scroll-fade-color: 'rgba(10,12,16,...)'`. Replace with `rgba(3,5,8,0.92)`.

- [ ] **Step 2: Update Progress sticky header** (`src/pages/Progress.tsx:886`)

Find:
```tsx
<div className="sticky top-0 z-20 bg-[var(--bg-base)]/95 backdrop-blur-xl scroll-fade-header">
```

Replace:
```tsx
<div className="sticky top-0 z-20 lg-nav scroll-fade-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
```

Also search `Progress.tsx` for `rgba(10,12,16` or `rgba(0,0,0,0.65)` or similar old hardcoded backgrounds and update to glass values. The two line-chart overlay tooltips at lines ~1993 and ~2065:

```tsx
// Find: style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
// Replace: style={{ background: 'rgba(18,18,24,0.88)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 8 }}
```

- [ ] **Step 3: Update Home date navigator header** (`src/pages/Home.tsx:519`)

Find:
```tsx
<header className="sticky top-0 z-40 bg-[var(--bg-base)]/95 scroll-fade-header grid ..." style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', paddingTop: 'env(safe-area-inset-top)', minHeight: 'calc(44px + env(safe-area-inset-top))', '--scroll-fade-color': 'rgba(3,5,8,0.95)' } as React.CSSProperties}>
```

Replace the `className` and `style` to use lg-nav:
```tsx
<header
  className="sticky top-0 z-40 lg-nav scroll-fade-header grid grid-cols-[1fr_auto_1fr] items-center px-1"
  style={{
    paddingTop: 'env(safe-area-inset-top)',
    minHeight: 'calc(44px + env(safe-area-inset-top))',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    '--scroll-fade-color': 'rgba(3,5,8,0.95)',
  } as React.CSSProperties}
>
```

- [ ] **Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/pages/Calendar.tsx src/pages/Progress.tsx src/pages/Home.tsx
git commit -m "style: apply liquid glass nav material to all page sticky headers"
```

---

## Task 6: Final Polish — Settings page groups, Auth card, Toggle fix

**Files:**
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Auth.tsx`
- Modify: `src/index.css` (toggle fix)

### What this task does:
Settings page grouped rows use `rounded-2xl overflow-hidden` containers — these need explicit backdrop-filter since they use `var(--bg-base)` as background in some places. Auth card should be a proper glass sheet. Toggle track needs updated colors since `--bg-elevated` is now transparent.

- [ ] **Step 1: Fix Settings section containers** (`src/pages/Settings.tsx`)

Search for:
```tsx
style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
```
(appears on the `rounded-xl overflow-hidden` row group containers)

Replace each occurrence with:
```tsx
style={{
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.10)',
  backdropFilter: 'blur(20px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
}}
```

Also find the large outer section `<div className="rounded-2xl overflow-hidden"` containers and add the same glass treatment:
```tsx
style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
```

- [ ] **Step 2: Update Auth page card** (`src/pages/Auth.tsx`)

Find the main auth card container (look for `rounded-2xl` or `rounded-xl` wrapper around the form). Apply glass sheet:

```tsx
// Find: className="... rounded-2xl ..." with background
// Add: lg-sheet class, or inline: style={{ background: 'rgba(18,18,24,0.90)', backdropFilter: 'blur(50px) saturate(2.0)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 20 }}
```

Auth inputs currently use `bg-[var(--bg-elevated)]` = `rgba(0,0,0,0.35)` — this is correct for glass inputs, keep unchanged.

- [ ] **Step 3: Fix toggle track** in `src/index.css`

The toggle track uses `background: var(--bg-elevated)` which is now `rgba(0,0,0,0.35)` — may look invisible. Update:

Find:
```css
.toggle-track {
  ...
  background: var(--bg-elevated);
  border: 1px solid var(--border);
```

Replace:
```css
.toggle-track {
  ...
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
```

- [ ] **Step 4: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/pages/Settings.tsx src/pages/Auth.tsx src/index.css
git commit -m "style: settings groups glass, auth card glass, toggle track fix"
```

---

## Task 7: Verification Pass

**Files:** Visual browser check only — no code changes unless issues found.

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Check each screen with this checklist**

| Screen | Check |
|--------|-------|
| Home | Date nav header is glass (blurs content behind). Cards have subtle glass backdrop. |
| Log/Active Workout | No regressions. Minimal visual change (user request). |
| Calendar | Sticky header is glass. Month grid cards visible and readable. |
| Progress | Tab bar header is glass. Chart cards readable. Tooltips are glass. |
| Timeline | Cards have glass backdrop. |
| Settings | Section groups are glass. Toggle visible and working. |
| AI Chat | Drawer slides up with glass material. Handle pill visible. |
| Bottom sheets (FinishSheet, WeightReps) | Glass material. Handle pill at top. Text readable. |
| Auth | Form card is glass. Inputs visible. |
| Bottom nav | Floating pill, active tab tight capsule only around icon. |

- [ ] **Step 3: Contrast check**

Text must remain readable on all glass surfaces. If any text is hard to read:
- Increase text opacity: change `text-[var(--text-secondary)]` elements to `text-[var(--text-primary)]`
- Or add a subtle `text-shadow: 0 1px 2px rgba(0,0,0,0.5)` for glass overlays

- [ ] **Step 4: Final TypeScript check + tag**

```bash
npx tsc --noEmit
git add -A
git commit -m "style: liquid glass design system — complete (7 tasks)"
```

---

## Key Decisions & Trade-offs

1. **Global backdrop-filter on div.border.rounded-*** vs class-by-class: The global CSS rule covers ~90% of cards without touching individual files. The 10% edge case (buttons with border) will also get blur but this is imperceptible on solid-color buttons.

2. **`background-attachment: fixed`**: Required for the ambient blue glow to stay fixed while page content scrolls, which is essential for the depth illusion. May cause slight performance overhead on low-end Android. Acceptable for a fitness PWA.

3. **Sheet material (`rgba(18,18,24,0.90)`)**: Higher opacity than cards because sheets overlay other content and need clear separation. Apple uses 85-90% opacity for sheets.

4. **Workout/Log pages minimal changes** (per user request): We only apply glass via the global CSS rule. No structural changes to `ActiveWorkout.tsx`, `ExerciseBlock.tsx`, `SetRow.tsx`.

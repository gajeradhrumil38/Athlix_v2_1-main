# Regional Food Safety Standards — Design Spec

**Date:** 2026-06-09
**Scope:** Region-aware health scoring (WHO / EU / USA / India / Japan) + persistent nutrition facts in history
**Primary files:** `src/features/food/`

---

## Goal

Let the user choose a regulatory region. Every health score, additive flag, and eat/avoid verdict
re-scores against that region's **official** limits. Default = WHO global. Additionally, make the
full nutrition facts panel viewable anytime from history (not just once after scanning).

---

## 1. Region Data Layer — `regionStandards.ts` (new)

A typed table of real, web-sourced official values. All numeric limits MUST be verified from the
listed authorities during implementation (WebSearch) — no invented numbers.

```ts
export type Region = 'who' | 'eu' | 'usa' | 'india' | 'japan';

export interface RegionLimits {
  sugarMaxG: number;      // added/free sugars, grams per day
  sodiumMaxMg: number;    // mg per day
  satFatMaxG: number;     // g per day
  transFatBanned: boolean;
  caffeineMaxMg: number;  // mg per day (adult)
}

export interface RegionStandard {
  id: Region;
  name: string;        // "European Union"
  flag: string;        // "🇪🇺"
  authority: string;   // "EFSA"
  limits: RegionLimits;
  bannedAdditives: string[]; // additive IDs banned/heavily restricted in this region
}

export const REGION_STANDARDS: Record<Region, RegionStandard>;
export const DEFAULT_REGION: Region = 'who';
```

**Real differences to source from the web during implementation:**

| Region | Authority | Key sourced facts |
|--------|-----------|-------------------|
| WHO    | WHO       | Free sugars <25 g ideal / 50 g max; sodium <2000 mg; eliminate trans fat; caffeine <400 mg |
| EU     | EFSA      | Bans potassium bromate, BVO, titanium dioxide (E171), partially-hydrogenated oils; restricts Red 40; sodium target <2000 mg |
| USA    | FDA       | Sugar 50 g DV; sodium 2300 mg DV; sat fat 20 g DV (current baseline) |
| India  | FSSAI     | E-number additive rules; sugar/sodium aligned to ICMR-NIN; flags FSSAI-restricted additives |
| Japan  | MHLW      | Salt <7.5 g/day men (≈3000 mg sodium target); sodium-focused labelling |

If a specific authority figure cannot be verified, the implementation falls back to the WHO value
and the additive's existing global concern level — never a guessed number.

---

## 2. Additive Database — region-aware (`healthScore.service.ts`)

Each additive entry in the existing `ADDITIVES` array gains a region field:

```ts
interface AdditivePattern {
  pattern: RegExp;
  id: string;                 // stable id, referenced by RegionStandard.bannedAdditives
  name: string;
  concern: 'high' | 'medium' | 'low';
  effect: string;
  bannedIn?: Region[];        // regions where this additive is banned/restricted
}
```

When scoring against region R, any detected additive whose `bannedIn` includes R:
- Escalates `concern` to `high`
- Carries a `banned: true` flag on the returned `Additive`
- Renders a red **"BANNED IN EU"**-style badge instead of the generic HIGH badge

`Additive` type gains: `banned?: boolean; bannedRegionName?: string;`

---

## 3. Region-Aware Scoring (`healthScore.service.ts`)

Both scorers take an optional region (defaults to WHO):

```ts
export function scoreLabel(label: LabelData, region?: Region): HealthScore;
export function scoreDish(foods: DetectedFood[], region?: Region): HealthScore;
```

- The internal `DV` constants are replaced by `REGION_STANDARDS[region].limits`.
- `checkAdditives(ingredients, region)` consults `bannedIn` to escalate concerns.
- Score math (weights, grade bands, recommendation thresholds) is UNCHANGED — only the
  underlying limits and additive severity shift by region.

---

## 4. State — `useRegionStandard` hook (new)

Mirrors the existing `useNutritionPriority` pattern, plus a "has the user chosen yet?" flag so the
first-run popup can fire exactly once.

```ts
export function useRegionStandard(): {
  region: Region;            // effective region for scoring — falls back to 'who' if unchosen
  setRegion: (r: Region) => void;  // writes the key → hasChosenRegion becomes true forever
  standard: RegionStandard;
  hasChosenRegion: boolean;  // true once the localStorage key exists
  comparisonRegions: Region[];          // up to 3 standards for the comparison panel
  setComparisonRegions: (r: Region[]) => void;
};
```

- Region persists to `localStorage` key `athlix:food_region`.
- Comparison set persists to `localStorage` key `athlix:food_comparison_regions`, default `['usa','eu']`.
- **Unset region = not chosen.** `region` resolves to `'who'` for scoring while unset, but
  `hasChosenRegion` stays `false` until `setRegion` is called once. This is how we tell
  "defaulted to WHO" apart from "user explicitly picked WHO" — so the popup never re-appears.

---

## 5. UI

### 5a. Region selector sheet — `RegionStandardSheet.tsx` (new)
- Bottom sheet, same visual language as `NutritionPrioritySheet`.
- One selectable row per region: flag + name + authority + one-line summary of its strictest rule.
- **Two modes:**
  - `mode="onboarding"` — first-run; not dismissible without choosing; copy explains why
    ("Pick your region so we score food against the right safety standards").
  - `mode="settings"` — re-opened anytime to change; dismissible; highlights the current choice.
- Opens from the existing sliders/settings affordance already present in `FoodResults`
  (the "Priority" button area) and `FoodHistoryPage` header.

### 5a-i. First-run region popup (one-time only)
- Trigger: in `FoodScannerPage`, on mount, if `!hasChosenRegion`, show `RegionStandardSheet`
  in `onboarding` mode.
- Choosing a region calls `setRegion(r)` → writes `athlix:food_region` → `hasChosenRegion`
  becomes `true` permanently → the popup never appears again on any device session that shares
  this localStorage.
- The popup is **not** shown on the history page or anywhere else — only the scanner entry, once.
- Settings change path: the sliders/gear control on `FoodHistoryPage` and `FoodResults` opens the
  same sheet in `settings` mode, so the user can change region whenever, without ever being
  auto-prompted again.

### 5b. Active-region badge
- `LabelResults` and `FoodResults` show a small tappable badge:
  `🇪🇺 Scored against EU standards (EFSA)` → tapping opens the region sheet.
- Re-scoring is reactive: changing the region updates rings/verdict immediately (scores recompute
  via `useMemo` keyed on region).

### 5c. Banned-additive badge
- In `LabelResults` `ConcernItem` and `FoodDetailModal`, a banned additive shows a red
  **BANNED** pill with the region name, ahead of the HIGH/MEDIUM/LOW severity pill.

---

## 6. Product Standard Detection & Multi-Standard Comparison Panel

**Scenario:** The user is in the US (region = FDA) but scans a product manufactured to FSSAI (India)
standards. The app must (a) detect the product's *origin* standard from the label, (b) still judge it
against the *user's* region (FDA), and (c) show whether the product **meets** the user's region or
lists the specific **violations**.

### 6a. Detect the product's standard (Gemini)
`LabelData` gains two fields, extracted by the existing unified Gemini prompt:

```ts
detectedStandard?: Region | 'unknown';  // which regime the product was made under
detectedStandardEvidence?: string;       // the visible cue, e.g. "FSSAI Lic. No. 10012..."
```

Gemini infers `detectedStandard` from visible label cues:
- **FSSAI** — "FSSAI Lic. No.", FSSAI logo, veg/non-veg mark, "Marketed by … India"
- **FDA/USA** — US-format Nutrition Facts panel, "Distributed by … USA", US FDA wording
- **EU** — E-number additives (E102, E150d…), CE/health marks, multi-EU-language text
- **Japan** — Japanese label text, MHLW format
- `'unknown'` when no clear cue is visible

### 6b. Compliance check (`healthScore.service.ts`)
```ts
export interface ComplianceViolation {
  field: string;        // "Sodium", "Red 40", "Trans fat"
  detail: string;       // "800 mg/serving exceeds FDA guidance" or "restricted under FDA"
  severity: 'high' | 'medium';
}
export interface ComplianceResult {
  region: Region;                  // the standard being checked against
  isUserRegion: boolean;           // true if this row is the user's current region
  meets: boolean;
  violations: ComplianceViolation[];
}
export function checkCompliance(label: LabelData, region: Region): ComplianceResult;
```

Logic — the region limits are per-**day**; a serving is flagged using the standard front-of-pack
"high in" rule: **a single serving providing ≥20% of the region's daily limit is a violation**
(this matches the FDA "20% DV = high" guidance and is applied uniformly to every region):
- `label.sodium ≥ 0.20 × limits.sodiumMaxMg` → violation
- `label.totalSugars (or addedSugars) ≥ 0.20 × limits.sugarMaxG` → violation
- `label.saturatedFat ≥ 0.20 × limits.satFatMaxG` → violation
- `label.transFat > 0` while `limits.transFatBanned` → violation
- Any detected additive in the region's `bannedAdditives` → violation
- `meets = violations.length === 0`

### 6b-i. Multi-standard comparison set (dedup logic)
```ts
const REGION_ORDER: Region[] = ['who', 'usa', 'eu', 'india', 'japan'];

export function buildComparisonStandards(opts: {
  userRegion: Region;
  productStandard: Region | 'unknown';
  chosen: Region[];        // user's settings picks (default ['usa', 'eu'])
  maxCount?: number;       // default 3
}): Region[];
```

Algorithm — guarantees no duplicate rows and no "same-standard-as-product" row:
1. `candidates = unique([userRegion, ...chosen])` — current region first.
2. Drop `productStandard` from candidates (a product trivially meets its own making-standard →
   "user can not see same standard comparison").
3. If `candidates.length < maxCount`, backfill from `REGION_ORDER`, skipping anything already
   present and skipping `productStandard`, until `maxCount` reached or regions exhausted.
4. Return `candidates.slice(0, maxCount)`.

Worked example (user=USA/FDA, product=FDA, chosen defaults `['usa','eu']`):
`[usa, usa, eu]` → unique `[usa, eu]` → drop product `usa` → `[eu]` → backfill →
`[eu, who, india]`. The panel shows EU, WHO, FSSAI — never FDA-vs-FDA. ✓

### 6c. Comparison panel (UI — end of the nutrition facts page)
Rendered at the **bottom** of `LabelResults` and `FoodDetailModal`, after the nutrition table.
Header shows the product's detected standard; below it, one verdict row per standard in the
deduplicated comparison set (`buildComparisonStandards`), each via `checkCompliance(label, region)`:

```
┌──────────────────────────────────────────────┐
│ STANDARDS COMPARISON                           │
│ Product made to  🇮🇳 FSSAI                     │
│                                                │
│  🇺🇸 FDA  (your region)    ✗ 2 violations      │
│   • Red 40 — flagged by FDA advisory           │
│   • Sodium 920mg/serving — high vs FDA         │
│                                                │
│  🇪🇺 EU                     ✗ 3 violations      │
│   • Red 40 — BANNED in EU                       │
│   • Titanium dioxide — BANNED in EU            │
│   • Sodium 920mg/serving — high vs EU          │
│                                                │
│  🌍 WHO                     ✓ Meets             │
└──────────────────────────────────────────────┘
```
- Each row: flag + standard name (+ `(your region)` tag if `isUserRegion`), then
  green **✓ Meets** or red **✗ N violations** with the violation list expanded beneath.
- Rows come straight from `buildComparisonStandards` → no duplicate standard, never the
  product's own standard.
- If `detectedStandard === 'unknown'` → header reads `Product standard: not detected`;
  comparison rows still render normally.

New component: `CompliancePanel.tsx` (shared by `LabelResults` and `FoodDetailModal`).

### 6d. Comparison standards setting
- The user's chosen comparison standards (`comparisonRegions`, up to 3) are picked in the
  `RegionStandardSheet` `settings` mode — a second selectable group below the primary region,
  multi-select capped at 3.
- Default `['usa', 'eu']`. Persisted to `localStorage` key `athlix:food_comparison_regions`.
- Exposed via the `useRegionStandard` hook (see §4).

---

## 7. Persistent Nutrition Facts in History

**Problem:** `LabelResults.handleSave()` persists only a summary `DetectedFood`. The full `LabelData`
(sat/trans fat, sodium, fiber, sugars, ingredients, additives, vitamins) is discarded, so the
history `FoodDetailModal` cannot render the facts panel — the user sees it only once, right after scanning.

**Fix (no DB migration — uses existing `foods_detected` JSONB):**

1. Extend `DetectedFood` with `labelData?: LabelData`.
2. In `LabelResults.handleSave()`, attach the full `LabelData` to the saved food's `labelData`.
3. `FoodDetailModal`: when the scan's first food has `source === 'label'` and `labelData`, render the
   full `NutritionTable` + `HealthRings` (reuse components from `LabelResults`), available anytime.
4. The history detail re-scores the label against the user's current region (via `scoreLabel(labelData, region)`).

**Component reuse:** `NutritionTable` is currently a private component inside `LabelResults.tsx`.
Extract it to its own file `NutritionFactsTable.tsx` so both `LabelResults` and `FoodDetailModal`
import it. `HealthRings` is already shared.

---

## 8. Component / File Summary

| File | Change |
|------|--------|
| `services/regionStandards.ts` | NEW — region table + types + default |
| `hooks/useRegionStandard.ts` | NEW — region + `comparisonRegions` (up to 3) persisted state; `hasChosenRegion` |
| `components/RegionStandardSheet.tsx` | NEW — region picker (`onboarding` + `settings` modes) + comparison multi-select (cap 3) |
| `pages/FoodScannerPage.tsx` | One-time onboarding popup on mount when `!hasChosenRegion` |
| `components/NutritionFactsTable.tsx` | NEW — extracted from LabelResults for reuse |
| `components/CompliancePanel.tsx` | NEW — multi-standard comparison verdict (dedup rows) |
| `services/healthScore.service.ts` | Region param on scorers; `bannedIn` on additives; `banned` on Additive; `checkCompliance()`; `buildComparisonStandards()` |
| `services/foodRecognition.service.ts` | Gemini prompt extracts `detectedStandard` + evidence |
| `types.ts` | `labelData?` on DetectedFood; `banned?`/`bannedRegionName?` on Additive; `detectedStandard?`/`detectedStandardEvidence?` on LabelData |
| `components/LabelResults.tsx` | Region badge; persist labelData on save; use extracted table; render CompliancePanel |
| `components/FoodResults.tsx` | Region badge; region-aware scoreDish; open region sheet |
| `components/FoodDetailModal.tsx` | Render facts panel + CompliancePanel for saved label scans; region-aware score |
| `pages/FoodHistoryPage.tsx` | Region sheet entry point |

---

## 9. Out of Scope

- Separate browsable "standards library" screen (user chose re-score-only).
- Category-aware thresholds (drinks vs snacks) — one threshold set per region.
- Server-side storage of region preference (localStorage only, like nutrition priority).
- DB schema migration (label data rides in existing JSONB).
- Per-country coverage beyond the five chosen regions.

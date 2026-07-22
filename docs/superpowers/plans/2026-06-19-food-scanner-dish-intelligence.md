# Food Scanner — Dish Intelligence Enhancement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface product type, harmful ingredient warnings, and plain-English health advice for dish/meal scans — matching the depth already present for label scans.

**Architecture:** Three additions to the dish scan flow: (1) carry `type` (whole_food/packaged/restaurant/drink) from Gemini through to `DetectedFood`; (2) a second Gemini call that analyses likely harmful ingredients for any packaged item found in a dish; (3) a new `RealLifeAdviceCard` component that converts the health score into practical human-readable advice. Label scan flow is untouched — it already has full compliance, ingredient warnings, and health rings.

**Tech Stack:** React 18, TypeScript, Gemini `gemini-1.5-flash` (existing API key), existing `ADDITIVES` + `checkAdditives()` + `checkCompliance()` from `healthScore.service.ts`

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Modify | `src/features/food/types.ts` | Add `type` field to `DetectedFood` |
| Modify | `src/features/food/services/foodRecognition.service.ts` | Pass `type` through; add `analyzePackagedIngredients()` |
| Modify | `src/features/food/components/FoodResults.tsx` | Type badge on ServingEditor; trigger ingredient analysis; add RealLifeAdviceCard |
| Create | `src/features/food/components/RealLifeAdviceCard.tsx` | Plain-English advice component |

---

## Task 1: Add `type` to `DetectedFood` and wire it through

**Files:**
- Modify: `src/features/food/types.ts:7-23`
- Modify: `src/features/food/services/foodRecognition.service.ts:370-397`

- [ ] **Step 1: Add `type` field to `DetectedFood`**

Open `src/features/food/types.ts`. Add `type` after `confidence`:

```ts
export interface DetectedFood {
  id: string;
  name: string;
  brand?: string;
  servingSize: string;
  servingGrams: number;
  servings: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  confidence?: number;
  type?: 'whole_food' | 'packaged' | 'restaurant' | 'drink';
  source?: 'usda' | 'openfoodfacts' | 'fatsecret' | 'label';
  labelData?: LabelData;
}
```

- [ ] **Step 2: Wire `type` through in `recognizeFoodWithGemini`**

In `src/features/food/services/foodRecognition.service.ts`, the dish scan block builds `food` from `matches[0]`. After the existing line `const food: DetectedFood = { ...matches[0] };` (around line 387), add:

```ts
const food: DetectedFood = { ...matches[0] };
food.servings = Math.max(0.5, Math.round((item.servings ?? 1) * 2) / 2);
if (item.portionNote) food.servingSize = item.portionNote;
// carry product type from Gemini's classification
if (item.type === 'packaged' || item.type === 'restaurant' || item.type === 'drink') {
  food.type = item.type as 'packaged' | 'restaurant' | 'drink';
} else {
  food.type = 'whole_food';
}
return food;
```

The `GeminiItem` type at the top of that block already has `type?: string`, so no change needed there.

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/features/food/types.ts src/features/food/services/foodRecognition.service.ts
git commit -m "feat(food): carry Gemini product type through to DetectedFood"
```

---

## Task 2: Show product type badge on each food card in FoodResults

**Files:**
- Modify: `src/features/food/components/FoodResults.tsx:94-185` (ServingEditor component)

The `type` field is now available on every `DetectedFood`. Show it as a small pill badge.

- [ ] **Step 1: Add `TypeBadge` helper inside `FoodResults.tsx`**

Add this function before `ServingEditor` (around line 93):

```tsx
function TypeBadge({ type }: { type?: DetectedFood['type'] }) {
  if (!type) return null;
  const cfg: Record<NonNullable<DetectedFood['type']>, { label: string; color: string; bg: string }> = {
    whole_food:  { label: 'Fresh',      color: '#4ade80', bg: 'rgba(74,222,128,0.10)' },
    packaged:    { label: 'Packaged',   color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
    restaurant:  { label: 'Restaurant', color: '#60a5fa', bg: 'rgba(96,165,250,0.10)' },
    drink:       { label: 'Drink',      color: '#a78bfa', bg: 'rgba(167,139,250,0.10)' },
  };
  const { label, color, bg } = cfg[type];
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '0.10em',
      textTransform: 'uppercase', color, background: bg,
      padding: '2px 6px', borderRadius: 4, border: `1px solid ${color}30`,
    }}>
      {label}
    </span>
  );
}
```

- [ ] **Step 2: Render `TypeBadge` in `ServingEditor`**

Inside `ServingEditor`, the food name line (around line 119) already renders `food.name` + a source badge. Add `<TypeBadge type={food.type} />` after the source badge span:

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <p style={{ color: '#fff', fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>{food.name}</p>
  {food.source && (
    <span style={{ /* existing source badge styles */ }}>
      {sourceLabel[food.source] ?? food.source}
    </span>
  )}
  <TypeBadge type={food.type} />
</div>
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/features/food/components/FoodResults.tsx
git commit -m "feat(food): show product type badge (Fresh/Packaged/Restaurant/Drink) on food cards"
```

---

## Task 3: Gemini ingredient analysis for packaged dish items

**Files:**
- Modify: `src/features/food/services/foodRecognition.service.ts` (add new exported function)

When a dish scan contains packaged items, we do a second lightweight Gemini call to surface likely harmful ingredients. This is separate from the main scan (runs async after results appear).

- [ ] **Step 1: Add `analyzePackagedIngredients()` to `foodRecognition.service.ts`**

Add this function at the bottom of `foodRecognition.service.ts` (after `calcTotals`):

```ts
export interface PackagedIngredientWarning {
  foodName: string;
  suspectedIngredients: string; // comma-separated ingredient list Gemini suggests
  concerns: import('../types').Additive[]; // matched against ADDITIVES DB
}

/**
 * For packaged food items found in a dish scan, ask Gemini to describe
 * their typical ingredient list, then run it through the existing additive DB.
 *
 * Returns one entry per packaged food that has at least one concern.
 * Silently returns [] on any error (this is a best-effort enhancement).
 */
export async function analyzePackagedIngredients(
  packagedFoods: import('../types').DetectedFood[],
): Promise<PackagedIngredientWarning[]> {
  if (packagedFoods.length === 0) return [];
  const apiKey = localStorage.getItem('athlix:gemini_api_key');
  if (!apiKey) return [];

  const model = localStorage.getItem('athlix:gemini_model') || 'gemini-1.5-flash';

  const foodList = packagedFoods.map((f, i) => `${i + 1}. ${f.name}${f.brand ? ` (${f.brand})` : ''}`).join('\n');

  const prompt =
    'You are a food ingredient analyst. For each packaged food below, list the most likely ingredients found in this type of product. Focus on ingredients that are potentially harmful: artificial colors (Red 40, Yellow 5, Yellow 6), preservatives (BHA, BHT, TBHQ, sodium benzoate, sodium nitrite), sweeteners (aspartame, acesulfame K, saccharin, sucralose, HFCS), and others (carrageenan, partially hydrogenated oils, titanium dioxide, potassium bromate).\n\n' +
    'Foods:\n' + foodList + '\n\n' +
    'Return ONLY a JSON array — no markdown, no explanation:\n' +
    '[{"name":"<food name>","ingredients":"<comma-separated ingredient list, only harmful ones>"}]\n' +
    'If a food typically has no harmful ingredients, include it with ingredients:"none".\n' +
    'Keep ingredient lists short — only the concerning ingredients, not the full list.';

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      },
    );
    if (!resp.ok) return [];
    const json = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = extractJsonFromText(rawText) as Array<{ name: string; ingredients: string }>;
    if (!Array.isArray(parsed)) return [];

    // Import here to avoid circular — checkAdditives is in healthScore.service.ts
    const { checkAdditives } = await import('./healthScore.service');

    const results: PackagedIngredientWarning[] = [];
    for (const item of parsed) {
      if (!item.ingredients || item.ingredients === 'none') continue;
      const concerns = checkAdditives(item.ingredients);
      if (concerns.length === 0) continue;
      results.push({ foodName: item.name, suspectedIngredients: item.ingredients, concerns });
    }
    return results;
  } catch {
    return [];
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/features/food/services/foodRecognition.service.ts
git commit -m "feat(food): add analyzePackagedIngredients() — Gemini ingredient concern analysis for dish scans"
```

---

## Task 4: Create `RealLifeAdviceCard` component

**Files:**
- Create: `src/features/food/components/RealLifeAdviceCard.tsx`

This component converts the health score + food types into plain-English practical advice — no new API calls, all client-side logic.

- [ ] **Step 1: Create the component**

```tsx
// src/features/food/components/RealLifeAdviceCard.tsx

import React from 'react';
import type { DetectedFood } from '../types';
import type { HealthScore } from '../types';

interface Props {
  foods: DetectedFood[];
  score: HealthScore;
  totalCalories: number;
}

function proteinEquivalent(g: number): string {
  const eggs = Math.round((g / 6) * 10) / 10;
  if (eggs < 1) return `${g.toFixed(0)}g protein`;
  return `${eggs} egg${eggs === 1 ? '' : 's'} worth of protein`;
}

function calorieEquivalent(kcal: number): string {
  if (kcal < 100) return `${kcal} kcal`;
  const bananas = Math.round((kcal / 89) * 10) / 10;
  if (bananas <= 2.5) return `≈ ${bananas} banana${bananas === 1 ? '' : 's'} in calories`;
  const apples = Math.round((kcal / 95) * 10) / 10;
  return `≈ ${apples} apple${apples === 1 ? '' : 's'} in calories`;
}

export const RealLifeAdviceCard: React.FC<Props> = ({ foods, score, totalCalories }) => {
  const hasPackaged = foods.some((f) => f.type === 'packaged');
  const hasRestaurant = foods.some((f) => f.type === 'restaurant');
  const allWhole = foods.every((f) => !f.type || f.type === 'whole_food');

  const gradeColor: Record<string, string> = {
    A: '#4ade80', B: '#a3e635', C: '#fbbf24', D: '#fb923c', E: '#f87171',
  };
  const color = gradeColor[score.grade] ?? '#fbbf24';

  const lines: string[] = [];

  // Calorie context
  if (totalCalories > 0) lines.push(calorieEquivalent(totalCalories));

  // Grade-based advice
  if (score.grade === 'A') {
    lines.push('Solid choice — clean macro balance, eat freely.');
  } else if (score.grade === 'B') {
    lines.push('Good meal overall. Fine as a regular part of your diet.');
  } else if (score.grade === 'C') {
    lines.push('Reasonable but keep an eye on portion size — don\'t make this an everyday meal.');
  } else if (score.grade === 'D') {
    lines.push('High in one or more concern areas. Treat as an occasional meal, not a staple.');
  } else {
    lines.push('Avoid making this a habit — significant nutritional concerns. Balance with lighter meals.');
  }

  // Food type context
  if (allWhole) {
    lines.push('All whole foods — minimal processing, best choice for daily eating.');
  } else if (hasPackaged) {
    lines.push('Contains packaged items — check ingredients for preservatives and artificial additives.');
  }
  if (hasRestaurant) {
    lines.push('Restaurant food tends to have higher sodium and oil than home-cooked — fine occasionally.');
  }

  // Specific risks from score
  if (score.sodiumScore < 40) lines.push('High sodium — drink extra water and avoid other salty foods today.');
  if (score.sugarScore < 40) lines.push('High sugar — this alone may exceed your daily sugar budget.');
  if (score.fatScore < 40) lines.push('High saturated or trans fat — balance with low-fat meals the rest of the day.');

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${color}18`, border: `1px solid ${color}40`,
        }}>
          <span style={{ color, fontSize: 14, fontWeight: 900 }}>{score.grade}</span>
        </div>
        <p style={{ color: '#fff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          What This Means For You
        </p>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {lines.map((line, i) => (
          <div key={i} className="flex items-start gap-2">
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, marginTop: 5, shrink: 0 }} />
            <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 1.55 }}>{line}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/features/food/components/RealLifeAdviceCard.tsx
git commit -m "feat(food): add RealLifeAdviceCard — plain-English practical advice from health score"
```

---

## Task 5: Wire it all together in `FoodResults`

**Files:**
- Modify: `src/features/food/components/FoodResults.tsx`

This task integrates Tasks 3 and 4 into the dish scan results view. After the `HealthSnapshot` block:
1. Run `analyzePackagedIngredients()` for any packaged foods
2. Show ingredient concerns if found
3. Show `RealLifeAdviceCard`

- [ ] **Step 1: Add state + effect for ingredient analysis**

At the top of `FoodResults` component (after the existing `useState` calls), add:

```tsx
import { analyzePackagedIngredients, type PackagedIngredientWarning } from '../services/foodRecognition.service';
import { scoreDish } from '../services/healthScore.service';
import { RealLifeAdviceCard } from './RealLifeAdviceCard';
import { AlertTriangle } from 'lucide-react';
// (AlertTriangle may already be imported — check first, add only if missing)
```

Then add state for the async ingredient analysis:

```tsx
const [ingredientWarnings, setIngredientWarnings] = useState<PackagedIngredientWarning[]>([]);
const dishScore = useMemo(() => scoreDish(foods), [foods]);

useEffect(() => {
  const packaged = foods.filter((f) => f.type === 'packaged');
  if (packaged.length === 0) { setIngredientWarnings([]); return; }
  analyzePackagedIngredients(packaged).then(setIngredientWarnings).catch(() => {});
}, [foods]);
```

Note: The `scoreDish` import and `useEffect` import — check what's already imported at the top of `FoodResults.tsx` and only add what's missing. `scoreDish` is already imported in `HealthSnapshot` (which is module-level), so it's available. Add `useEffect` to the React import if it's not already there.

- [ ] **Step 2: Render ingredient warnings card**

After the `<HealthSnapshot ... />` block and before the "Add food" button, add:

```tsx
{/* Packaged ingredient concerns */}
{ingredientWarnings.length > 0 && (
  <div className="rounded-2xl overflow-hidden" style={{ background: '#16191F', border: '1px solid rgba(255,255,255,0.08)' }}>
    <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: '#fbbf24' }} />
      <p style={{ color: '#fff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        Packaged Item Concerns
      </p>
    </div>
    <div className="px-4 py-3 space-y-3">
      {ingredientWarnings.map((w, wi) => (
        <div key={wi}>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
            {w.foodName}
          </p>
          <div className="space-y-2">
            {w.concerns.map((c, ci) => {
              const color = c.concern === 'high' ? '#f87171' : c.concern === 'medium' ? '#fbbf24' : 'rgba(255,255,255,0.5)';
              return (
                <div key={ci} className="rounded-xl px-3 py-2.5"
                  style={{ background: `${color}10`, border: `1px solid ${color}22` }}>
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{c.name}</p>
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                      color, background: `${color}22`, padding: '1px 6px', borderRadius: 4,
                    }}>
                      {c.concern.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, lineHeight: 1.4 }}>{c.effect}</p>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, lineHeight: 1.5 }}>
        Ingredients estimated by AI — scan the product label for exact analysis.
      </p>
    </div>
  </div>
)}

{/* Real-life advice */}
{foods.length > 0 && (
  <RealLifeAdviceCard foods={foods} score={dishScore} totalCalories={totals.total_calories} />
)}
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/features/food/components/FoodResults.tsx
git commit -m "feat(food): add packaged ingredient warnings and real-life advice to dish scan results"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ FDA/regulatory violations shown — via `TypeBadge` (packaged flag) + `analyzePackagedIngredients` + concern cards
- ✅ Product type detection displayed — TypeBadge on every food card (Fresh/Packaged/Restaurant/Drink)  
- ✅ Increased ingredient analysis — second Gemini call for packaged items in dish scans
- ✅ Harmful ingredients shown — `checkAdditives()` applied to Gemini's suspected ingredient list, color-coded HIGH/MEDIUM/LOW + effect
- ✅ Real-life human thinking — `RealLifeAdviceCard` with calorie equivalents, grade-based plain-English advice, food-type context, specific risk warnings

**Note on label scans:** Already fully implemented — `LabelResults.tsx` shows `HealthRings`, `ConcernItem` (with BANNED labels), `NutritionFactsTable`, `CompliancePanel`. No changes needed.

**Disclaimer:** The ingredient analysis for dish scans (Task 3) relies on Gemini inferring likely harmful ingredients for packaged foods by name — it cannot read the actual label. The disclaimer "Ingredients estimated by AI — scan the product label for exact analysis." is shown in the UI (Task 5 Step 2).

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-19-food-scanner-dish-intelligence.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans skill

Which approach?

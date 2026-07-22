/**
 * Multi-provider nutrition lookup.
 *
 * Provider priority:
 *   whole_food / restaurant → USDA FoodData Central (government gold standard, free)
 *   packaged / branded      → Open Food Facts first (3M+ products), then USDA Branded
 *   fallback for both       → FatSecret (via Supabase edge function — handled in foodRecognition.service)
 *
 * Neither USDA nor Open Food Facts require registration for typical usage.
 */

import type { DetectedFood } from '../types';

// ─── Request timeout (free APIs can be slow) ─────────────────────────────────

const API_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ─── USDA FoodData Central ─────────────────────────────────────────────────

const USDA_KEY  = 'DEMO_KEY'; // 1 000 req/hour per IP — sufficient for a PWA
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

// Standard USDA nutrient IDs (FoodData Central)
const NID = {
  energy:  1008, // kcal
  protein: 1003,
  carbs:   1005, // Carbohydrate, by difference
  fat:     1004, // Total lipid (fat)
  fiber:   1079, // Fiber, total dietary
  sugar:   2000, // Sugars, total including NLEA
} as const;

interface UsdaFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients: Array<{ nutrientId: number; value: number }>;
  // Branded foods only
  labelNutrients?: {
    calories?:      { value: number };
    fat?:           { value: number };
    carbohydrates?: { value: number };
    protein?:       { value: number };
    fiber?:         { value: number };
    sugars?:        { value: number };
  };
}

function usdaNutrient(food: UsdaFood, id: number): number {
  return food.foodNutrients.find((n) => n.nutrientId === id)?.value ?? 0;
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function usdaToDetected(f: UsdaFood): DetectedFood | null {
  const name = f.description?.trim();
  if (!name) return null;

  const isGrams   = f.servingSizeUnit === 'g' || f.servingSizeUnit === 'GRM';
  const servingG  = isGrams ? (f.servingSize ?? 100) : 100;
  const servingLbl = f.householdServingFullText
    ? `${f.householdServingFullText} (${servingG}g)`
    : `${servingG}g`;

  let calories: number, protein: number, carbs: number, fat: number;
  let fiber: number | undefined, sugar: number | undefined;

  if (f.labelNutrients?.calories != null) {
    // Branded foods: labelNutrients are already per-serving
    calories = f.labelNutrients.calories.value ?? 0;
    fat      = f.labelNutrients.fat?.value           ?? 0;
    carbs    = f.labelNutrients.carbohydrates?.value ?? 0;
    protein  = f.labelNutrients.protein?.value       ?? 0;
    fiber    = f.labelNutrients.fiber?.value;
    sugar    = f.labelNutrients.sugars?.value;
  } else {
    // Foundation / SR Legacy: foodNutrients are per 100 g — scale to serving
    const r  = servingG / 100;
    calories = usdaNutrient(f, NID.energy)  * r;
    protein  = usdaNutrient(f, NID.protein) * r;
    carbs    = usdaNutrient(f, NID.carbs)   * r;
    fat      = usdaNutrient(f, NID.fat)     * r;
    const fb = usdaNutrient(f, NID.fiber);
    const sg = usdaNutrient(f, NID.sugar);
    fiber    = fb > 0 ? fb * r : undefined;
    sugar    = sg > 0 ? sg * r : undefined;
  }

  if (calories === 0 && protein === 0 && carbs === 0) return null;

  return {
    id:           `usda-${f.fdcId}`,
    name:         titleCase(name),
    brand:        f.brandOwner || f.brandName || undefined,
    servingSize:  servingLbl,
    servingGrams: servingG,
    servings:     1,
    calories:     parseFloat(calories.toFixed(1)),
    protein:      parseFloat(protein.toFixed(1)),
    carbs:        parseFloat(carbs.toFixed(1)),
    fat:          parseFloat(fat.toFixed(1)),
    fiber:        fiber != null ? parseFloat(fiber.toFixed(1)) : undefined,
    sugar:        sugar != null ? parseFloat(sugar.toFixed(1)) : undefined,
    source:       'usda',
  };
}

export async function searchUSDA(query: string, maxResults = 8): Promise<DetectedFood[]> {
  const params = new URLSearchParams({
    query,
    api_key:   USDA_KEY,
    dataType:  'Foundation,SR Legacy,Survey (FNDDS),Branded',
    pageSize:  String(maxResults),
    sortBy:    'dataType.keyword', // Foundation > SR Legacy > Survey > Branded
    sortOrder: 'asc',
  });
  const res = await withTimeout(
    fetch(`${USDA_BASE}/foods/search?${params}`, { headers: { Accept: 'application/json' } }),
    API_TIMEOUT_MS,
    new Response('{}', { status: 200 }),
  );
  if (!res.ok) throw new Error(`USDA ${res.status}: ${res.statusText}`);
  const json = await res.json() as { foods?: UsdaFood[] };
  return (json.foods ?? [])
    .map(usdaToDetected)
    .filter((x): x is DetectedFood => x !== null)
    .slice(0, maxResults);
}

// ─── Open Food Facts ──────────────────────────────────────────────────────────

interface OffNutriments {
  'energy-kcal_100g'?:     number;
  proteins_100g?:          number;
  carbohydrates_100g?:     number;
  fat_100g?:               number;
  fiber_100g?:             number;
  sugars_100g?:            number;
  'energy-kcal_serving'?:  number;
  proteins_serving?:       number;
  carbohydrates_serving?:  number;
  fat_serving?:            number;
  fiber_serving?:          number;
  sugars_serving?:         number;
}

interface OffProduct {
  product_name?: string;
  brands?:       string;
  serving_size?: string;
  nutriments?:   OffNutriments;
}

function parseServingGrams(s?: string): number {
  if (!s) return 100;
  const m = /(\d+(?:\.\d+)?)\s*g/i.exec(s);
  return m ? parseFloat(m[1]) : 100;
}

function offToDetected(p: OffProduct, idx: number): DetectedFood | null {
  const n    = p.nutriments;
  const name = p.product_name?.trim();
  if (!n || !name) return null;

  const servingG     = parseServingGrams(p.serving_size);
  const hasPerServing = n['energy-kcal_serving'] != null;

  let calories: number, protein: number, carbs: number, fat: number;
  let fiber: number | undefined, sugar: number | undefined;

  if (hasPerServing) {
    calories = n['energy-kcal_serving']   ?? 0;
    protein  = n.proteins_serving         ?? 0;
    carbs    = n.carbohydrates_serving    ?? 0;
    fat      = n.fat_serving              ?? 0;
    fiber    = n.fiber_serving;
    sugar    = n.sugars_serving;
  } else {
    const r  = servingG / 100;
    calories = (n['energy-kcal_100g']  ?? 0) * r;
    protein  = (n.proteins_100g        ?? 0) * r;
    carbs    = (n.carbohydrates_100g   ?? 0) * r;
    fat      = (n.fat_100g             ?? 0) * r;
    fiber    = n.fiber_100g  != null ? n.fiber_100g  * r : undefined;
    sugar    = n.sugars_100g != null ? n.sugars_100g * r : undefined;
  }

  if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) return null;

  const brand = p.brands?.split(',')[0].trim() || undefined;

  return {
    id:           `off-${idx}`,
    name,
    brand,
    servingSize:  p.serving_size || '100g',
    servingGrams: servingG,
    servings:     1,
    calories:     parseFloat(calories.toFixed(1)),
    protein:      parseFloat(protein.toFixed(1)),
    carbs:        parseFloat(carbs.toFixed(1)),
    fat:          parseFloat(fat.toFixed(1)),
    fiber:        fiber != null ? parseFloat(fiber.toFixed(1)) : undefined,
    sugar:        sugar != null ? parseFloat(sugar.toFixed(1)) : undefined,
    source:       'openfoodfacts',
  };
}

export async function searchOpenFoodFacts(query: string, maxResults = 8): Promise<DetectedFood[]> {
  const params = new URLSearchParams({
    search_terms: query,
    json:         '1',
    page_size:    String(maxResults),
    // Request only the fields we use — keeps payload small and response faster
    fields:       'product_name,brands,serving_size,nutriments',
    sort_by:      'unique_scans_n', // most-scanned = highest data quality
  });
  // No custom headers — User-Agent is a forbidden header that triggers CORS preflight
  const res = await withTimeout(
    fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`),
    API_TIMEOUT_MS,
    new Response('{}', { status: 200 }),
  );
  if (!res.ok) throw new Error(`Open Food Facts ${res.status}`);
  const json = await res.json() as { products?: OffProduct[] };
  return (json.products ?? [])
    .map((p, i) => offToDetected(p, i))
    .filter((x): x is DetectedFood => x !== null)
    .slice(0, maxResults);
}

// ─── Smart multi-provider routing ─────────────────────────────────────────────

export type FoodType = 'whole_food' | 'packaged' | 'restaurant';

/**
 * Route to the best nutrition provider(s) based on food type.
 * Always resolves — partial failures from one provider never block the other.
 */
export async function searchNutrition(
  query: string,
  type: FoodType = 'whole_food',
): Promise<DetectedFood[]> {
  if (type === 'packaged') {
    // Packaged / branded: Open Food Facts has the largest branded DB
    const [offRes, usdaRes] = await Promise.allSettled([
      searchOpenFoodFacts(query, 8),
      searchUSDA(query, 5),
    ]);
    const off  = offRes.status  === 'fulfilled' ? offRes.value  : [];
    const usda = usdaRes.status === 'fulfilled' ? usdaRes.value : [];
    return dedup([...off, ...usda]).slice(0, 12);
  }
  // Whole foods / restaurant: USDA is the gold standard for ingredients
  const [usdaRes, offRes] = await Promise.allSettled([
    searchUSDA(query, 8),
    searchOpenFoodFacts(query, 5),
  ]);
  const usda = usdaRes.status === 'fulfilled' ? usdaRes.value : [];
  const off  = offRes.status  === 'fulfilled' ? offRes.value  : [];
  return dedup([...usda, ...off]).slice(0, 12);
}

/** Remove near-duplicate food entries (same normalised name, different provider). */
export function dedup(foods: DetectedFood[]): DetectedFood[] {
  const seen = new Set<string>();
  return foods.filter((f) => {
    const key = f.name.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

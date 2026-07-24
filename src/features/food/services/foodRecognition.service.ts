/**
 * FoodRecognitionService
 *
 * 1. Image compression + upload to Supabase Storage
 * 2. Gemini Vision — identify foods + classify type (whole_food / packaged / restaurant)
 * 3. Multi-provider nutrition lookup: USDA → Open Food Facts → FatSecret (best accuracy)
 * 4. FatSecret proxy via Supabase Edge Function (OAuth 1.0a — credentials never touch browser)
 */

import { supabase } from '../../../lib/supabase';
import type {
  DetectedFood,
  FatSecretFoodEntry,
  FatSecretFood,
  FatSecretServing,
  FatSecretRecognizeResponse,
  FatSecretSearchResponse,
  FatSecretFoodResponse,
} from '../types';
import {
  searchNutrition,
  searchUSDA,
  searchOpenFoodFacts,
  dedup,
  type FoodType,
} from './nutritionProviders.service';
import type { LabelData } from '../types';

export interface GeminiScanResult {
  foods: DetectedFood[];
  labelData: LabelData | null;
}

// ─── Image processing (client-side Canvas) ────────────────────────────────────

function calcDims(
  w: number, h: number, maxW: number, maxH: number,
): { width: number; height: number } {
  if (w <= maxW && h <= maxH) return { width: w, height: h };
  const r = Math.min(maxW / w, maxH / h);
  return { width: Math.round(w * r), height: Math.round(h * r) };
}

function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not load image — the file may be corrupted.')); };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('Image encoding failed. Try a different image.')),
      'image/jpeg',
      quality,
    );
  });
}

/** Resize + compress an image file. Returns a JPEG Blob ≤ maxW×maxH at given quality. */
export async function compressImage(
  file: File,
  maxW = 800,
  maxH = 800,
  quality = 0.85,
): Promise<Blob> {
  const img = await fileToImage(file);
  const { width, height } = calcDims(img.naturalWidth, img.naturalHeight, maxW, maxH);
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
  return canvasToBlob(canvas, quality);
}

/** Square-crop + resize to a thumbnail Blob. */
export async function makeThumbnail(file: File, size = 200): Promise<Blob> {
  const img = await fileToImage(file);
  const { naturalWidth: iw, naturalHeight: ih } = img;
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const side = Math.min(iw, ih);
  const sx   = (iw - side) / 2;
  const sy   = (ih - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return canvasToBlob(canvas, 0.80);
}

// ─── Supabase Storage upload ───────────────────────────────────────────────────

function uniqueFilename(userId: string, suffix: string): string {
  // crypto.randomUUID() is available in all modern browsers; fallback for edge cases
  const uid = typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return `${userId}/${uid}${suffix}.jpg`;
}

function storageErrorMessage(err: unknown): string {
  const raw = (err as { message?: string })?.message ?? String(err);
  if (/bucket.*not.*found|no such bucket/i.test(raw))
    return 'Storage bucket "food-scans" not found. Create it in your Supabase dashboard → Storage.';
  if (/security policy|rls|violates/i.test(raw))
    return 'Upload permission denied. Check RLS policies on the food-scans storage bucket.';
  if (/exceeded|too large|size/i.test(raw))
    return 'Image too large. Max allowed size is 10 MB.';
  return `Upload failed: ${raw}`;
}

/** Upload a Blob to the food-scans bucket. Returns the public URL. */
export async function uploadFoodImage(
  userId: string,
  blob: Blob,
  suffix: '_thumb' | '' = '',
): Promise<string> {
  const path = uniqueFilename(userId, suffix);
  const { error } = await supabase.storage
    .from('food-scans')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(storageErrorMessage(error));
  return supabase.storage.from('food-scans').getPublicUrl(path).data.publicUrl;
}

/** Delete an image by its public URL. Best-effort — never throws. */
export async function deleteFoodImage(publicUrl: string): Promise<void> {
  try {
    const marker = '/food-scans/';
    const idx    = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
    await supabase.storage.from('food-scans').remove([path]);
  } catch { /* silent */ }
}

// ─── Edge-function proxy (FatSecret OAuth 1.0a) ───────────────────────────────

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('food-scan', { body });
  if (error) throw error;
  const d = data as Record<string, unknown>;
  if (d?.error) {
    const fe = d.error as { message?: string; code?: string };
    throw new Error(fe.message ?? JSON.stringify(d.error));
  }
  return data as T;
}

// ─── FatSecret parsers ────────────────────────────────────────────────────────

function firstServing(food: FatSecretFood): FatSecretServing | null {
  const s = food.servings?.serving;
  if (!s) return null;
  return Array.isArray(s) ? s[0] : s;
}

function parseServing(
  id: string,
  name: string,
  brand: string | undefined,
  entry: FatSecretFoodEntry | null,
  serving: FatSecretServing,
): DetectedFood {
  return {
    id,
    name,
    brand,
    servingSize:  serving.serving_description ?? '1 serving',
    servingGrams: parseFloat(serving.metric_serving_amount ?? '100') || 100,
    servings:     parseFloat(entry?.number_of_units ?? '1') || 1,
    calories:     parseFloat(serving.calories        ?? '0'),
    protein:      parseFloat(serving.protein         ?? '0'),
    carbs:        parseFloat(serving.carbohydrate    ?? '0'),
    fat:          parseFloat(serving.fat             ?? '0'),
    fiber:        serving.fiber ? parseFloat(serving.fiber) : undefined,
    sugar:        serving.sugar ? parseFloat(serving.sugar) : undefined,
    confidence:   entry?.confidence ? parseFloat(entry.confidence) : undefined,
    source:       'fatsecret',
  };
}

/**
 * Parse compact food_description from FatSecret search results.
 * Format: "Per 100g - Calories: 52kcal | Fat: 0.17g | Carbs: 13.81g | Protein: 0.26g"
 */
function parseDescription(desc: string): Pick<DetectedFood, 'calories' | 'protein' | 'carbs' | 'fat'> {
  const num = (label: string): number => {
    const m = new RegExp(`${label}:\\s*([\\d.]+)`, 'i').exec(desc);
    return m ? parseFloat(m[1]) : 0;
  };
  return { calories: num('Calories'), protein: num('Protein'), carbs: num('Carbs'), fat: num('Fat') };
}

// ─── Gemini Vision helpers ─────────────────────────────────────────────────────

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to encode image for analysis.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Prepare an image specifically for Gemini Vision:
 *  1. EXIF rotation — load via <img> (browser applies EXIF on iOS/Chrome) with
 *     createImageBitmap as fallback for wider HEIC/AVIF format support
 *  2. Dimension guard — throws a clear message if the image has no pixels
 *  3. Renders to canvas at up to 1280×1280 (enough detail for food recognition)
 *  4. Mild canvas enhancement: contrast + brightness + saturation
 *     (silently skipped on browsers that don't support ctx.filter)
 *  5. Always outputs JPEG — consistent format, most reliable for Gemini Vision
 */
async function prepareForGemini(file: File): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  let source: HTMLImageElement | ImageBitmap | null = null;
  let srcW = 0, srcH = 0;

  // Primary path: <img> element — browser applies EXIF orientation automatically
  try {
    const img = await fileToImage(file);
    srcW = img.naturalWidth;
    srcH = img.naturalHeight;
    source = img;
  } catch {
    // Fallback: createImageBitmap — wider format support (HEIC/AVIF on some platforms)
    try {
      const bmp = await createImageBitmap(file);
      srcW = bmp.width;
      srcH = bmp.height;
      source = bmp;
    } catch {
      throw new Error(
        'Could not read this image. Please try a different photo, or use the camera to take a new one.',
      );
    }
  }

  if (!srcW || !srcH) {
    if (source instanceof ImageBitmap) source.close();
    throw new Error(
      'This image appears to be empty or corrupted. Please choose a different photo.',
    );
  }

  const { width, height } = calcDims(srcW, srcH, 1280, 1280);
  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'contrast(1.12) brightness(1.06) saturate(1.1)';
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  ctx.filter = 'none';

  if (source instanceof ImageBitmap) source.close();

  const blob = await canvasToBlob(canvas, 0.92);
  const data = await blobToBase64(blob);
  return { data, mimeType: 'image/jpeg' };
}

function extractJsonFromText(text: string): unknown {
  // Strip ALL markdown code fence variants (```json, ```, etc.)
  const stripped = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // Prefer outermost JSON object (new unified Gemini response: {"scanType":...})
  const objStart = stripped.indexOf('{');
  const objEnd   = stripped.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) {
    try { return JSON.parse(stripped.slice(objStart, objEnd + 1)); } catch { /* fall through */ }
  }

  // Fallback: outermost JSON array (legacy format)
  const arrStart = stripped.indexOf('[');
  const arrEnd   = stripped.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    return JSON.parse(stripped.slice(arrStart, arrEnd + 1));
  }

  return JSON.parse(stripped);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Unified Gemini scan — detects whether the image is a nutrition facts panel or a dish/meal.
 *
 * Returns:
 *  - { foods, labelData: null }   when a dish/meal is photographed
 *  - { foods: [], labelData }     when a nutrition label is photographed
 *
 * Nutrition lookup path for dish items: USDA → Open Food Facts → FatSecret (fallback).
 * Calls Gemini through the server-side /api/ai-coach/generate proxy.
 */
export async function recognizeFoodWithGemini(imageFile: File): Promise<GeminiScanResult> {
  // Preprocess: EXIF-correct, enhance, always JPEG — critical for gallery uploads
  const { data: base64Data, mimeType } = await prepareForGemini(imageFile);

  const prompt =
    'You are a food & nutrition analyst. Carefully examine this image — it may be a freshly taken photo OR a gallery image (older photo, screenshot, any angle, any lighting).\n\n' +

    'CASE A — Nutrition Facts Panel\n' +
    'If you see a printed Nutrition Facts label (black-bordered standard panel on packaged food), extract ALL numbers exactly. Return:\n' +
    '{"scanType":"nutrition_label","label":{"productName":"","servingSize":"","servingGrams":100,"servingsPerContainer":"","calories":0,"totalFat":0,"saturatedFat":0,"transFat":0,"cholesterol":0,"sodium":0,"totalCarbs":0,"dietaryFiber":0,"totalSugars":0,"addedSugars":0,"protein":0,"ingredients":"","vitaminD":0,"calcium":0,"iron":0,"potassium":0,"detectedStandard":"unknown","detectedStandardEvidence":""}}\n\n' +
    'detectedStandard — infer which regulatory regime the PRODUCT was made under, from visible label cues:\n' +
    '  "india" = FSSAI logo / "FSSAI Lic. No." / veg-nonveg mark / "Marketed by … India"\n' +
    '  "usa"   = US-format Nutrition Facts panel / "Distributed by … USA" / FDA wording\n' +
    '  "eu"    = E-number additives (E102, E150d…) / CE mark / multiple EU languages\n' +
    '  "japan" = Japanese label text / MHLW format\n' +
    '  "unknown" = no clear cue. Put the cue you used in detectedStandardEvidence (short text).\n\n' +

    'CASE B — Food / Meal Photo\n' +
    'If you see any food — on a plate, in a bowl, on a surface, in a container, partially eaten, or mixed — identify every distinct item. Include ALL visible food even if partially obscured. Return:\n' +
    '{"scanType":"dish","items":[{"name":"<specific food name>","type":"<whole_food|packaged|restaurant>","servings":<number>,"portionNote":"<size cue>"}]}\n\n' +

    'Strict rules:\n' +
    '- Return ONLY raw JSON — no markdown fences, no explanation, no other text\n' +
    '- name: be specific for nutrition DB lookup (e.g. "grilled chicken breast" not "chicken", "white rice cooked" not "rice")\n' +
    '- type: "whole_food"=fresh/raw ingredient, "packaged"=branded/boxed product, "restaurant"=cooked/prepared dish\n' +
    '- servings: best decimal estimate of portions visible (0.5, 1, 1.5, 2…); if unclear, use 1\n' +
    '- portionNote: a size cue visible in the image ("large bowl ~300g", "2 slices", "1 cup cooked")\n' +
    '- Caloric drinks (juice, milk, smoothie, protein shake) are food items — include them\n' +
    '- If truly no food is visible (empty plate, non-food scene): {"scanType":"dish","items":[]}\n' +
    '- DO NOT return empty items if there is food — make your best identification even under imperfect conditions';

  const resp = await fetch('/api/ai-coach/generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-1.5-flash',
      stream: false,
      contents: [{ parts: [
        { inline_data: { mime_type: mimeType, data: base64Data } },
        { text: prompt },
      ] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    if (errBody?.error?.code === 'NO_KEY') {
      throw new Error('Gemini API key not set. Open Settings → AI Coach to add your free key.');
    }
    const msg = errBody?.error?.message || resp.statusText;
    throw new Error(`Gemini error: ${msg}`);
  }

  const json    = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let parsed: Record<string, unknown> = {};
  try { parsed = extractJsonFromText(rawText) as Record<string, unknown>; } catch { /* treat as empty dish */ }

  // ── CASE A: Nutrition label ────────────────────────────────────────────────
  if (parsed.scanType === 'nutrition_label' && parsed.label) {
    return { foods: [], labelData: parsed.label as LabelData };
  }

  // ── CASE B: Dish / meal ────────────────────────────────────────────────────
  type GeminiItem = { name: string; type?: string; servings?: number; portionNote?: string };
  const items: GeminiItem[] = Array.isArray(parsed.items) ? (parsed.items as GeminiItem[]) : [];

  if (items.length === 0) return { foods: [], labelData: null };

  const results = await Promise.all(
    items.map(async (item): Promise<DetectedFood | null> => {
      const name = item.name?.trim();
      if (!name) return null;
      try {
        const foodType: FoodType =
          item.type === 'packaged' || item.type === 'restaurant' ? item.type : 'whole_food';

        let matches = await searchNutrition(name, foodType);
        if (matches.length === 0) matches = await searchFatSecret(name);
        if (matches.length === 0) return null;

        const food: DetectedFood = { ...matches[0] };
        food.servings = Math.max(0.5, Math.round((item.servings ?? 1) * 2) / 2);
        if (item.portionNote) food.servingSize = item.portionNote;
        if (item.type === 'packaged' || item.type === 'restaurant' || item.type === 'drink') {
          food.type = item.type as 'packaged' | 'restaurant' | 'drink';
        } else {
          food.type = 'whole_food';
        }
        return food;
      } catch {
        return null;
      }
    }),
  );

  return { foods: results.filter((r): r is DetectedFood => r !== null), labelData: null };
}

/**
 * Recognize foods in an already-uploaded image URL via FatSecret Premier.
 * Requires FatSecret Premier plan — kept for reference but not used by the scanner.
 */
export async function recognizeFood(imageUrl: string): Promise<DetectedFood[]> {
  const raw    = await invoke<FatSecretRecognizeResponse>({ action: 'recognize', imageUrl });
  const entries = raw.food_entries?.food_entry;
  if (!entries) return [];
  const list   = Array.isArray(entries) ? entries : [entries];
  return list.flatMap((entry): DetectedFood[] => {
    const food    = entry.food;
    if (!food) return [];
    const serving = firstServing(food);
    if (!serving) return [];
    return [parseServing(entry.food_id, entry.food_entry_name ?? food.food_name, food.brand_name, entry, serving)];
  });
}

/** FatSecret text search via edge function (internal — used as fallback). */
async function searchFatSecret(query: string): Promise<DetectedFood[]> {
  const raw   = await invoke<FatSecretSearchResponse>({ action: 'search', query });
  const foods = raw.foods?.food;
  if (!foods) return [];
  const list  = Array.isArray(foods) ? foods : [foods];
  return list.flatMap((food): DetectedFood[] => {
    const serving = firstServing(food);
    if (serving) return [parseServing(food.food_id, food.food_name, food.brand_name, null, serving)];
    if (food.food_description) {
      return [{
        id:           food.food_id,
        name:         food.food_name,
        brand:        food.brand_name,
        servingSize:  '100g',
        servingGrams: 100,
        servings:     1,
        source:       'fatsecret',
        ...parseDescription(food.food_description),
      }];
    }
    return [];
  });
}

/**
 * Search nutrition for a food query — merges USDA, Open Food Facts, and FatSecret.
 * Used by the manual "Add food" search in FoodResults.
 */
export async function searchFood(query: string): Promise<DetectedFood[]> {
  const [usdaRes, offRes, fsRes] = await Promise.allSettled([
    searchUSDA(query, 6),
    searchOpenFoodFacts(query, 6),
    searchFatSecret(query),
  ]);
  const usda = usdaRes.status === 'fulfilled' ? usdaRes.value : [];
  const off  = offRes.status  === 'fulfilled' ? offRes.value  : [];
  const fs   = fsRes.status   === 'fulfilled' ? fsRes.value   : [];
  return dedup([...usda, ...off, ...fs]).slice(0, 15);
}

/**
 * Fetch full nutritional details for a single food by its FatSecret ID.
 */
export async function getFoodDetails(foodId: string): Promise<DetectedFood | null> {
  const raw  = await invoke<FatSecretFoodResponse>({ action: 'get_food', foodId });
  const food = raw.food;
  if (!food) return null;
  const serving = firstServing(food);
  if (!serving) return null;
  return parseServing(food.food_id, food.food_name, food.brand_name, null, serving);
}

// ─── Packaged ingredient analysis (dish scan) ─────────────────────────────────

export interface PackagedIngredientWarning {
  foodName: string;
  suspectedIngredients: string;
  concerns: import('../types').Additive[];
}

/**
 * For packaged food items found in a dish scan, ask Gemini to name likely
 * harmful ingredients, then run them through the existing additive DB.
 * Best-effort — silently returns [] on any error.
 */
export async function analyzePackagedIngredients(
  packagedFoods: import('../types').DetectedFood[],
): Promise<PackagedIngredientWarning[]> {
  if (packagedFoods.length === 0) return [];
  const foodList = packagedFoods
    .map((f, i) => `${i + 1}. ${f.name}${f.brand ? ` (${f.brand})` : ''}`)
    .join('\n');

  const prompt =
    'You are a food ingredient analyst. For each packaged food below, list only the potentially harmful ingredients typically found in this type of product. Focus on: artificial colors (Red 40, Yellow 5, Yellow 6, Red 3), preservatives (BHA, BHT, TBHQ, sodium benzoate, sodium nitrite, potassium bromate), artificial sweeteners (aspartame, acesulfame K, saccharin, sucralose, HFCS), and others (carrageenan, partially hydrogenated oils, titanium dioxide, BVO).\n\n' +
    'Foods:\n' + foodList + '\n\n' +
    'Return ONLY a JSON array — no markdown, no explanation:\n' +
    '[{"name":"<food name>","ingredients":"<comma-separated harmful ingredients only>"}]\n' +
    'If a food typically has none of these, use ingredients:"none".\n' +
    'Keep each ingredients value short — only the concerning ones, not the full list.';

  try {
    const resp = await fetch('/api/ai-coach/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemini-1.5-flash',
        stream: false,
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });
    if (!resp.ok) return [];

    const json    = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed  = extractJsonFromText(rawText) as Array<{ name: string; ingredients: string }>;
    if (!Array.isArray(parsed)) return [];

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

// ─── Nutrition aggregation ─────────────────────────────────────────────────────

/** Sum macros across all detected foods, respecting each food's servings count. */
export function calcTotals(foods: DetectedFood[]): {
  total_calories: number;
  total_protein:  number;
  total_carbs:    number;
  total_fat:      number;
} {
  return foods.reduce(
    (acc, f) => ({
      total_calories: acc.total_calories + Math.round(f.calories * f.servings),
      total_protein:  parseFloat((acc.total_protein + f.protein * f.servings).toFixed(1)),
      total_carbs:    parseFloat((acc.total_carbs   + f.carbs   * f.servings).toFixed(1)),
      total_fat:      parseFloat((acc.total_fat     + f.fat     * f.servings).toFixed(1)),
    }),
    { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0 },
  );
}

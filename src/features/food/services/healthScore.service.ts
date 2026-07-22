/**
 * Health scoring engine — region-aware.
 *
 * Scores 0–100 where HIGHER = HEALTHIER (green). Grade: A 80+ B 60+ C 40+ D 20+ E <20.
 * Limits come from REGION_STANDARDS so the same product scores differently per region.
 */

import type {
  HealthScore, HealthGrade, Additive, LabelData, DetectedFood,
  Region, ComplianceResult, ComplianceViolation,
} from '../types';
import {
  REGION_STANDARDS, REGION_ORDER, DEFAULT_REGION, regionShortName,
} from './regionStandards';

// ─── Chemical additive database (EWG / CSPI / IARC + per-region ban status) ────

interface AdditivePattern {
  id: string;
  pattern: RegExp;
  name: string;
  concern: 'high' | 'medium' | 'low';
  effect: string;
  bannedIn?: Region[]; // regions where this additive is banned or heavily restricted
}

const ADDITIVES: AdditivePattern[] = [
  // ── High concern ──────────────────────────────────────────────────────────
  { id: 'red40', pattern: /red\s*(?:no\.?\s*)?40|allura\s*red|e-?129/i,
    name: 'Red 40 (Allura Red)', concern: 'high',
    effect: 'Linked to hyperactivity in children; IARC "possible carcinogen"', bannedIn: ['eu'] },
  { id: 'yellow5', pattern: /yellow\s*(?:no\.?\s*)?5|tartrazine|e-?102/i,
    name: 'Yellow 5 (Tartrazine)', concern: 'high',
    effect: 'Hyperactivity, allergy risk; warning label required in the EU', bannedIn: ['eu'] },
  { id: 'yellow6', pattern: /yellow\s*(?:no\.?\s*)?6|sunset\s*yellow|e-?110/i,
    name: 'Yellow 6 (Sunset Yellow)', concern: 'high',
    effect: 'Hyperactivity, possible carcinogen at high doses', bannedIn: ['eu'] },
  { id: 'red3', pattern: /red\s*(?:no\.?\s*)?3|erythrosine|e-?127/i,
    name: 'Red 3 (Erythrosine)', concern: 'high',
    effect: 'Thyroid carcinogen — FDA banned (2025); restricted in the EU', bannedIn: ['usa', 'eu'] },
  { id: 'titanium_dioxide', pattern: /titanium\s*dioxide|e-?171\b/i,
    name: 'Titanium Dioxide (E171)', concern: 'high',
    effect: 'Genotoxicity cannot be ruled out — EFSA banned it in the EU (2022)', bannedIn: ['eu'] },
  { id: 'sodium_nitrite', pattern: /sodium\s*nitrite|e-?250\b/i,
    name: 'Sodium Nitrite', concern: 'high',
    effect: 'Forms nitrosamines in processed meats — IARC Group 2A carcinogen' },
  { id: 'bha', pattern: /\bbha\b|butylated\s*hydroxyanisole|e-?320\b/i,
    name: 'BHA (Butylated Hydroxyanisole)', concern: 'high',
    effect: 'IARC "possible carcinogen"; endocrine disruptor concerns', bannedIn: ['eu'] },
  { id: 'bht', pattern: /\bbht\b|butylated\s*hydroxytoluene|e-?321\b/i,
    name: 'BHT (Butylated Hydroxytoluene)', concern: 'high',
    effect: 'Possible carcinogen; liver and kidney effects at high doses' },
  { id: 'tbhq', pattern: /\btbhq\b|tert-?butylhydroquinone/i,
    name: 'TBHQ', concern: 'high',
    effect: 'Immune system effects; EFSA flagged safety concerns in 2020' },
  { id: 'potassium_bromate', pattern: /potassium\s*bromate|e-?924\b/i,
    name: 'Potassium Bromate', concern: 'high',
    effect: 'Known carcinogen — banned in the EU, India, UK, Canada', bannedIn: ['eu', 'india'] },
  { id: 'propyl_gallate', pattern: /propyl\s*gallate|e-?310\b/i,
    name: 'Propyl Gallate', concern: 'high',
    effect: 'Possible endocrine disruptor; tumours in animal studies' },
  { id: 'partially_hydrogenated', pattern: /partially\s*hydrogenated/i,
    name: 'Partially Hydrogenated Oil', concern: 'high',
    effect: 'Artificial trans fat — banned in the US, EU and India', bannedIn: ['usa', 'eu', 'india'] },
  // ── Medium concern ────────────────────────────────────────────────────────
  { id: 'hfcs', pattern: /high[\s-]fructose\s*corn\s*syrup|\bhfcs\b/i,
    name: 'High Fructose Corn Syrup', concern: 'medium',
    effect: 'Strongly linked to obesity, insulin resistance, metabolic syndrome' },
  { id: 'aspartame', pattern: /aspartame|e-?951\b/i,
    name: 'Aspartame', concern: 'medium',
    effect: 'IARC classified "possibly carcinogenic to humans" (2023)' },
  { id: 'saccharin', pattern: /saccharin|e-?954\b/i,
    name: 'Saccharin', concern: 'medium',
    effect: 'Alters gut microbiome; possible bladder irritant' },
  { id: 'acesulfame_k', pattern: /acesulfame[\s-]*(?:k|potassium)|e-?950\b/i,
    name: 'Acesulfame K', concern: 'medium',
    effect: 'Alters gut bacteria; possible neurotoxin at high doses' },
  { id: 'carrageenan', pattern: /carrageenan|e-?407\b/i,
    name: 'Carrageenan', concern: 'medium',
    effect: 'May promote intestinal inflammation and gut permeability' },
  { id: 'caramel_iv', pattern: /caramel\s*colo(?:u?r|ring).*(?:iv|class\s*4)|e-?150d\b/i,
    name: 'Caramel Color Class IV', concern: 'medium',
    effect: 'Contains 4-MEI — IARC "possible carcinogen"' },
  { id: 'sodium_benzoate', pattern: /sodium\s*benzoate|e-?211\b/i,
    name: 'Sodium Benzoate', concern: 'medium',
    effect: 'Forms benzene (carcinogen) when combined with Vitamin C' },
  { id: 'bvo', pattern: /brominated\s*vegetable\s*oil|\bbvo\b/i,
    name: 'Brominated Vegetable Oil (BVO)', concern: 'medium',
    effect: 'Bioaccumulates — FDA revoked authorization (2024); banned in the EU & India',
    bannedIn: ['usa', 'eu', 'india'] },
  { id: 'sucralose', pattern: /sucralose|e-?955\b/i,
    name: 'Sucralose', concern: 'medium',
    effect: 'May negatively alter gut microbiome; debated metabolic effects' },
  // ── Low concern ───────────────────────────────────────────────────────────
  { id: 'msg', pattern: /monosodium\s*glutamate|\bmsg\b|e-?621\b/i,
    name: 'MSG', concern: 'low',
    effect: 'Generally recognized as safe; some sensitivity reported' },
  { id: 'artificial', pattern: /artificial\s*(?:flavo(?:u?r|ring)|colo(?:u?r|ring))/i,
    name: 'Artificial Flavors/Colors', concern: 'low',
    effect: 'Catch-all term — specific chemicals not disclosed on label' },
];

// ─── Additive detection (region-aware) ────────────────────────────────────────

export function checkAdditives(ingredients: string, region?: Region): Additive[] {
  if (!ingredients?.trim()) return [];
  const found: Additive[] = [];
  for (const a of ADDITIVES) {
    if (!a.pattern.test(ingredients)) continue;
    const banned = !!(region && a.bannedIn?.includes(region));
    found.push({
      name:    a.name,
      concern: banned ? 'high' : a.concern, // banned-in-region escalates to high
      effect:  a.effect,
      ...(banned ? { banned: true, bannedRegionName: regionShortName(region!) } : {}),
    });
  }
  return found;
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function gradeFromScore(s: number): HealthGrade {
  if (s >= 80) return 'A';
  if (s >= 60) return 'B';
  if (s >= 40) return 'C';
  if (s >= 20) return 'D';
  return 'E';
}

function recommendation(overall: number, reason: string): Pick<HealthScore, 'recommendation' | 'reason'> {
  if (overall >= 67) return { recommendation: 'eat',      reason };
  if (overall >= 34) return { recommendation: 'moderate', reason };
  return                    { recommendation: 'avoid',    reason };
}

function scoreSugar(totalSugars: number, addedSugars: number, sugarMaxG: number): number {
  const effective = addedSugars > 0 ? addedSugars : totalSugars;
  return clamp(Math.round(100 - (effective / sugarMaxG) * 100), 0, 100);
}

function scoreSodium(sodium: number, sodiumMaxMg: number): number {
  return clamp(Math.round(100 - (sodium / sodiumMaxMg) * 100), 0, 100);
}

function scoreFat(saturatedFat: number, transFat: number, satFatMaxG: number, transBanned: boolean): number {
  if (transFat > 0 && transBanned) return 0; // trans fat where the region bans it = zero
  return clamp(Math.round(100 - (saturatedFat / satFatMaxG) * 100), 0, 100);
}

function scoreAdditives(concerns: Additive[]): number {
  const deduction = concerns.reduce((acc, c) => {
    if (c.concern === 'high')   return acc + 30;
    if (c.concern === 'medium') return acc + 15;
    return acc + 5;
  }, 0);
  return clamp(100 - deduction, 0, 100);
}

// ─── Public API: label scoring ────────────────────────────────────────────────

/** Score a scanned nutrition label against a region's official limits (default WHO). */
export function scoreLabel(label: LabelData, region: Region = DEFAULT_REGION): HealthScore {
  const lim = REGION_STANDARDS[region].limits;
  const concerns      = checkAdditives(label.ingredients, region);
  const sugarScore    = scoreSugar(label.totalSugars, label.addedSugars, lim.sugarMaxG);
  const sodiumScore   = scoreSodium(label.sodium, lim.sodiumMaxMg);
  const fatScore      = scoreFat(label.saturatedFat, label.transFat, lim.satFatMaxG, lim.transFatBanned);
  const additiveScore = scoreAdditives(concerns);

  const overall = Math.round(
    0.30 * additiveScore + 0.25 * sugarScore + 0.25 * sodiumScore + 0.20 * fatScore,
  );

  const risks: string[] = [];
  if (sugarScore  < 50) risks.push(`high sugars (${label.totalSugars}g)`);
  if (sodiumScore < 50) risks.push(`high sodium (${label.sodium}mg)`);
  if (fatScore    < 50) risks.push(label.transFat > 0 ? 'contains trans fat' : `high saturated fat (${label.saturatedFat}g)`);
  if (concerns.some((c) => c.banned)) risks.push(`contains additives restricted in ${regionShortName(region)}`);
  else if (concerns.some((c) => c.concern === 'high')) risks.push('contains high-concern additives');

  const reason = risks.length === 0
    ? (overall >= 80 ? 'Clean ingredients, balanced macros — enjoy freely.'
                     : 'Relatively clean profile. Reasonable as part of a varied diet.')
    : `Watch out: ${risks.join(', ')}.`;

  return {
    overall, grade: gradeFromScore(overall),
    sugarScore, sodiumScore, fatScore, additiveScore, concerns,
    ...recommendation(overall, reason),
  };
}

// ─── Public API: dish scoring ─────────────────────────────────────────────────

/**
 * Score a dish scan (foods, no label). Region currently only affects label-based
 * scoring; dishes have no ingredient panel, so the macro-ratio score is region-stable.
 * The param is accepted for a consistent call signature.
 */
export function scoreDish(foods: DetectedFood[], _region: Region = DEFAULT_REGION): HealthScore {
  if (foods.length === 0) {
    return { overall: 50, grade: 'C', sugarScore: 50, sodiumScore: 80, fatScore: 60,
      additiveScore: 100, concerns: [], recommendation: 'moderate', reason: 'No food data to score.' };
  }

  const totalCal  = foods.reduce((a, f) => a + f.calories * f.servings, 0);
  const totalProt = foods.reduce((a, f) => a + f.protein  * f.servings, 0);
  const totalCarb = foods.reduce((a, f) => a + f.carbs    * f.servings, 0);
  const totalFat  = foods.reduce((a, f) => a + f.fat      * f.servings, 0);

  if (totalCal === 0) {
    return { overall: 50, grade: 'C', sugarScore: 50, sodiumScore: 80, fatScore: 60,
      additiveScore: 100, concerns: [], recommendation: 'moderate', reason: 'Unable to calculate score.' };
  }

  const protPct   = (totalProt * 4) / totalCal;
  const protScore = clamp(Math.round(protPct * 300), 0, 100);
  const fatPct    = (totalFat * 9) / totalCal;
  const fatScore  = clamp(Math.round((1 - fatPct / 0.6) * 100), 0, 100);
  const carbPct   = (totalCarb * 4) / totalCal;
  const sugarScore = clamp(Math.round((1 - carbPct * 0.8) * 100), 0, 100);
  const sodiumScore = 75;
  const allWhole  = foods.every((f) => !f.source || f.source === 'usda');
  const additiveScore = allWhole ? 95 : 70;

  const overall = Math.round(
    0.35 * protScore + 0.25 * fatScore + 0.20 * sugarScore + 0.20 * additiveScore,
  );

  const insights: string[] = [];
  if (protPct >= 0.25) insights.push('high protein');
  if (fatPct  <= 0.30) insights.push('low fat');
  if (allWhole)        insights.push('whole foods');
  if (protPct < 0.10)  insights.push('low protein');
  if (fatPct  > 0.45)  insights.push('high fat');
  if (carbPct > 0.65)  insights.push('high carbs');
  const reason = insights.length > 0
    ? insights.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.'
    : 'Balanced macros.';

  return {
    overall, grade: gradeFromScore(overall),
    sugarScore, sodiumScore, fatScore, additiveScore, concerns: [],
    ...recommendation(overall, reason),
  };
}

// ─── Compliance: does this label meet a given region's standards? ──────────────

const HIGH_IN_FRACTION = 0.20; // FDA "20% DV per serving = high in" rule, applied uniformly

export function checkCompliance(label: LabelData, region: Region): ComplianceResult {
  const lim = REGION_STANDARDS[region].limits;
  const short = regionShortName(region);
  const violations: ComplianceViolation[] = [];

  if (label.sodium >= HIGH_IN_FRACTION * lim.sodiumMaxMg) {
    violations.push({ field: 'Sodium', detail: `${label.sodium}mg/serving — high vs ${short}`, severity: 'high' });
  }
  const sugar = label.addedSugars > 0 ? label.addedSugars : label.totalSugars;
  if (sugar >= HIGH_IN_FRACTION * lim.sugarMaxG) {
    violations.push({ field: 'Sugar', detail: `${sugar}g/serving — high vs ${short}`, severity: 'high' });
  }
  if (label.saturatedFat >= HIGH_IN_FRACTION * lim.satFatMaxG) {
    violations.push({ field: 'Saturated fat', detail: `${label.saturatedFat}g/serving — high vs ${short}`, severity: 'medium' });
  }
  if (label.transFat > 0 && lim.transFatBanned) {
    violations.push({ field: 'Trans fat', detail: `${label.transFat}g — banned under ${short}`, severity: 'high' });
  }
  for (const a of checkAdditives(label.ingredients, region)) {
    if (a.banned) {
      violations.push({ field: a.name, detail: `restricted/banned under ${short}`, severity: 'high' });
    }
  }

  return { region, isUserRegion: false, meets: violations.length === 0, violations };
}

// ─── Comparison set builder (dedup, never product's own standard) ──────────────

export function buildComparisonStandards(opts: {
  userRegion: Region;
  productStandard: Region | 'unknown';
  chosen: Region[];
  maxCount?: number;
}): Region[] {
  const { userRegion, productStandard, chosen, maxCount = 3 } = opts;

  // 1. current region first, then chosen — unique
  const candidates: Region[] = [];
  for (const r of [userRegion, ...chosen]) {
    if (!candidates.includes(r)) candidates.push(r);
  }
  // 2. drop the product's own standard (trivially meets itself)
  let set = productStandard === 'unknown'
    ? candidates
    : candidates.filter((r) => r !== productStandard);

  // 3. backfill from REGION_ORDER until maxCount, skipping product standard + duplicates
  if (set.length < maxCount) {
    for (const r of REGION_ORDER) {
      if (set.length >= maxCount) break;
      if (r === productStandard) continue;
      if (!set.includes(r)) set.push(r);
    }
  }
  // 4. cap
  return set.slice(0, maxCount);
}

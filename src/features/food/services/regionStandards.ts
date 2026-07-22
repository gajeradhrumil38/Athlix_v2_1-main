/**
 * Regional food-safety standards.
 *
 * All figures are sourced from the cited authorities (verified June 2026):
 *  - WHO  : free sugars <25g ideal / <50g (<10% energy); sodium <2000mg (5g salt);
 *           eliminate industrial trans fat; caffeine <400mg/day (EFSA-aligned).
 *           https://www.who.int  (sugars/sodium guidelines)
 *  - EU   : EFSA — bans titanium dioxide (E171, 2022), potassium bromate, BVO,
 *           industrial trans fat (<2g/100g fat, 2021), Red 3 (erythrosine restricted);
 *           Southampton colours require a warning label. sodium target <2000mg.
 *           https://www.efsa.europa.eu
 *  - USA  : FDA Daily Reference Values — sugar 50g, sodium 2300mg, sat fat 20g;
 *           banned artificial PHOs (2018/2020), Red 3 (banned Jan 2025), BVO authorization
 *           revoked (Aug 2024). caffeine 400mg/day cited as safe.
 *           https://www.fda.gov
 *  - India: FSSAI — banned potassium bromate (2016); industrial trans fat <2% (2022);
 *           sugar <25g (ICMR-NIN <10% energy); sodium <2000mg (WHO-aligned).
 *           https://fssai.gov.in
 *  - Japan: MHLW Dietary Reference Intakes 2020 — salt goal <7.5g/day (men) ≈ 2950mg sodium;
 *           sugars follow WHO (<50g); caffeine no official limit (use 400mg).
 *           https://www.mhlw.go.jp
 */

import type { Region } from '../types';

export interface RegionLimits {
  sugarMaxG: number;      // free/added sugars, grams per day
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
  tagline: string;     // one-line summary of its strictest rule
  limits: RegionLimits;
}

export const REGION_ORDER: Region[] = ['who', 'usa', 'eu', 'india', 'japan'];

export const REGION_STANDARDS: Record<Region, RegionStandard> = {
  who: {
    id: 'who',
    name: 'WHO Global',
    flag: '🌍',
    authority: 'World Health Organization',
    tagline: 'Free sugars <25g · sodium <2000mg · eliminate trans fat',
    limits: { sugarMaxG: 25, sodiumMaxMg: 2000, satFatMaxG: 22, transFatBanned: true, caffeineMaxMg: 400 },
  },
  usa: {
    id: 'usa',
    name: 'United States',
    flag: '🇺🇸',
    authority: 'FDA',
    tagline: 'Daily Values: sugar 50g · sodium 2300mg · sat fat 20g',
    limits: { sugarMaxG: 50, sodiumMaxMg: 2300, satFatMaxG: 20, transFatBanned: true, caffeineMaxMg: 400 },
  },
  eu: {
    id: 'eu',
    name: 'European Union',
    flag: '🇪🇺',
    authority: 'EFSA',
    tagline: 'Strictest additive regime — bans E171, bromate, BVO',
    limits: { sugarMaxG: 50, sodiumMaxMg: 2000, satFatMaxG: 20, transFatBanned: true, caffeineMaxMg: 400 },
  },
  india: {
    id: 'india',
    name: 'India',
    flag: '🇮🇳',
    authority: 'FSSAI',
    tagline: 'Bans potassium bromate · sugar <25g · sodium <2000mg',
    limits: { sugarMaxG: 25, sodiumMaxMg: 2000, satFatMaxG: 22, transFatBanned: true, caffeineMaxMg: 400 },
  },
  japan: {
    id: 'japan',
    name: 'Japan',
    flag: '🇯🇵',
    authority: 'MHLW',
    tagline: 'Sodium-focused — salt <7.5g/day (≈2950mg sodium)',
    limits: { sugarMaxG: 50, sodiumMaxMg: 2950, satFatMaxG: 20, transFatBanned: false, caffeineMaxMg: 400 },
  },
};

export const DEFAULT_REGION: Region = 'who';

export function regionName(r: Region): string { return REGION_STANDARDS[r].name; }
export function regionFlag(r: Region): string { return REGION_STANDARDS[r].flag; }
export function regionShortName(r: Region): string {
  return { who: 'WHO', usa: 'FDA', eu: 'EU', india: 'FSSAI', japan: 'Japan' }[r];
}

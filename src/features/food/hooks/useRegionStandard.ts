import { useCallback, useEffect, useState } from 'react';
import type { Region } from '../types';
import { REGION_STANDARDS, DEFAULT_REGION, type RegionStandard } from '../services/regionStandards';

const REGION_KEY     = 'athlix:food_region';
const COMPARISON_KEY = 'athlix:food_comparison_regions';
const DEFAULT_COMPARISON: Region[] = ['usa', 'eu'];
const MAX_COMPARISON = 3;

const VALID: Region[] = ['who', 'eu', 'usa', 'india', 'japan'];

function loadRegion(): Region | null {
  try {
    const raw = localStorage.getItem(REGION_KEY);
    return raw && (VALID as string[]).includes(raw) ? (raw as Region) : null;
  } catch { return null; }
}

function loadComparison(): Region[] {
  try {
    const raw = localStorage.getItem(COMPARISON_KEY);
    if (!raw) return DEFAULT_COMPARISON;
    const parsed = JSON.parse(raw) as Region[];
    const valid = Array.isArray(parsed) ? parsed.filter((r) => (VALID as string[]).includes(r)) : [];
    return valid.length ? valid.slice(0, MAX_COMPARISON) : DEFAULT_COMPARISON;
  } catch { return DEFAULT_COMPARISON; }
}

export function useRegionStandard() {
  // null = the user has not chosen yet (popup may fire)
  const [chosenRegion, setChosenRegion] = useState<Region | null>(loadRegion);
  const [comparisonRegions, setComparisonState] = useState<Region[]>(loadComparison);

  useEffect(() => {
    if (chosenRegion) localStorage.setItem(REGION_KEY, chosenRegion);
  }, [chosenRegion]);

  useEffect(() => {
    localStorage.setItem(COMPARISON_KEY, JSON.stringify(comparisonRegions));
  }, [comparisonRegions]);

  const setRegion = useCallback((r: Region) => setChosenRegion(r), []);
  const setComparisonRegions = useCallback(
    (r: Region[]) => setComparisonState(r.slice(0, MAX_COMPARISON)),
    [],
  );

  const region: Region = chosenRegion ?? DEFAULT_REGION; // effective region for scoring
  const standard: RegionStandard = REGION_STANDARDS[region];

  return {
    region,
    setRegion,
    standard,
    hasChosenRegion: chosenRegion !== null,
    comparisonRegions,
    setComparisonRegions,
    maxComparison: MAX_COMPARISON,
  };
}

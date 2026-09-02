export type WeightUnit = 'kg' | 'lbs';

export const isWeightUnit = (value: unknown): value is WeightUnit =>
  value === 'kg' || value === 'lbs';

const KG_TO_LBS = 2.2046226218;

const roundToStep = (value: number, step: number) => {
  if (!Number.isFinite(value)) return 0;
  if (step <= 0) return value;
  return Math.round(value / step) * step;
};

export const convertWeight = (
  value: number,
  fromUnit: WeightUnit,
  toUnit: WeightUnit,
  // Fine-grained by default (matches the step already used explicitly at
  // most call sites) — NOT the plate/dial increment (0.5kg / 1lb). That
  // coarse a default silently drifted values on every conversion: e.g. a
  // genuine 70lbs, converted to kg and rounded to the nearest 0.5 (32.0kg),
  // then converted back and rounded to the nearest 1 (71lbs) — a real user
  // report. No call site in this codebase actually wants snap-to-plate
  // behavior as a side effect of unit conversion; that belongs to the
  // dial/stepper input controls themselves, which don't call this at all.
  // Pass an explicit coarser step only where snapping is the deliberate UX.
  step = 0.1,
) => {
  if (!Number.isFinite(value)) return 0;
  if (fromUnit === toUnit) return roundToStep(value, step);
  const converted = fromUnit === 'kg' ? value * KG_TO_LBS : value / KG_TO_LBS;
  return roundToStep(converted, step);
};

export const formatWeight = (value: number, unit: WeightUnit, maxFractionDigits = 1) => {
  const normalized = Number.isFinite(value) ? value : 0;
  return `${normalized.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits })} ${unit}`;
};

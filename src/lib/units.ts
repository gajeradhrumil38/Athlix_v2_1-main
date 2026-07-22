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
  step = toUnit === 'kg' ? 0.5 : 1,
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

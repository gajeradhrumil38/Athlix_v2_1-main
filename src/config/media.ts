const env = import.meta.env as Record<string, string | undefined>;

const svgFlag =
  env.VITE_ENABLE_EXERCISE_SVG ??
  env.NEXT_PUBLIC_ENABLE_EXERCISE_SVG ??
  '';

const truthy = new Set(['1', 'true', 'yes', 'on']);

// Disabled by default for now; set VITE_ENABLE_EXERCISE_SVG=true (or
// NEXT_PUBLIC_ENABLE_EXERCISE_SVG=true) to re-enable globally.
export const ENABLE_EXERCISE_SVG =
  truthy.has(String(svgFlag).trim().toLowerCase());


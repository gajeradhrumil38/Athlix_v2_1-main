// Single source of truth for how a saved workout is titled in list/calendar
// views. Previously Calendar.tsx and Timeline.tsx each carried their own
// identical copy of this logic — they drifted-proof only by luck, and both
// had the same bug, so a fix in one wouldn't reach the other. Keeping it
// here means there's exactly one place to reason about (and fix) it.

const getExerciseNames = (w: any): string[] =>
  Array.from(new Set((w?.exercises || []).map((e: any) => e?.name as string).filter(Boolean)));

/**
 * The name to show for a workout on a calendar/timeline card.
 *
 * Leads with the workout's OWN title. The exercises are already shown
 * separately (muscle badges + the expandable set list), so the card title
 * should identify the session, not promote the first exercise as if it were
 * the whole workout.
 *
 * The old behaviour returned `exercises[0].name` whenever a workout had any
 * exercises — so a 4-exercise session logged without a custom name showed up
 * as a single "Barbell Back Squat" entry, reading as one exercise rather
 * than a workout. The logger always assigns at least a generic title
 * ("Morning Workout" / "Evening Workout"), so that promotion was actively
 * hiding a perfectly good name behind an exercise name.
 */
export const getWorkoutDisplayTitle = (w: any): string => {
  const title = (w?.title ?? '').trim();
  if (title) return title;

  // Genuinely untitled (defensive — the logger normally sets a generic
  // title, so this is a fallback for legacy/imported rows): derive something
  // meaningful rather than a bare exercise name or a flat "Workout".
  const names = getExerciseNames(w);
  if (names.length === 1) return names[0]; // a true single-exercise session — its name IS informative
  const groups = Array.isArray(w?.muscle_groups) ? w.muscle_groups.filter(Boolean) : [];
  if (groups.length === 1) return `${groups[0]} Workout`;
  return 'Workout';
};

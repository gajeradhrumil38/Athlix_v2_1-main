// Single source of truth for how a saved workout is titled in list/calendar
// views. Previously Calendar.tsx and Timeline.tsx each carried their own
// identical copy of this logic — they drifted-proof only by luck, and both
// had the same bug, so a fix in one wouldn't reach the other. Keeping it
// here means there's exactly one place to reason about (and fix) it.

const getExerciseNames = (w: any): string[] =>
  Array.from(new Set((w?.exercises || []).map((e: any) => e?.name as string).filter(Boolean)));

// Titles that are placeholders, not names the user actually chose: the neutral
// "Workout" the save RPC assigns when no title is given, and the old auto
// "Morning/Afternoon/Evening Workout" defaults. These are treated as "unnamed"
// so the card derives its label from the exercises instead of showing a
// made-up session name. (An empty title is handled separately below.)
const PLACEHOLDER_TITLES = new Set([
  'workout', 'morning workout', 'afternoon workout', 'evening workout',
]);

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
  // A real, user-chosen name wins. Placeholder/auto titles fall through and
  // are represented by the exercises instead (see PLACEHOLDER_TITLES).
  if (title && !PLACEHOLDER_TITLES.has(title.toLowerCase())) return title;

  // Unnamed workout → represent it by the exercises actually performed
  // (an unnamed session should read as "what I did", not a made-up name).
  // Distinct exercise names joined; the card truncates if there are many,
  // and the full list is always in the expanded view.
  const names = getExerciseNames(w);
  if (names.length > 0) return names.join(' · ');

  // No exercises either (empty/legacy row) → fall back to the muscle focus,
  // then the placeholder itself, then a flat label.
  const groups = Array.isArray(w?.muscle_groups) ? w.muscle_groups.filter(Boolean) : [];
  if (groups.length > 0) return `${groups.join(' · ')} Workout`;
  return title || 'Workout';
};

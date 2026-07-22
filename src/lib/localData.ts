import { DEFAULT_LAYOUT } from '../config/widgets';
import { getExerciseMuscleProfile } from './exerciseMuscles';
import { fuzzyFilter } from './fuzzySearch';
import { convertWeight, isWeightUnit, type WeightUnit } from './units';
import {
  OPENTRAINING_ASSETS_BY_ID,
  OPENTRAINING_EXERCISES,
  OPENTRAINING_ID_BY_NAME,
  normalizeExerciseName,
} from '../data/opentrainingCatalog';

export interface LocalUser {
  id: string;
  email: string;
}

interface StoredUser extends LocalUser {
  password: string;
  created_at: string;
}

export interface LocalProfile {
  id: string;
  full_name: string | null;
  unit_preference: 'kg' | 'lbs';
  theme_preference: 'dark' | 'darker';
  start_workout_enabled: boolean;
  show_start_sheet: boolean;
  body_weight: number | null;
  body_weight_unit: 'kg' | 'lbs';
  height_feet: number | null;
  height_inches: number | null;
  created_at: string;
}

export interface LocalWorkout {
  id: string;
  user_id: string;
  title: string;
  date: string;
  duration_minutes: number;
  notes: string | null;
  muscle_groups: string[];
  created_at: string;
}

export type ExerciseSetUnit = 'kg' | 'lbs' | 'km' | 'mi';

export interface LocalExercise {
  id: string;
  workout_id: string;
  name: string;
  muscle_group?: string | null;
  sets: number;
  reps: number;
  weight: number;
  unit: ExerciseSetUnit;
  order_index: number;
  exercise_db_id?: string | null;
}

export interface LocalTemplate {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
}

export interface LocalTemplateExercise {
  id: string;
  template_id: string;
  name: string;
  muscle_group?: string | null;
  default_sets: number;
  default_reps: number;
  default_weight: number;
  order_index: number;
  exercise_db_id?: string | null;
}

export interface LocalBodyWeightLog {
  id: string;
  user_id: string;
  date: string;
  weight: number;
  unit: 'kg' | 'lbs';
  notes?: string | null;
  created_at: string;
}

export interface LocalPersonalRecord {
  id: string;
  user_id: string;
  exercise_name: string;
  best_weight: number;
  best_reps: number;
  achieved_date: string;
  created_at: string;
  exercise_db_id?: string | null;
}

export interface LocalExerciseSessionSummary {
  name: string;
  muscleGroup: string;
  exercise_db_id?: string | null;
  lastSession?: {
    date: string;
    sets: number;
    reps: number;
    weight: number;
    totalVolume: number;
    perSetData?: Array<{ weight: number; reps: number }>;
  };
}

export interface LocalExerciseLibraryItem {
  id: string;
  name: string;
  muscle_group: string;
  is_custom: boolean;
  user_id?: string | null;
  exercise_db_id?: string | null;
  muscle_slugs?: { slug: string; type: 'primary' | 'secondary' }[];
}

export interface LocalHeartRateSession {
  id: string;
  user_id: string;
  device_name: string;
  connected_at: string;
  disconnected_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface LocalHeartRateSample {
  id: string;
  user_id: string;
  session_id: string;
  ts: number;
  bpm: number;
  created_at: string;
}

interface LocalDashboardLayout {
  user_id: string;
  layout: typeof DEFAULT_LAYOUT;
  updated_at: string;
}

interface LocalDatabase {
  users: StoredUser[];
  profiles: LocalProfile[];
  workouts: LocalWorkout[];
  exercises: LocalExercise[];
  templates: LocalTemplate[];
  templateExercises: LocalTemplateExercise[];
  bodyWeightLogs: LocalBodyWeightLog[];
  personalRecords: LocalPersonalRecord[];
  exerciseLibrary: LocalExerciseLibraryItem[];
  heartRateSessions: LocalHeartRateSession[];
  heartRateSamples: LocalHeartRateSample[];
  dashboardLayouts: LocalDashboardLayout[];
}

const DB_KEY = 'athlix_local_db_v1';
const SESSION_KEY = 'athlix_local_session_v1';
const MAX_HEART_RATE_SAMPLES_PER_USER = 50000;

const authListeners = new Set<(user: LocalUser | null) => void>();

const DEFAULT_EXERCISES: Record<string, string[]> = {
  Chest: [
    'Bench Press',
    'Incline Bench Press',
    'Cable Fly',
    'Push-Ups',
    'Chest Dips',
    'Machine Chest Press',
    'Low Cable Fly',
    'High Cable Fly',
    'Landmine Press',
    'Incline Dumbbell Fly',
    // ── New machine exercises ──
    'Flat Chest Press',
    'Wide Grip Chest Press',
    'Narrow Grip Chest Press',
    'Single Arm Chest Press',
    'Pec Deck Fly',
    'Single Arm Pec Fly',
    'Cable Crossover',
    'Standing Cable Press',
    'Smith Machine Bench Press',
    'Decline Chest Press',
    'Incline Chest Press',
  ],
  Back: [
    'Deadlift',
    'Pull-Ups',
    'Lat Pulldown',
    'Seated Cable Row',
    'Bent Over Row',
    'Single Arm Dumbbell Row',
    'Chest Supported Row',
    'Rack Pull',
    'Straight Arm Pulldown',
    'Pendlay Row',
    'Back Extension',
    '45-Degree Back Extension',
    'Hyperextension',
    'Weighted Back Extension',
    'Single Leg Back Extension',
    'Barbell Shrug',
    'Dumbbell Shrug',
    // ── New machine exercises ──
    'Wide Grip Lat Pulldown',
    'Close Grip Lat Pulldown',
    'Reverse Grip Lat Pulldown',
    'Single Arm Lat Pulldown',
    'Neutral Grip Lat Pulldown',
    'V-Bar Lat Pulldown',
    'Wide Grip Row',
    'Close Grip Row',
    'V-Bar Row',
    'Neutral Grip Row',
    'T-Bar Row',
    'Close Grip T-Bar Row',
    'Wide Grip T-Bar Row',
    'Single Arm T-Bar Row',
    'Incline Row',
    'Prone Row',
    'Single Arm Supported Row',
    'Assisted Pull-up',
    'Assisted Chin-up',
    'Machine Shrugs',
    'Cable Shrugs',
    'Cable Upright Row',
    'Smith Machine Row',
    'Smith Machine Deadlift',
  ],
  Shoulders: [
    'Overhead Press',
    'Dumbbell Shoulder Press',
    'Lateral Raise',
    'Arnold Press',
    'Cable Lateral Raise',
    'Machine Lateral Raise',
    'Face Pull',
    'Reverse Pec Deck',
    'Rear Delt Fly',
    'Upright Row',
    'Seated Dumbbell Press',
    // ── New machine exercises ──
    'Seated Shoulder Press',
    'Single Arm Shoulder Press',
    'Single Arm Lateral Raise',
    'Seated Lateral Raise',
    'Single Arm Rear Delt Fly',
    'Cable Front Raise',
    'Smith Machine Shoulder Press',
    'Smith Machine Upright Row',
  ],
  Biceps: [
    'Barbell Curl',
    'Dumbbell Curl',
    'Hammer Curl',
    'Preacher Curl',
    'Cable Curl',
    'EZ Bar Curl',
    'Spider Curl',
    'Incline Dumbbell Curl',
    'Reverse Curl',
    'Machine Bicep Curl',
    // ── New machine exercises ──
    'Single Arm Bicep Curl',
    'Single Arm Preacher Curl',
    'EZ Bar Preacher Curl',
    'Reverse Preacher Curl',
    'Single Arm Hammer Curl',
    'Neutral Grip Curl',
    'Cable Bicep Curl',
    'Concentration Curl',
  ],
  Triceps: [
    'Tricep Pushdown',
    'Skull Crushers',
    'Overhead Tricep Extension',
    'Dips',
    'Cable Rope Pushdown',
    'Close Grip Bench Press',
    'Overhead Cable Extension',
    'Dumbbell Kickback',
    // ── New machine exercises ──
    'Seated Tricep Extension',
    'Single Arm Tricep Extension',
    'Assisted Tricep Dip',
    'V-Bar Pushdown',
    'Single Arm Pushdown',
    'Reverse Grip Pushdown',
    'Cable Kickbacks',
  ],
  Legs: [
    'Squat',
    'Leg Press',
    'Romanian Deadlift',
    'Bulgarian Split Squat',
    'Calf Raises',
    'Hack Squat',
    'Front Squat',
    'Hip Thrust',
    'Glute Bridge',
    'Leg Extension',
    'Lying Leg Curl',
    'Seated Leg Curl',
    'Standing Calf Raise',
    'Seated Calf Raise',
    'Nordic Hamstring Curl',
    'Glute Ham Raise',
    'Adductor Machine',
    'Abductor Machine',
    'Walking Lunge',
    'Goblet Squat',
    'Box Jump',
    'Sled Push',
    'Sumo Deadlift',
    'Smith Machine Squat',
    // ── New machine exercises ──
    'Single Leg Press',
    'Wide Stance Leg Press',
    'Narrow Stance Leg Press',
    'High Foot Placement Leg Press',
    'Low Foot Placement Leg Press',
    'Calf Press on Leg Press',
    'Reverse Hack Squat',
    'Single Leg Hack Squat',
    'Narrow Stance Hack Squat',
    'Wide Stance Hack Squat',
    'Single Leg Extension',
    'Tempo Leg Extension',
    'Single Leg Curl',
    'Tempo Leg Curl',
    'Single Leg Seated Curl',
    'Hip Adduction',
    'Seated Hip Adduction',
    'Inner Thigh Squeeze',
    'Single Leg Calf Raise',
    'Toe Press',
    'Single Leg Seated Calf Raise',
    'Belt Squat',
    'Single Leg Belt Squat',
    'Wide Stance Belt Squat',
    'Pendulum Squat',
    'Single Leg Pendulum Squat',
    'Assisted Sissy Squat',
    'Smith Machine Lunges',
    'Smith Machine Calf Raise',
    'Step Up',
    'Reverse Lunge',
    'Split Squat',
  ],
  Glutes: [
    'Hip Thrust (Machine)',
    'Single Leg Hip Thrust',
    'Banded Hip Thrust',
    'Hip Abduction',
    'Seated Hip Abduction',
    'Single Leg Hip Abduction',
    'Glute Kickback',
    'Single Leg Kickback',
    'Standing Rear Kick',
    'Hip Extension',
    'Reverse Hyper',
    'Single Leg Reverse Hyper',
    'Donkey Kick',
    'Fire Hydrant',
    'Clamshell',
    'Glute Bridge',
    'Single Leg Hip Thrust (Bodyweight)',
  ],
  Core: [
    'Plank',
    'Crunches',
    'Hanging Knee Raise',
    'Ab Wheel Rollout',
    'Cable Crunch',
    'Hanging Leg Raise',
    'Toes to Bar',
    'Russian Twist',
    'Dead Bug',
    'Hollow Hold',
    'Dragon Flag',
    'Pallof Press',
    'V-Up',
    // ── New machine / weighted core ──
    'Ab Crunch Machine',
    'Weighted Ab Crunch',
    'Oblique Crunch',
    'Seated Torso Rotation',
    'Standing Torso Twist',
    "Captain's Chair Leg Raise",
    'Oblique Knee Raise',
    'GHD Sit-up',
    'Decline Sit-up',
    'Decline Oblique Crunch',
    'Leg Raise on Decline',
    'Side Plank',
    'Bird Dog',
    'Reverse Crunch',
  ],
  Cardio: [
    'Treadmill',
    'Cycling',
    'Rowing Machine',
    'Elliptical',
    'Stairmaster',
    'Assault Bike',
    'Ski Erg',
    'Jump Rope',
    'Battle Ropes',
    'Farmers Walk',
    'Swimming',
    'Running (Outdoor)',
    'Walking',
    // ── New cardio variants ──
    'Incline Walk',
    'Hill Climb',
    'Forward Elliptical',
    'Reverse Elliptical',
    'Incline Elliptical',
    'High Resistance Elliptical',
    'Steady State Cycling',
    'Interval Cycling',
    'High Resistance Cycling',
    'Sprint Cycling',
    'Endurance Cycling',
    'Rowing',
    'Endurance Row',
    'Sprint Row Intervals',
    'Power Strokes',
    'Steady Climb',
    'Interval Climb',
    'Stair Sprint',
    'Side Step Climb',
    'Tabata Protocol',
    'Arm Cycling',
    'Forward Arm Cycle',
    'Reverse Arm Cycle',
    'Interval Arm Cycling',
  ],
  Forearms: [
    'Wrist Curl',
    'Reverse Wrist Curl',
    'Wrist Roller',
    'Finger Curls',
    'Wrist Extension',
    'Plate Pinch',
    'Forearm Pronation',
    'Forearm Supination',
    'Grip Training',
  ],
};

const makeLibraryKey = (muscleGroup: string, name: string) =>
  `${muscleGroup.toLowerCase()}::${normalizeExerciseName(name)}`;

const nowIso = () => new Date().toISOString();
const createId = () => crypto.randomUUID();

const buildDefaultExerciseLibrary = (): LocalExerciseLibraryItem[] => {
  const merged = new Map<string, LocalExerciseLibraryItem>();

  Object.entries(DEFAULT_EXERCISES).forEach(([muscle_group, names]) => {
    names.forEach((name) => {
      const key = makeLibraryKey(muscle_group, name);
      const openTrainingId = OPENTRAINING_ID_BY_NAME[normalizeExerciseName(name)] || null;
      if (merged.has(key)) return;
      merged.set(key, {
        id: createId(),
        name,
        muscle_group,
        is_custom: false,
        user_id: null,
        exercise_db_id: openTrainingId,
      });
    });
  });

  OPENTRAINING_EXERCISES.forEach((exercise) => {
    const key = makeLibraryKey(exercise.muscleGroup, exercise.name);
    if (merged.has(key)) return;
    merged.set(key, {
      id: createId(),
      name: exercise.name,
      muscle_group: exercise.muscleGroup,
      is_custom: false,
      user_id: null,
      exercise_db_id: exercise.id,
    });
  });

  return Array.from(merged.values()).sort((a, b) => {
    if (a.muscle_group !== b.muscle_group) return a.muscle_group.localeCompare(b.muscle_group);
    return a.name.localeCompare(b.name);
  });
};

const mergeExerciseLibrary = (existing: LocalExerciseLibraryItem[] = []) => {
  const defaults = buildDefaultExerciseLibrary();
  const deduped: LocalExerciseLibraryItem[] = [];
  const seen = new Set<string>();

  const existingKey = (item: LocalExerciseLibraryItem) =>
    `${item.is_custom ? `custom:${item.user_id || 'shared'}` : 'default'}::${makeLibraryKey(item.muscle_group, item.name)}`;

  existing.forEach((item) => {
    const key = existingKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(item);
  });

  const nonCustomIndex = new Map<string, number>();
  deduped.forEach((item, index) => {
    if (item.is_custom) return;
    nonCustomIndex.set(makeLibraryKey(item.muscle_group, item.name), index);
  });

  defaults.forEach((item) => {
    const key = makeLibraryKey(item.muscle_group, item.name);
    const index = nonCustomIndex.get(key);
    if (index === undefined) {
      nonCustomIndex.set(key, deduped.push(item) - 1);
      return;
    }

    const current = deduped[index];
    if (!current.exercise_db_id && item.exercise_db_id) {
      deduped[index] = {
        ...current,
        exercise_db_id: item.exercise_db_id,
      };
    }
  });

  return deduped;
};

const createInitialDb = (): LocalDatabase => ({
  users: [],
  profiles: [],
  workouts: [],
  exercises: [],
  templates: [],
  templateExercises: [],
  bodyWeightLogs: [],
  personalRecords: [],
  exerciseLibrary: buildDefaultExerciseLibrary(),
  heartRateSessions: [],
  heartRateSamples: [],
  dashboardLayouts: [],
});

const readDb = (): LocalDatabase => {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const initial = createInitialDb();
    localStorage.setItem(DB_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
    const normalizedProfiles = (parsed.profiles || []).map((profile) => ({
      ...profile,
      start_workout_enabled: Boolean((profile as any).start_workout_enabled),
      show_start_sheet: Boolean((profile as any).show_start_sheet),
      body_weight: typeof (profile as any).body_weight === 'number' ? (profile as any).body_weight : null,
      body_weight_unit: (profile as any).body_weight_unit === 'kg' ? 'kg' : 'lbs',
      height_feet: typeof (profile as any).height_feet === 'number' ? (profile as any).height_feet : null,
      height_inches: typeof (profile as any).height_inches === 'number' ? (profile as any).height_inches : null,
    })) as LocalProfile[];

    return {
      ...createInitialDb(),
      ...parsed,
      profiles: normalizedProfiles,
      exerciseLibrary: mergeExerciseLibrary(parsed.exerciseLibrary || []),
      heartRateSessions: (parsed.heartRateSessions || []) as LocalHeartRateSession[],
      heartRateSamples: (parsed.heartRateSamples || []) as LocalHeartRateSample[],
    };
  } catch {
    const initial = createInitialDb();
    localStorage.setItem(DB_KEY, JSON.stringify(initial));
    return initial;
  }
};

const writeDb = (db: LocalDatabase) => {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
};

const sanitizeUser = (user: StoredUser): LocalUser => ({
  id: user.id,
  email: user.email,
});

const emitAuthChange = () => {
  const user = getCurrentUser();
  authListeners.forEach((listener) => listener(user));
};

export const getCurrentUser = (): LocalUser | null => {
  const sessionUserId = localStorage.getItem(SESSION_KEY);
  if (!sessionUserId) return null;
  const db = readDb();
  const user = db.users.find((item) => item.id === sessionUserId);
  return user ? sanitizeUser(user) : null;
};

export const subscribeToAuth = (listener: (user: LocalUser | null) => void) => {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
};

export const signUpLocal = async (email: string, password: string, fullName?: string) => {
  const db = readDb();
  const normalizedEmail = email.trim().toLowerCase();

  if (db.users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    throw new Error('An account with this email already exists.');
  }

  const user: StoredUser = {
    id: createId(),
    email: normalizedEmail,
    password,
    created_at: nowIso(),
  };

  const profile: LocalProfile = {
    id: user.id,
    full_name: fullName || normalizedEmail.split('@')[0],
    unit_preference: 'lbs',
    theme_preference: 'dark',
    start_workout_enabled: false,
    show_start_sheet: false,
    body_weight: null,
    body_weight_unit: 'lbs',
    height_feet: null,
    height_inches: null,
    created_at: nowIso(),
  };

  db.users.push(user);
  db.profiles.push(profile);
  writeDb(db);
  localStorage.setItem(SESSION_KEY, user.id);
  emitAuthChange();

  return sanitizeUser(user);
};

export const signInLocal = async (email: string, password: string) => {
  const db = readDb();
  const normalizedEmail = email.trim().toLowerCase();
  const existingAccount = db.users.find(
    (entry) => entry.email.toLowerCase() === normalizedEmail,
  );

  if (!existingAccount) {
    throw new Error('No account found for this email. Please sign up first.');
  }

  const user = db.users.find(
    (entry) => entry.email.toLowerCase() === normalizedEmail && entry.password === password,
  );

  if (!user) {
    throw new Error('Invalid email or password.');
  }

  localStorage.setItem(SESSION_KEY, user.id);
  emitAuthChange();
  return sanitizeUser(user);
};

export const signOutLocal = async () => {
  localStorage.removeItem(SESSION_KEY);
  emitAuthChange();
};

export const deleteAccountLocal = async (userId: string) => {
  const db = readDb();

  const workoutIds = db.workouts
    .filter((workout) => workout.user_id === userId)
    .map((workout) => workout.id);
  const templateIds = db.templates
    .filter((template) => template.user_id === userId)
    .map((template) => template.id);

  db.users = db.users.filter((user) => user.id !== userId);
  db.profiles = db.profiles.filter((profile) => profile.id !== userId);
  db.workouts = db.workouts.filter((workout) => workout.user_id !== userId);
  db.exercises = db.exercises.filter((exercise) => !workoutIds.includes(exercise.workout_id));
  db.templates = db.templates.filter((template) => template.user_id !== userId);
  db.templateExercises = db.templateExercises.filter(
    (exercise) => !templateIds.includes(exercise.template_id),
  );
  db.bodyWeightLogs = db.bodyWeightLogs.filter((log) => log.user_id !== userId);
  db.personalRecords = db.personalRecords.filter((record) => record.user_id !== userId);
  db.exerciseLibrary = db.exerciseLibrary.filter(
    (exercise) => !(exercise.is_custom && exercise.user_id === userId),
  );
  db.heartRateSessions = db.heartRateSessions.filter((session) => session.user_id !== userId);
  db.heartRateSamples = db.heartRateSamples.filter((sample) => sample.user_id !== userId);
  db.dashboardLayouts = db.dashboardLayouts.filter((layout) => layout.user_id !== userId);

  writeDb(db);
  localStorage.removeItem(SESSION_KEY);
  emitAuthChange();
};

export const getProfile = async (userId: string) => {
  const db = readDb();
  return db.profiles.find((profile) => profile.id === userId) ?? null;
};

export const updateProfile = async (userId: string, updates: Partial<LocalProfile>) => {
  const db = readDb();
  const index = db.profiles.findIndex((profile) => profile.id === userId);
  if (index === -1) throw new Error('Profile not found.');
  const existingProfile = db.profiles[index];
  const requestedUnit = updates.unit_preference ?? existingProfile.unit_preference;
  const targetUnit = requestedUnit as WeightUnit;

  const shouldConvertAllUserWeights = requestedUnit !== existingProfile.unit_preference;
  if (shouldConvertAllUserWeights) {
    const userWorkoutIds = new Set(
      db.workouts.filter((workout) => workout.user_id === userId).map((workout) => workout.id),
    );
    const userTemplateIds = new Set(
      db.templates.filter((template) => template.user_id === userId).map((template) => template.id),
    );

    db.exercises = db.exercises.map((exercise) => {
      if (!userWorkoutIds.has(exercise.workout_id)) return exercise;
      const sourceUnit = exercise.unit || existingProfile.unit_preference;
      if (!isWeightUnit(sourceUnit)) return exercise;
      return {
        ...exercise,
        weight: convertWeight(Number(exercise.weight || 0), sourceUnit, targetUnit),
        unit: targetUnit,
      };
    });

    db.templateExercises = db.templateExercises.map((exercise) => {
      if (!userTemplateIds.has(exercise.template_id)) return exercise;
      return {
        ...exercise,
        default_weight: convertWeight(
          Number(exercise.default_weight || 0),
          existingProfile.unit_preference,
          targetUnit,
        ),
      };
    });

    db.personalRecords = db.personalRecords.map((record) => {
      if (record.user_id !== userId) return record;
      return {
        ...record,
        best_weight: convertWeight(
          Number(record.best_weight || 0),
          existingProfile.unit_preference,
          targetUnit,
        ),
      };
    });

    db.bodyWeightLogs = db.bodyWeightLogs.map((log) => {
      if (log.user_id !== userId) return log;
      const sourceUnit = (log.unit || existingProfile.body_weight_unit) as WeightUnit;
      return {
        ...log,
        weight: convertWeight(Number(log.weight || 0), sourceUnit, targetUnit, 0.1),
        unit: targetUnit,
      };
    });
  }

  const nextProfile: LocalProfile = {
    ...existingProfile,
    ...updates,
    unit_preference: targetUnit,
  };

  const bodyWeightUnitUpdate = (updates.body_weight_unit as WeightUnit | undefined) ?? nextProfile.body_weight_unit;
  if (bodyWeightUnitUpdate !== nextProfile.body_weight_unit && nextProfile.body_weight != null) {
    nextProfile.body_weight = convertWeight(
      Number(nextProfile.body_weight),
      nextProfile.body_weight_unit,
      bodyWeightUnitUpdate,
      0.1,
    );
  }

  if (shouldConvertAllUserWeights) {
    nextProfile.body_weight_unit = targetUnit;
    if (nextProfile.body_weight != null) {
      nextProfile.body_weight = convertWeight(
        Number(nextProfile.body_weight),
        existingProfile.body_weight_unit,
        targetUnit,
        0.1,
      );
    }
  } else {
    nextProfile.body_weight_unit = bodyWeightUnitUpdate;
  }

  db.profiles[index] = nextProfile;
  writeDb(db);
  return db.profiles[index];
};

const attachExercises = (workouts: LocalWorkout[], exercises: LocalExercise[]) =>
  workouts.map((workout) => ({
    ...workout,
    exercises: exercises
      .filter((exercise) => exercise.workout_id === workout.id)
      .sort((a, b) => a.order_index - b.order_index),
  }));

export const getWorkouts = async (
  userId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    includeExercises?: boolean;
    limit?: number;
  },
) => {
  const db = readDb();
  let workouts = db.workouts.filter((workout) => workout.user_id === userId);

  if (options?.startDate) {
    workouts = workouts.filter((workout) => workout.date >= options.startDate!);
  }
  if (options?.endDate) {
    workouts = workouts.filter((workout) => workout.date <= options.endDate!);
  }

  workouts = workouts.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.created_at.localeCompare(a.created_at);
  });

  if (options?.limit) {
    workouts = workouts.slice(0, options.limit);
  }

  return options?.includeExercises ? attachExercises(workouts, db.exercises) : workouts;
};

export const saveWorkout = async (
  userId: string,
  input: {
    title: string;
    date: string;
    duration_minutes: number;
    notes?: string | null;
    exercises: Array<{
      name: string;
      muscle_group?: string;
      exercise_db_id?: string | null;
      completed_sets: Array<{ reps: number; weight: number; unit?: ExerciseSetUnit }>;
    }>;
  },
) => {
  const db = readDb();
  const validExercises = input.exercises
    .map((exercise) => ({
      ...exercise,
      completed_sets: (exercise.completed_sets || []).filter(
        (set) => Number(set.reps || 0) > 0 || Number(set.weight || 0) > 0,
      ),
    }))
    .filter((exercise) => exercise.completed_sets.length > 0);

  if (validExercises.length === 0) {
    throw new Error('Complete at least one set before saving.');
  }

  const workoutId = createId();
  const createdAt = nowIso();
  const muscle_groups = Array.from(
    new Set(validExercises.map((exercise) => exercise.muscle_group).filter(Boolean) as string[]),
  );

  const workout: LocalWorkout = {
    id: workoutId,
    user_id: userId,
    title: input.title,
    date: input.date,
    duration_minutes: Math.max(0, input.duration_minutes),
    notes: input.notes || null,
    muscle_groups,
    created_at: createdAt,
  };

  db.workouts.push(workout);

  let orderIndex = 0;
  validExercises.forEach((exercise) => {
    exercise.completed_sets.forEach((set) => {
      db.exercises.push({
        id: createId(),
        workout_id: workoutId,
        name: exercise.name,
        muscle_group: exercise.muscle_group || null,
        sets: 1,
        reps: set.reps,
        weight: set.weight || 0,
        unit: set.unit || 'lbs',
        order_index: orderIndex++,
        exercise_db_id: exercise.exercise_db_id || null,
      });

      const existingPr = db.personalRecords.find(
        (record) => record.user_id === userId && record.exercise_name === exercise.name,
      );

      const shouldReplace =
        !existingPr ||
        set.weight > existingPr.best_weight ||
        (set.weight === existingPr.best_weight && set.reps > existingPr.best_reps);

      if (shouldReplace) {
        const nextRecord: LocalPersonalRecord = {
          id: existingPr?.id || createId(),
          user_id: userId,
          exercise_name: exercise.name,
          best_weight: set.weight || 0,
          best_reps: set.reps,
          achieved_date: input.date,
          created_at: existingPr?.created_at || createdAt,
          exercise_db_id: exercise.exercise_db_id || null,
        };

        if (existingPr) {
          const index = db.personalRecords.findIndex((record) => record.id === existingPr.id);
          db.personalRecords[index] = nextRecord;
        } else {
          db.personalRecords.push(nextRecord);
        }
      }
    });
  });

  writeDb(db);
  return workout;
};

export const deleteWorkout = async (userId: string, workoutId: string) => {
  const db = readDb();
  db.workouts = db.workouts.filter((workout) => !(workout.id === workoutId && workout.user_id === userId));
  db.exercises = db.exercises.filter((exercise) => exercise.workout_id !== workoutId);
  writeDb(db);
};

export const updateWorkoutSets = async (
  userId: string,
  workoutId: string,
  exercises: Array<{
    name: string;
    muscle_group?: string;
    exercise_db_id?: string | null;
    completed_sets: Array<{ reps: number; weight: number; unit?: ExerciseSetUnit }>;
  }>,
): Promise<{ workout: LocalWorkout; exercises: LocalExercise[] }> => {
  const db = readDb();
  const workout = db.workouts.find((w) => w.id === workoutId && w.user_id === userId);
  if (!workout) throw new Error('Workout not found.');

  const valid = exercises
    .map((ex) => ({
      ...ex,
      completed_sets: (ex.completed_sets || []).filter(
        (s) => Number(s.reps || 0) > 0 || Number(s.weight || 0) > 0,
      ),
    }))
    .filter((ex) => ex.completed_sets.length > 0);

  // Replace this workout's exercise rows
  db.exercises = db.exercises.filter((e) => e.workout_id !== workoutId);
  const rows: LocalExercise[] = [];
  let order = 0;
  valid.forEach((ex) => {
    ex.completed_sets.forEach((set) => {
      rows.push({
        id: createId(),
        workout_id: workoutId,
        name: ex.name,
        muscle_group: ex.muscle_group || null,
        sets: 1,
        reps: set.reps,
        weight: set.weight || 0,
        unit: set.unit || 'lbs',
        order_index: order++,
        exercise_db_id: ex.exercise_db_id || null,
      } as LocalExercise);
    });
  });
  db.exercises.push(...rows);

  workout.muscle_groups = Array.from(
    new Set(valid.map((ex) => ex.muscle_group).filter(Boolean) as string[]),
  );

  writeDb(db);
  return { workout, exercises: rows };
};

export const getTemplates = async (userId: string) => {
  const db = readDb();
  return db.templates
    .filter((template) => template.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((template) => ({
      ...template,
      template_exercises: db.templateExercises
        .filter((exercise) => exercise.template_id === template.id)
        .sort((a, b) => a.order_index - b.order_index),
    }));
};

export const checkTemplateNameExists = async (
  userId: string,
  title: string,
  excludeId?: string | null,
): Promise<boolean> => {
  const db = readDb();
  return db.templates.some(
    (t) =>
      t.user_id === userId &&
      t.title.trim().toLowerCase() === title.trim().toLowerCase() &&
      t.id !== excludeId,
  );
};

export const saveTemplate = async (
  userId: string,
  input: {
    templateId?: string | null;
    title: string;
    exercises: Array<{
      name: string;
      muscle_group?: string | null;
      default_sets: number;
      default_reps: number;
      default_weight: number;
      exercise_db_id?: string | null;
      order_index: number;
    }>;
  },
) => {
  const db = readDb();
  const templateId = input.templateId || createId();
  const templateIndex = db.templates.findIndex((template) => template.id === templateId);

  if (templateIndex === -1) {
    db.templates.push({
      id: templateId,
      user_id: userId,
      title: input.title,
      created_at: nowIso(),
    });
  } else {
    db.templates[templateIndex] = {
      ...db.templates[templateIndex],
      title: input.title,
    };
  }

  db.templateExercises = db.templateExercises.filter((exercise) => exercise.template_id !== templateId);
  input.exercises.forEach((exercise) => {
    db.templateExercises.push({
      id: createId(),
      template_id: templateId,
      name: exercise.name,
      muscle_group: exercise.muscle_group || null,
      default_sets: exercise.default_sets,
      default_reps: exercise.default_reps,
      default_weight: exercise.default_weight,
      order_index: exercise.order_index,
      exercise_db_id: exercise.exercise_db_id || null,
    });
  });

  writeDb(db);
  return templateId;
};

export const deleteTemplate = async (userId: string, templateId: string) => {
  const db = readDb();
  db.templates = db.templates.filter((template) => !(template.id === templateId && template.user_id === userId));
  db.templateExercises = db.templateExercises.filter((exercise) => exercise.template_id !== templateId);
  writeDb(db);
};

export const getBodyWeightLogs = async (userId: string) => {
  const db = readDb();
  return db.bodyWeightLogs
    .filter((log) => log.user_id === userId)
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const logBodyWeight = async (userId: string, input: { date: string; weight: number; unit?: 'kg' | 'lbs'; notes?: string | null }) => {
  const db = readDb();
  const existingIndex = db.bodyWeightLogs.findIndex(
    (log) => log.user_id === userId && log.date === input.date,
  );

  const nextLog: LocalBodyWeightLog = {
    id: existingIndex >= 0 ? db.bodyWeightLogs[existingIndex].id : createId(),
    user_id: userId,
    date: input.date,
    weight: input.weight,
    unit: input.unit || 'lbs',
    notes: input.notes || null,
    created_at: existingIndex >= 0 ? db.bodyWeightLogs[existingIndex].created_at : nowIso(),
  };

  if (existingIndex >= 0) {
    db.bodyWeightLogs[existingIndex] = nextLog;
  } else {
    db.bodyWeightLogs.push(nextLog);
  }

  writeDb(db);
  return nextLog;
};

export const updateBodyWeightLog = async (
  _userId: string,
  id: string,
  input: { weight: number; unit: 'kg' | 'lbs'; notes?: string | null },
): Promise<LocalBodyWeightLog> => {
  const db = readDb();
  const idx = db.bodyWeightLogs.findIndex((l) => l.id === id);
  if (idx < 0) throw new Error('Weight log not found');
  db.bodyWeightLogs[idx] = { ...db.bodyWeightLogs[idx], ...input };
  writeDb(db);
  return db.bodyWeightLogs[idx];
};

export const getPersonalRecords = async (userId: string, options?: { startDate?: string; endDate?: string }) => {
  const db = readDb();
  return db.personalRecords
    .filter((record) => record.user_id === userId)
    .filter((record) => !options?.startDate || record.achieved_date >= options.startDate)
    .filter((record) => !options?.endDate || record.achieved_date <= options.endDate)
    .sort((a, b) => b.achieved_date.localeCompare(a.achieved_date));
};

export const getExerciseRowsWithWorkoutDates = async (userId: string) => {
  const db = readDb();
  return db.exercises
    .map((exercise) => {
      const workout = db.workouts.find((item) => item.id === exercise.workout_id);
      return workout && workout.user_id === userId
        ? {
            ...exercise,
            workouts: { date: workout.date },
            workout_id: workout.id,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.workouts.date.localeCompare(b!.workouts.date)) as Array<
    LocalExercise & { workouts: { date: string } }
  >;
};

const inferMuscleGroupFromName = (db: LocalDatabase, userId: string, exerciseName: string) => {
  const libraryMatch = db.exerciseLibrary.find(
    (exercise) =>
      exercise.name.toLowerCase() === exerciseName.toLowerCase() &&
      (!exercise.is_custom || exercise.user_id === userId),
  );

  if (libraryMatch) return libraryMatch.muscle_group;

  const priorExercise = db.exercises.find((exercise) => {
    const workout = db.workouts.find((item) => item.id === exercise.workout_id);
    return (
      workout?.user_id === userId &&
      exercise.name.toLowerCase() === exerciseName.toLowerCase() &&
      exercise.muscle_group
    );
  });

  if (priorExercise?.muscle_group) return priorExercise.muscle_group;

  return getExerciseMuscleProfile(exerciseName).primary[0] || 'Core';
};

export const getLastExerciseSession = async (userId: string, exerciseName: string) => {
  const rows = await getExerciseRowsWithWorkoutDates(userId);
  const matches = rows
    .filter((row) => row.name === exerciseName)
    .sort((a, b) => {
      if (a.workouts.date !== b.workouts.date) return b.workouts.date.localeCompare(a.workouts.date);
      return b.order_index - a.order_index;
    });

  if (matches.length === 0) return null;

  const latestWorkoutId = matches[0].workout_id;
  const sessionRows = matches
    .filter((row) => row.workout_id === latestWorkoutId)
    .sort((a, b) => a.order_index - b.order_index);

  const lastRow = sessionRows[sessionRows.length - 1];
  const totalVolume = sessionRows.reduce((sum, row) => sum + row.weight * row.reps * row.sets, 0);

  return {
    name: lastRow.name,
    muscleGroup: lastRow.muscle_group || 'Core',
    exercise_db_id: lastRow.exercise_db_id || null,
    lastSession: {
      date: lastRow.workouts.date,
      sets: sessionRows.length,
      reps: lastRow.reps,
      weight: lastRow.weight,
      totalVolume,
    },
  };
};

export const getExerciseLibraryByGroup = async (userId: string, muscleGroup: string) => {
  const db = readDb();
  return db.exerciseLibrary
    .filter((exercise) => exercise.muscle_group === muscleGroup)
    .filter((exercise) => !exercise.is_custom || exercise.user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const addCustomExercise = async (
  userId: string,
  name: string,
  muscleGroup: string,
  muscleSlugs: { slug: string; type: 'primary' | 'secondary' }[] = [],
) => {
  const db = readDb();
  const normalized = name.trim();
  const normalizedName = normalizeExerciseName(normalized);
  const openTrainingId = OPENTRAINING_ID_BY_NAME[normalizedName] || null;
  const openTrainingAsset = openTrainingId ? OPENTRAINING_ASSETS_BY_ID[openTrainingId] : null;
  const matchedAssetId =
    openTrainingAsset && openTrainingAsset.muscleGroup === muscleGroup ? openTrainingId : null;
  const existing = db.exerciseLibrary.find(
    (exercise) =>
      exercise.muscle_group === muscleGroup &&
      exercise.name.toLowerCase() === normalized.toLowerCase() &&
      (!exercise.is_custom || exercise.user_id === userId),
  );

  if (existing) return existing;

  const item: LocalExerciseLibraryItem = {
    id: createId(),
    name: normalized,
    muscle_group: muscleGroup,
    is_custom: true,
    user_id: userId,
    exercise_db_id: matchedAssetId,
    muscle_slugs: muscleSlugs,
  };

  db.exerciseLibrary.push(item);
  writeDb(db);
  return item;
};

export const searchExerciseLibrary = async (userId: string, query: string) => {
  const db = readDb();
  const eligible = db.exerciseLibrary.filter((ex) => !ex.is_custom || ex.user_id === userId);
  if (!query.trim()) return [...eligible].sort((a, b) => a.name.localeCompare(b.name));
  return fuzzyFilter(eligible, query, (ex) => ex.name);
};

export const getRecentExerciseOptions = async (userId: string): Promise<LocalExerciseSessionSummary[]> => {
  const db = readDb();
  const recentRows = db.exercises
    .map((exercise) => {
      const workout = db.workouts.find((item) => item.id === exercise.workout_id);
      return workout && workout.user_id === userId
        ? {
            ...exercise,
            workout_date: workout.date,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a!.workout_date !== b!.workout_date) return b!.workout_date.localeCompare(a!.workout_date);
      return b!.order_index - a!.order_index;
    }) as Array<LocalExercise & { workout_date: string }>;

  const seen = new Set<string>();
  const options: LocalExerciseSessionSummary[] = [];

  for (const row of recentRows) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const summary = await getLastExerciseSession(userId, row.name);
    options.push(
      summary || {
        name: row.name,
        muscleGroup: row.muscle_group || inferMuscleGroupFromName(db, userId, row.name),
        exercise_db_id: row.exercise_db_id || null,
      },
    );
  }

  return options.slice(0, 12);
};

export const buildExercisesFromWorkout = async (userId: string, workoutId: string) => {
  const db = readDb();
  const rows = db.exercises
    .filter((exercise) => exercise.workout_id === workoutId)
    .sort((a, b) => a.order_index - b.order_index);

  const grouped = new Map<
    string,
    {
      name: string;
      muscleGroup: string;
      exercise_db_id?: string | null;
      sets: Array<{ weight: number; reps: number; done: boolean }>;
    }
  >();

  rows.forEach((row) => {
    const key = `${row.name}::${row.exercise_db_id || ''}::${row.muscle_group || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: row.name,
        muscleGroup: row.muscle_group || inferMuscleGroupFromName(db, userId, row.name),
        exercise_db_id: row.exercise_db_id || null,
        sets: [],
      });
    }

    grouped.get(key)!.sets.push({
      weight: row.weight,
      reps: row.reps,
      done: false,
    });
  });

  return Array.from(grouped.values());
};

export const getDashboardLayout = async (userId: string) => {
  const db = readDb();
  return db.dashboardLayouts.find((layout) => layout.user_id === userId)?.layout ?? null;
};

export const saveDashboardLayout = async (userId: string, layout: typeof DEFAULT_LAYOUT) => {
  const db = readDb();
  const index = db.dashboardLayouts.findIndex((entry) => entry.user_id === userId);
  const nextLayout: LocalDashboardLayout = {
    user_id: userId,
    layout,
    updated_at: nowIso(),
  };

  if (index >= 0) {
    db.dashboardLayouts[index] = nextLayout;
  } else {
    db.dashboardLayouts.push(nextLayout);
  }

  writeDb(db);
};

const trimHeartRateSamplesForUser = (db: LocalDatabase, userId: string) => {
  const userSamples = db.heartRateSamples
    .filter((sample) => sample.user_id === userId)
    .sort((a, b) => a.ts - b.ts);

  if (userSamples.length <= MAX_HEART_RATE_SAMPLES_PER_USER) return;

  const keepIds = new Set(
    userSamples.slice(-MAX_HEART_RATE_SAMPLES_PER_USER).map((sample) => sample.id),
  );

  db.heartRateSamples = db.heartRateSamples.filter(
    (sample) => sample.user_id !== userId || keepIds.has(sample.id),
  );
};

export const startHeartRateSession = async (
  userId: string,
  deviceName: string,
) => {
  const db = readDb();
  const now = nowIso();

  db.heartRateSessions = db.heartRateSessions.map((session) => {
    if (session.user_id !== userId || session.disconnected_at) return session;
    return {
      ...session,
      disconnected_at: now,
      updated_at: now,
      last_seen_at: now,
    };
  });

  const nextSession: LocalHeartRateSession = {
    id: createId(),
    user_id: userId,
    device_name: deviceName || 'Heart Rate Device',
    connected_at: now,
    disconnected_at: null,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
  };

  db.heartRateSessions.push(nextSession);
  writeDb(db);
  return nextSession;
};

export const endHeartRateSession = async (
  userId: string,
  sessionId?: string | null,
) => {
  const db = readDb();
  const now = nowIso();

  db.heartRateSessions = db.heartRateSessions.map((session) => {
    if (session.user_id !== userId) return session;
    if (sessionId && session.id !== sessionId) return session;
    if (session.disconnected_at) return session;
    return {
      ...session,
      disconnected_at: now,
      last_seen_at: now,
      updated_at: now,
    };
  });

  writeDb(db);
};

export const appendHeartRateSamples = async (
  userId: string,
  sessionId: string,
  samples: Array<{ ts: number; bpm: number }>,
) => {
  if (!samples.length) return 0;

  const db = readDb();
  const sessionIndex = db.heartRateSessions.findIndex(
    (session) => session.id === sessionId && session.user_id === userId,
  );

  if (sessionIndex === -1) return 0;

  const cleaned = samples
    .map((sample) => ({
      ts: Number(sample.ts),
      bpm: Number(sample.bpm),
    }))
    .filter((sample) => Number.isFinite(sample.ts) && Number.isFinite(sample.bpm))
    .filter((sample) => sample.ts > 0 && sample.bpm > 0)
    .sort((a, b) => a.ts - b.ts);

  if (!cleaned.length) return 0;

  const minTs = cleaned[0].ts - 2500;
  const existingKeys = new Set(
    db.heartRateSamples
      .filter((sample) => sample.user_id === userId && sample.session_id === sessionId)
      .filter((sample) => sample.ts >= minTs)
      .map((sample) => `${sample.ts}:${sample.bpm}`),
  );

  const createdAt = nowIso();
  let inserted = 0;
  cleaned.forEach((sample) => {
    const roundedTs = Math.round(sample.ts);
    const roundedBpm = Math.round(sample.bpm);
    const key = `${roundedTs}:${roundedBpm}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);
    db.heartRateSamples.push({
      id: createId(),
      user_id: userId,
      session_id: sessionId,
      ts: roundedTs,
      bpm: roundedBpm,
      created_at: createdAt,
    });
    inserted += 1;
  });

  if (inserted === 0) return 0;

  const lastSeenTs = cleaned[cleaned.length - 1].ts;
  db.heartRateSessions[sessionIndex] = {
    ...db.heartRateSessions[sessionIndex],
    last_seen_at: new Date(lastSeenTs).toISOString(),
    updated_at: nowIso(),
  };

  trimHeartRateSamplesForUser(db, userId);
  writeDb(db);
  return inserted;
};

export const getHeartRateSamples = async (
  userId: string,
  options?: {
    sessionId?: string | null;
    sinceTs?: number;
    untilTs?: number;
    limit?: number;
  },
) => {
  const db = readDb();
  let rows = db.heartRateSamples
    .filter((sample) => sample.user_id === userId)
    .filter((sample) => !options?.sessionId || sample.session_id === options.sessionId)
    .filter((sample) => options?.sinceTs == null || sample.ts >= options.sinceTs)
    .filter((sample) => options?.untilTs == null || sample.ts <= options.untilTs)
    .sort((a, b) => a.ts - b.ts);

  if (options?.limit && options.limit > 0 && rows.length > options.limit) {
    rows = rows.slice(-options.limit);
  }

  return rows;
};

export const getLatestHeartRateSession = async (userId: string) => {
  const db = readDb();
  const sessions = db.heartRateSessions
    .filter((session) => session.user_id === userId)
    .sort((a, b) => b.connected_at.localeCompare(a.connected_at));
  return sessions[0] ?? null;
};

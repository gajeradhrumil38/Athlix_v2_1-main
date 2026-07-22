import { DEFAULT_LAYOUT } from '../config/widgets';
import {
  OPENTRAINING_ASSETS_BY_ID,
  OPENTRAINING_EXERCISES,
  OPENTRAINING_ID_BY_NAME,
  normalizeExerciseName,
} from '../data/opentrainingCatalog';
import { getExerciseMuscleProfile } from './exerciseMuscles';
import { fuzzyFilter } from './fuzzySearch';
import * as localData from './localData';
import { hasSupabaseConfig, supabase } from './supabase';
import { convertWeight, isWeightUnit, type WeightUnit } from './units';

export type LocalUser = localData.LocalUser;
export type LocalProfile = localData.LocalProfile;
export type LocalWorkout = localData.LocalWorkout;
export type LocalExercise = localData.LocalExercise;
export type ExerciseSetUnit = localData.ExerciseSetUnit;
export type LocalTemplate = localData.LocalTemplate;
export type LocalTemplateExercise = localData.LocalTemplateExercise;
export type LocalBodyWeightLog = localData.LocalBodyWeightLog;
export type LocalPersonalRecord = localData.LocalPersonalRecord;
export type LocalExerciseSessionSummary = localData.LocalExerciseSessionSummary;
export type LocalExerciseLibraryItem = localData.LocalExerciseLibraryItem;
export type LocalHeartRateSession = localData.LocalHeartRateSession;
export type LocalHeartRateSample = localData.LocalHeartRateSample;

type RawRecord = Record<string, any>;

type LegacyDb = {
  users?: Array<{ id: string; email: string }>;
  profiles?: LocalProfile[];
  workouts?: LocalWorkout[];
  exercises?: LocalExercise[];
  templates?: LocalTemplate[];
  templateExercises?: LocalTemplateExercise[];
  bodyWeightLogs?: LocalBodyWeightLog[];
  personalRecords?: LocalPersonalRecord[];
  exerciseLibrary?: LocalExerciseLibraryItem[];
  heartRateSessions?: LocalHeartRateSession[];
  heartRateSamples?: LocalHeartRateSample[];
  dashboardLayouts?: Array<{ user_id: string; layout: typeof DEFAULT_LAYOUT; updated_at: string }>;
};

const DB_KEY = 'athlix_local_db_v1';
const MIGRATION_KEY_PREFIX = 'athlix_supabase_migrated_v1';
const MAX_HEART_RATE_SAMPLES_PER_USER = 50000;

const authListeners = new Set<(user: LocalUser | null) => void>();
const unsupportedColumnsByTable = new Map<string, Set<string>>();
const migrationByUser = new Map<string, Promise<void>>();

const DEFAULT_EXERCISES: Record<string, string[]> = {
  Chest: [
    'Bench Press',
    'Dumbbell Bench Press',
    'Incline Bench Press',
    'Incline Dumbbell Press',
    'Decline Bench Press',
    'Smith Machine Bench Press',
    'Cable Fly',
    'Low Cable Fly',
    'High Cable Fly',
    'Dumbbell Fly',
    'Incline Dumbbell Fly',
    'Push-Ups',
    'Chest Dips',
    'Machine Chest Press',
    'Pec Deck',
    'Landmine Press',
    'Cable Chest Press',
  ],
  Back: [
    'Deadlift',
    'Pull-Ups',
    'Chin-Ups',
    'Neutral Grip Pull-Up',
    'Inverted Row',
    'Lat Pulldown',
    'Close Grip Lat Pulldown',
    'Single Arm Lat Pulldown',
    'Seated Cable Row',
    'Single Arm Cable Row',
    'Bent Over Row',
    'Single Arm Dumbbell Row',
    'Chest Supported Row',
    'T-Bar Row',
    'Meadows Row',
    'Pendlay Row',
    'Rack Pull',
    'Romanian Deadlift',
    'Straight Arm Pulldown',
    'Back Extension',
    'Reverse Hyper',
    'Barbell Shrug',
    'Dumbbell Shrug',
    'Cable Shrug',
    'Good Mornings',
  ],
  Shoulders: [
    'Overhead Press',
    'Dumbbell Shoulder Press',
    'Seated Dumbbell Press',
    'Arnold Press',
    'Smith Machine Shoulder Press',
    'Machine Shoulder Press',
    'Lateral Raise',
    'Cable Lateral Raise',
    'Machine Lateral Raise',
    'Cable Y Raise',
    'Front Raise',
    'Face Pull',
    'Cable Face Pull',
    'Reverse Pec Deck',
    'Rear Delt Fly',
    'Dumbbell Rear Delt Fly',
    'Upright Row',
    'Band Pull Apart',
    'Pike Push-Up',
  ],
  Biceps: [
    'Barbell Curl',
    'Dumbbell Curl',
    'Alternating Dumbbell Curl',
    'Hammer Curl',
    'Cross Body Hammer Curl',
    'Preacher Curl',
    'Machine Preacher Curl',
    'Cable Curl',
    'High Cable Curl',
    'EZ Bar Curl',
    'Spider Curl',
    'Concentration Curl',
    'Incline Dumbbell Curl',
    'Bayesian Curl',
    'Zottman Curl',
    'Reverse Curl',
    'Machine Bicep Curl',
  ],
  Triceps: [
    'Tricep Pushdown',
    'Cable Rope Pushdown',
    'Single Arm Pushdown',
    'Reverse Grip Pushdown',
    'Skull Crushers',
    'EZ Bar Skull Crusher',
    'Overhead Tricep Extension',
    'Overhead Cable Extension',
    'Dumbbell Overhead Extension',
    'Close Grip Bench Press',
    'JM Press',
    'Tate Press',
    'Dumbbell Kickback',
    'Cable Kickback',
    'Tricep Dips',
    'Dips',
  ],
  Glutes: [
    'Hip Thrust',
    'Barbell Hip Thrust',
    'Machine Hip Thrust',
    'Single Leg Hip Thrust',
    'Glute Bridge',
    'Weighted Glute Bridge',
    'Glute Kickback (Machine)',
    'Cable Hip Extension',
    'Donkey Kick',
    'Fire Hydrant',
    'Clamshell',
    'Side Lying Hip Abduction',
    'Cable Hip Abduction',
    'Hip Abduction Machine',
    'Sumo Deadlift',
    'Romanian Deadlift',
    'Single Leg Romanian Deadlift',
  ],
  Legs: [
    'Squat',
    'Barbell Back Squat',
    'Front Squat',
    'Smith Machine Squat',
    'Hack Squat',
    'Goblet Squat',
    'Bulgarian Split Squat',
    'Split Squat',
    'Reverse Lunge',
    'Walking Lunge',
    'Step Up',
    'Sissy Squat',
    'Leg Press',
    'Single Leg Press',
    'Leg Extension',
    'Lying Leg Curl',
    'Seated Leg Curl',
    'Nordic Hamstring Curl',
    'Hip Adduction Machine',
    'Hip Adduction',
    'Seated Hip Adduction',
    'Inner Thigh Squeeze',
    'Adductor Machine',
    'Reverse Nordic',
    'Terminal Knee Extension',
    'VMO Squat',
    'Standing Calf Raise',
    'Seated Calf Raise',
    'Calf Raises',
    'Leg Press Calf Raise',
    'Box Jump',
    'Jump Squat',
    'Sled Push',
    'Tibialis Raise',
    'Ankle Dorsiflexion',
    'Hip Circle',
  ],
  Core: [
    'Plank',
    'Side Plank',
    'Copenhagen Plank',
    'Hollow Hold',
    'L-Sit',
    'Crunches',
    'Weighted Crunch',
    'Decline Crunch',
    'Reverse Crunch',
    'Bicycle Crunch',
    'Russian Twist',
    'V-Up',
    'Hanging Knee Raise',
    'Hanging Leg Raise',
    'Toes to Bar',
    'Ab Wheel Rollout',
    'Cable Crunch',
    'Dead Bug',
    'Bird Dog',
    'Dragon Flag',
    'Pallof Press',
    'Landmine Rotation',
    'Woodchop',
    'Mountain Climbers',
    'Sit-Ups',
  ],
  Forearms: [
    'Wrist Curl',
    'Reverse Wrist Curl',
    'Wrist Roller',
    'Farmers Carry',
    'Plate Pinch',
    'Finger Curls',
    'Wrist Extension',
    'Grip Training',
  ],
  Cardio: [
    'Treadmill',
    'Running (Outdoor)',
    'Cycling',
    'Rowing Machine',
    'Elliptical',
    'Stairmaster',
    'Stair Climber',
    'Assault Bike',
    'Ski Erg',
    'Jump Rope',
    'Battle Ropes',
    'Farmers Walk',
    'Sled Pull',
    'Swimming',
    'Walking',
    'HIIT',
    'Boxing',
    'Sprint Intervals',
  ],
  Mobility: [
    'Ankle Circles',
    'Ankle Dorsiflexion Stretch',
    'Calf Stretch',
    'Knee Flexion',
    'Hip Circle',
    'Hip Flexor Stretch',
    '90/90 Hip Stretch',
    'Couch Stretch',
    'Figure 4 Stretch',
    'World\'s Greatest Stretch',
    'Thoracic Rotation',
    'Thoracic Extension',
    'Cat Cow',
    'Thread the Needle',
    'Band Distraction Hip',
    'Shoulder Circles',
    'Neck Rolls',
    'Wrist Circles',
    'Foam Rolling',
    'Lacrosse Ball Massage',
  ],
  Yoga: [
    'Sun Salutation',
    'Vinyasa Flow',
    'Yin Yoga',
    'Power Yoga',
    'Yoga',
    'Warrior I',
    'Warrior II',
    'Warrior III',
    'Triangle Pose',
    'Tree Pose',
    'Chair Pose',
    'Mountain Pose',
    'Eagle Pose',
    'Downward Dog',
    'Upward Dog',
    'Cobra Pose',
    'Camel Pose',
    'Wheel Pose',
    'Bridge Pose',
    'Bow Pose',
    'Pigeon Pose',
    'Seated Forward Fold',
    'Butterfly Stretch',
    'Supine Twist',
    'Child\'s Pose',
    'Happy Baby',
    'Legs Up the Wall',
    'Corpse Pose',
    'Hamstring Stretch',
    'Quad Stretch',
    'Chest Opener',
    'Shoulder Stretch',
    'Lateral Lunge Stretch',
    'Doorway Chest Stretch',
    'Meditation',
  ],
};

// ── Exercise aliases ──────────────────────────────────────────────────────────
// Maps common search terms / alternate names → canonical exercise name.
// Used in search so "flat bench", "RDL", "pec deck" etc. find the right exercise.
const EXERCISE_ALIASES: Record<string, string> = {
  // Chest
  'flat bench':           'Bench Press',
  'flat press':           'Bench Press',
  'barbell bench':        'Bench Press',
  'bb bench':             'Bench Press',
  'barbell press':        'Bench Press',
  'db bench':             'Dumbbell Bench Press',
  'dumbbell press':       'Dumbbell Bench Press',
  'incline press':        'Incline Bench Press',
  'incline db press':     'Incline Dumbbell Press',
  'decline press':        'Decline Bench Press',
  'smith bench':          'Smith Machine Bench Press',
  'pec deck':             'Pec Deck',
  'pec dec':              'Pec Deck',
  'chest fly machine':    'Pec Deck',
  'machine fly':          'Pec Deck',
  'cable crossover':      'Cable Fly',
  'chest crossover':      'Cable Fly',
  'db fly':               'Dumbbell Fly',
  // Back
  'rdl':                  'Romanian Deadlift',
  'romanian dl':          'Romanian Deadlift',
  'slrdl':                'Single Leg Romanian Deadlift',
  'sl rdl':               'Single Leg Romanian Deadlift',
  'pulldown':             'Lat Pulldown',
  'lat pull':             'Lat Pulldown',
  'cable pulldown':       'Lat Pulldown',
  'barbell row':          'Bent Over Row',
  'bb row':               'Bent Over Row',
  'bent row':             'Bent Over Row',
  'db row':               'Single Arm Dumbbell Row',
  'one arm row':          'Single Arm Dumbbell Row',
  'single arm row':       'Single Arm Dumbbell Row',
  'tbar row':             'T-Bar Row',
  't bar row':            'T-Bar Row',
  'back ext':             'Back Extension',
  'hyperextension':       'Back Extension',
  'hyper':                'Reverse Hyper',
  'straight arm':         'Straight Arm Pulldown',
  'pullover':             'Straight Arm Pulldown',
  'banded pull apart':    'Band Pull Apart',
  'chin up':              'Chin-Ups',
  'chinup':               'Chin-Ups',
  'pull up':              'Pull-Ups',
  'pullup':               'Pull-Ups',
  // Shoulders
  'ohp':                  'Overhead Press',
  'military press':       'Overhead Press',
  'bb press':             'Overhead Press',
  'barbell ohp':          'Overhead Press',
  'db shoulder press':    'Dumbbell Shoulder Press',
  'db press':             'Dumbbell Shoulder Press',
  'lateral':              'Lateral Raise',
  'side raise':           'Lateral Raise',
  'side lateral':         'Lateral Raise',
  'db lateral':           'Lateral Raise',
  'rear delt':            'Rear Delt Fly',
  'reverse fly':          'Rear Delt Fly',
  'reverse delt fly':     'Rear Delt Fly',
  'pec deck rear':        'Reverse Pec Deck',
  'face pulls':           'Face Pull',
  'cable face pulls':     'Cable Face Pull',
  'front raises':         'Front Raise',
  // Biceps
  'bicep curl':           'Barbell Curl',
  'bb curl':              'Barbell Curl',
  'barbell bicep':        'Barbell Curl',
  'db curl':              'Dumbbell Curl',
  'alt curl':             'Alternating Dumbbell Curl',
  'alternating curl':     'Alternating Dumbbell Curl',
  'hammer':               'Hammer Curl',
  'cross body':           'Cross Body Hammer Curl',
  'preacher':             'Preacher Curl',
  'spider':               'Spider Curl',
  'concentration':        'Concentration Curl',
  'cable bicep':          'Cable Curl',
  'high cable':           'High Cable Curl',
  'bayesian':             'Bayesian Curl',
  'zottman':              'Zottman Curl',
  // Triceps
  'pushdown':             'Tricep Pushdown',
  'tricep cable':         'Cable Rope Pushdown',
  'rope pushdown':        'Cable Rope Pushdown',
  'skull crusher':        'Skull Crushers',
  'skullcrusher':         'Skull Crushers',
  'jm press':             'JM Press',
  'french press':         'Overhead Tricep Extension',
  'overhead ext':         'Overhead Tricep Extension',
  'cgbp':                 'Close Grip Bench Press',
  'close grip':           'Close Grip Bench Press',
  'tricep dip':           'Tricep Dips',
  'kickback':             'Dumbbell Kickback',
  // Glutes & Legs
  'hip thrust':           'Barbell Hip Thrust',
  'barbell hip':          'Barbell Hip Thrust',
  'bss':                  'Bulgarian Split Squat',
  'split squat':          'Bulgarian Split Squat',
  'rear foot elevated':   'Bulgarian Split Squat',
  'rfess':                'Bulgarian Split Squat',
  'back squat':           'Squat',
  'bb squat':             'Squat',
  'barbell squat':        'Squat',
  'low bar':              'Squat',
  'high bar':             'Squat',
  'goblet':               'Goblet Squat',
  'sumo':                 'Sumo Deadlift',
  'hack':                 'Hack Squat',
  'leg curl':             'Lying Leg Curl',
  'ham curl':             'Lying Leg Curl',
  'hamstring curl':       'Lying Leg Curl',
  'lying curl':           'Lying Leg Curl',
  'seated curl':          'Seated Leg Curl',
  'quad extension':       'Leg Extension',
  'knee extension':       'Leg Extension',
  'leg ext':              'Leg Extension',
  'nordic':               'Nordic Hamstring Curl',
  'standing calf':        'Standing Calf Raise',
  'seated calf':          'Seated Calf Raise',
  'calf raise':           'Calf Raises',
  'tke':                  'Terminal Knee Extension',
  'step ups':             'Step Up',
  'box step':             'Step Up',
  'glute bridge':         'Glute Bridge',
  'fire hydrant':         'Fire Hydrant',
  'donkey kick':          'Donkey Kick',
  'clamshells':           'Clamshell',
  'hip abduction':        'Hip Abduction Machine',
  'hip adduction':        'Hip Adduction Machine',
  'inner thigh':          'Hip Adduction Machine',
  'outer thigh':          'Hip Abduction Machine',
  'tibialis':             'Tibialis Raise',
  'shin raise':           'Tibialis Raise',
  // Core
  'ab wheel':             'Ab Wheel Rollout',
  'wheel rollout':        'Ab Wheel Rollout',
  'leg raise':            'Hanging Leg Raise',
  'knee raise':           'Hanging Knee Raise',
  'ttb':                  'Toes to Bar',
  'toes to bar':          'Toes to Bar',
  't2b':                  'Toes to Bar',
  'russian twist':        'Russian Twist',
  'hollow':               'Hollow Hold',
  'hollow body':          'Hollow Hold',
  'pallof':               'Pallof Press',
  'l sit':                'L-Sit',
  'dead bug':             'Dead Bug',
  'bird dog':             'Bird Dog',
  'side plank':           'Side Plank',
  'copenhagen':           'Copenhagen Plank',
  'bicycle':              'Bicycle Crunch',
  'reverse crunch':       'Reverse Crunch',
  // Cardio
  'row machine':          'Rowing Machine',
  'concept2':             'Rowing Machine',
  'c2':                   'Rowing Machine',
  'erg':                  'Rowing Machine',
  'skierg':               'Ski Erg',
  'ski machine':          'Ski Erg',
  'jump rope':            'Jump Rope',
  'skipping':             'Jump Rope',
  'skipping rope':        'Jump Rope',
  'battle rope':          'Battle Ropes',
  'farmers':              'Farmers Walk',
  'stair':                'Stairmaster',
  'stairs':               'Stairmaster',
  'stepmill':             'Stair Climber',
  'step machine':         'Stairmaster',
  'air bike':             'Assault Bike',
  'fan bike':             'Assault Bike',
  'echo bike':            'Assault Bike',
  'spin bike':            'Cycling',
  'stationary bike':      'Cycling',
  'peloton':              'Cycling',
  'cross trainer':        'Elliptical',
  // Forearms
  'wrist curl':           'Wrist Curl',
  'reverse wrist':        'Reverse Wrist Curl',
  'farmers carry':        'Farmers Carry',
  'plate pinch':          'Plate Pinch',
  'grip':                 'Grip Training',
  // Mobility
  'ankle circle':         'Ankle Circles',
  'hip flexor':           'Hip Flexor Stretch',
  'couch stretch':        'Couch Stretch',
  'figure 4':             'Figure 4 Stretch',
  'pigeon':               '90/90 Hip Stretch',
  'cat cow':              'Cat Cow',
  'foam roll':            'Foam Rolling',
};

let currentUserCache: LocalUser | null = null;
let authInitialized = false;
let authSubscription: { unsubscribe: () => void } | null = null;
let heartRateTableSupport: boolean | null = null;

const nowIso = () => new Date().toISOString();
const createId = () => crypto.randomUUID();

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const chunk = <T,>(rows: T[], size = 300) => {
  const buckets: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    buckets.push(rows.slice(i, i + size));
  }
  return buckets;
};

const normalizeError = (error: any, fallback: string) => {
  const message = error?.message || error?.error_description || fallback;
  return new Error(String(message));
};

const toLocalUser = (user: { id: string; email?: string | null } | null | undefined): LocalUser | null => {
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email };
};

const makeLibraryKey = (muscleGroup: string, name: string) =>
  `${muscleGroup.toLowerCase()}::${normalizeExerciseName(name)}`;

const inferMuscleGroupFromName = (exerciseName: string) =>
  getExerciseMuscleProfile(exerciseName).primary[0] || 'Core';

const detectMissingColumn = (message: string | undefined) => {
  if (!message) return null;

  const matchers = [
    /Could not find the '([^']+)' column/i,
    /column "([^"]+)" does not exist/i,
    /record "new" has no field "([^"]+)"/i,
    /column ([a-zA-Z0-9_]+) does not exist/i,
  ];

  for (const matcher of matchers) {
    const found = message.match(matcher);
    if (found?.[1]) return found[1];
  }

  return null;
};

const tableHasUnsupportedColumn = (table: string, column: string) =>
  unsupportedColumnsByTable.get(table)?.has(column) ?? false;

const markUnsupportedColumn = (table: string, column: string) => {
  const next = new Set(unsupportedColumnsByTable.get(table) || []);
  next.add(column);
  unsupportedColumnsByTable.set(table, next);
};

const sanitizeRowForTable = (table: string, row: RawRecord) => {
  const unsupported = unsupportedColumnsByTable.get(table);
  if (!unsupported?.size) return row;

  const copy: RawRecord = { ...row };
  for (const column of unsupported) {
    delete copy[column];
  }
  return copy;
};

const dedupeBy = <T,>(rows: T[], keySelector: (value: T) => string) => {
  const map = new Map<string, T>();
  rows.forEach((row) => {
    map.set(keySelector(row), row);
  });
  return Array.from(map.values());
};

const isMissingRelationError = (error: any) => {
  const message = String(error?.message || '');
  return error?.code === '42P01' || message.toLowerCase().includes('does not exist');
};

const withUnsupportedColumnRetry = async <T,>(
  table: string,
  factory: () => Promise<{ data: T | null; error: any }>,
) => {
  let attempts = 0;
  while (attempts < 8) {
    const result = await factory();
    if (!result.error) return result;

    const missingColumn = detectMissingColumn(result.error?.message);
    if (!missingColumn) return result;

    if (tableHasUnsupportedColumn(table, missingColumn)) {
      return result;
    }

    markUnsupportedColumn(table, missingColumn);
    attempts += 1;
  }

  return { data: null, error: new Error(`Could not complete operation for ${table}`) as any };
};

const upsertRows = async (table: string, rows: RawRecord[], onConflict?: string) => {
  if (!rows.length) return;

  const batches = chunk(rows);
  for (const batch of batches) {
    const originalBatch = batch;
    const result = await withUnsupportedColumnRetry(table, async () => {
      const payload = originalBatch.map((row) => sanitizeRowForTable(table, row));
      if (!payload.length) return { data: null, error: null };
      return supabase.from(table).upsert(payload, onConflict ? { onConflict } : undefined);
    });

    if (result.error) {
      throw normalizeError(result.error, `Failed to upsert ${table}.`);
    }
  }
};

const insertRows = async (table: string, rows: RawRecord[]) => {
  if (!rows.length) return;

  for (const batch of chunk(rows)) {
    const originalBatch = batch;
    const result = await withUnsupportedColumnRetry(table, async () => {
      const payload = originalBatch.map((row) => sanitizeRowForTable(table, row));
      if (!payload.length) return { data: null, error: null };
      return supabase.from(table).insert(payload);
    });

    if (result.error) {
      throw normalizeError(result.error, `Failed to insert ${table}.`);
    }
  }
};

const updateRows = async (table: string, match: RawRecord, updates: RawRecord) => {
  const result = await withUnsupportedColumnRetry(table, async () => {
    const payload = sanitizeRowForTable(table, updates);
    if (!Object.keys(payload).length) {
      return { data: null, error: null };
    }

    let query = supabase.from(table).update(payload);
    Object.entries(match).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    return query;
  });

  if (result.error) {
    throw normalizeError(result.error, `Failed to update ${table}.`);
  }
};

const fetchByIds = async (table: string, ids: string[], select = '*') => {
  if (!ids.length) return [] as RawRecord[];

  const rows: RawRecord[] = [];
  for (const batch of chunk(ids, 400)) {
    const { data, error } = await supabase.from(table).select(select).in('id', batch);
    if (error) throw normalizeError(error, `Failed to query ${table}.`);
    rows.push(...(data || []));
  }
  return rows;
};

/** Returns the current page's base URL (before the hash) so redirects always work regardless of deploy path. */
const getAppUrl = (): string =>
  typeof window !== 'undefined'
    ? window.location.href.split('#')[0]
    : 'https://athlix-v2-1.vercel.app/legacy-app/';

const ensureSupabaseAuthInitialized = () => {
  if (!hasSupabaseConfig || authInitialized) return;
  authInitialized = true;

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const nextUser = toLocalUser(session?.user);
    currentUserCache = nextUser;

    // PKCE flow: Supabase fires PASSWORD_RECOVERY after exchanging the code
    // from the reset-password email link. Capture it here so the React app
    // can show the ResetPassword screen instead of the dashboard.
    if (event === 'PASSWORD_RECOVERY') {
      sessionStorage.setItem('athlix:password_recovery', '1');
      window.dispatchEvent(new CustomEvent('athlix:password-recovery'));
    }

    if (session?.user) {
      void migrateLegacyDataIfNeeded(session.user.id, session.user.email || null);
    }

    authListeners.forEach((listener) => {
      listener(nextUser);
    });
  });

  authSubscription = data.subscription;

  void supabase.auth
    .getUser()
    .then(({ data: userData }) => {
      const nextUser = toLocalUser(userData.user);
      currentUserCache = nextUser;
      if (userData.user) {
        void migrateLegacyDataIfNeeded(userData.user.id, userData.user.email || null);
      }
      authListeners.forEach((listener) => {
        listener(nextUser);
      });
    })
    .catch(() => {
      currentUserCache = null;
    });
};

const readLegacyDb = (): LegacyDb | null => {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? (parsed as LegacyDb) : null;
  } catch {
    return null;
  }
};

const migrationMarkerKey = (supabaseUserId: string) => `${MIGRATION_KEY_PREFIX}:${supabaseUserId}`;

const normalizeProfile = (userId: string, row: RawRecord | null): LocalProfile => {
  return {
    id: userId,
    full_name: row?.full_name ?? null,
    unit_preference: row?.unit_preference === 'kg' ? 'kg' : 'lbs',
    theme_preference: row?.theme_preference === 'darker' ? 'darker' : 'dark',
    start_workout_enabled: Boolean(row?.start_workout_enabled),
    show_start_sheet: Boolean(row?.show_start_sheet),
    body_weight: typeof row?.body_weight === 'number' ? row.body_weight : null,
    body_weight_unit: row?.body_weight_unit === 'kg' ? 'kg' : 'lbs',
    height_feet: typeof row?.height_feet === 'number' ? row.height_feet : null,
    height_inches: typeof row?.height_inches === 'number' ? row.height_inches : null,
    created_at: row?.created_at || nowIso(),
  };
};

const ensureProfileExists = async (userId: string, email: string | null, fullName?: string | null) => {
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (existingProfileError) {
    throw normalizeError(existingProfileError, 'Failed to load profile.');
  }

  if (existingProfile) {
    return normalizeProfile(userId, existingProfile as RawRecord);
  }

  const nameFromEmail = email ? email.split('@')[0] : null;
  const nextProfile: RawRecord = {
    id: userId,
    full_name: fullName ?? nameFromEmail,
    unit_preference: 'lbs',
    theme_preference: 'dark',
    start_workout_enabled: false,
    show_start_sheet: false,
    body_weight: null,
    body_weight_unit: 'lbs',
    height_feet: null,
    height_inches: null,
  };

  await upsertRows('profiles', [nextProfile], 'id');
  return normalizeProfile(userId, nextProfile);
};

const buildDefaultExerciseLibrary = () => {
  const merged = new Map<string, LocalExerciseLibraryItem>();

  Object.entries(DEFAULT_EXERCISES).forEach(([muscle_group, names]) => {
    names.forEach((name) => {
      const key = makeLibraryKey(muscle_group, name);
      if (merged.has(key)) return;
      const openTrainingId = OPENTRAINING_ID_BY_NAME[normalizeExerciseName(name)] || null;
      merged.set(key, {
        id: `default-${key}`,
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
      id: `default-${key}`,
      name: exercise.name,
      muscle_group: exercise.muscleGroup,
      is_custom: false,
      user_id: null,
      exercise_db_id: exercise.id,
    });
  });

  return Array.from(merged.values());
};

const mergeWithDefaultLibrary = (rows: LocalExerciseLibraryItem[]) => {
  const merged = new Map<string, LocalExerciseLibraryItem>();

  rows.forEach((row) => {
    const key = `${row.is_custom ? `custom:${row.user_id || 'shared'}` : 'default'}::${makeLibraryKey(row.muscle_group, row.name)}`;
    merged.set(key, row);
  });

  buildDefaultExerciseLibrary().forEach((item) => {
    const key = `default::${makeLibraryKey(item.muscle_group, item.name)}`;
    if (!merged.has(key)) {
      merged.set(key, item);
      return;
    }

    const existing = merged.get(key)!;
    if (!existing.exercise_db_id && item.exercise_db_id) {
      merged.set(key, {
        ...existing,
        exercise_db_id: item.exercise_db_id,
      });
    }
  });

  return Array.from(merged.values());
};

const convertAllUserDataUnits = async (
  userId: string,
  sourceUnit: WeightUnit,
  targetUnit: WeightUnit,
  sourceBodyWeightUnit: WeightUnit,
) => {
  const { data: workouts, error: workoutsError } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId);
  if (workoutsError) throw normalizeError(workoutsError, 'Failed to load workouts for conversion.');

  const workoutIds = (workouts || []).map((item: any) => item.id);
  if (workoutIds.length) {
    const exerciseRows = await fetchByIds('workouts', workoutIds, 'id');
    const validWorkoutIds = new Set(exerciseRows.map((row) => row.id));

    if (validWorkoutIds.size > 0) {
      const { data: exercises, error: exercisesError } = await supabase
        .from('exercises')
        .select('*')
        .in('workout_id', Array.from(validWorkoutIds));
      if (exercisesError) throw normalizeError(exercisesError, 'Failed to load exercises for conversion.');

      const nextExercises = (exercises || [])
        .map((exercise: any) => {
          const rowUnit = exercise.unit || sourceUnit;
          if (!isWeightUnit(rowUnit)) return null;
          return {
            id: exercise.id,
            weight: convertWeight(Number(exercise.weight || 0), rowUnit, targetUnit),
            unit: targetUnit,
          };
        })
        .filter(Boolean) as Array<{ id: string; weight: number; unit: WeightUnit }>;

      for (const row of chunk(nextExercises, 250)) {
        for (const item of row) {
          await updateRows('exercises', { id: item.id }, { weight: item.weight, unit: item.unit });
        }
      }
    }
  }

  const { data: templates, error: templateError } = await supabase
    .from('templates')
    .select('id')
    .eq('user_id', userId);
  if (templateError) throw normalizeError(templateError, 'Failed to load templates for conversion.');

  const templateIds = (templates || []).map((item: any) => item.id);
  if (templateIds.length) {
    const { data: templateExercises, error: templateExercisesError } = await supabase
      .from('template_exercises')
      .select('*')
      .in('template_id', templateIds);
    if (templateExercisesError) {
      throw normalizeError(templateExercisesError, 'Failed to load template exercises for conversion.');
    }

    for (const exercise of templateExercises || []) {
      await updateRows(
        'template_exercises',
        { id: exercise.id },
        {
          default_weight: convertWeight(
            Number(exercise.default_weight || 0),
            sourceUnit,
            targetUnit,
          ),
        },
      );
    }
  }

  const { data: records, error: recordsError } = await supabase
    .from('personal_records')
    .select('*')
    .eq('user_id', userId);
  if (recordsError) throw normalizeError(recordsError, 'Failed to load PRs for conversion.');

  for (const record of records || []) {
    await updateRows('personal_records', { id: record.id }, {
      best_weight: convertWeight(Number(record.best_weight || 0), sourceUnit, targetUnit),
    });
  }

  const { data: weightLogs, error: weightLogsError } = await supabase
    .from('body_weight_logs')
    .select('*')
    .eq('user_id', userId);
  if (weightLogsError) throw normalizeError(weightLogsError, 'Failed to load body weight logs for conversion.');

  for (const log of weightLogs || []) {
    const rowUnit = (log.unit || sourceBodyWeightUnit) as WeightUnit;
    await updateRows('body_weight_logs', { id: log.id }, {
      weight: convertWeight(Number(log.weight || 0), rowUnit, targetUnit, 0.1),
      unit: targetUnit,
    });
  }
};

const migrateLegacyDataIfNeeded = async (supabaseUserId: string, email: string | null) => {
  if (!hasSupabaseConfig || typeof window === 'undefined') return;

  const markerKey = migrationMarkerKey(supabaseUserId);
  if (localStorage.getItem(markerKey) === '1') return;

  if (migrationByUser.has(supabaseUserId)) {
    await migrationByUser.get(supabaseUserId);
    return;
  }

  const migrationTask = (async () => {
    const db = readLegacyDb();
    if (!db || !email) {
      localStorage.setItem(markerKey, '1');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const legacyUser = (db.users || []).find(
      (item) => item.email.trim().toLowerCase() === normalizedEmail,
    );

    if (!legacyUser) {
      localStorage.setItem(markerKey, '1');
      return;
    }

    const legacyUserId = legacyUser.id;

    const legacyProfile = (db.profiles || []).find((profile) => profile.id === legacyUserId);
    if (legacyProfile) {
      await upsertRows(
        'profiles',
        [
          {
            id: supabaseUserId,
            full_name: legacyProfile.full_name,
            unit_preference: legacyProfile.unit_preference,
            theme_preference: legacyProfile.theme_preference,
            start_workout_enabled: legacyProfile.start_workout_enabled,
            show_start_sheet: legacyProfile.show_start_sheet,
            body_weight: legacyProfile.body_weight,
            body_weight_unit: legacyProfile.body_weight_unit,
            height_feet: legacyProfile.height_feet,
            height_inches: legacyProfile.height_inches,
          },
        ],
        'id',
      );
    }

    const workouts = (db.workouts || []).filter((workout) => workout.user_id === legacyUserId);
    const workoutIds = new Set(workouts.map((workout) => workout.id));

    if (workouts.length) {
      await upsertRows(
        'workouts',
        workouts.map((workout) => ({
          ...workout,
          user_id: supabaseUserId,
          notes: workout.notes || null,
        })),
        'id',
      );
    }

    const exercises = (db.exercises || []).filter((exercise) => workoutIds.has(exercise.workout_id));
    if (exercises.length) {
      await upsertRows(
        'exercises',
        exercises.map((exercise) => ({
          ...exercise,
          muscle_group: exercise.muscle_group || null,
          exercise_db_id: exercise.exercise_db_id || null,
        })),
        'id',
      );
    }

    const templates = (db.templates || []).filter((template) => template.user_id === legacyUserId);
    const templateIds = new Set(templates.map((template) => template.id));

    if (templates.length) {
      await upsertRows(
        'templates',
        templates.map((template) => ({ ...template, user_id: supabaseUserId })),
        'id',
      );
    }

    const templateExercises = (db.templateExercises || []).filter((exercise) =>
      templateIds.has(exercise.template_id),
    );
    if (templateExercises.length) {
      await upsertRows(
        'template_exercises',
        templateExercises.map((exercise) => ({
          ...exercise,
          muscle_group: exercise.muscle_group || null,
          exercise_db_id: exercise.exercise_db_id || null,
        })),
        'id',
      );
    }

    const bodyWeightLogs = (db.bodyWeightLogs || []).filter((log) => log.user_id === legacyUserId);
    if (bodyWeightLogs.length) {
      await upsertRows(
        'body_weight_logs',
        bodyWeightLogs.map((log) => ({ ...log, user_id: supabaseUserId })),
        'id',
      );
    }

    const personalRecords = (db.personalRecords || []).filter(
      (record) => record.user_id === legacyUserId,
    );
    if (personalRecords.length) {
      await upsertRows(
        'personal_records',
        personalRecords.map((record) => ({ ...record, user_id: supabaseUserId })),
        'user_id,exercise_name',
      );
    }

    const customExercises = dedupeBy(
      (db.exerciseLibrary || []).filter(
        (exercise) => exercise.is_custom && exercise.user_id === legacyUserId,
      ),
      (exercise) => `${exercise.user_id}:${exercise.muscle_group}:${exercise.name.toLowerCase()}`,
    );

    if (customExercises.length) {
      await upsertRows(
        'exercise_library',
        customExercises.map((exercise) => ({
          ...exercise,
          user_id: supabaseUserId,
          is_custom: true,
          exercise_db_id: exercise.exercise_db_id || null,
        })),
        'id',
      );
    }

    const dashboardLayout = (db.dashboardLayouts || []).find(
      (layout) => layout.user_id === legacyUserId,
    );

    if (dashboardLayout) {
      await upsertRows(
        'user_dashboard_layout',
        [
          {
            user_id: supabaseUserId,
            layout: dashboardLayout.layout,
            updated_at: dashboardLayout.updated_at || nowIso(),
          },
        ],
        'user_id',
      );
    }

    if (await supportsHeartRateTables()) {
      const sessions = (db.heartRateSessions || []).filter(
        (session) => session.user_id === legacyUserId,
      );
      if (sessions.length) {
        await upsertRows(
          'heart_rate_sessions',
          sessions.map((session) => ({ ...session, user_id: supabaseUserId })),
          'id',
        );
      }

      const sessionIds = new Set(sessions.map((session) => session.id));
      const samples = (db.heartRateSamples || []).filter((sample) =>
        sessionIds.has(sample.session_id),
      );
      if (samples.length) {
        await upsertRows(
          'heart_rate_samples',
          samples.map((sample) => ({ ...sample, user_id: supabaseUserId })),
          'id',
        );
      }
    }

    localStorage.setItem(markerKey, '1');
  })();

  migrationByUser.set(supabaseUserId, migrationTask);
  try {
    await migrationTask;
  } finally {
    migrationByUser.delete(supabaseUserId);
  }
};

const supportsHeartRateTables = async () => {
  if (!hasSupabaseConfig) return false;
  if (heartRateTableSupport != null) return heartRateTableSupport;

  const { error } = await supabase.from('heart_rate_sessions').select('id').limit(1);
  if (error && isMissingRelationError(error)) {
    heartRateTableSupport = false;
    return false;
  }

  heartRateTableSupport = true;
  return true;
};

const emitAuthChange = () => {
  authListeners.forEach((listener) => listener(currentUserCache));
};

export const getCurrentUser = (): LocalUser | null => {
  if (!hasSupabaseConfig) return localData.getCurrentUser();
  ensureSupabaseAuthInitialized();
  return currentUserCache;
};

export const getCurrentUserAsync = async (): Promise<LocalUser | null> => {
  if (!hasSupabaseConfig) return localData.getCurrentUser();

  ensureSupabaseAuthInitialized();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;

  currentUserCache = toLocalUser(data.user);
  if (data.user) {
    migrateLegacyDataIfNeeded(data.user.id, data.user.email || null).catch((err) => {
      console.warn('Legacy data migration failed (non-fatal):', err);
    });

    // Fire password-recovery event if main.tsx detected a recovery redirect.
    // We do this here (after confirming the user is authenticated) to avoid
    // any race with React's useEffect listeners.
    if (sessionStorage.getItem('athlix:password_recovery') === '1') {
      sessionStorage.removeItem('athlix:password_recovery');
      // Small delay so AuthContext listeners are guaranteed to be registered
      setTimeout(() => window.dispatchEvent(new CustomEvent('athlix:password-recovery')), 50);
    }
  }

  return currentUserCache;
};

export const subscribeToAuth = (listener: (user: LocalUser | null) => void) => {
  if (!hasSupabaseConfig) {
    return localData.subscribeToAuth(listener);
  }

  ensureSupabaseAuthInitialized();
  authListeners.add(listener);
  listener(currentUserCache);

  return () => {
    authListeners.delete(listener);
    if (authListeners.size === 0 && authSubscription) {
      authSubscription.unsubscribe();
      authSubscription = null;
      authInitialized = false;
    }
  };
};

export const signUpLocal = async (email: string, password: string, fullName?: string) => {
  if (!hasSupabaseConfig) return localData.signUpLocal(email, password, fullName);

  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        full_name: fullName || normalizedEmail.split('@')[0],
      },
      emailRedirectTo: getAppUrl(),
    },
  });

  if (error) {
    throw normalizeError(error, 'Failed to sign up.');
  }

  if (!data.user) {
    throw new Error('Failed to create account.');
  }

  if (!data.session) {
    throw new Error('Account created. Check your email to confirm before signing in.');
  }

  currentUserCache = toLocalUser(data.user);
  emitAuthChange();

  await ensureProfileExists(data.user.id, data.user.email || normalizedEmail, fullName || null);
  await migrateLegacyDataIfNeeded(data.user.id, data.user.email || normalizedEmail);

  if (!currentUserCache) {
    throw new Error('Could not establish an authenticated session.');
  }

  return currentUserCache;
};

export const signInLocal = async (email: string, password: string) => {
  if (!hasSupabaseConfig) return localData.signInLocal(email, password);

  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    throw normalizeError(error, 'Invalid email or password.');
  }

  if (!data.user) {
    throw new Error('No account found for this email.');
  }

  currentUserCache = toLocalUser(data.user);
  emitAuthChange();

  await ensureProfileExists(data.user.id, data.user.email || normalizedEmail, null);
  await migrateLegacyDataIfNeeded(data.user.id, data.user.email || normalizedEmail);

  if (!currentUserCache) {
    throw new Error('Could not establish an authenticated session.');
  }

  return currentUserCache;
};

export const signOutLocal = async () => {
  if (!hasSupabaseConfig) return localData.signOutLocal();

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw normalizeError(error, 'Failed to sign out.');
  }

  currentUserCache = null;
  emitAuthChange();
};

export const sendPasswordResetEmail = async (email: string): Promise<void> => {
  if (!hasSupabaseConfig) throw new Error('Password reset requires a Supabase connection.');

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: getAppUrl(),
  });

  if (error) {
    // Preserve the HTTP status so callers can distinguish 429 rate-limit from
    // other failures — normalizeError wraps into a plain Error which drops it.
    const e = normalizeError(error, 'Failed to send reset email.') as Error & { status?: number };
    e.status = (error as any).status ?? (error as any).code;
    throw e;
  }
};

export const updatePassword = async (newPassword: string): Promise<void> => {
  if (!hasSupabaseConfig) throw new Error('Password update requires a Supabase connection.');

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw normalizeError(error, 'Failed to update password.');
};

export const deleteAccountLocal = async (userId: string) => {
  if (!hasSupabaseConfig) return localData.deleteAccountLocal(userId);

  const { data: workoutRows, error: workoutQueryError } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId);
  if (workoutQueryError) throw normalizeError(workoutQueryError, 'Failed to load workouts.');

  const workoutIds = (workoutRows || []).map((row: any) => row.id);
  if (workoutIds.length) {
    const { error: exerciseDeleteError } = await supabase
      .from('exercises')
      .delete()
      .in('workout_id', workoutIds);
    if (exerciseDeleteError && !isMissingRelationError(exerciseDeleteError)) {
      throw normalizeError(exerciseDeleteError, 'Failed to delete workout sets.');
    }
  }

  const { error: workoutsDeleteError } = await supabase
    .from('workouts')
    .delete()
    .eq('user_id', userId);
  if (workoutsDeleteError && !isMissingRelationError(workoutsDeleteError)) {
    throw normalizeError(workoutsDeleteError, 'Failed to delete workouts.');
  }

  const { data: templateRows, error: templateQueryError } = await supabase
    .from('templates')
    .select('id')
    .eq('user_id', userId);
  if (templateQueryError) throw normalizeError(templateQueryError, 'Failed to load templates.');

  const templateIds = (templateRows || []).map((row: any) => row.id);
  if (templateIds.length) {
    const { error: templateExerciseDeleteError } = await supabase
      .from('template_exercises')
      .delete()
      .in('template_id', templateIds);
    if (templateExerciseDeleteError && !isMissingRelationError(templateExerciseDeleteError)) {
      throw normalizeError(templateExerciseDeleteError, 'Failed to delete template exercises.');
    }
  }

  const tableDeletes: Array<{ table: string; match: RawRecord }> = [
    { table: 'templates', match: { user_id: userId } },
    { table: 'body_weight_logs', match: { user_id: userId } },
    { table: 'personal_records', match: { user_id: userId } },
    { table: 'exercise_library', match: { user_id: userId, is_custom: true } },
    { table: 'user_dashboard_layout', match: { user_id: userId } },
    { table: 'profiles', match: { id: userId } },
    { table: 'heart_rate_samples', match: { user_id: userId } },
    { table: 'heart_rate_sessions', match: { user_id: userId } },
  ];

  for (const entry of tableDeletes) {
    let query = supabase.from(entry.table).delete();
    Object.entries(entry.match).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { error } = await query;
    if (error && !isMissingRelationError(error)) {
      throw normalizeError(error, `Failed to delete ${entry.table}.`);
    }
  }

  await signOutLocal();
};

export const getProfile = async (userId: string) => {
  if (!hasSupabaseConfig) return localData.getProfile(userId);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw normalizeError(error, 'Failed to load profile.');
  }

  if (!data) {
    const { data: authData } = await supabase.auth.getUser();
    const profile = await ensureProfileExists(userId, authData.user?.email || null, null);
    return profile;
  }

  return normalizeProfile(userId, data as RawRecord);
};

export const updateProfile = async (userId: string, updates: Partial<LocalProfile>) => {
  if (!hasSupabaseConfig) return localData.updateProfile(userId, updates);

  const existingProfile = await getProfile(userId);
  if (!existingProfile) throw new Error('Profile not found.');

  const requestedUnit = (updates.unit_preference ?? existingProfile.unit_preference) as WeightUnit;
  const targetUnit = requestedUnit;
  const shouldConvertAllUserWeights = requestedUnit !== existingProfile.unit_preference;

  const nextProfile: LocalProfile = {
    ...existingProfile,
    ...updates,
    unit_preference: targetUnit,
  };

  const bodyWeightUnitUpdate =
    (updates.body_weight_unit as WeightUnit | undefined) ?? nextProfile.body_weight_unit;

  if (bodyWeightUnitUpdate !== nextProfile.body_weight_unit && nextProfile.body_weight != null) {
    nextProfile.body_weight = convertWeight(
      Number(nextProfile.body_weight),
      nextProfile.body_weight_unit,
      bodyWeightUnitUpdate,
      0.1,
    );
  }

  if (shouldConvertAllUserWeights) {
    await convertAllUserDataUnits(
      userId,
      existingProfile.unit_preference,
      targetUnit,
      existingProfile.body_weight_unit,
    );

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

  await upsertRows(
    'profiles',
    [
      {
        id: userId,
        full_name: nextProfile.full_name,
        unit_preference: nextProfile.unit_preference,
        theme_preference: nextProfile.theme_preference,
        start_workout_enabled: nextProfile.start_workout_enabled,
        show_start_sheet: nextProfile.show_start_sheet,
        body_weight: nextProfile.body_weight,
        body_weight_unit: nextProfile.body_weight_unit,
        height_feet: nextProfile.height_feet,
        height_inches: nextProfile.height_inches,
      },
    ],
    'id',
  );

  return await getProfile(userId);
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
  if (!hasSupabaseConfig) return localData.getWorkouts(userId, options);

  let query = supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false });

  if (options?.startDate) query = query.gte('date', options.startDate);
  if (options?.endDate) query = query.lte('date', options.endDate);
  if (options?.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw normalizeError(error, 'Failed to load workouts.');

  const workouts = (data || []) as LocalWorkout[];

  if (!options?.includeExercises || workouts.length === 0) {
    return workouts;
  }

  const workoutIds = workouts.map((workout) => workout.id);
  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('exercises')
    .select('*')
    .in('workout_id', workoutIds)
    .order('order_index', { ascending: true });

  if (exercisesError) throw normalizeError(exercisesError, 'Failed to load workout exercises.');

  return attachExercises(workouts, (exerciseRows || []) as LocalExercise[]);
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
  if (!hasSupabaseConfig) return localData.saveWorkout(userId, input);

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

  const rpcPayload = {
    p_title: input.title,
    p_workout_date: input.date,
    p_duration_minutes: Math.max(0, input.duration_minutes),
    p_notes: input.notes || null,
    p_exercises: validExercises,
  };

  const { data: workoutIdFromRpc, error: rpcError } = await supabase.rpc(
    'save_workout_with_sets',
    rpcPayload,
  );

  if (!rpcError && workoutIdFromRpc) {
    const { data: workoutRow, error: workoutFetchError } = await supabase
      .from('workouts')
      .select('*')
      .eq('id', workoutIdFromRpc)
      .maybeSingle();

    if (workoutFetchError) {
      throw normalizeError(workoutFetchError, 'Workout saved, but failed to fetch it.');
    }

    return workoutRow as LocalWorkout;
  }

  const fallbackWorkoutId = createId();
  const createdAt = nowIso();
  const muscle_groups = Array.from(
    new Set(validExercises.map((exercise) => exercise.muscle_group).filter(Boolean) as string[]),
  );

  const workout: LocalWorkout = {
    id: fallbackWorkoutId,
    user_id: userId,
    title: input.title,
    date: input.date,
    duration_minutes: Math.max(0, input.duration_minutes),
    notes: input.notes || null,
    muscle_groups,
    created_at: createdAt,
  };

  await upsertRows('workouts', [workout], 'id');

  let orderIndex = 0;
  const rowsToInsert: RawRecord[] = [];
  const bestFromNewWorkout = new Map<string, { weight: number; reps: number; exercise_db_id?: string | null }>();

  validExercises.forEach((exercise) => {
    exercise.completed_sets.forEach((set) => {
      rowsToInsert.push({
        id: createId(),
        workout_id: fallbackWorkoutId,
        name: exercise.name,
        muscle_group: exercise.muscle_group || null,
        sets: 1,
        reps: set.reps,
        weight: set.weight || 0,
        unit: set.unit || 'lbs',
        order_index: orderIndex++,
        exercise_db_id: exercise.exercise_db_id || null,
      });

      const existing = bestFromNewWorkout.get(exercise.name);
      const candidate = { weight: set.weight || 0, reps: set.reps, exercise_db_id: exercise.exercise_db_id || null };
      if (!existing) {
        bestFromNewWorkout.set(exercise.name, candidate);
        return;
      }

      if (
        candidate.weight > existing.weight ||
        (candidate.weight === existing.weight && candidate.reps > existing.reps)
      ) {
        bestFromNewWorkout.set(exercise.name, candidate);
      }
    });
  });

  await insertRows('exercises', rowsToInsert);
  invalidateExerciseRowsCache(); // fresh data next time the picker opens

  const exerciseNames = Array.from(bestFromNewWorkout.keys());
  const { data: existingRecords, error: recordError } = await supabase
    .from('personal_records')
    .select('*')
    .eq('user_id', userId)
    .in('exercise_name', exerciseNames);

  if (recordError) {
    throw normalizeError(recordError, 'Workout saved, but failed while updating personal records.');
  }

  const existingByName = new Map((existingRecords || []).map((record: any) => [record.exercise_name, record]));
  const rowsToUpsert: RawRecord[] = [];

  bestFromNewWorkout.forEach((candidate, exerciseName) => {
    const existing = existingByName.get(exerciseName);
    const shouldReplace =
      !existing ||
      candidate.weight > Number(existing.best_weight || 0) ||
      (candidate.weight === Number(existing.best_weight || 0) && candidate.reps > Number(existing.best_reps || 0));

    if (!shouldReplace) return;

    rowsToUpsert.push({
      id: existing?.id || createId(),
      user_id: userId,
      exercise_name: exerciseName,
      best_weight: candidate.weight,
      best_reps: candidate.reps,
      achieved_date: input.date,
      created_at: existing?.created_at || createdAt,
      exercise_db_id: candidate.exercise_db_id || existing?.exercise_db_id || null,
    });
  });

  if (rowsToUpsert.length) {
    await upsertRows('personal_records', rowsToUpsert, 'id');
  }

  return workout;
};

export const deleteWorkout = async (userId: string, workoutId: string) => {
  if (!hasSupabaseConfig) return localData.deleteWorkout(userId, workoutId);

  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workoutId)
    .eq('user_id', userId);

  if (error) throw normalizeError(error, 'Failed to delete workout.');
};

/**
 * Replace a logged workout's sets in place (same workout id, date and title).
 * Used by the calendar card's inline editor. Returns the new flat exercise rows.
 */
export const updateWorkoutSets = async (
  userId: string,
  workoutId: string,
  exercises: Array<{
    name: string;
    muscle_group?: string;
    exercise_db_id?: string | null;
    completed_sets: Array<{ reps: number; weight: number; unit?: ExerciseSetUnit }>;
  }>,
): Promise<{ exercises: LocalExercise[]; muscle_groups: string[] }> => {
  if (!hasSupabaseConfig) {
    const res = await localData.updateWorkoutSets(userId, workoutId, exercises);
    return { exercises: res.exercises, muscle_groups: res.workout.muscle_groups || [] };
  }

  // Ownership guard
  const { data: owned, error: ownErr } = await supabase
    .from('workouts')
    .select('id')
    .eq('id', workoutId)
    .eq('user_id', userId)
    .maybeSingle();
  if (ownErr) throw normalizeError(ownErr, 'Failed to verify workout.');
  if (!owned) throw new Error('Workout not found.');

  const valid = exercises
    .map((ex) => ({
      ...ex,
      completed_sets: (ex.completed_sets || []).filter(
        (s) => Number(s.reps || 0) > 0 || Number(s.weight || 0) > 0,
      ),
    }))
    .filter((ex) => ex.completed_sets.length > 0);

  if (valid.length === 0) throw new Error('Keep at least one set, or delete the workout instead.');

  // Build the replacement rows
  const rows: RawRecord[] = [];
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
      });
    });
  });

  // Replace: delete old set rows, insert new
  const { error: delErr } = await supabase.from('exercises').delete().eq('workout_id', workoutId);
  if (delErr) throw normalizeError(delErr, 'Failed to update workout sets.');

  await insertRows('exercises', rows);
  invalidateExerciseRowsCache();

  const muscle_groups = Array.from(new Set(valid.map((ex) => ex.muscle_group).filter(Boolean) as string[]));
  const { error: wErr } = await supabase
    .from('workouts')
    .update({ muscle_groups })
    .eq('id', workoutId)
    .eq('user_id', userId);
  if (wErr) throw normalizeError(wErr, 'Sets saved, but failed to update the workout summary.');

  return { exercises: rows as unknown as LocalExercise[], muscle_groups };
};

/** Rename a workout session. Trims the new title; no-ops if blank or unchanged. */
export const renameWorkout = async (
  userId: string,
  workoutId: string,
  newTitle: string,
): Promise<void> => {
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  await updateRows('workouts', { id: workoutId, user_id: userId }, { title: trimmed });
};

export const getTemplates = async (userId: string) => {
  if (!hasSupabaseConfig) return localData.getTemplates(userId);

  const { data: templates, error: templatesError } = await supabase
    .from('templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (templatesError) throw normalizeError(templatesError, 'Failed to load templates.');

  if (!templates?.length) return [];

  const templateIds = templates.map((template: any) => template.id);
  const { data: templateExercises, error: exercisesError } = await supabase
    .from('template_exercises')
    .select('*')
    .in('template_id', templateIds)
    .order('order_index', { ascending: true });

  if (exercisesError) throw normalizeError(exercisesError, 'Failed to load template exercises.');

  return templates.map((template: any) => ({
    ...template,
    template_exercises: (templateExercises || [])
      .filter((exercise: any) => exercise.template_id === template.id)
      .sort((a: any, b: any) => a.order_index - b.order_index),
  }));
};

export const checkTemplateNameExists = async (
  userId: string,
  title: string,
  excludeId?: string | null,
): Promise<boolean> => {
  if (!hasSupabaseConfig) return localData.checkTemplateNameExists(userId, title, excludeId);
  let query = supabase
    .from('templates')
    .select('id')
    .eq('user_id', userId)
    .ilike('title', title.trim());
  if (excludeId) query = query.neq('id', excludeId);
  const { data } = await query.limit(1);
  return (data?.length ?? 0) > 0;
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
  if (!hasSupabaseConfig) return localData.saveTemplate(userId, input);

  // When updating an existing template, skip the RPC (it may always INSERT a new row)
  // and go directly to the safe JS update path.
  if (!input.templateId) {
    const rpcPayload = {
      p_template_id: null,
      p_title: input.title,
      p_exercises: input.exercises,
    };

    const { data: templateIdFromRpc, error: rpcError } = await supabase.rpc(
      'save_template_with_exercises',
      rpcPayload,
    );

    if (!rpcError && templateIdFromRpc) {
      return templateIdFromRpc as string;
    }
  }

  const templateId = input.templateId || createId();
  const { data: existingTemplate, error: existingTemplateError } = await supabase
    .from('templates')
    .select('id')
    .eq('id', templateId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existingTemplateError) {
    throw normalizeError(existingTemplateError, 'Failed to load template before saving.');
  }

  if (existingTemplate) {
    await updateRows('templates', { id: templateId, user_id: userId }, { title: input.title });
  } else {
    await upsertRows(
      'templates',
      [{ id: templateId, user_id: userId, title: input.title, created_at: nowIso() }],
      'id',
    );
  }

  const { error: deleteError } = await supabase
    .from('template_exercises')
    .delete()
    .eq('template_id', templateId);

  if (deleteError) {
    throw normalizeError(deleteError, 'Failed to clear template exercises before saving.');
  }

  await insertRows(
    'template_exercises',
    input.exercises.map((exercise) => ({
      id: createId(),
      template_id: templateId,
      name: exercise.name,
      muscle_group: exercise.muscle_group || null,
      default_sets: exercise.default_sets,
      default_reps: exercise.default_reps,
      default_weight: exercise.default_weight,
      order_index: exercise.order_index,
      exercise_db_id: exercise.exercise_db_id || null,
    })),
  );

  return templateId;
};

export const deleteTemplate = async (userId: string, templateId: string) => {
  if (!hasSupabaseConfig) return localData.deleteTemplate(userId, templateId);

  const { error } = await supabase
    .from('templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', userId);

  if (error) throw normalizeError(error, 'Failed to delete template.');
};

export const getBodyWeightLogs = async (userId: string) => {
  if (!hasSupabaseConfig) return localData.getBodyWeightLogs(userId);

  const { data, error } = await supabase
    .from('body_weight_logs')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) throw normalizeError(error, 'Failed to load body weight logs.');
  return (data || []) as LocalBodyWeightLog[];
};

export const logBodyWeight = async (
  userId: string,
  input: { date: string; weight: number; unit?: 'kg' | 'lbs'; notes?: string | null },
) => {
  if (!hasSupabaseConfig) return localData.logBodyWeight(userId, input);

  const rpcPayload = {
    p_date: input.date,
    p_weight: input.weight,
    p_unit: input.unit || 'lbs',
    p_notes: input.notes || null,
  };

  const { data: logIdFromRpc, error: rpcError } = await supabase.rpc('log_body_weight', rpcPayload);
  if (!rpcError && logIdFromRpc) {
    const { data: logRow, error: rowError } = await supabase
      .from('body_weight_logs')
      .select('*')
      .eq('id', logIdFromRpc)
      .maybeSingle();
    if (rowError) throw normalizeError(rowError, 'Body weight saved, but failed to fetch row.');
    return logRow as LocalBodyWeightLog;
  }

  // No unique constraint on (user_id, date) — check-then-insert/update manually.
  const { data: existing, error: lookupError } = await supabase
    .from('body_weight_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('date', input.date)
    .maybeSingle();

  if (lookupError) throw normalizeError(lookupError, 'Failed to check existing weight log.');

  if (existing?.id) {
    // Update the existing entry for today
    const { data: updated, error: updateError } = await supabase
      .from('body_weight_logs')
      .update({
        weight: input.weight,
        unit: input.unit || 'lbs',
        notes: input.notes ?? null,
      })
      .eq('id', existing.id)
      .select()
      .maybeSingle();

    if (updateError) throw normalizeError(updateError, 'Failed to update weight log.');
    return updated as LocalBodyWeightLog;
  }

  // Insert new entry
  const newId = createId();
  await upsertRows('body_weight_logs', [
    {
      id: newId,
      user_id: userId,
      date: input.date,
      weight: input.weight,
      unit: input.unit || 'lbs',
      notes: input.notes || null,
      created_at: nowIso(),
    },
  ], 'id');

  const { data, error } = await supabase
    .from('body_weight_logs')
    .select('*')
    .eq('id', newId)
    .maybeSingle();

  if (error) throw normalizeError(error, 'Failed to fetch body weight log.');
  return data as LocalBodyWeightLog;
};

export const updateBodyWeightLog = async (
  userId: string,
  id: string,
  input: { weight: number; unit: 'kg' | 'lbs'; notes?: string | null },
): Promise<LocalBodyWeightLog> => {
  if (!hasSupabaseConfig) return localData.updateBodyWeightLog(userId, id, input);

  const { data, error } = await supabase
    .from('body_weight_logs')
    .update({ weight: input.weight, unit: input.unit, notes: input.notes ?? null })
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) throw normalizeError(error, 'Failed to update weight log.');
  return data as LocalBodyWeightLog;
};

export const getPersonalRecords = async (
  userId: string,
  options?: { startDate?: string; endDate?: string },
) => {
  if (!hasSupabaseConfig) return localData.getPersonalRecords(userId, options);

  let query = supabase.from('personal_records').select('*').eq('user_id', userId);
  if (options?.startDate) query = query.gte('achieved_date', options.startDate);
  if (options?.endDate) query = query.lte('achieved_date', options.endDate);

  const { data, error } = await query.order('achieved_date', { ascending: false });
  if (error) throw normalizeError(error, 'Failed to load personal records.');

  return (data || []) as LocalPersonalRecord[];
};

// ── In-memory cache for exercise rows (avoids repeated full-table fetches) ────
let _exerciseRowsCache: { userId: string; rows: any[]; ts: number } | null = null;
const EXERCISE_ROWS_TTL_MS = 45_000; // 45 s — invalidated after any workout save

export const invalidateExerciseRowsCache = () => { _exerciseRowsCache = null; };

const getCachedExerciseRows = async (userId: string) => {
  const now = Date.now();
  if (
    _exerciseRowsCache &&
    _exerciseRowsCache.userId === userId &&
    now - _exerciseRowsCache.ts < EXERCISE_ROWS_TTL_MS
  ) {
    return _exerciseRowsCache.rows;
  }
  const rows = await getExerciseRowsWithWorkoutDates(userId);
  _exerciseRowsCache = { userId, rows, ts: now };
  return rows;
};

export const getExerciseRowsWithWorkoutDates = async (userId: string) => {
  if (!hasSupabaseConfig) return localData.getExerciseRowsWithWorkoutDates(userId);

  const { data: workouts, error: workoutsError } = await supabase
    .from('workouts')
    .select('id,date')
    .eq('user_id', userId);

  if (workoutsError) throw normalizeError(workoutsError, 'Failed to load workouts.');
  if (!workouts?.length) return [];

  const workoutMap = new Map<string, string>();
  workouts.forEach((workout: any) => {
    workoutMap.set(workout.id, workout.date);
  });

  const workoutIds = workouts.map((workout: any) => workout.id);
  const exercises: Array<LocalExercise & { workouts: { date: string } }> = [];

  for (const batch of chunk(workoutIds, 400)) {
    const { data: exerciseBatch, error: exercisesError } = await supabase
      .from('exercises')
      .select('*')
      .in('workout_id', batch);

    if (exercisesError) throw normalizeError(exercisesError, 'Failed to load exercises.');

    (exerciseBatch || []).forEach((exercise: any) => {
      const workoutDate = workoutMap.get(exercise.workout_id);
      if (!workoutDate) return;
      exercises.push({
        ...exercise,
        workouts: { date: workoutDate },
      });
    });
  }

  return exercises.sort((a, b) => a.workouts.date.localeCompare(b.workouts.date));
};

export const getLastExerciseSession = async (userId: string, exerciseName: string) => {
  if (!hasSupabaseConfig) return localData.getLastExerciseSession(userId, exerciseName);

  const rows = await getCachedExerciseRows(userId);
  const matches = rows
    .filter((row) => row.name === exerciseName)
    .sort((a, b) => {
      if (a.workouts.date !== b.workouts.date) return b.workouts.date.localeCompare(a.workouts.date);
      return b.order_index - a.order_index;
    });

  if (!matches.length) return null;

  const latestDate = matches[0].workouts.date;
  const latestWorkoutId = matches[0].workout_id;
  const sessionRows = matches
    .filter((row) => row.workout_id === latestWorkoutId || row.workouts.date === latestDate)
    .sort((a, b) => a.order_index - b.order_index);

  const lastRow = sessionRows[sessionRows.length - 1];
  const totalVolume = sessionRows.reduce((sum, row) => sum + row.weight * row.reps * row.sets, 0);

  return {
    name: lastRow.name,
    muscleGroup: lastRow.muscle_group || inferMuscleGroupFromName(lastRow.name),
    exercise_db_id: lastRow.exercise_db_id || null,
    lastSession: {
      date: lastRow.workouts.date,
      sets: sessionRows.length,
      reps: lastRow.reps,
      weight: lastRow.weight,
      totalVolume,
      perSetData: sessionRows.map((r) => ({ weight: r.weight, reps: r.reps })),
    },
  };
};

const fetchExerciseLibraryRows = async (userId: string, query?: string, muscleGroup?: string) => {
  let supabaseQuery = supabase
    .from('exercise_library')
    .select('*')
    .or(`is_custom.eq.false,user_id.eq.${userId}`);

  if (query) {
    supabaseQuery = supabaseQuery.ilike('name', `%${query}%`);
  }

  if (muscleGroup) {
    supabaseQuery = supabaseQuery.eq('muscle_group', muscleGroup);
  }

  const { data, error } = await supabaseQuery;
  if (error) throw normalizeError(error, 'Failed to load exercise library.');

  const rows = (data || []) as LocalExerciseLibraryItem[];
  return mergeWithDefaultLibrary(rows);
};

export const getExerciseLibraryByGroup = async (userId: string, muscleGroup: string) => {
  if (!hasSupabaseConfig) return localData.getExerciseLibraryByGroup(userId, muscleGroup);

  const rows = await fetchExerciseLibraryRows(userId, undefined, muscleGroup);
  return rows
    .filter((exercise) => exercise.muscle_group === muscleGroup)
    .filter((exercise) => !exercise.is_custom || exercise.user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
};

// ── Muscle slug metadata helpers ──────────────────────────────────────────────

type SlugEntry = { slug: string; type: 'primary' | 'secondary' };
type MetaEntry = { __input_type__: string };
type SlugOrMeta = SlugEntry | MetaEntry;

export const extractInputTypeFromSlugs = (slugs: unknown): string | undefined => {
  if (!Array.isArray(slugs)) return undefined;
  const meta = (slugs as SlugOrMeta[]).find((s): s is MetaEntry => '__input_type__' in s);
  return meta?.__input_type__;
};

export const addCustomExercise = async (
  userId: string,
  name: string,
  muscleGroup: string,
  muscleSlugs: SlugEntry[] = [],
  inputType?: string,
) => {
  if (!hasSupabaseConfig) return localData.addCustomExercise(userId, name, muscleGroup, muscleSlugs);

  const normalizedName = name.trim();
  const searchRows = await fetchExerciseLibraryRows(userId, normalizedName, muscleGroup);
  const existing = searchRows.find(
    (exercise) =>
      exercise.muscle_group === muscleGroup &&
      exercise.name.toLowerCase() === normalizedName.toLowerCase() &&
      (!exercise.is_custom || exercise.user_id === userId),
  );

  if (existing) return existing;

  const openTrainingId = OPENTRAINING_ID_BY_NAME[normalizeExerciseName(normalizedName)] || null;
  const openTrainingAsset = openTrainingId ? OPENTRAINING_ASSETS_BY_ID[openTrainingId] : null;
  const matchedAssetId =
    openTrainingAsset && openTrainingAsset.muscleGroup === muscleGroup ? openTrainingId : null;

  const slugsWithMeta: SlugOrMeta[] = [
    ...muscleSlugs,
    ...(inputType ? [{ __input_type__: inputType } as MetaEntry] : []),
  ];

  const item: LocalExerciseLibraryItem = {
    id: createId(),
    name: normalizedName,
    muscle_group: muscleGroup,
    is_custom: true,
    user_id: userId,
    exercise_db_id: matchedAssetId,
    muscle_slugs: slugsWithMeta,
  };

  await upsertRows('exercise_library', [{ ...item, is_custom: true, muscle_slugs: slugsWithMeta }], 'id');

  _libCache = null;
  return item;
};

export const updateCustomExercise = async (
  userId: string,
  exerciseId: string,
  updates: { name?: string; muscleGroup?: string },
): Promise<void> => {
  if (!hasSupabaseConfig) return;
  const payload: Record<string, string> = {};
  if (updates.name) payload.name = updates.name.trim();
  if (updates.muscleGroup) payload.muscle_group = updates.muscleGroup;
  if (!Object.keys(payload).length) return;
  await supabase
    .from('exercise_library')
    .update(payload)
    .eq('id', exerciseId)
    .eq('user_id', userId)
    .eq('is_custom', true);
  _libCache = null;
};

// Renames an exercise everywhere: library entry (if custom), all historical sets, personal records.
export const renameExerciseEverywhere = async (
  userId: string,
  oldName: string,
  newName: string,
  exerciseDbId?: string | null,
): Promise<void> => {
  if (!hasSupabaseConfig) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;

  // 1. Update the custom library entry (only for exercises the user owns)
  if (exerciseDbId) {
    await supabase
      .from('exercise_library')
      .update({ name: trimmed })
      .eq('id', exerciseDbId)
      .eq('user_id', userId)
      .eq('is_custom', true);
    _libCache = null;
  }

  // 2. Fetch this user's workout IDs to scope the historical updates
  const { data: wRows } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId);
  const wIds = ((wRows ?? []) as { id: string }[]).map((r) => r.id);
  if (wIds.length === 0) return;

  // 3. Rename all historical exercise sets
  await supabase
    .from('exercises')
    .update({ exercise_name: trimmed })
    .eq('exercise_name', oldName)
    .in('workout_id', wIds);

  // 4. Rename personal records
  await supabase
    .from('personal_records')
    .update({ exercise_name: trimmed })
    .eq('user_id', userId)
    .eq('exercise_name', oldName);
};

// ── Exercise library in-memory cache (shared across search calls) ─────────────
let _libCache: { userId: string; rows: ReturnType<typeof mergeWithDefaultLibrary>; ts: number } | null = null;
const LIB_TTL_MS = 5 * 60_000;

const getCachedLibrary = async (userId: string) => {
  const now = Date.now();
  if (_libCache && _libCache.userId === userId && now - _libCache.ts < LIB_TTL_MS) {
    return _libCache.rows;
  }
  const rows = await fetchExerciseLibraryRows(userId);
  _libCache = { userId, rows, ts: now };
  return rows;
};

export const getCustomExerciseSlugMap = async (
  userId: string,
): Promise<Map<string, { slug: string; type: 'primary' | 'secondary' }[]>> => {
  const all = await getCachedLibrary(userId);
  const map = new Map<string, { slug: string; type: 'primary' | 'secondary' }[]>();
  all.forEach((item) => {
    const slugs = item.muscle_slugs as { slug: string; type: 'primary' | 'secondary' }[] | undefined;
    if (item.is_custom && slugs && slugs.length > 0) {
      map.set((item.name as string).toLowerCase(), slugs);
    }
  });
  return map;
};

export const searchExerciseLibrary = async (userId: string, query: string) => {
  if (!hasSupabaseConfig) return localData.searchExerciseLibrary(userId, query);

  const all = await getCachedLibrary(userId);

  if (!query.trim()) return [...all].sort((a, b) => a.name.localeCompare(b.name));

  // Primary: fuzzy match on canonical exercise name
  const nameMatches = fuzzyFilter(all, query, (ex) => ex.name);
  const nameMatchedNames = new Set(nameMatches.map((e) => e.name.toLowerCase()));

  // Secondary: match query against alias keys, then resolve to canonical exercise
  const q = query.trim().toLowerCase();
  const aliasCanonicals = new Set<string>();
  for (const [alias, canonical] of Object.entries(EXERCISE_ALIASES)) {
    if (alias.includes(q) || q.includes(alias) || canonical.toLowerCase().includes(q)) {
      aliasCanonicals.add(canonical.toLowerCase());
    }
  }
  // Also fuzzy-match alias keys themselves
  const aliasKeys = Object.keys(EXERCISE_ALIASES).map((a) => ({ name: a }));
  fuzzyFilter(aliasKeys, query, (a) => a.name).forEach((a) => {
    const canonical = EXERCISE_ALIASES[a.name];
    if (canonical) aliasCanonicals.add(canonical.toLowerCase());
  });

  const aliasExtras = all.filter(
    (ex) => aliasCanonicals.has(ex.name.toLowerCase()) && !nameMatchedNames.has(ex.name.toLowerCase()),
  );

  // Tertiary: match query against muscle group name so "forearm" → all Forearms exercises
  const matchedNames = new Set([
    ...nameMatches.map((e) => e.name.toLowerCase()),
    ...aliasExtras.map((e) => e.name.toLowerCase()),
  ]);
  const muscleGroupExtras = all.filter((ex) => {
    const group = (ex.muscle_group || '').toLowerCase();
    return group.includes(q) && !matchedNames.has(ex.name.toLowerCase());
  });

  return [...nameMatches, ...aliasExtras, ...muscleGroupExtras];
};

export const getRecentExerciseOptions = async (
  userId: string,
): Promise<LocalExerciseSessionSummary[]> => {
  if (!hasSupabaseConfig) return localData.getRecentExerciseOptions(userId);

  // Single fetch — reused from cache if called again within TTL
  const rows = await getCachedExerciseRows(userId);

  // Sort desc by date then order_index so the most-recent set of each exercise comes first
  const sorted = [...rows].sort((a, b) => {
    if (a.workouts.date !== b.workouts.date) return b.workouts.date.localeCompare(a.workouts.date);
    return b.order_index - a.order_index;
  });

  // Build a lookup: exerciseName → all rows grouped by workout
  const byName = new Map<string, typeof sorted>();
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(row);
  }

  const seen = new Set<string>();
  const options: LocalExerciseSessionSummary[] = [];

  for (const row of sorted) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Compute last session inline — no extra round-trip
    const allRowsForExercise = byName.get(key) || [];
    const latestDate = row.workouts.date;
    const latestWorkoutId = row.workout_id;
    const sessionRows = allRowsForExercise
      .filter((r) => r.workout_id === latestWorkoutId)
      .sort((a, b) => a.order_index - b.order_index);

    const lastRow = sessionRows[sessionRows.length - 1] || row;
    const totalVolume = sessionRows.reduce((sum, r) => sum + r.weight * r.reps * (r.sets || 1), 0);

    options.push({
      name: row.name,
      muscleGroup: row.muscle_group || inferMuscleGroupFromName(row.name),
      exercise_db_id: row.exercise_db_id || null,
      lastSession: sessionRows.length > 0
        ? {
            date: latestDate,
            sets: sessionRows.length,
            reps: lastRow.reps,
            weight: lastRow.weight,
            totalVolume,
            perSetData: sessionRows.map((r) => ({ weight: r.weight, reps: r.reps })),
          }
        : undefined,
    });

  }

  return options;
};

export const buildExercisesFromWorkout = async (userId: string, workoutId: string) => {
  if (!hasSupabaseConfig) return localData.buildExercisesFromWorkout(userId, workoutId);

  const { data: workout, error: workoutError } = await supabase
    .from('workouts')
    .select('id,user_id')
    .eq('id', workoutId)
    .maybeSingle();

  if (workoutError) throw normalizeError(workoutError, 'Failed to load workout for quick-start.');
  if (!workout || workout.user_id !== userId) return [];

  const { data: rows, error: rowsError } = await supabase
    .from('exercises')
    .select('*')
    .eq('workout_id', workoutId)
    .order('order_index', { ascending: true });

  if (rowsError) throw normalizeError(rowsError, 'Failed to load workout exercises.');

  const grouped = new Map<
    string,
    {
      name: string;
      muscleGroup: string;
      exercise_db_id?: string | null;
      sets: Array<{ weight: number; reps: number; done: boolean }>;
    }
  >();

  (rows || []).forEach((row: any) => {
    const key = `${row.name}::${row.exercise_db_id || ''}::${row.muscle_group || ''}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: row.name,
        muscleGroup: row.muscle_group || inferMuscleGroupFromName(row.name),
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
  if (!hasSupabaseConfig) return localData.getDashboardLayout(userId);

  const { data, error } = await supabase
    .from('user_dashboard_layout')
    .select('layout')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw normalizeError(error, 'Failed to load dashboard layout.');
  return (data?.layout as typeof DEFAULT_LAYOUT | undefined) ?? null;
};

export const saveDashboardLayout = async (userId: string, layout: typeof DEFAULT_LAYOUT) => {
  if (!hasSupabaseConfig) return localData.saveDashboardLayout(userId, layout);

  await upsertRows(
    'user_dashboard_layout',
    [
      {
        user_id: userId,
        layout,
        updated_at: nowIso(),
      },
    ],
    'user_id',
  );
};

const trimHeartRateSamplesForUser = async (userId: string) => {
  const { data, error } = await supabase
    .from('heart_rate_samples')
    .select('id,ts')
    .eq('user_id', userId)
    .order('ts', { ascending: false });

  if (error) {
    throw normalizeError(error, 'Failed to trim heart-rate samples.');
  }

  const rows = data || [];
  if (rows.length <= MAX_HEART_RATE_SAMPLES_PER_USER) return;

  const rowsToDelete = rows.slice(MAX_HEART_RATE_SAMPLES_PER_USER);
  for (const batch of chunk(rowsToDelete.map((row: any) => row.id), 400)) {
    const { error: deleteError } = await supabase.from('heart_rate_samples').delete().in('id', batch);
    if (deleteError) {
      throw normalizeError(deleteError, 'Failed to trim old heart-rate samples.');
    }
  }
};

export const startHeartRateSession = async (userId: string, deviceName: string) => {
  if (!hasSupabaseConfig || !(await supportsHeartRateTables())) {
    return localData.startHeartRateSession(userId, deviceName);
  }

  const now = nowIso();

  const { error: closeError } = await supabase
    .from('heart_rate_sessions')
    .update({
      disconnected_at: now,
      updated_at: now,
      last_seen_at: now,
    })
    .eq('user_id', userId)
    .is('disconnected_at', null);

  if (closeError) throw normalizeError(closeError, 'Failed to close existing session.');

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

  await insertRows('heart_rate_sessions', [nextSession]);
  return nextSession;
};

export const endHeartRateSession = async (userId: string, sessionId?: string | null) => {
  if (!hasSupabaseConfig || !(await supportsHeartRateTables())) {
    return localData.endHeartRateSession(userId, sessionId);
  }

  const now = nowIso();
  let query = supabase
    .from('heart_rate_sessions')
    .update({
      disconnected_at: now,
      last_seen_at: now,
      updated_at: now,
    })
    .eq('user_id', userId)
    .is('disconnected_at', null);

  if (sessionId) query = query.eq('id', sessionId);

  const { error } = await query;
  if (error) throw normalizeError(error, 'Failed to end heart-rate session.');
};

export const appendHeartRateSamples = async (
  userId: string,
  sessionId: string,
  samples: Array<{ ts: number; bpm: number }>,
) => {
  if (!hasSupabaseConfig || !(await supportsHeartRateTables())) {
    return localData.appendHeartRateSamples(userId, sessionId, samples);
  }

  if (!samples.length) return 0;

  const { data: sessionRow, error: sessionError } = await supabase
    .from('heart_rate_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (sessionError) throw normalizeError(sessionError, 'Failed to load heart-rate session.');
  if (!sessionRow) return 0;

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
  const { data: existingRows, error: existingError } = await supabase
    .from('heart_rate_samples')
    .select('ts,bpm')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .gte('ts', minTs);

  if (existingError) throw normalizeError(existingError, 'Failed to dedupe heart-rate samples.');

  const existingKeys = new Set((existingRows || []).map((row: any) => `${row.ts}:${row.bpm}`));
  const createdAt = nowIso();

  const rowsToInsert: LocalHeartRateSample[] = [];
  cleaned.forEach((sample) => {
    const roundedTs = Math.round(sample.ts);
    const roundedBpm = Math.round(sample.bpm);
    const key = `${roundedTs}:${roundedBpm}`;
    if (existingKeys.has(key)) return;
    existingKeys.add(key);

    rowsToInsert.push({
      id: createId(),
      user_id: userId,
      session_id: sessionId,
      ts: roundedTs,
      bpm: roundedBpm,
      created_at: createdAt,
    });
  });

  if (!rowsToInsert.length) return 0;

  await insertRows('heart_rate_samples', rowsToInsert);

  const lastSeenTs = cleaned[cleaned.length - 1].ts;
  await updateRows(
    'heart_rate_sessions',
    { id: sessionId, user_id: userId },
    {
      last_seen_at: new Date(lastSeenTs).toISOString(),
      updated_at: nowIso(),
    },
  );

  await trimHeartRateSamplesForUser(userId);

  return rowsToInsert.length;
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
  if (!hasSupabaseConfig || !(await supportsHeartRateTables())) {
    return localData.getHeartRateSamples(userId, options);
  }

  let query = supabase
    .from('heart_rate_samples')
    .select('*')
    .eq('user_id', userId)
    .order('ts', { ascending: true });

  if (options?.sessionId) query = query.eq('session_id', options.sessionId);
  if (options?.sinceTs != null) query = query.gte('ts', options.sinceTs);
  if (options?.untilTs != null) query = query.lte('ts', options.untilTs);
  if (options?.limit && options.limit > 0) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw normalizeError(error, 'Failed to load heart-rate samples.');

  return (data || []) as LocalHeartRateSample[];
};

export const getLatestHeartRateSession = async (userId: string) => {
  if (!hasSupabaseConfig || !(await supportsHeartRateTables())) {
    return localData.getLatestHeartRateSession(userId);
  }

  const { data, error } = await supabase
    .from('heart_rate_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw normalizeError(error, 'Failed to load latest heart-rate session.');
  return (data || null) as LocalHeartRateSession | null;
};

// ─── Dopamine Entries ────────────────────────────────────────────────────────

export interface DopamineEntry {
  id?: string;
  user_id?: string;
  date: string;        // YYYY-MM-DD
  status: 'success' | 'relapse';
  urge: number;        // 1-5
  note?: string;
  triggers?: string[];
  helped_by?: string[];
}

export const getDopamineEntries = async (userId: string): Promise<DopamineEntry[]> => {
  const { data, error } = await supabase
    .from('dopamine_entries')
    .select('id, user_id, date, status, urge, note, triggers, helped_by')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  if (error) throw normalizeError(error, 'Failed to load dopamine entries.');
  return (data || []) as DopamineEntry[];
};

export const upsertDopamineEntry = async (
  userId: string,
  entry: { date: string; status: 'success' | 'relapse'; urge: number; note?: string; triggers?: string[]; helped_by?: string[] },
): Promise<DopamineEntry> => {
  const { data, error } = await supabase
    .from('dopamine_entries')
    .upsert(
      {
        user_id: userId,
        date: entry.date,
        status: entry.status,
        urge: entry.urge,
        note: entry.note ?? null,
        triggers: entry.triggers ?? [],
        helped_by: entry.helped_by ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,date' },
    )
    .select()
    .single();

  if (error) throw normalizeError(error, 'Failed to save dopamine entry.');
  return data as DopamineEntry;
};

export const deleteDopamineEntry = async (userId: string, date: string): Promise<void> => {
  const { error } = await supabase
    .from('dopamine_entries')
    .delete()
    .eq('user_id', userId)
    .eq('date', date);

  if (error) throw normalizeError(error, 'Failed to delete dopamine entry.');
};

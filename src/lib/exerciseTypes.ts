export type ExerciseInputType =
  | 'weight_reps'
  | 'distance_time'
  | 'time_only'
  | 'distance_only'
  | 'reps_only'
  | 'height_reps'
  | 'calories_time';

export type DistanceUnit = 'km' | 'mi';
export type WeightUnit = 'kg' | 'lbs';

export type DialFieldKind =
  | 'weight'
  | 'reps'
  | 'distance'
  | 'minutes'
  | 'seconds'
  | 'height'
  | 'calories';

// ─────────────────────────────────────────────────────────────────────────────
// Exact-name lookup (fastest path — must be lowercase, spaces normalised)
// ─────────────────────────────────────────────────────────────────────────────
const EXACT_TYPE_MAP: Record<string, ExerciseInputType> = {
  // ── Cardio machines — distance + time ──
  treadmill:            'distance_time',
  elliptical:           'distance_time',
  'elliptical trainer': 'distance_time',
  cycling:              'distance_time',
  'spin bike':          'distance_time',
  'stationary bike':    'distance_time',
  'stationary cycle':   'distance_time',
  'assault bike':       'distance_time',
  'echo bike':          'distance_time',
  'air bike':           'distance_time',
  'ski erg':            'distance_time',
  skierg:               'distance_time',
  'rowing machine':     'distance_time',
  rower:                'distance_time',
  'sled push':          'distance_time',
  'sled pull':          'distance_time',
  'farmers walk':       'distance_time',
  "farmer's walk":      'distance_time',
  'farmer walk':        'distance_time',
  'farmer carry':       'distance_time',
  'loaded carry':       'distance_time',
  running:              'distance_time',
  'running outdoor':    'distance_time',
  jogging:              'distance_time',
  sprinting:            'distance_time',
  bike:                 'distance_time',
  run:                  'distance_time',

  // ── Cardio — distance only ──
  swimming:  'distance_only',
  swim:      'distance_only',
  walking:   'distance_only',
  walk:      'distance_only',

  // ── Timed static / recovery ──
  'stair climber':  'time_only',
  stairmaster:      'time_only',
  stepmill:         'time_only',
  'step mill':      'time_only',
  'jump rope':      'time_only',
  'battle rope':    'time_only',
  'battle ropes':   'time_only',
  plank:            'time_only',
  'wall sit':       'time_only',
  stretching:       'time_only',
  sauna:            'time_only',
  yoga:             'reps_only',
  meditation:       'time_only',
  'hollow hold':    'time_only',
  'dead bug':       'reps_only',

  // ── Yoga poses / flows — reps_only so users can count reps + optional weight ──
  'sun salutation':         'reps_only',
  'vinyasa flow':           'reps_only',
  'vinyasa':                'reps_only',
  'yin yoga':               'time_only',   // long passive holds — keep timed
  'power yoga':             'reps_only',
  'warrior i':              'reps_only',
  'warrior ii':             'reps_only',
  'warrior iii':            'reps_only',
  'warrior 1':              'reps_only',
  'warrior 2':              'reps_only',
  'warrior 3':              'reps_only',
  'triangle pose':          'reps_only',
  'tree pose':              'reps_only',
  'chair pose':             'reps_only',
  'mountain pose':          'reps_only',
  'eagle pose':             'reps_only',
  'downward dog':           'reps_only',
  'upward dog':             'reps_only',
  'cobra pose':             'reps_only',
  'camel pose':             'reps_only',
  'wheel pose':             'reps_only',
  'bridge pose':            'reps_only',
  'bow pose':               'reps_only',
  'pigeon pose':            'time_only',   // passive long hold
  'seated forward fold':    'time_only',   // passive long hold
  'butterfly stretch':      'time_only',   // passive long hold
  'supine twist':           'reps_only',
  "child's pose":           'time_only',   // passive long hold
  'childs pose':            'time_only',   // passive long hold
  'happy baby':             'reps_only',
  'legs up the wall':       'time_only',   // passive recovery hold
  'corpse pose':            'time_only',   // passive recovery hold
  'savasana':               'time_only',   // passive recovery hold
  'cat cow':                'reps_only',
  'cat-cow':                'reps_only',

  // ── Stretching / mobility ──
  'hip flexor stretch':     'time_only',
  'hamstring stretch':      'time_only',
  'quad stretch':           'time_only',
  'chest opener':           'time_only',
  'shoulder stretch':       'time_only',
  'thoracic rotation':      'time_only',
  "world's greatest stretch": 'time_only',
  'foam rolling':           'time_only',
  'foam roll':              'time_only',

  // ── Bodyweight reps only ──
  'pull-ups':             'reps_only',
  pullups:                'reps_only',
  'pull ups':             'reps_only',
  'chin-ups':             'reps_only',
  chinups:                'reps_only',
  'chin ups':             'reps_only',
  'push-ups':             'reps_only',
  pushups:                'reps_only',
  'push ups':             'reps_only',
  'wall push-up':         'reps_only',
  'wall push up':         'reps_only',
  'wall pushup':          'reps_only',
  'kneeling push-up':     'reps_only',
  'kneeling pushup':      'reps_only',
  'handstand push-up':    'reps_only',
  'handstand pushup':     'reps_only',
  'handstand push ups':   'reps_only',
  'muscle-up':            'reps_only',
  'muscle up':            'reps_only',
  'muscle ups':           'reps_only',
  'kipping pull-up':      'reps_only',
  'kipping pullup':       'reps_only',
  'typewriter pull-up':   'reps_only',
  dips:                   'reps_only',
  'chest dips':           'reps_only',
  'jump squat':           'reps_only',
  'squat jump':           'reps_only',
  'squat jumps':          'reps_only',
  'air squat':            'reps_only',
  'air squats':           'reps_only',
  'bodyweight squat':     'reps_only',
  'bodyweight squats':    'reps_only',
  'pistol squat':         'reps_only',
  'pistol squats':        'reps_only',
  'single leg squat':     'reps_only',
  'single-leg squat':     'reps_only',
  'jump lunge':           'reps_only',
  'jump lunges':          'reps_only',
  'jumping lunge':        'reps_only',
  'jumping lunges':       'reps_only',
  'bodyweight lunge':     'reps_only',
  'bodyweight lunges':    'reps_only',
  'high knees':           'reps_only',
  'high knee':            'reps_only',
  'skater jump':          'reps_only',
  'skater jumps':         'reps_only',
  'lateral jump':         'reps_only',
  'lateral jumps':        'reps_only',
  'broad jump':           'reps_only',
  'broad jumps':          'reps_only',
  'tuck jump':            'reps_only',
  'tuck jumps':           'reps_only',
  'star jump':            'reps_only',
  'star jumps':           'reps_only',
  'bodyweight hip thrust':  'reps_only',
  'bodyweight glute bridge':'reps_only',

  // ── Core bodyweight — reps only ──
  crunch:                  'reps_only',
  crunches:                'reps_only',
  'leg raise':             'reps_only',
  'leg raises':            'reps_only',
  'hanging leg raise':     'reps_only',
  'hanging leg raises':    'reps_only',
  'hanging knee raise':    'reps_only',
  'hanging knee raises':   'reps_only',
  'toes to bar':           'reps_only',
  'toes-to-bar':           'reps_only',
  't2b':                   'reps_only',
  'knees to chest':        'reps_only',
  'v-up':                  'reps_only',
  'v up':                  'reps_only',
  'v-ups':                 'reps_only',
  'v ups':                 'reps_only',
  'dragon flag':           'reps_only',
  'dragon flags':          'reps_only',
  'ab wheel rollout':      'reps_only',
  'ab wheel':              'reps_only',
  'russian twist':         'reps_only',
  'russian twists':        'reps_only',
  'sit-up':                'reps_only',
  'sit-ups':               'reps_only',
  'sit up':                'reps_only',
  'sit ups':               'reps_only',
  'bicycle crunch':        'reps_only',
  'bicycle crunches':      'reps_only',
  'mountain climbers':     'reps_only',
  'mountain climber':      'reps_only',
  'burpee':                'reps_only',
  'burpees':               'reps_only',
  'jumping jack':          'reps_only',
  'jumping jacks':         'reps_only',
  'nordic hamstring curl': 'reps_only',
  'nordic curl':           'reps_only',
  'nordic curls':          'reps_only',
  'glute kickback':        'reps_only',
  'donkey kick':           'reps_only',
  'donkey kicks':          'reps_only',
  'fire hydrant':          'reps_only',
  'fire hydrants':         'reps_only',
  'side lying leg raise':  'reps_only',
  'hip raise':             'reps_only',
  'hip raises':            'reps_only',

  // ── Height + reps ──
  'box jump':  'height_reps',
  'box jumps': 'height_reps',

  // ── Glutes / bodyweight reps ──
  'glute bridge':               'reps_only',
  'single leg hip thrust':      'reps_only',
  'clamshell':                  'reps_only',
  'clamshells':                 'reps_only',
  'side lying hip abduction':   'reps_only',
  'hip abduction (lying)':      'reps_only',

  // ── Legs bodyweight / reps only ──
  'sissy squat':                'reps_only',
  'reverse nordic':             'reps_only',
  'terminal knee extension':    'reps_only',
  'tke':                        'reps_only',
  'ankle circles':              'reps_only',
  'ankle dorsiflexion':         'reps_only',
  'tibialis raise':             'reps_only',
  'hip circle':                 'reps_only',

  // ── Core reps / bodyweight ──
  'ghd sit-up':                 'reps_only',
  'oblique knee raise':         'reps_only',
  "captain's chair leg raise":  'reps_only',
  'decline sit-up':             'reps_only',
  'decline oblique crunch':     'reps_only',
  'leg raise on decline':       'reps_only',
  'oblique crunch':             'reps_only',

  // ── Core timed holds ──
  'side plank':                 'time_only',
  'copenhagen plank':           'time_only',
  'l-sit':                      'time_only',
  'l sit':                      'time_only',

  // ── Core reps ──
  'bird dog':                   'reps_only',
  'reverse crunch':             'reps_only',
  'reverse crunches':           'reps_only',
  'decline crunch':             'reps_only',
  'decline crunches':           'reps_only',

  // ── Shoulder bodyweight ──
  'band pull apart':            'reps_only',
  'band pull aparts':           'reps_only',
  'pike push-up':               'reps_only',
  'pike push ups':              'reps_only',
  'pike pushup':                'reps_only',

  // ── Back bodyweight / assisted machine ──
  'inverted row':               'reps_only',
  'inverted rows':              'reps_only',
  'neutral grip pull-up':       'reps_only',
  'neutral grip pullup':        'reps_only',
  'assisted pull-up':           'reps_only',
  'assisted chin-up':           'reps_only',
  'wide grip pull-up':          'reps_only',
  'close grip chin-up':         'reps_only',

  // ── Triceps bodyweight / assisted ──
  'tricep dips':                'reps_only',
  'assisted tricep dip':        'reps_only',
  'close grip dip':             'reps_only',

  // ── Mobility — timed ──
  'ankle dorsiflexion stretch': 'time_only',
  'calf stretch':               'time_only',
  '90/90 hip stretch':          'time_only',
  'couch stretch':              'time_only',
  'figure 4 stretch':           'time_only',
  'thoracic extension':         'time_only',
  'thread the needle':          'time_only',
  'band distraction hip':       'time_only',
  'lacrosse ball massage':      'time_only',
  'lateral lunge stretch':      'time_only',
  'doorway chest stretch':      'time_only',

  // ── Mobility — reps ──
  'neck rolls':                 'reps_only',
  'shoulder circles':           'reps_only',
  'wrist circles':              'reps_only',

  // ── Cardio timed ──
  'skipping':                   'time_only',
  'boxing':                     'time_only',
  'shadow boxing':              'time_only',
  'hiit':                       'time_only',
  'sprint intervals':           'time_only',
  'tabata protocol':            'time_only',
  'steady climb':               'time_only',
  'interval climb':             'time_only',
  'stair sprint':               'time_only',
  'side step climb':            'time_only',
  'hill climb':                 'distance_time',
  'incline walk':               'distance_time',
  'forward elliptical':         'distance_time',
  'reverse elliptical':         'distance_time',
  'incline elliptical':         'distance_time',
  'high resistance elliptical': 'distance_time',
  'steady state cycling':       'distance_time',
  'interval cycling':           'distance_time',
  'high resistance cycling':    'distance_time',
  'sprint cycling':             'distance_time',
  'endurance cycling':          'distance_time',
  'rowing':                     'distance_time',
  'endurance row':              'distance_time',
  'sprint row intervals':       'distance_time',
  'power strokes':              'distance_time',
  'arm cycling':                'distance_time',
  'forward arm cycle':          'distance_time',
  'reverse arm cycle':          'distance_time',
  'interval arm cycling':       'time_only',

  // ── Forearms ──
  'wrist curl':                 'weight_reps',
  'reverse wrist curl':         'weight_reps',
  'wrist roller':               'reps_only',
  'plate pinch':                'time_only',
  'finger curls':               'weight_reps',
  'wrist extension':            'weight_reps',
  'grip training':              'time_only',
  'farmers carry':              'distance_only',

  // ── Weight + reps (explicit to prevent false pattern matches) ──
  'walking lunge':              'weight_reps',
  'walking lunges':             'weight_reps',
  'reverse lunge':              'weight_reps',
  'dumbbell walking lunge':     'weight_reps',
  'step up':                    'weight_reps',
  'step ups':                   'weight_reps',
  'vmo squat':                  'weight_reps',
  'goblet squat':               'weight_reps',
  'split squat':                'weight_reps',
};

// ─────────────────────────────────────────────────────────────────────────────
// Pattern-based lookup — ordered from most-specific to least-specific.
// Uses word-boundary anchors (\b) to avoid substring false-positives
// (e.g. "crunch" must NOT match "run", "bicycle crunch" must NOT match "cycle").
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_PATTERNS: { patterns: RegExp[]; type: ExerciseInputType }[] = [
  // ── Distance + Time ───────────────────────────────────────────────────────
  {
    patterns: [
      /\btreadmill\b/i,
      /\brilliant?ical\b/i,
      /\bski[\s-]?erg\b/i,
      /\bassault[\s-]bike\b/i,
      /\becho[\s-]bike\b/i,
      /\bair[\s-]bike\b/i,
      /\bspin[\s-]bike\b/i,
      /\bstationary[\s-](bike|cycle)\b/i,
      /sled[\s-]push/i,
      /sled[\s-]pull/i,
      /farmers?[\s-]walk/i,
      /farmer[\s-]carry/i,
      /loaded[\s-]carry/i,
      /\browing[\s-]machine\b/i,
      /\b(erg|rower)\b/i,
      // Running / jogging — word-bounded so "crunch" (c-RUN-ch) is NOT caught
      /\brun(s|ning|ner)?\b/i,
      /\bjog(s|ging)?\b/i,
      /\bsprint(s|ing|er)?\b/i,
      // Cycling — word-bounded so "bicycle crunch" is NOT caught
      /\bcycl(e|es|ing|ist)\b/i,
      /\bbike\b/i,
    ],
    type: 'distance_time',
  },

  // ── Distance Only ─────────────────────────────────────────────────────────
  {
    patterns: [
      /\bswim(s|ming|mer)?\b/i,
      // "walking" only when it IS the full activity, not "walking lunge" etc.
      // The EXACT_TYPE_MAP handles "walking lunge" → weight_reps before we reach here,
      // but add a guard pattern: match "walking" only when NOT followed by "lunge".
      /\bwalking\b(?!\s+lunge)/i,
      /\bwalk\b(?!\s+out|ing\s+lunge)/i,
    ],
    type: 'distance_only',
  },

  // ── Time Only ─────────────────────────────────────────────────────────────
  {
    patterns: [
      /stair[\s-]?(master|climber|stepper)/i,
      /\bstepmill\b/i,
      /battle[\s-]ropes?/i,
      /\bjump[\s-]rope\b/i,
      /\bplank\b/i,
      /\bwall[\s-]sit\b/i,
      /\bsauna\b/i,
      /\bstretching?\b/i,
      /\bstretch(ing)?\b/i,
      /\bmeditation\b/i,
      /\bhollow[\s-]hold\b/i,
      /\bisometric\b/i,
      /\bfoam[\s-]roll(ing)?\b/i,
      /\bmobility\b/i,
      /\bsavasana\b/i,
    ],
    type: 'time_only',
  },

  // ── Yoga / Pose — reps_only with optional weight toggle ───────────────────
  {
    patterns: [
      /\byoga\b/i,
      /\bvinyasa\b/i,
      /\basana\b/i,
      /\bpose\b/i,
      /\bwarrior\b/i,
      /\bpigeon\b/i,
      /\bnamaste\b/i,
      /\bpranayama\b/i,
      /\bcat[\s-]cow\b/i,
    ],
    type: 'reps_only',
  },

  // ── Bodyweight / Reps Only ────────────────────────────────────────────────
  {
    patterns: [
      /\bbodyweight\b/i,        // any "bodyweight X" → reps_only with optional weight
      /\bair[\s-]squat\b/i,
      /\bpistol[\s-]squat\b/i,
      /\bhigh[\s-]knees?\b/i,
      /\bjump[\s-]lunge\b/i,
      /\bjumping[\s-]lunge\b/i,
      /\bskater[\s-]jump\b/i,
      /\btuck[\s-]jump\b/i,
      /\bstar[\s-]jump\b/i,
      /\bbroad[\s-]jump\b/i,
      /\bhandstand[\s-]push[\s-]?ups?\b/i,
      /\bmuscle[\s-]?ups?\b/i,
      /\bpull[\s-]?ups?\b/i,
      /\bchin[\s-]?ups?\b/i,
      /\bpush[\s-]?ups?\b/i,
      /\bdips?\b/i,
      /\bjump[\s-]squat\b/i,
      /\bdip\b/i,
      // Core bodyweight
      /\bcrunche?s?\b/i,
      /\bleg[\s-]raises?\b/i,
      /\bhanging[\s-](leg|knee)[\s-]raises?\b/i,
      /\btoes[\s-]to[\s-]bar\b/i,
      /\bt2b\b/i,
      /\bknees[\s-]to[\s-](chest|elbow)\b/i,
      /\bv[\s-]ups?\b/i,
      /\bdragon[\s-]flags?\b/i,
      /\bab[\s-]wheel\b/i,
      /\brussian[\s-]twists?\b/i,
      /\bsit[\s-]?ups?\b/i,
      /\bbicycle[\s-]crunche?s?\b/i,
      /\bmountain[\s-]climbers?\b/i,
      /\bburpees?\b/i,
      /\bjumping[\s-]jacks?\b/i,
      /\bnordic[\s-](hamstring[\s-])?curls?\b/i,
      /\bglute[\s-]kickbacks?\b/i,
      /\bdonkey[\s-]kicks?\b/i,
      /\bfire[\s-]hydrants?\b/i,
      /\bhip[\s-]raises?\b/i,
    ],
    type: 'reps_only',
  },

  // ── Height + Reps ─────────────────────────────────────────────────────────
  {
    patterns: [/\bbox[\s-]jumps?\b/i, /\bdepth[\s-]jumps?\b/i],
    type: 'height_reps',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public resolver — exact → pattern → default
// ─────────────────────────────────────────────────────────────────────────────
const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const resolveExerciseInputType = (exerciseName: string): ExerciseInputType => {
  const normalized = normalizeKey(exerciseName);

  // 1. Exact match (fastest, most reliable)
  const exact = EXACT_TYPE_MAP[normalized];
  if (exact) return exact;

  // 2. Pattern match (word-boundary safe — no substring false-positives)
  for (const { patterns, type } of TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(normalized))) return type;
  }

  // 3. Default: almost every gym exercise is weight × reps
  return 'weight_reps';
};

// ─────────────────────────────────────────────────────────────────────────────
// Label / unit helpers
// ─────────────────────────────────────────────────────────────────────────────
export const INPUT_LABELS: Record<
  ExerciseInputType,
  { primary: string; secondary: string | null }
> = {
  weight_reps:    { primary: 'KG',   secondary: 'REPS' },
  distance_time:  { primary: 'KM',   secondary: 'MIN'  },
  time_only:      { primary: 'MIN',  secondary: 'SEC'  },
  distance_only:  { primary: 'KM',   secondary: null   },
  reps_only:      { primary: 'REPS', secondary: null   },
  height_reps:    { primary: 'CM',   secondary: 'REPS' },
  calories_time:  { primary: 'CAL',  secondary: 'MIN'  },
};

export const hasSecondaryField = (type: ExerciseInputType) => INPUT_LABELS[type].secondary !== null;

export const isDistanceExerciseType = (type: ExerciseInputType) =>
  type === 'distance_time' || type === 'distance_only';

export const isWeightExerciseType = (type: ExerciseInputType) =>
  type === 'weight_reps' || type === 'height_reps';

export const getFieldKinds = (type: ExerciseInputType): {
  primary: DialFieldKind;
  secondary: DialFieldKind | null;
} => {
  switch (type) {
    case 'weight_reps':   return { primary: 'weight',   secondary: 'reps'    };
    case 'distance_time': return { primary: 'distance', secondary: 'minutes' };
    case 'time_only':     return { primary: 'minutes',  secondary: 'seconds' };
    case 'distance_only': return { primary: 'distance', secondary: null      };
    case 'reps_only':     return { primary: 'reps',     secondary: null      };
    case 'height_reps':   return { primary: 'height',   secondary: 'reps'   };
    case 'calories_time': return { primary: 'calories', secondary: 'minutes' };
    default:              return { primary: 'weight',   secondary: 'reps'    };
  }
};

export const getDefaultSetValues = (type: ExerciseInputType) => {
  switch (type) {
    case 'distance_time': return { weight: 0, reps: 5   };
    case 'time_only':     return { weight: 2, reps: 0   };
    case 'calories_time': return { weight: 0, reps: 5   };
    case 'reps_only':     return { weight: 0, reps: 10  };
    case 'distance_only': return { weight: 0, reps: 0   };
    case 'height_reps':   return { weight: 0, reps: 8   };
    case 'weight_reps':
    default:              return { weight: 0, reps: 0   };
  }
};

export const getInputLabels = (
  type: ExerciseInputType,
  options?: { weightUnit?: WeightUnit; distanceUnit?: DistanceUnit },
) => {
  const weightUnit   = (options?.weightUnit   || 'lbs').toUpperCase();
  const distanceUnit = (options?.distanceUnit || 'km').toUpperCase();
  const base = INPUT_LABELS[type];

  if (type === 'weight_reps') return { primary: weightUnit, secondary: base.secondary };
  if (type === 'distance_time' || type === 'distance_only') return { primary: distanceUnit, secondary: base.secondary };
  return base;
};

export const getUnitDisplay = (
  type: ExerciseInputType,
  options?: { weightUnit?: WeightUnit; distanceUnit?: DistanceUnit },
) => {
  if (type === 'weight_reps')                              return (options?.weightUnit   || 'lbs').toUpperCase();
  if (type === 'distance_time' || type === 'distance_only') return (options?.distanceUnit || 'km').toUpperCase();
  if (type === 'height_reps')   return 'CM';
  if (type === 'calories_time') return 'CAL';
  if (type === 'reps_only')     return 'REPS';
  if (type === 'time_only')     return 'MIN';
  return '';
};

export const isSetReadyForCompletion = (
  type: ExerciseInputType,
  values: { weight: number | null; reps: number | null },
) => {
  const weight = Number(values.weight || 0);
  const reps   = Number(values.reps   || 0);

  switch (type) {
    case 'weight_reps':   return reps > 0;
    case 'distance_time': return weight > 0 || reps > 0;
    case 'time_only':     return weight > 0 || reps > 0;
    case 'distance_only': return weight > 0;
    case 'reps_only':     return reps > 0;
    case 'height_reps':   return reps > 0;
    case 'calories_time': return weight > 0 || reps > 0;
    default:              return weight > 0 || reps > 0;
  }
};

export const formatSetValue = (kind: DialFieldKind, value: number | null) => {
  const numeric = Number(value || 0);
  if (kind === 'weight' || kind === 'distance') return numeric.toFixed(1);
  return String(Math.round(numeric));
};

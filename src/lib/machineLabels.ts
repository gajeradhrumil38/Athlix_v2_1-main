// Maps lowercase-normalised exercise name → machine/equipment label shown at low opacity in ExercisePicker.
// Keys must match normalizeExerciseName() output (lowercase, trimmed).

export const MACHINE_LABELS: Record<string, string> = {
  // ── Chest Press Machine ──────────────────────────────────────────────
  'flat chest press':            'Chest Press Machine',
  'wide grip chest press':       'Chest Press Machine',
  'narrow grip chest press':     'Chest Press Machine',
  'single arm chest press':      'Chest Press Machine',
  'machine chest press':         'Chest Press Machine',

  // ── Pec Deck Machine ─────────────────────────────────────────────────
  'pec deck fly':                'Pec Deck Machine',
  'chest fly':                   'Pec Deck Machine',
  'single arm pec fly':          'Pec Deck Machine',
  'reverse pec deck':            'Pec Deck Machine',

  // ── Cable / Crossover ────────────────────────────────────────────────
  'cable crossover':             'Cable Crossover',
  'standing cable press':        'Cable Machine',
  'cable chest fly':             'Cable Machine',
  'cable bicep curl':            'Cable Machine',
  'cable front raise':           'Cable Machine',
  'cable upright row':           'Cable Machine',
  'cable shrugs':                'Cable Machine',
  'cable kickbacks':             'Cable Machine',
  'cable woodchop':              'Cable Machine',
  'cable hip adduction':         'Cable Machine',
  'cable hip abduction':         'Cable Machine',
  'v-bar pushdown':              'Cable Machine',
  'single arm pushdown':         'Cable Machine',
  'reverse grip pushdown':       'Cable Machine',

  // ── Smith Machine ────────────────────────────────────────────────────
  'smith machine bench press':   'Smith Machine',
  'smith machine squat':         'Smith Machine',
  'smith machine shoulder press':'Smith Machine',
  'smith machine row':           'Smith Machine',
  'smith machine deadlift':      'Smith Machine',
  'smith machine lunges':        'Smith Machine',
  'smith machine calf raise':    'Smith Machine',
  'smith machine upright row':   'Smith Machine',

  // ── Lat Pulldown Machine ──────────────────────────────────────────────
  'lat pulldown':                'Lat Pulldown Machine',
  'wide grip lat pulldown':      'Lat Pulldown Machine',
  'close grip lat pulldown':     'Lat Pulldown Machine',
  'reverse grip lat pulldown':   'Lat Pulldown Machine',
  'single arm lat pulldown':     'Lat Pulldown Machine',
  'neutral grip lat pulldown':   'Lat Pulldown Machine',
  'v-bar lat pulldown':          'Lat Pulldown Machine',

  // ── Seated Row Machine ────────────────────────────────────────────────
  'seated cable row':            'Seated Row Machine',
  'wide grip row':               'Seated Row Machine',
  'close grip row':              'Seated Row Machine',
  'v-bar row':                   'Seated Row Machine',
  'neutral grip row':            'Seated Row Machine',

  // ── T-Bar Row ────────────────────────────────────────────────────────
  't-bar row':                   'T-Bar Row Machine',
  'close grip t-bar row':        'T-Bar Row Machine',
  'wide grip t-bar row':         'T-Bar Row Machine',
  'single arm t-bar row':        'T-Bar Row Machine',

  // ── Chest Supported Row ───────────────────────────────────────────────
  'chest supported row':         'Chest Supported Row Machine',
  'incline row':                 'Chest Supported Row Machine',
  'prone row':                   'Chest Supported Row Machine',
  'single arm supported row':    'Chest Supported Row Machine',

  // ── Pull-up Assist ────────────────────────────────────────────────────
  'assisted pull-up':            'Assisted Pull-up Machine',
  'assisted chin-up':            'Assisted Pull-up Machine',

  // ── Shrug Machine ────────────────────────────────────────────────────
  'machine shrugs':              'Shrug Machine',
  'behind the back shrugs':      'Shrug Machine',

  // ── Shoulder Press Machine ────────────────────────────────────────────
  'seated shoulder press':       'Shoulder Press Machine',
  'single arm shoulder press':   'Shoulder Press Machine',

  // ── Lateral Raise Machine ─────────────────────────────────────────────
  'machine lateral raise':       'Lateral Raise Machine',
  'single arm lateral raise':    'Lateral Raise Machine',
  'seated lateral raise':        'Lateral Raise Machine',

  // ── Rear Delt Machine ────────────────────────────────────────────────
  'rear delt fly':               'Reverse Pec Deck Machine',
  'single arm rear delt fly':    'Reverse Pec Deck Machine',

  // ── Bicep Curl Machine ────────────────────────────────────────────────
  'machine bicep curl':          'Bicep Curl Machine',
  'single arm bicep curl':       'Bicep Curl Machine',

  // ── Preacher Curl Machine ─────────────────────────────────────────────
  'preacher curl':               'Preacher Curl Machine',
  'single arm preacher curl':    'Preacher Curl Machine',
  'ez bar preacher curl':        'Preacher Curl Machine',
  'reverse preacher curl':       'Preacher Curl Machine',

  // ── Tricep Extension Machine ──────────────────────────────────────────
  'seated tricep extension':     'Tricep Extension Machine',
  'single arm tricep extension': 'Tricep Extension Machine',

  // ── Tricep Dip Machine ────────────────────────────────────────────────
  'assisted tricep dip':         'Tricep Dip Machine',

  // ── Leg Press Machine ─────────────────────────────────────────────────
  'leg press':                   'Leg Press Machine',
  'single leg press':            'Leg Press Machine',
  'wide stance leg press':       'Leg Press Machine',
  'narrow stance leg press':     'Leg Press Machine',
  'high foot placement leg press': 'Leg Press Machine',
  'low foot placement leg press':  'Leg Press Machine',
  'calf press on leg press':     'Leg Press Machine',

  // ── Hack Squat Machine ────────────────────────────────────────────────
  'hack squat':                  'Hack Squat Machine',
  'reverse hack squat':          'Hack Squat Machine',
  'single leg hack squat':       'Hack Squat Machine',
  'narrow stance hack squat':    'Hack Squat Machine',
  'wide stance hack squat':      'Hack Squat Machine',

  // ── Leg Extension Machine ─────────────────────────────────────────────
  'leg extension':               'Leg Extension Machine',
  'single leg extension':        'Leg Extension Machine',
  'tempo leg extension':         'Leg Extension Machine',

  // ── Leg Curl Machine ──────────────────────────────────────────────────
  'lying leg curl':              'Leg Curl Machine (Lying)',
  'single leg curl':             'Leg Curl Machine',
  'tempo leg curl':              'Leg Curl Machine',
  'seated leg curl':             'Leg Curl Machine (Seated)',
  'single leg seated curl':      'Leg Curl Machine (Seated)',

  // ── Hip Abductor / Adductor ───────────────────────────────────────────
  'hip abduction':               'Hip Abductor Machine',
  'seated hip abduction':        'Hip Abductor Machine',
  'single leg hip abduction':    'Hip Abductor Machine',
  'abductor machine':            'Hip Abductor Machine',
  'hip adduction':               'Hip Adductor Machine',
  'seated hip adduction':        'Hip Adductor Machine',
  'inner thigh squeeze':         'Hip Adductor Machine',
  'adductor machine':            'Hip Adductor Machine',

  // ── Calf Raise Machine ────────────────────────────────────────────────
  'standing calf raise':         'Calf Raise Machine',
  'single leg calf raise':       'Calf Raise Machine',
  'toe press':                   'Leg Press Machine',
  'seated calf raise':           'Calf Raise Machine (Seated)',
  'single leg seated calf raise':'Calf Raise Machine (Seated)',
  'calf raises':                 'Calf Raise Machine',

  // ── Belt / Pendulum / Sissy Squat ─────────────────────────────────────
  'belt squat':                  'Belt Squat Machine',
  'single leg belt squat':       'Belt Squat Machine',
  'wide stance belt squat':      'Belt Squat Machine',
  'pendulum squat':              'Pendulum Squat Machine',
  'single leg pendulum squat':   'Pendulum Squat Machine',
  'assisted sissy squat':        'Sissy Squat Machine',

  // ── Back Extension / GHD ─────────────────────────────────────────────
  'back extension':              'Back Extension Machine',
  '45-degree back extension':    'Back Extension Machine',
  'hyperextension':              'Hyperextension Bench',
  'weighted back extension':     'Back Extension Machine',
  'single leg back extension':   'Back Extension Machine',
  'glute ham raise':             'GHD Machine',
  'ghd sit-up':                  'GHD Machine',
  'nordic hamstring curl':       'GHD Machine',
  'reverse hyper':               'Reverse Hyper Machine',
  'single leg reverse hyper':    'Reverse Hyper Machine',

  // ── Glute Kickback / Hip Thrust ───────────────────────────────────────
  'glute kickback':              'Glute Kickback Machine',
  'single leg kickback':         'Glute Kickback Machine',
  'hip thrust':                  'Hip Thrust Machine',
  'single leg hip thrust':       'Hip Thrust Machine',
  'banded hip thrust':           'Hip Thrust Machine',

  // ── Ab / Core Machines ────────────────────────────────────────────────
  'ab crunch machine':           'Ab Crunch Machine',
  'cable crunch':                'Cable Machine',
  'seated torso rotation':       'Torso Rotation Machine',
  'standing torso twist':        'Torso Rotation Machine',
  'captain\'s chair leg raise':  'Captain\'s Chair',
  'oblique knee raise':          'Captain\'s Chair',
  'hanging knee raise':          'Captain\'s Chair',
  'hanging leg raise':           'Captain\'s Chair',

  // ── Forearm Machine ───────────────────────────────────────────────────
  'wrist curl':                  'Forearm Curl Machine',
  'reverse wrist curl':          'Forearm Curl Machine',
  'wrist roller':                'Wrist Roller',

  // ── Cardio Machines ───────────────────────────────────────────────────
  'treadmill':                   'Treadmill',
  'incline walk':                'Treadmill',
  'hill climb':                  'Treadmill',
  'sprint intervals':            'Treadmill / Track',
  'elliptical':                  'Elliptical Trainer',
  'forward elliptical':          'Elliptical Trainer',
  'reverse elliptical':          'Elliptical Trainer',
  'incline elliptical':          'Elliptical Trainer',
  'high resistance elliptical':  'Elliptical Trainer',
  'steady state cycling':        'Stationary Bike',
  'interval cycling':            'Stationary Bike',
  'high resistance cycling':     'Stationary Bike',
  'sprint cycling':              'Stationary Bike',
  'endurance cycling':           'Recumbent Bike',
  'rowing':                      'Rowing Machine',
  'endurance row':               'Rowing Machine',
  'power strokes':               'Rowing Machine',
  'sprint row intervals':        'Rowing Machine',
  'steady climb':                'StairMaster',
  'interval climb':              'StairMaster',
  'stair sprint':                'StairMaster',
  'side step climb':             'StairMaster',
  'tabata protocol':             'Air Bike / Any Cardio',
  'arm cycling':                 'Arm Ergometer',
  'forward arm cycle':           'Arm Ergometer',
  'reverse arm cycle':           'Arm Ergometer',
  'interval arm cycling':        'Arm Ergometer',
};

export const getMachineLabel = (exerciseName: string): string | null => {
  const key = exerciseName.toLowerCase().replace(/\s+/g, ' ').trim();
  return MACHINE_LABELS[key] ?? null;
};

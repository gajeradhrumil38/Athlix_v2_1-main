import type { Slug } from 'react-muscle-highlighter';

export type MuscleRegion =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Arms'
  | 'Legs'
  | 'Glutes'
  | 'Core'
  | 'Forearms'
  | 'Cardio'
  | 'Yoga'
  | 'Mobility';

export type MuscleSlug = Extract<
  Slug,
  | 'abs'
  | 'adductors'
  | 'ankles'
  | 'biceps'
  | 'calves'
  | 'chest'
  | 'deltoids'
  | 'forearm'
  | 'gluteal'
  | 'hamstring'
  | 'lower-back'
  | 'obliques'
  | 'quadriceps'
  | 'tibialis'
  | 'trapezius'
  | 'triceps'
  | 'upper-back'
>;

export interface ExerciseMuscleTarget {
  slug: MuscleSlug;
  weight: number;
}

export interface ExerciseMuscleProfile {
  primary: MuscleRegion[];
  secondary: MuscleRegion[];
  targets: ExerciseMuscleTarget[];
}

interface ExercisePatternProfile {
  patterns: RegExp[];
  targets: ExerciseMuscleTarget[];
  primaryRegions?: MuscleRegion[];
  secondaryRegions?: MuscleRegion[];
}

export const PRIMARY_LOAD_WEIGHT = 1;
export const SECONDARY_LOAD_WEIGHT = 0.4;

export const MUSCLE_SLUG_LABELS: Record<MuscleSlug, string> = {
  abs: 'Abs',
  adductors: 'Adductors',
  ankles: 'Ankles',
  biceps: 'Biceps',
  calves: 'Calves',
  chest: 'Chest',
  deltoids: 'Shoulders',
  forearm: 'Forearms',
  gluteal: 'Glutes',
  hamstring: 'Hamstrings',
  'lower-back': 'Lower Back',
  obliques: 'Obliques',
  quadriceps: 'Quads',
  tibialis: 'Tibialis',
  trapezius: 'Traps',
  triceps: 'Triceps',
  'upper-back': 'Upper Back',
};

export const MUSCLE_SLUG_REGION_MAP: Record<MuscleSlug, MuscleRegion> = {
  abs: 'Core',
  adductors: 'Legs',
  ankles: 'Legs',
  biceps: 'Biceps',
  calves: 'Legs',
  chest: 'Chest',
  deltoids: 'Shoulders',
  forearm: 'Forearms',
  gluteal: 'Glutes',
  hamstring: 'Legs',
  'lower-back': 'Back',
  obliques: 'Core',
  quadriceps: 'Legs',
  tibialis: 'Legs',
  trapezius: 'Back',
  triceps: 'Triceps',
  'upper-back': 'Back',
};

const target = (slug: MuscleSlug, weight: number): ExerciseMuscleTarget => ({ slug, weight });

const normalizeTargets = (targets: ExerciseMuscleTarget[]) => {
  const bySlug = new Map<MuscleSlug, number>();
  targets.forEach(({ slug, weight }) => {
    if (weight <= 0) return;
    bySlug.set(slug, (bySlug.get(slug) || 0) + weight);
  });

  return Array.from(bySlug.entries())
    .map(([slug, weight]) => ({
      slug,
      weight: Number(weight.toFixed(3)),
    }))
    .sort((a, b) => b.weight - a.weight);
};

const uniqueRegions = (regions: MuscleRegion[]) => Array.from(new Set(regions));

const deriveRegionsFromTargets = (targets: ExerciseMuscleTarget[]) => {
  const regionWeights = new Map<MuscleRegion, number>();

  targets.forEach(({ slug, weight }) => {
    const region = MUSCLE_SLUG_REGION_MAP[slug];
    regionWeights.set(region, (regionWeights.get(region) || 0) + weight);
  });

  const sorted = Array.from(regionWeights.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) {
    return {
      primary: ['Core'] as MuscleRegion[],
      secondary: [] as MuscleRegion[],
    };
  }

  const topWeight = sorted[0][1];
  const primary = sorted
    .filter(([, weight], index) => weight >= topWeight * 0.65 || index === 0)
    .map(([region]) => region);
  const secondary = sorted
    .filter(([region, weight]) => !primary.includes(region) && weight >= topWeight * 0.24)
    .map(([region]) => region);

  return {
    primary: uniqueRegions(primary),
    secondary: uniqueRegions(secondary),
  };
};

const buildProfile = (
  targets: ExerciseMuscleTarget[],
  primaryRegions?: MuscleRegion[],
  secondaryRegions?: MuscleRegion[],
): ExerciseMuscleProfile => {
  const normalizedTargets = normalizeTargets(targets);
  const derived = deriveRegionsFromTargets(normalizedTargets);

  return {
    primary: uniqueRegions(primaryRegions || derived.primary),
    secondary: uniqueRegions(
      (secondaryRegions || derived.secondary).filter(
        (region) => !(primaryRegions || derived.primary).includes(region),
      ),
    ),
    targets: normalizedTargets,
  };
};

const FALLBACK_TARGETS_BY_GROUP: Record<MuscleRegion, ExerciseMuscleTarget[]> = {
  Chest:     [target('chest', 1), target('deltoids', 0.28), target('triceps', 0.22)],
  Back:      [target('upper-back', 0.8), target('trapezius', 0.45), target('lower-back', 0.35), target('biceps', 0.2)],
  Shoulders: [target('deltoids', 1), target('trapezius', 0.18)],
  Biceps:    [target('biceps', 1)],
  Triceps:   [target('triceps', 1)],
  Arms:      [target('biceps', 0.55), target('triceps', 0.55), target('forearm', 0.2)],
  Legs:      [target('quadriceps', 0.8), target('gluteal', 0.55), target('hamstring', 0.45), target('adductors', 0.22), target('calves', 0.15)],
  Glutes:    [target('gluteal', 1), target('hamstring', 0.45), target('adductors', 0.18)],
  Core:      [target('abs', 0.82), target('obliques', 0.42)],
  Forearms:  [target('forearm', 1)],
  Cardio:    [target('quadriceps', 0.45), target('calves', 0.42), target('hamstring', 0.22), target('gluteal', 0.18)],
  Yoga:      [target('lower-back', 0.45), target('hamstring', 0.45), target('abs', 0.38), target('deltoids', 0.3), target('adductors', 0.28), target('gluteal', 0.22)],
  Mobility:  [target('lower-back', 0.5), target('hamstring', 0.45), target('adductors', 0.4), target('gluteal', 0.3), target('tibialis', 0.2), target('calves', 0.18)],
};

const EXERCISE_MUSCLE_PATTERNS: ExercisePatternProfile[] = [
  {
    patterns: [/incline (bench )?press/i, /incline dumbbell press/i],
    targets: [target('chest', 0.88), target('deltoids', 0.55), target('triceps', 0.45)],
  },
  {
    patterns: [/close[- ]grip bench/i, /close grip bench/i],
    targets: [target('triceps', 0.95), target('chest', 0.35), target('deltoids', 0.22)],
  },
  {
    patterns: [
      /bench press/i,
      /chest press/i,
      /machine chest press/i,
      /smith (bench )?press/i,
      /decline (bench )?press/i,
      /dumbbell (bench|chest) press/i,
      /floor press/i,
    ],
    targets: [target('chest', 1), target('triceps', 0.55), target('deltoids', 0.42)],
  },
  {
    patterns: [/reverse pec deck/i, /rear delt fly/i, /rear delt raise/i],
    targets: [target('deltoids', 0.8), target('upper-back', 0.52), target('trapezius', 0.3)],
    primaryRegions: ['Shoulders'],
    secondaryRegions: ['Back'],
  },
  {
    patterns: [/cable fly/i, /flye/i, /\bfly\b/i, /pec deck/i, /crossover/i],
    targets: [target('chest', 1), target('deltoids', 0.16)],
  },
  {
    patterns: [/landmine press/i],
    targets: [target('chest', 0.68), target('deltoids', 0.62), target('triceps', 0.42), target('abs', 0.16)],
    primaryRegions: ['Chest', 'Shoulders'],
    secondaryRegions: ['Triceps', 'Core'],
  },
  {
    patterns: [/push-?ups?/i],
    targets: [target('chest', 0.82), target('triceps', 0.45), target('deltoids', 0.35), target('abs', 0.18)],
  },
  {
    patterns: [/chest dips/i],
    targets: [target('chest', 0.72), target('triceps', 0.68), target('deltoids', 0.22)],
  },
  {
    patterns: [/\bdips\b/i],
    targets: [target('triceps', 0.85), target('chest', 0.42), target('deltoids', 0.2)],
  },
  {
    patterns: [/straight arm pulldown/i, /straight-arm pulldown/i],
    targets: [target('upper-back', 0.9), target('triceps', 0.14), target('abs', 0.1)],
    primaryRegions: ['Back'],
    secondaryRegions: ['Triceps', 'Core'],
  },
  {
    patterns: [/pull-?ups?/i, /chin-?ups?/i, /lat pull/i, /pulldown/i],
    targets: [target('upper-back', 0.92), target('biceps', 0.42), target('trapezius', 0.2)],
  },
  {
    patterns: [/chest.?supported row/i, /seal row/i, /seated cable row/i, /machine row/i],
    targets: [target('upper-back', 0.9), target('trapezius', 0.38), target('biceps', 0.34)],
  },
  {
    patterns: [/upright row/i],
    targets: [target('deltoids', 0.75), target('trapezius', 0.6), target('biceps', 0.12)],
    primaryRegions: ['Shoulders', 'Back'],
  },
  {
    patterns: [/bent over row/i, /barbell row/i, /t-?bar row/i, /pendlay row/i, /single arm row/i, /\brow\b/i],
    targets: [target('upper-back', 0.88), target('trapezius', 0.4), target('biceps', 0.32), target('lower-back', 0.22)],
  },
  {
    patterns: [/face pull/i, /reverse fly/i, /rear delt/i],
    targets: [target('deltoids', 0.72), target('upper-back', 0.55), target('trapezius', 0.3)],
  },
  {
    patterns: [/shrug/i],
    targets: [target('trapezius', 1)],
    primaryRegions: ['Back'],
  },
  {
    patterns: [/romanian deadlift/i, /\brdl\b/i, /straight leg deadlift/i, /stiff leg deadlift/i, /good morning/i],
    targets: [target('hamstring', 0.95), target('gluteal', 0.72), target('lower-back', 0.35)],
    primaryRegions: ['Legs', 'Back'],
  },
  {
    patterns: [/rack pull/i],
    targets: [target('trapezius', 0.82), target('lower-back', 0.56), target('gluteal', 0.45), target('hamstring', 0.36)],
    primaryRegions: ['Back', 'Legs'],
  },
  {
    patterns: [/back extension/i],
    targets: [target('lower-back', 0.95), target('gluteal', 0.42), target('hamstring', 0.26)],
    primaryRegions: ['Back'],
    secondaryRegions: ['Legs'],
  },
  {
    patterns: [/deadlift/i, /trap bar deadlift/i],
    targets: [target('gluteal', 0.75), target('hamstring', 0.65), target('lower-back', 0.5), target('quadriceps', 0.32), target('trapezius', 0.25)],
    primaryRegions: ['Legs', 'Back'],
  },
  {
    patterns: [/overhead press/i, /shoulder press/i, /dumbbell shoulder press/i, /seated dumbbell press/i, /arnold press/i, /military press/i],
    targets: [target('deltoids', 1), target('triceps', 0.55), target('trapezius', 0.18)],
  },
  {
    patterns: [/lateral raise/i, /side raise/i],
    targets: [target('deltoids', 1)],
  },
  {
    patterns: [/front raise/i],
    targets: [target('deltoids', 0.95)],
  },
  {
    patterns: [/leg curl/i, /hamstring curl/i, /nordic curl/i],
    targets: [target('hamstring', 1)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [
      /barbell curl/i,
      /dumbbell curl/i,
      /hammer curl/i,
      /preacher curl/i,
      /incline dumbbell curl/i,
      /incline curl/i,
      /cable curl/i,
      /ez bar curl/i,
      /spider curl/i,
      /machine bicep curl/i,
      /reverse curl/i,
    ],
    targets: [target('biceps', 1)],
  },
  {
    patterns: [/pushdown/i, /skull crusher/i, /tricep extension/i, /triceps extension/i, /french press/i, /overhead tricep/i],
    targets: [target('triceps', 1)],
  },
  {
    patterns: [/leg press/i, /sled press/i],
    targets: [target('quadriceps', 1), target('gluteal', 0.45), target('adductors', 0.22)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/leg extension/i],
    targets: [target('quadriceps', 1)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/hack squat/i],
    targets: [target('quadriceps', 0.95), target('gluteal', 0.5), target('adductors', 0.25)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/split squat/i, /bulgarian/i, /\blunge\b/i, /step-?up/i],
    targets: [target('quadriceps', 0.8), target('gluteal', 0.62), target('adductors', 0.22), target('hamstring', 0.18)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/\bsquat\b/i],
    targets: [target('quadriceps', 0.88), target('gluteal', 0.65), target('adductors', 0.3), target('hamstring', 0.18)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/hip thrust/i, /glute bridge/i, /hip raise/i],
    targets: [target('gluteal', 1), target('hamstring', 0.35), target('adductors', 0.15)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/calf raise/i],
    targets: [target('calves', 1)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/adductor/i],
    targets: [target('adductors', 1)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/abductor/i],
    targets: [target('gluteal', 1)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/plank/i, /hollow hold/i, /dead bug/i],
    targets: [target('abs', 0.78), target('obliques', 0.45), target('lower-back', 0.18)],
    primaryRegions: ['Core'],
    secondaryRegions: ['Back'],
  },
  {
    patterns: [/crunch/i, /sit-?ups?/i, /leg raise/i, /knee raise/i, /ab wheel/i, /\babs?\b/i],
    targets: [target('abs', 1), target('obliques', 0.25)],
    primaryRegions: ['Core'],
  },
  {
    patterns: [/russian twist/i, /wood ?chop/i, /side bend/i],
    targets: [target('obliques', 1), target('abs', 0.28)],
    primaryRegions: ['Core'],
  },
  {
    patterns: [/ski erg/i, /skierg/i],
    targets: [target('upper-back', 0.68), target('triceps', 0.48), target('abs', 0.4), target('obliques', 0.25), target('quadriceps', 0.16)],
    primaryRegions: ['Cardio', 'Back', 'Core'],
    secondaryRegions: ['Triceps', 'Legs'],
  },
  {
    patterns: [/rowing machine/i, /\berg\b/i],
    targets: [target('upper-back', 0.48), target('quadriceps', 0.42), target('hamstring', 0.3), target('biceps', 0.18)],
    primaryRegions: ['Cardio', 'Back'],
    secondaryRegions: ['Legs', 'Biceps'],
  },
  {
    patterns: [/assault bike/i, /echo bike/i, /air bike/i],
    targets: [target('quadriceps', 0.62), target('deltoids', 0.42), target('triceps', 0.26), target('gluteal', 0.26), target('hamstring', 0.2), target('abs', 0.14)],
    primaryRegions: ['Cardio', 'Legs'],
    secondaryRegions: ['Shoulders', 'Triceps', 'Core'],
  },
  {
    patterns: [/cycling/i, /\bbike\b/i, /spin bike/i],
    targets: [target('quadriceps', 0.62), target('gluteal', 0.24), target('calves', 0.18), target('hamstring', 0.15)],
    primaryRegions: ['Cardio', 'Legs'],
  },
  {
    patterns: [/battle rope/i, /battle ropes/i],
    targets: [target('deltoids', 0.82), target('trapezius', 0.42), target('triceps', 0.36), target('abs', 0.3), target('obliques', 0.2)],
    primaryRegions: ['Cardio', 'Shoulders'],
    secondaryRegions: ['Triceps', 'Core', 'Back'],
  },
  {
    patterns: [/farmers walk/i, /farmer'?s walk/i, /farmer carry/i, /loaded carry/i],
    targets: [target('trapezius', 0.86), target('upper-back', 0.4), target('abs', 0.35), target('obliques', 0.28), target('quadriceps', 0.24), target('calves', 0.2)],
    primaryRegions: ['Back', 'Cardio'],
    secondaryRegions: ['Core', 'Legs'],
  },
  {
    patterns: [/swimming/i, /\bswim\b/i],
    targets: [target('upper-back', 0.62), target('deltoids', 0.58), target('triceps', 0.34), target('abs', 0.22), target('quadriceps', 0.2), target('calves', 0.12)],
    primaryRegions: ['Cardio', 'Back', 'Shoulders'],
    secondaryRegions: ['Triceps', 'Core', 'Legs'],
  },
  {
    patterns: [/stair ?master/i, /stair ?climber/i, /stepmill/i, /step mill/i, /stair ?stepper/i],
    targets: [target('gluteal', 0.88), target('quadriceps', 0.82), target('hamstring', 0.55), target('calves', 0.48), target('adductors', 0.22), target('abs', 0.16)],
    primaryRegions: ['Cardio', 'Legs'],
    secondaryRegions: ['Core'],
  },
  // ── Yoga ──────────────────────────────────────────────────────────────────
  {
    // Downward Dog / Adho Mukha Svanasana — shoulders, hamstrings, calves, back
    patterns: [/downward.?dog/i, /adho mukha/i],
    targets: [target('deltoids', 0.62), target('hamstring', 0.58), target('calves', 0.42), target('upper-back', 0.35), target('abs', 0.2)],
    primaryRegions: ['Yoga', 'Shoulders'],
    secondaryRegions: ['Legs', 'Back'],
  },
  {
    // Warrior I / II / III — quads, glutes, adductors, core
    patterns: [/warrior\s*(pose|i{1,3}|one|two|three)?/i, /virabhadrasana/i],
    targets: [target('quadriceps', 0.72), target('gluteal', 0.55), target('adductors', 0.42), target('abs', 0.28), target('deltoids', 0.22)],
    primaryRegions: ['Yoga', 'Legs'],
    secondaryRegions: ['Core', 'Shoulders'],
  },
  {
    // Pigeon / Hip Openers — hip flexors, adductors, glutes
    patterns: [/pigeon\s*pose/i, /eka pada/i, /lizard\s*pose/i, /hip\s*open/i],
    targets: [target('adductors', 0.88), target('gluteal', 0.65), target('lower-back', 0.3)],
    primaryRegions: ['Yoga', 'Legs'],
  },
  {
    // Bridge / Wheel — glutes, lower back, hamstrings, chest
    patterns: [/bridge\s*pose/i, /wheel\s*pose/i, /urdhva dhanurasana/i, /setu bandha/i],
    targets: [target('gluteal', 0.78), target('hamstring', 0.5), target('lower-back', 0.45), target('chest', 0.25)],
    primaryRegions: ['Yoga', 'Legs'],
    secondaryRegions: ['Back'],
  },
  {
    // Cobra / Upward Dog — lower back, chest, deltoids
    patterns: [/cobra\s*pose/i, /upward.?dog/i, /bhujangasana/i, /urdhva mukha/i],
    targets: [target('lower-back', 0.78), target('chest', 0.42), target('deltoids', 0.35), target('abs', 0.15)],
    primaryRegions: ['Yoga', 'Back'],
    secondaryRegions: ['Chest', 'Shoulders'],
  },
  {
    // Boat Pose / Navasana — abs, hip flexors
    patterns: [/boat\s*pose/i, /navasana/i],
    targets: [target('abs', 0.92), target('adductors', 0.35), target('quadriceps', 0.28)],
    primaryRegions: ['Yoga', 'Core'],
  },
  {
    // Child's Pose — lower back, glutes, adductors (restorative)
    patterns: [/child'?s?\s*pose/i, /balasana/i],
    targets: [target('lower-back', 0.72), target('gluteal', 0.35), target('adductors', 0.3)],
    primaryRegions: ['Yoga', 'Back'],
  },
  {
    // Camel Pose — chest, lower back, deltoids
    patterns: [/camel\s*pose/i, /ustrasana/i],
    targets: [target('chest', 0.55), target('lower-back', 0.62), target('deltoids', 0.38)],
    primaryRegions: ['Yoga', 'Chest'],
    secondaryRegions: ['Back', 'Shoulders'],
  },
  {
    // Sun Salutation — full body sequence
    patterns: [/sun\s*salutation/i, /surya namaskar/i],
    targets: [target('deltoids', 0.42), target('hamstring', 0.42), target('abs', 0.38), target('lower-back', 0.35), target('quadriceps', 0.32), target('chest', 0.28)],
    primaryRegions: ['Yoga'],
    secondaryRegions: ['Core', 'Legs', 'Shoulders'],
  },
  {
    // General yoga / vinyasa / meditation / stretching
    patterns: [/\byoga\b/i, /\bvinyasa\b/i, /\basana\b/i, /\bmeditation\b/i, /\bstretching?\b/i, /\bflexibility\b/i, /\bmobility\b/i],
    targets: [target('lower-back', 0.45), target('hamstring', 0.45), target('abs', 0.38), target('deltoids', 0.3), target('adductors', 0.28), target('gluteal', 0.22)],
    primaryRegions: ['Yoga', 'Core'],
    secondaryRegions: ['Back', 'Legs'],
  },
  // ── Forearms ──────────────────────────────────────────────────────────────
  {
    patterns: [/wrist curl/i, /wrist extension/i, /reverse wrist/i, /finger curl/i, /plate pinch/i, /wrist roller/i, /grip training/i, /grip strength/i],
    targets: [target('forearm', 1)],
    primaryRegions: ['Forearms'],
  },
  {
    patterns: [/farmers (carry|walk)/i, /farmer'?s (carry|walk)/i, /loaded carry/i],
    targets: [target('trapezius', 0.86), target('upper-back', 0.4), target('forearm', 0.55), target('abs', 0.35), target('obliques', 0.28), target('quadriceps', 0.24), target('calves', 0.2)],
    primaryRegions: ['Back', 'Forearms'],
    secondaryRegions: ['Core', 'Legs'],
  },

  // ── Ankle / Tibialis ──────────────────────────────────────────────────────
  {
    patterns: [/tibialis raise/i, /tibialis/i],
    targets: [target('tibialis', 1), target('ankles', 0.3)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/ankle circle/i, /ankle dorsiflexion/i, /ankle mobility/i, /calf raise/i],
    targets: [target('calves', 0.8), target('tibialis', 0.45), target('ankles', 0.35)],
    primaryRegions: ['Legs'],
  },

  // ── Glute isolation ───────────────────────────────────────────────────────
  {
    patterns: [/glute kickback/i, /donkey kick/i, /fire hydrant/i, /clamshell/i, /side lying (leg|hip) raise/i, /hip abduction/i, /seated hip abduction/i, /single leg kickback/i, /standing rear kick/i],
    targets: [target('gluteal', 1), target('adductors', 0.22)],
    primaryRegions: ['Glutes'],
  },
  {
    patterns: [/hip adduction/i, /inner thigh/i, /adductor machine/i],
    targets: [target('adductors', 1), target('gluteal', 0.22)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/reverse hyper/i],
    targets: [target('gluteal', 1), target('hamstring', 0.45), target('lower-back', 0.28)],
    primaryRegions: ['Glutes'],
    secondaryRegions: ['Legs'],
  },
  {
    patterns: [/glute ham raise/i, /\bghd\b/i, /nordic hamstring/i],
    targets: [target('hamstring', 1), target('gluteal', 0.55), target('lower-back', 0.35)],
    primaryRegions: ['Legs'],
    secondaryRegions: ['Glutes', 'Back'],
  },
  {
    patterns: [/torso rotation/i, /torso twist/i],
    targets: [target('obliques', 1), target('abs', 0.35)],
    primaryRegions: ['Core'],
  },
  {
    patterns: [/belt squat/i, /pendulum squat/i, /sissy squat/i],
    targets: [target('quadriceps', 0.95), target('gluteal', 0.45), target('adductors', 0.2)],
    primaryRegions: ['Legs'],
  },
  {
    patterns: [/arm cycling/i, /arm cycle/i, /arm ergometer/i, /arm bike/i],
    targets: [target('deltoids', 0.72), target('biceps', 0.5), target('triceps', 0.45), target('chest', 0.28)],
    primaryRegions: ['Cardio', 'Shoulders'],
    secondaryRegions: ['Arms'],
  },
  {
    patterns: [/pec deck/i, /chest fly/i, /cable crossover/i, /cable chest fly/i],
    targets: [target('chest', 1), target('deltoids', 0.28)],
    primaryRegions: ['Chest'],
    secondaryRegions: ['Shoulders'],
  },
  {
    patterns: [/t-bar row/i, /t bar row/i],
    targets: [target('upper-back', 0.88), target('biceps', 0.35), target('lower-back', 0.32)],
    primaryRegions: ['Back'],
    secondaryRegions: ['Biceps'],
  },
  {
    patterns: [/forearm pronation/i, /forearm supination/i, /forearm curl/i],
    targets: [target('forearm', 1)],
    primaryRegions: ['Forearms'],
  },

  // ── Mobility / stretching ─────────────────────────────────────────────────
  {
    patterns: [/\bmobility\b/i, /foam roll/i, /lacrosse ball/i, /90\/90/i, /couch stretch/i, /pigeon/i, /hip flexor stretch/i, /thoracic/i, /world.?s greatest/i],
    targets: [target('lower-back', 0.5), target('hamstring', 0.45), target('adductors', 0.4), target('gluteal', 0.3), target('tibialis', 0.15), target('calves', 0.15)],
    primaryRegions: ['Mobility'],
    secondaryRegions: ['Legs', 'Back'],
  },

  // ── Running / treadmill ───────────────────────────────────────────────────
  {
    patterns: [/treadmill/i, /elliptical/i, /\brun(ning)?\b/i, /\bwalk(ing)?\b/i, /\bjog(ging)?\b/i, /sprint/i],
    targets: [target('quadriceps', 0.45), target('calves', 0.45), target('hamstring', 0.25), target('gluteal', 0.18)],
    primaryRegions: ['Cardio', 'Legs'],
  },
  {
    patterns: [/bear walk/i, /bear crawl/i, /sled push/i],
    targets: [target('quadriceps', 0.35), target('deltoids', 0.35), target('abs', 0.3), target('chest', 0.25)],
    primaryRegions: ['Cardio'],
    secondaryRegions: ['Legs', 'Shoulders', 'Core'],
  },
];

export const getMuscleSlugLabel = (slug: string) =>
  MUSCLE_SLUG_LABELS[slug as MuscleSlug] || slug;

export const getExerciseRegionWeights = (targets: ExerciseMuscleTarget[]) => {
  const regionWeights = new Map<MuscleRegion, number>();

  targets.forEach(({ slug, weight }) => {
    const region = MUSCLE_SLUG_REGION_MAP[slug];
    regionWeights.set(region, (regionWeights.get(region) || 0) + weight);
  });

  return Array.from(regionWeights.entries()).map(([region, weight]) => ({
    region,
    weight,
  }));
};

export const buildProfileFromSlugs = (
  muscleSlugs: { slug: string; type: 'primary' | 'secondary' }[],
): ExerciseMuscleProfile => {
  const valid = muscleSlugs.filter((s) => s.slug in MUSCLE_SLUG_REGION_MAP);
  const targets: ExerciseMuscleTarget[] = valid.map((s) =>
    target(s.slug as MuscleSlug, s.type === 'primary' ? PRIMARY_LOAD_WEIGHT : SECONDARY_LOAD_WEIGHT),
  );
  const primaryRegions = uniqueRegions(
    valid.filter((s) => s.type === 'primary').map((s) => MUSCLE_SLUG_REGION_MAP[s.slug as MuscleSlug]),
  );
  const secondaryRegions = uniqueRegions(
    valid.filter((s) => s.type === 'secondary').map((s) => MUSCLE_SLUG_REGION_MAP[s.slug as MuscleSlug]),
  );
  return buildProfile(targets, primaryRegions, secondaryRegions);
};

export const getExerciseMuscleProfile = (
  exerciseName: string,
  fallbackMuscleGroup?: string | null,
  muscleSlugs?: { slug: string; type: 'primary' | 'secondary' }[],
): ExerciseMuscleProfile => {
  if (muscleSlugs && muscleSlugs.length > 0) {
    return buildProfileFromSlugs(muscleSlugs);
  }

  for (const profile of EXERCISE_MUSCLE_PATTERNS) {
    if (profile.patterns.some((pattern) => pattern.test(exerciseName))) {
      return buildProfile(profile.targets, profile.primaryRegions, profile.secondaryRegions);
    }
  }

  const fallback = fallbackMuscleGroup as MuscleRegion | null | undefined;
  if (fallback && FALLBACK_TARGETS_BY_GROUP[fallback]) {
    return buildProfile(FALLBACK_TARGETS_BY_GROUP[fallback], [fallback]);
  }

  return buildProfile(FALLBACK_TARGETS_BY_GROUP.Core, ['Core']);
};

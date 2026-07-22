// Generated from chaosbastler/opentraining-exercises (66 entries)
export type AthlixMuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Legs'
  | 'Core'
  | 'Cardio'
  | 'Other';

export interface OpenTrainingExerciseAsset {
  id: string;
  name: string;
  muscleGroup: AthlixMuscleGroup;
  images: [string, string?];
}

export const normalizeExerciseName = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const OPENTRAINING_EXERCISES: OpenTrainingExerciseAsset[] = [
  { id: 'ot_arnoldpress', name: 'Arnold Press', muscleGroup: 'Shoulders', images: ['Arnold-press-1.png', 'Arnold-press-2.png'] },
  { id: 'ot_backextensiononstabilityball', name: 'Back extensions on swiss ball', muscleGroup: 'Back', images: ['Back-extension-on-stability-ball-1.png', 'Back-extension-on-stability-ball-2.png'] },
  { id: 'ot_barbellfrontraises', name: 'Barbell front raises', muscleGroup: 'Shoulders', images: ['Barbell-front-raises-1.png', 'Barbell-front-raises-2.png'] },
  { id: 'ot_barbellshrugs', name: 'Barbell shrugs', muscleGroup: 'Shoulders', images: ['Barbell-shrugs-1.png', 'Barbell-shrugs-2.png'] },
  { id: 'ot_barbelluprightrows', name: 'Barbell upright rows', muscleGroup: 'Back', images: ['Barbell-upright-rows-1.png', 'Barbell-upright-rows-2.png'] },
  { id: 'ot_benchdips', name: 'Dips', muscleGroup: 'Triceps', images: ['Bench-dips-1.png', 'Bench-dips-2.png'] },
  { id: 'ot_benchpress', name: 'Bench Press', muscleGroup: 'Chest', images: ['Bench-press-1.png', 'Bench-press-2.png'] },
  { id: 'ot_bentarmpullover', name: 'Bent arm pullover', muscleGroup: 'Chest', images: ['Bent-arm-pullover-1.png', 'Bent-arm-pullover-2.png'] },
  { id: 'ot_bentkneehipraise', name: 'Bent knee hip raise', muscleGroup: 'Core', images: ['Bent-knee-hip-raise-1.png', 'Bent-knee-hip-raise-2.png'] },
  { id: 'ot_bicepcurls', name: 'Curl (barbell)', muscleGroup: 'Biceps', images: ['Bicep-curls-1.png', 'Bicep-curls-2.png'] },
  { id: 'ot_bicephammercurl', name: 'Bicep hammer curl', muscleGroup: 'Biceps', images: ['Bicep-hammer-curl-1.png', 'Bicep-hammer-curl-2.png'] },
  { id: 'ot_bicepscurl', name: 'Curl', muscleGroup: 'Biceps', images: ['Biceps-curl-1.png', 'Biceps-curl-2.png'] },
  { id: 'ot_bicepscurlreverse', name: 'Curl (reverse)', muscleGroup: 'Biceps', images: ['Biceps-curl-reverse-1.png', 'Biceps-curl-reverse-2.png'] },
  { id: 'ot_bridge', name: 'Bridge', muscleGroup: 'Core', images: ['Bridge-1.png', 'Bridge-2.png'] },
  { id: 'ot_concentrationcurls', name: 'Concentration curls', muscleGroup: 'Biceps', images: ['Concentration-curls-1.png', 'Concentration-curls-2.png'] },
  { id: 'ot_crossbodycrunch', name: 'Crunch (cross body)', muscleGroup: 'Core', images: ['Cross-body-crunch-1.png', 'Cross-body-crunch-2.png'] },
  { id: 'ot_crunches', name: 'Crunch', muscleGroup: 'Core', images: ['Crunches-1.png', 'Crunches-2.png'] },
  { id: 'ot_cruncheswithlegsonstabilityball', name: 'Crunch (legs on swiss ball)', muscleGroup: 'Core', images: ['Crunches-with-legs-on-stability-ball-1.png', 'Crunches-with-legs-on-stability-ball-2.png'] },
  { id: 'ot_declinecrunch', name: 'Crunch (declined)', muscleGroup: 'Core', images: ['Decline-crunch-1.png', 'Decline-crunch-2.png'] },
  { id: 'ot_dumbbelldeclineflys', name: 'Dumbell decline flies', muscleGroup: 'Chest', images: ['Dumbbell-decline-flys-1.png', 'Dumbbell-decline-flys-2.png'] },
  { id: 'ot_dumbbellflys', name: 'Dumbell flies', muscleGroup: 'Chest', images: ['Dumbbell-flys-1.png', 'Dumbbell-flys-2.png'] },
  { id: 'ot_dumbbellfrontraises_2', name: 'Dumbbell front raise (dumbell)', muscleGroup: 'Shoulders', images: ['Dumbbell-front-raises-2-1.png', 'Dumbbell-front-raises-2-2.png'] },
  { id: 'ot_dumbbellfrontraises', name: 'Dumbbell front raise (dumbbell, one arm)', muscleGroup: 'Shoulders', images: ['Dumbbell-front-raises-1.png', 'Dumbbell-front-raises-2.png'] },
  { id: 'ot_dumbbelllateralraises', name: 'Dumbbell lateral raise', muscleGroup: 'Shoulders', images: ['Dumbbell-lateral-raises-1.png', 'Dumbbell-lateral-raises-2.png'] },
  { id: 'ot_exerciseballpullin', name: 'Swiss Ball Pull In', muscleGroup: 'Core', images: ['Exercise-ball-pull-in-1.png', 'Exercise-ball-pull-in-2.png'] },
  { id: 'ot_girondasternumchins', name: 'Gironda Sternum Chins', muscleGroup: 'Back', images: ['Gironda-sternum-chins-1.png', 'Gironda-sternum-chins-2.png'] },
  { id: 'ot_hammercurlswithrope', name: 'Hammer curls with rope', muscleGroup: 'Biceps', images: ['Hammer-curls-with-rope-1.png', 'Hammer-curls-with-rope-2.png'] },
  { id: 'ot_highcablecurls', name: 'High cable cursl', muscleGroup: 'Biceps', images: ['High-cable-curls-1.png', 'High-cable-curls-2.png'] },
  { id: 'ot_hyperextensions', name: 'Hyperextensions', muscleGroup: 'Back', images: ['Hyperextensions-1.png', 'Hyperextensions-2.png'] },
  { id: 'ot_inclinetricepsextensions', name: 'Incline triceps extensions', muscleGroup: 'Triceps', images: ['Incline-triceps-extensions-1.png', 'Incline-triceps-extensions-2.png'] },
  { id: 'ot_kneelingconcentrationtricepsextension', name: 'Concentration triceps extension (kneeling)', muscleGroup: 'Triceps', images: ['Kneeling-concentration-triceps-extension-1.png', 'Kneeling-concentration-triceps-extension-2.png'] },
  { id: 'ot_legpressx', name: 'Leg Press', muscleGroup: 'Legs', images: ['Leg-press-1-1024x670.png', 'Leg-press-2-1024x670.png'] },
  { id: 'ot_legraises', name: 'Leg Raises', muscleGroup: 'Core', images: ['Leg-raises-1.png', 'Leg-raises-2.png'] },
  { id: 'ot_lowtricepsextension', name: 'Low triceps extension', muscleGroup: 'Triceps', images: ['Low-triceps-extension-1.png', 'Low-triceps-extension-2.png'] },
  { id: 'ot_lunges_long', name: 'Lunges (barbell)', muscleGroup: 'Legs', images: ['Lunges-1.png', 'Lunges-2.png'] },
  { id: 'ot_lunges_short', name: 'Lunges (dumbbell)', muscleGroup: 'Legs', images: ['Lunges-2-1.png', 'Lunges-2-2.png'] },
  { id: 'ot_lyingbicepcablecurl', name: 'Lying bicep cabel curl', muscleGroup: 'Biceps', images: ['Lying-bicep-cable-curl-1.png', 'Lying-bicep-cable-curl-2.png'] },
  { id: 'ot_lyingclosegriptricepspresstochin', name: 'Triceps Press To Chin (lying, Close Grip)', muscleGroup: 'Triceps', images: ['Lying-close-grip-triceps-press-to-chin-1.png', 'Lying-close-grip-triceps-press-to-chin-2.png'] },
  { id: 'ot_lyingonearmrearlateralraise', name: 'Rear lateral raise (lying, one arm)', muscleGroup: 'Shoulders', images: ['Lying-one-arm-rear-lateral-raise-1.png', 'Lying-one-arm-rear-lateral-raise-2.png'] },
  { id: 'ot_lyingrearlateralraise', name: 'Rear lateral raise (lying)', muscleGroup: 'Shoulders', images: ['Lying-rear-lateral-raise-1.png', 'Lying-rear-lateral-raise-2.png'] },
  { id: 'ot_lyingtricepsextensionacrossface', name: 'Triceps extension across face (lying)', muscleGroup: 'Triceps', images: ['Lying-triceps-extension-across-face-1.png', 'Lying-triceps-extension-across-face-2.png'] },
  { id: 'ot_medicineballbicepscurlonstabilityball', name: 'Curl (on ball)', muscleGroup: 'Biceps', images: ['Medicine-ball-biceps-curl-on-stability-ball-1.png', 'Medicine-ball-biceps-curl-on-stability-ball-2.png'] },
  { id: 'ot_narrowgripbenchpress', name: 'Bench press (narrow grip)', muscleGroup: 'Chest', images: ['Narrow-grip-bench-press-1.png', 'Narrow-grip-bench-press-2.png'] },
  { id: 'ot_onearmbenchpress', name: 'Bench press (one arm)', muscleGroup: 'Chest', images: ['One-arm-bench-press-1.png', 'One-arm-bench-press-2.png'] },
  { id: 'ot_onearmbicepconcentrationonstabilityball', name: 'Biceps concentration curl (on ball, one arm)', muscleGroup: 'Biceps', images: ['One-arm-bicep-concentration-on-stability-ball-1.png', 'One-arm-bicep-concentration-on-stability-ball-2.png'] },
  { id: 'ot_onearmedbiasedpushup', name: 'Push up (one arm, biased)', muscleGroup: 'Chest', images: ['One-armed-biased-push-up-1.png', 'One-armed-biased-push-up-2.png'] },
  { id: 'ot_onearmpreachercurl', name: 'Preacher curl(one arm, biased)', muscleGroup: 'Biceps', images: ['One-arm-preacher-curl-1.png', 'One-arm-preacher-curl-2.png'] },
  { id: 'ot_onearmshoulderpress', name: 'Shoulder press (one arm)', muscleGroup: 'Shoulders', images: ['One-arm-shoulder-press-1.png', 'One-arm-shoulder-press-2.png'] },
  { id: 'ot_onearmuprightrow', name: 'Row (one arm, upright)', muscleGroup: 'Shoulders', images: ['One-arm-upright-row-1.png', 'One-arm-upright-row-2.png'] },
  { id: 'ot_preachercurl_long', name: 'Preacher curl (barbell)', muscleGroup: 'Biceps', images: ['Preacher-curl-3-1.png', 'Preacher-curl-3-2.png'] },
  { id: 'ot_pulloveronstabilityballwithweight', name: 'Pullover (on ball, with weight)', muscleGroup: 'Chest', images: ['Pullover-on-stability-ball-with-weight-1.png', 'Pullover-on-stability-ball-with-weight-2.png'] },
  { id: 'ot_pushup', name: 'Pushup (on swiss ball)', muscleGroup: 'Chest', images: ['Push-up-1.png', 'Push-up-2.png'] },
  { id: 'ot_pushups', name: 'Pushup', muscleGroup: 'Chest', images: ['Push-ups-1.png', 'Push-ups-2.png'] },
  { id: 'ot_pushupwithfeetonanexerciseball', name: 'Pushup (feet on ball)', muscleGroup: 'Chest', images: ['Push-up-with-feet-on-an-exercise-ball-1.png', 'Push-up-with-feet-on-an-exercise-ball-2.png'] },
  { id: 'ot_reardeltoidrow', name: 'Rear deltoid row', muscleGroup: 'Back', images: ['Rear-deltoid-row-1.png', 'Rear-deltoid-row-2.png'] },
  { id: 'ot_reverseplatecurls', name: 'Reverse plate curls', muscleGroup: 'Biceps', images: ['Reverse-plate-curls-1.png', 'Reverse-plate-curls-2.png'] },
  { id: 'ot_seatedtricepspress', name: 'Triceps press (seated)', muscleGroup: 'Triceps', images: ['Seated-triceps-press-1.png', 'Seated-triceps-press-2.png'] },
  { id: 'ot_sideplank', name: 'Side Plank', muscleGroup: 'Core', images: ['Side-plank-1.png', 'Side-plank-2.png'] },
  { id: 'ot_spidercurl', name: 'Spider Curl', muscleGroup: 'Biceps', images: ['Spider-curl-1.png', 'Spider-curl-2.png'] },
  { id: 'ot_squats', name: 'Squats', muscleGroup: 'Legs', images: ['Squats-1.png', 'Squats-2-1.png'] },
  { id: 'ot_stabilityballabdominalcrunch', name: 'Crunch (on swiss ball)', muscleGroup: 'Core', images: ['Stability-ball-abdominal-crunch-1.png', 'Stability-ball-abdominal-crunch-2.png'] },
  { id: 'ot_standingbicepscurl', name: 'Curl (standing)', muscleGroup: 'Biceps', images: ['Standing-biceps-curl-1.png', 'Standing-biceps-curl-2.png'] },
  { id: 'ot_supermans', name: 'Superman', muscleGroup: 'Back', images: ['Supermans-1.png', 'Supermans-2.png'] },
  { id: 'ot_tbarrow', name: 'T-Bar Row', muscleGroup: 'Back', images: ['T-bar-row-1.png', 'T-bar-row-2.png'] },
  { id: 'ot_tricepdips', name: 'Dips (with dip stands)', muscleGroup: 'Triceps', images: ['Tricep-dips-1.gif', 'Tricep-dips-2-1.gif'] },
  { id: 'ot_tricepskickback', name: 'Triceps kickback', muscleGroup: 'Triceps', images: ['Triceps-kickback-1.png', 'Triceps-kickback-2.png'] },
];

export const OPENTRAINING_ASSETS_BY_ID: Record<string, OpenTrainingExerciseAsset> = Object.fromEntries(
  OPENTRAINING_EXERCISES.map((exercise) => [exercise.id, exercise]),
);

export const OPENTRAINING_ID_BY_NAME: Record<string, string> = Object.fromEntries(
  OPENTRAINING_EXERCISES.map((exercise) => [normalizeExerciseName(exercise.name), exercise.id]),
);

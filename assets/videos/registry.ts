// Registre des videos demo musculation.
// Metro bundler exige un `require()` statique pour inclure un asset.

export const LIFT_VIDEOS: Record<string, any> = {
  // --- 6 exercices de base ---
  bench_press:     require('./bench_press.mp4'),
  squat:           require('./squat.mp4'),
  deadlift:        require('./deadlift.mp4'),
  shoulder_press:  require('./shoulder_press.mp4'),
  pullup:          require('./pullup.mp4'),
  bicep_curl:      require('./bicep_curl.mp4'),

  // --- exercices additionnels (verifies via recherche Pexels) ---
  dumbbell_row:      require('./dumbbell_row.mp4'),
  barbell_row:       require('./barbell_row.mp4'),
  lat_pulldown:      require('./lat_pulldown.mp4'),
  lunges:            require('./lunges.mp4'),
  romanian_dl:       require('./romanian_dl.mp4'),
  tricep_dips:       require('./tricep_dips.mp4'),
  tricep_pushdown:   require('./tricep_pushdown.mp4'),
  hammer_curl:       require('./hammer_curl.mp4'),
  preacher_curl:     require('./preacher_curl.mp4'),
  lateral_raise:     require('./lateral_raise.mp4'),
  front_raise:       require('./front_raise.mp4'),
  face_pull:         require('./face_pull.mp4'),
  chest_fly:         require('./chest_fly.mp4'),
  cable_crossover:   require('./cable_crossover.mp4'),
  leg_extension:     require('./leg_extension.mp4'),
  hip_thrust:        require('./hip_thrust.mp4'),
  bulgarian_split:   require('./bulgarian_split.mp4'),
  crunches:          require('./crunches.mp4'),
  russian_twist:     require('./russian_twist.mp4'),
  hanging_knee:      require('./hanging_knee.mp4'),

  // --- combles via wger.de (videos CC, transcodees en MP4 H.264 540p) ---
  incline_bench:   require('./incline_bench.mp4'),
  leg_press:       require('./leg_press.mp4'),
  leg_curl:        require('./leg_curl.mp4'),
  calf_raise:      require('./calf_raise.mp4'),
  // plank: pas de video libre dispo (a fournir)

  // --- nouveaux exercices (source wger.de, CC) ---
  front_squat:     require('./front_squat.mp4'),
  skullcrusher:    require('./skullcrusher.mp4'),
  tricep_kickback: require('./tricep_kickback.mp4'),
  shrug:           require('./shrug.mp4'),
  bent_over_lateral: require('./bent_over_lateral.mp4'),
  walking_lunge:   require('./walking_lunge.mp4'),
  hip_adduction:   require('./hip_adduction.mp4'),
  seated_calf:     require('./seated_calf.mp4'),
  cable_row_one_arm: require('./cable_row_one_arm.mp4'),
  chest_dips:      require('./chest_dips.mp4'),
  front_squat_machine: require('./front_squat_machine.mp4'),
  single_preacher: require('./single_preacher.mp4'),
};

export function getLocalVideo(exerciseId: string): any | null {
  return LIFT_VIDEOS[exerciseId] || null;
}

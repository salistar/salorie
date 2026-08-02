// Registre de photos premium (royalty-free, bundlées assets/images/photos/) pour les
// héros d'écran via <HeroImage>. require() = chemins statiques (contrainte Metro).
import { ImageSourcePropType } from 'react-native';

export const PHOTOS = {
  food: require('../assets/images/photos/food_0.jpg'),
  food2: require('../assets/images/photos/food_2.jpg'),
  salad: require('../assets/images/photos/salad_0.jpg'),
  mealprep: require('../assets/images/photos/mealprep_0.jpg'),
  mealprep2: require('../assets/images/photos/mealprep_2.jpg'),
  veggies: require('../assets/images/photos/veggies_0.jpg'),
  fruits: require('../assets/images/photos/fruits_0.jpg'),
  moroccan: require('../assets/images/photos/moroccan_0.jpg'),
  moroccan2: require('../assets/images/photos/moroccan_2.jpg'),
  tajine: require('../assets/images/photos/tajine_0.jpg'),
  medfood: require('../assets/images/photos/medfood_0.jpg'),
  running: require('../assets/images/photos/running_0.jpg'),
  running2: require('../assets/images/photos/running_2.jpg'),
  gym: require('../assets/images/photos/gym_0.jpg'),
  gym2: require('../assets/images/photos/gym_2.jpg'),
  yoga: require('../assets/images/photos/yoga_0.jpg'),
  breakfast: require('../assets/images/photos/breakfast_0.jpg'),
  smoothie: require('../assets/images/photos/smoothie_0.jpg'),
  water: require('../assets/images/photos/water_0.jpg'),
  wellness: require('../assets/images/photos/wellness_0.jpg'),
  fish: require('../assets/images/photos/fish_0.jpg'),
} as const;

// Héro par écran (1 image, pas de surcharge).
export const HERO: Record<string, ImageSourcePropType> = {
  home: PHOTOS.food,
  coach: PHOTOS.wellness,
  defis: PHOTOS.running,
  analytics: PHOTOS.veggies,
  kitchen: PHOTOS.mealprep,
  diary: PHOTOS.salad,
  ramadan: PHOTOS.tajine,
  leagues: PHOTOS.gym,
  marketplace: PHOTOS.food2,
  'group-sports': PHOTOS.running2,
  'healthy-recipes': PHOTOS.moroccan,
  'ai-meal-plan': PHOTOS.mealprep2,
  vitals: PHOTOS.wellness,
  streaks: PHOTOS.gym2,
};

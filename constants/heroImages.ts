// Registre de photos premium (royalty-free, bundlées assets/images/photos/) pour les
// héros d'écran via <HeroImage>. require() = chemins statiques (contrainte Metro).
import { ImageSourcePropType } from 'react-native';

export const PHOTOS = {
  food: require('../assets/images/photos/food_0.jpg'),
  food2: require('../assets/images/photos/food_2.jpg'),
  salad: require('../assets/images/photos/salad_0.jpg'),
  mealprep: require('../assets/images/photos/mealprep_2.jpg'),
  mealprep2: require('../assets/images/photos/mealprep_2.jpg'),
  veggies: require('../assets/images/photos/veggies_0.jpg'),
  fruits: require('../assets/images/photos/fruits_0.jpg'),
  moroccan: require('../assets/images/photos/moroccan_0.jpg'),
  moroccan2: require('../assets/images/photos/moroccan_2.jpg'),
  tajine: require('../assets/images/photos/tajine_0.jpg'),
  medfood: require('../assets/images/photos/medfood_0.jpg'),
  running: require('../assets/images/photos/running_2.jpg'),
  running2: require('../assets/images/photos/running_2.jpg'),
  gym: require('../assets/images/photos/gym_2.jpg'),
  gym2: require('../assets/images/photos/gym_2.jpg'),
  yoga: require('../assets/images/photos/wellness_0.jpg'),
  breakfast: require('../assets/images/photos/breakfast_0.jpg'),
  smoothie: require('../assets/images/photos/smoothie_0.jpg'),
  water: require('../assets/images/photos/water_0.jpg'),
  wellness: require('../assets/images/photos/wellness_0.jpg'),
  fish: require('../assets/images/photos/fish_0.jpg'),
  // Photothèque marocaine élargie (14 août 2026). Ces fichiers étaient DÉJÀ dans
  // le dépôt, téléchargés lors de la constitution de la bibliothèque, mais aucun
  // `require` ne les citait : ils ne pesaient donc rien dans l'APK — Metro n'embarque
  // que ce qui est requis — mais ils ne s'affichaient nulle part non plus.
  moroccan3: require('../assets/images/photos/moroccan_1.jpg'),
  moroccan4: require('../assets/images/photos/moroccan_3.jpg'),
  moroccan5: require('../assets/images/photos/moroccan_4.jpg'),
  tajine2: require('../assets/images/photos/tajine_1.jpg'),
  tajine3: require('../assets/images/photos/tajine_2.jpg'),
  medfood2: require('../assets/images/photos/medfood_1.jpg'),
  medfood3: require('../assets/images/photos/medfood_2.jpg'),
} as const;

// Héro par écran (1 image, pas de surcharge).
//
// Rééquilibrage du 14 août 2026 : sur quatorze écrans, DEUX seulement montraient un
// plat marocain, alors que la cuisine locale est l'argument central de l'app face à
// Yazio ou MyFitnessPal — et que sept photos marocaines dormaient dans le dépôt sans
// être citées nulle part. Un utilisateur de Casablanca ouvrait donc son journal sur
// une salade de magazine américain. Les écrans qui parlent de NOURRITURE montrent
// désormais de la nourriture d'ici ; ceux qui parlent d'effort restent neutres, un
// coureur n'ayant pas de nationalité.
export const HERO: Record<string, ImageSourcePropType> = {
  home: PHOTOS.moroccan,
  coach: PHOTOS.wellness,
  defis: PHOTOS.running,
  analytics: PHOTOS.veggies,
  kitchen: PHOTOS.tajine2,
  diary: PHOTOS.medfood,
  ramadan: PHOTOS.tajine,
  leagues: PHOTOS.gym,
  marketplace: PHOTOS.moroccan3,
  'group-sports': PHOTOS.running2,
  'healthy-recipes': PHOTOS.moroccan2,
  'ai-meal-plan': PHOTOS.medfood2,
  vitals: PHOTOS.wellness,
  streaks: PHOTOS.gym2,
};

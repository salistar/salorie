// ⚠️ COPIE GENEREE — NE PAS MODIFIER ICI.
//
// La source est `lib/localRecipes.ts` a la racine du depot. Cette copie existe
// parce que le contexte de build Docker du web est `./web` : un import qui sort
// de ce dossier donne « module not found » dans le conteneur, alors qu'il passe
// en local. Constate en production le 17 aout 2026, deux deploiements de suite.
//
// `npm run sync:partage` regenere ce fichier, et un test compare les deux :
// s'ils divergent, la suite echoue. La duplication est donc impossible a laisser
// filer, ce qui etait tout l'enjeu — surtout pour le rapport medical.
// ───── fin de l'entete generee, la source commence ici ─────
// RECETTES LOCALES SANTÉ — ancrage MENA (Maghreb / Moyen-Orient).
// Base de données STATIQUE (aucun réseau, aucun Firestore) de recettes locales,
// chacune scorable vs l'objectif du jour de l'utilisateur via le moteur objectif
// existant (lib/objective/scoring.ts). L'idée : proposer des plats familiers
// (tajine, couscous, harira…) avec un verdict santé personnalisé (super / correct
// / à éviter) + des raisons médicales, et des astuces "santé" pour alléger la
// recette (cuire au four plutôt que frire, moins de sel pour la tension…).
//
// Les i18n sont portées PAR la donnée (name{fr,ar,en}) ; l'écran choisit la langue.
// Les valeurs nutritionnelles sont PAR PORTION (servings indiqué séparément).
import { scoreFood, type FoodScore, type ObjectiveContext, type FoodCandidate } from './objective/scoring';

/** Langues supportées pour les libellés de recette. */
export type RecipeLang = 'fr' | 'ar' | 'en';

/** Chaîne localisée fr/ar/en. */
export interface Localized {
  fr: string;
  ar: string;
  en: string;
}

/** Catégorie culinaire (sert au filtre de la grille). */
export type RecipeCategory =
  | 'soup'        // soupes (harira, chorba…)
  | 'main'        // plats principaux (tajine, couscous…)
  | 'salad'       // salades / entrées froides (zaalouk, méchouia…)
  | 'bread'       // pains & galettes (msemen, batbout…)
  | 'pastry'      // feuilletés / pâtisseries salées (briouates…)
  | 'dessert';    // desserts

/** Une recette locale santé (données statiques). */
export interface LocalRecipe {
  id: string;
  name: Localized;
  category: RecipeCategory;
  /** Nutrition PAR PORTION. */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /**
   * Étiquettes normalisées, alignées sur les tags compris par scoreFood
   * (ex: 'high_sodium', 'fried', 'vegetarian', 'high_fiber', 'red_meat'…).
   * Elles alimentent DIRECTEMENT le scoring médical (hypertension → high_sodium,
   * cholestérol → fried/saturated_fat, etc.).
   */
  tags: string[];
  /** Nombre de portions produites par la recette complète. */
  servings: number;
  ingredients: Localized[];
  steps: Localized[];
  /** Astuces pour rendre la recette plus saine (localisées). */
  healthySwaps: Localized[];
}

// ---------------------------------------------------------------------------
// DONNÉES — ~18 recettes MENA. Nutrition approximative PAR PORTION.
// ---------------------------------------------------------------------------
export const LOCAL_RECIPES: LocalRecipe[] = [
  {
    id: 'tajine-poulet-citron',
    name: {
      fr: 'Tajine de poulet au citron confit',
      ar: 'طاجين الدجاج بالليمون المخلل',
      en: 'Chicken tajine with preserved lemon',
    },
    category: 'main',
    kcal: 380, protein: 34, carbs: 14, fat: 20,
    tags: ['high_protein', 'high_sodium'],
    servings: 4,
    ingredients: [
      { fr: '4 cuisses de poulet', ar: '4 أفخاذ دجاج', en: '4 chicken thighs' },
      { fr: '1 citron confit', ar: 'ليمونة مخللة', en: '1 preserved lemon' },
      { fr: 'Olives vertes', ar: 'زيتون أخضر', en: 'Green olives' },
      { fr: 'Oignon, ail, gingembre', ar: 'بصل، ثوم، زنجبيل', en: 'Onion, garlic, ginger' },
      { fr: 'Safran, curcuma, coriandre', ar: 'زعفران، كركم، كزبرة', en: 'Saffron, turmeric, coriander' },
    ],
    steps: [
      { fr: 'Faire revenir oignon et épices dans un peu d’huile.', ar: 'يُقلى البصل والتوابل بقليل من الزيت.', en: 'Sauté onion and spices in a little oil.' },
      { fr: 'Ajouter le poulet, couvrir d’eau, mijoter 40 min.', ar: 'يُضاف الدجاج ويُغطى بالماء ويُطهى 40 دقيقة.', en: 'Add chicken, cover with water, simmer 40 min.' },
      { fr: 'Ajouter citron confit et olives, réduire la sauce.', ar: 'يُضاف الليمون المخلل والزيتون وتُكثّف الصلصة.', en: 'Add preserved lemon and olives, reduce the sauce.' },
    ],
    healthySwaps: [
      { fr: 'Retirer la peau du poulet pour moins de gras saturé.', ar: 'انزع جلد الدجاج لتقليل الدهون المشبعة.', en: 'Remove chicken skin for less saturated fat.' },
      { fr: 'Rincer les olives et le citron confit pour moins de sel (tension).', ar: 'اشطف الزيتون والليمون المخلل لتقليل الملح (الضغط).', en: 'Rinse olives and lemon to cut salt (blood pressure).' },
    ],
  },
  {
    id: 'couscous-legumes',
    name: {
      fr: 'Couscous aux sept légumes',
      ar: 'كسكس بسبع خضار',
      en: 'Seven-vegetable couscous',
    },
    category: 'main',
    kcal: 420, protein: 15, carbs: 72, fat: 8,
    tags: ['vegetarian', 'high_fiber'],
    servings: 6,
    ingredients: [
      { fr: 'Semoule de blé', ar: 'سميد القمح', en: 'Wheat semolina' },
      { fr: 'Courgette, carotte, navet, potiron', ar: 'كوسة، جزر، لفت، قرع', en: 'Zucchini, carrot, turnip, pumpkin' },
      { fr: 'Pois chiches', ar: 'حمص', en: 'Chickpeas' },
      { fr: 'Oignon, tomate, épices', ar: 'بصل، طماطم، توابل', en: 'Onion, tomato, spices' },
    ],
    steps: [
      { fr: 'Cuire les légumes dans un bouillon épicé.', ar: 'تُطهى الخضار في مرق متبّل.', en: 'Cook the vegetables in a spiced broth.' },
      { fr: 'Cuire la semoule à la vapeur en trois passages.', ar: 'يُطهى السميد على البخار ثلاث مرات.', en: 'Steam the semolina in three passes.' },
      { fr: 'Dresser la semoule, poser légumes et bouillon.', ar: 'يُقدّم السميد وتُوضع فوقه الخضار والمرق.', en: 'Plate the semolina, top with vegetables and broth.' },
    ],
    healthySwaps: [
      { fr: 'Utiliser de la semoule complète pour plus de fibres.', ar: 'استعمل سميداً كاملاً لمزيد من الألياف.', en: 'Use whole-grain semolina for more fibre.' },
      { fr: 'Saler le bouillon avec parcimonie.', ar: 'قلّل الملح في المرق.', en: 'Salt the broth sparingly.' },
    ],
  },
  {
    id: 'harira-allegee',
    name: {
      fr: 'Harira allégée',
      ar: 'حريرة خفيفة',
      en: 'Light harira soup',
    },
    category: 'soup',
    kcal: 210, protein: 12, carbs: 30, fat: 5,
    tags: ['high_fiber'],
    servings: 6,
    ingredients: [
      { fr: 'Lentilles et pois chiches', ar: 'عدس وحمص', en: 'Lentils and chickpeas' },
      { fr: 'Tomate, céleri, coriandre', ar: 'طماطم، كرفس، كزبرة', en: 'Tomato, celery, coriander' },
      { fr: 'Un peu de viande maigre (option)', ar: 'قليل من اللحم الخالي من الدهن (اختياري)', en: 'A little lean meat (optional)' },
    ],
    steps: [
      { fr: 'Mijoter légumineuses, tomate et épices.', ar: 'تُطهى البقوليات والطماطم والتوابل.', en: 'Simmer legumes, tomato and spices.' },
      { fr: 'Lier légèrement avec un peu de farine délayée.', ar: 'تُكثّف قليلاً بالدقيق المذاب.', en: 'Thicken lightly with a little diluted flour.' },
      { fr: 'Terminer avec coriandre et jus de citron.', ar: 'تُنهى بالكزبرة وعصير الليمون.', en: 'Finish with coriander and lemon juice.' },
    ],
    healthySwaps: [
      { fr: 'Réduire la farine de liaison pour moins de glucides.', ar: 'قلّل دقيق التكثيف لتقليل الكربوهيدرات.', en: 'Reduce thickening flour for fewer carbs.' },
      { fr: 'Version sans viande = plus légère et végétarienne.', ar: 'نسخة بدون لحم = أخف ونباتية.', en: 'Meat-free version = lighter and vegetarian.' },
    ],
  },
  {
    id: 'zaalouk',
    name: {
      fr: 'Zaalouk (caviar d’aubergine)',
      ar: 'زعلوك (سلطة الباذنجان)',
      en: 'Zaalouk (eggplant dip)',
    },
    category: 'salad',
    kcal: 130, protein: 3, carbs: 12, fat: 8,
    tags: ['vegetarian', 'high_fiber'],
    servings: 4,
    ingredients: [
      { fr: 'Aubergines', ar: 'باذنجان', en: 'Eggplants' },
      { fr: 'Tomates, ail', ar: 'طماطم، ثوم', en: 'Tomatoes, garlic' },
      { fr: 'Cumin, paprika, huile d’olive', ar: 'كمون، بابريكا، زيت الزيتون', en: 'Cumin, paprika, olive oil' },
    ],
    steps: [
      { fr: 'Cuire aubergines et tomates jusqu’à compotée.', ar: 'تُطهى حتى تصبح طرية.', en: 'Cook eggplant and tomato to a compote.' },
      { fr: 'Écraser, assaisonner, laisser réduire.', ar: 'تُهرس وتُتبّل وتُترك لتتكثّف.', en: 'Mash, season, let it reduce.' },
    ],
    healthySwaps: [
      { fr: 'Griller l’aubergine au four au lieu de la frire.', ar: 'اشوِ الباذنجان في الفرن بدل قليه.', en: 'Roast the eggplant instead of frying.' },
      { fr: 'Doser l’huile d’olive à la cuillère.', ar: 'قِس زيت الزيتون بالملعقة.', en: 'Measure the olive oil by the spoon.' },
    ],
  },
  {
    id: 'briouates-four',
    name: {
      fr: 'Briouates au four (viande)',
      ar: 'بريوات في الفرن (باللحم)',
      en: 'Baked briouates (meat)',
    },
    category: 'pastry',
    kcal: 190, protein: 9, carbs: 18, fat: 9,
    tags: ['red_meat'],
    servings: 8,
    ingredients: [
      { fr: 'Feuilles de brick', ar: 'أوراق البريك', en: 'Brick/filo sheets' },
      { fr: 'Viande hachée maigre, oignon', ar: 'لحم مفروم خالٍ من الدهن، بصل', en: 'Lean minced meat, onion' },
      { fr: 'Persil, épices', ar: 'بقدونس، توابل', en: 'Parsley, spices' },
    ],
    steps: [
      { fr: 'Cuire la farce, laisser refroidir.', ar: 'تُطهى الحشوة وتُترك لتبرد.', en: 'Cook the filling, let it cool.' },
      { fr: 'Plier les feuilles en triangles.', ar: 'تُطوى الأوراق مثلثات.', en: 'Fold the sheets into triangles.' },
      { fr: 'Badigeonner d’un filet d’huile, cuire au four.', ar: 'تُدهن بقليل من الزيت وتُخبز.', en: 'Brush with a little oil, bake.' },
    ],
    healthySwaps: [
      { fr: 'Cuire au four au lieu de frire (bien moins de gras).', ar: 'اخبزها بدل قليها (دهون أقل بكثير).', en: 'Bake instead of frying (far less fat).' },
      { fr: 'Utiliser de la volaille à la place du bœuf.', ar: 'استعمل الدواجن بدل لحم البقر.', en: 'Use poultry instead of beef.' },
    ],
  },
  {
    id: 'salade-mechouia',
    name: {
      fr: 'Salade méchouia',
      ar: 'سلطة مشوية',
      en: 'Mechouia grilled salad',
    },
    category: 'salad',
    kcal: 110, protein: 3, carbs: 9, fat: 7,
    tags: ['vegetarian', 'high_fiber'],
    servings: 4,
    ingredients: [
      { fr: 'Poivrons, tomates, piment', ar: 'فلفل، طماطم، فلفل حار', en: 'Peppers, tomatoes, chilli' },
      { fr: 'Ail, huile d’olive, cumin', ar: 'ثوم، زيت الزيتون، كمون', en: 'Garlic, olive oil, cumin' },
    ],
    steps: [
      { fr: 'Griller poivrons et tomates, peler.', ar: 'تُشوى وتُقشّر.', en: 'Grill peppers and tomatoes, then peel.' },
      { fr: 'Hacher finement et assaisonner.', ar: 'تُفرم وتُتبّل.', en: 'Chop finely and season.' },
    ],
    healthySwaps: [
      { fr: 'Limiter l’huile pour alléger encore.', ar: 'قلّل الزيت لتخفيفها أكثر.', en: 'Limit the oil to lighten it further.' },
      { fr: 'Sans sel ajouté : idéal pour la tension.', ar: 'بدون ملح مضاف: مثالية للضغط.', en: 'No added salt: ideal for blood pressure.' },
    ],
  },
  {
    id: 'chorba-frik',
    name: {
      fr: 'Chorba frik',
      ar: 'شوربة فريك',
      en: 'Chorba frik soup',
    },
    category: 'soup',
    kcal: 230, protein: 13, carbs: 28, fat: 7,
    tags: ['high_sodium'],
    servings: 6,
    ingredients: [
      { fr: 'Frik (blé vert concassé)', ar: 'فريك', en: 'Frik (cracked green wheat)' },
      { fr: 'Agneau maigre, tomate', ar: 'لحم غنم خالٍ من الدهن، طماطم', en: 'Lean lamb, tomato' },
      { fr: 'Coriandre, épices', ar: 'كزبرة، توابل', en: 'Coriander, spices' },
    ],
    steps: [
      { fr: 'Revenir la viande et la tomate.', ar: 'يُقلى اللحم مع الطماطم.', en: 'Brown the meat and tomato.' },
      { fr: 'Ajouter le frik et l’eau, mijoter.', ar: 'يُضاف الفريك والماء ويُطهى.', en: 'Add frik and water, simmer.' },
    ],
    healthySwaps: [
      { fr: 'Réduire le sel et le bouillon cube (tension).', ar: 'قلّل الملح ومكعب المرق (الضغط).', en: 'Cut salt and stock cubes (blood pressure).' },
      { fr: 'Choisir une viande maigre et dégraisser le bouillon.', ar: 'اختر لحماً خالياً من الدهن وأزل الدهون.', en: 'Use lean meat and skim the broth.' },
    ],
  },
  {
    id: 'taktouka',
    name: {
      fr: 'Taktouka (poivrons-tomates)',
      ar: 'تكتوكة (فلفل وطماطم)',
      en: 'Taktouka (pepper & tomato)',
    },
    category: 'salad',
    kcal: 100, protein: 2, carbs: 10, fat: 6,
    tags: ['vegetarian', 'high_fiber'],
    servings: 4,
    ingredients: [
      { fr: 'Poivrons verts, tomates', ar: 'فلفل أخضر، طماطم', en: 'Green peppers, tomatoes' },
      { fr: 'Ail, paprika, huile d’olive', ar: 'ثوم، بابريكا، زيت الزيتون', en: 'Garlic, paprika, olive oil' },
    ],
    steps: [
      { fr: 'Griller et peler les poivrons.', ar: 'يُشوى الفلفل ويُقشّر.', en: 'Grill and peel the peppers.' },
      { fr: 'Mijoter avec la tomate jusqu’à épaississement.', ar: 'يُطهى مع الطماطم حتى يتكثّف.', en: 'Simmer with tomato until thick.' },
    ],
    healthySwaps: [
      { fr: 'Peu d’huile : parfait pour un objectif perte de poids.', ar: 'قليل من الزيت: مثالي لخسارة الوزن.', en: 'Little oil: perfect for weight loss.' },
      { fr: 'Sans sel ajouté pour la tension.', ar: 'بدون ملح مضاف للضغط.', en: 'No added salt for blood pressure.' },
    ],
  },
  {
    id: 'msemen-complet',
    name: {
      fr: 'Msemen complet',
      ar: 'مسمّن بالقمح الكامل',
      en: 'Whole-wheat msemen',
    },
    category: 'bread',
    kcal: 210, protein: 6, carbs: 34, fat: 6,
    tags: ['vegetarian', 'high_fiber'],
    servings: 6,
    ingredients: [
      { fr: 'Farine complète, semoule fine', ar: 'دقيق كامل، سميد ناعم', en: 'Whole-wheat flour, fine semolina' },
      { fr: 'Un peu d’huile, eau, sel', ar: 'قليل من الزيت، ماء، ملح', en: 'A little oil, water, salt' },
    ],
    steps: [
      { fr: 'Pétrir, laisser reposer la pâte.', ar: 'يُعجن ويُترك ليرتاح.', en: 'Knead, let the dough rest.' },
      { fr: 'Étaler finement, plier en carré.', ar: 'يُرقّق ويُطوى مربعاً.', en: 'Roll thin, fold into a square.' },
      { fr: 'Cuire sur plaque avec très peu d’huile.', ar: 'يُطهى على الصاج بقليل جداً من الزيت.', en: 'Cook on a griddle with very little oil.' },
    ],
    healthySwaps: [
      { fr: 'Farine complète = plus de fibres, meilleur pour le diabète.', ar: 'الدقيق الكامل = ألياف أكثر، أفضل للسكري.', en: 'Whole-wheat = more fibre, better for diabetes.' },
      { fr: 'Cuire à sec sur poêle antiadhésive.', ar: 'اطهها بدون زيت على مقلاة غير لاصقة.', en: 'Dry-cook on a non-stick pan.' },
    ],
  },
  {
    id: 'loubia',
    name: {
      fr: 'Loubia (haricots blancs en sauce)',
      ar: 'لوبيا (فاصولياء بيضاء)',
      en: 'Loubia (white bean stew)',
    },
    category: 'main',
    kcal: 260, protein: 14, carbs: 38, fat: 5,
    tags: ['vegetarian', 'high_fiber'],
    servings: 4,
    ingredients: [
      { fr: 'Haricots blancs', ar: 'فاصولياء بيضاء', en: 'White beans' },
      { fr: 'Tomate, ail, cumin, paprika', ar: 'طماطم، ثوم، كمون، بابريكا', en: 'Tomato, garlic, cumin, paprika' },
    ],
    steps: [
      { fr: 'Cuire les haricots trempés jusqu’à tendreté.', ar: 'تُطهى الفاصولياء المنقوعة حتى تنضج.', en: 'Cook soaked beans until tender.' },
      { fr: 'Mijoter avec la sauce tomate épicée.', ar: 'تُطهى مع صلصة الطماطم المتبّلة.', en: 'Simmer with the spiced tomato sauce.' },
    ],
    healthySwaps: [
      { fr: 'Riche en fibres et protéines végétales : rassasiant.', ar: 'غنية بالألياف والبروتين النباتي: مُشبعة.', en: 'High in fibre and plant protein: filling.' },
      { fr: 'Réduire le sel pour la tension.', ar: 'قلّل الملح للضغط.', en: 'Cut salt for blood pressure.' },
    ],
  },
  {
    id: 'chakchouka',
    name: {
      fr: 'Chakchouka (œufs pochés en sauce)',
      ar: 'شكشوكة',
      en: 'Shakshuka (poached eggs)',
    },
    category: 'main',
    kcal: 240, protein: 14, carbs: 12, fat: 15,
    tags: ['vegetarian', 'high_protein'],
    servings: 3,
    ingredients: [
      { fr: 'Œufs', ar: 'بيض', en: 'Eggs' },
      { fr: 'Poivrons, tomates, oignon', ar: 'فلفل، طماطم، بصل', en: 'Peppers, tomatoes, onion' },
      { fr: 'Cumin, paprika, harissa', ar: 'كمون، بابريكا، هريسة', en: 'Cumin, paprika, harissa' },
    ],
    steps: [
      { fr: 'Mijoter poivrons, tomates et épices.', ar: 'تُطهى الخضار والتوابل.', en: 'Simmer peppers, tomatoes and spices.' },
      { fr: 'Casser les œufs dans la sauce, couvrir.', ar: 'يُكسر البيض في الصلصة ويُغطّى.', en: 'Crack the eggs into the sauce, cover.' },
    ],
    healthySwaps: [
      { fr: 'Peu d’huile : bon en perte de poids.', ar: 'قليل من الزيت: جيد لخسارة الوزن.', en: 'Little oil: good for weight loss.' },
      { fr: 'Doser l’harissa (sel) pour la tension.', ar: 'قلّل الهريسة (ملح) للضغط.', en: 'Go easy on harissa (salt) for blood pressure.' },
    ],
  },
  {
    id: 'rfissa-allegee',
    name: {
      fr: 'Rfissa allégée (poulet & lentilles)',
      ar: 'رفيسة خفيفة (دجاج وعدس)',
      en: 'Light rfissa (chicken & lentils)',
    },
    category: 'main',
    kcal: 410, protein: 30, carbs: 40, fat: 14,
    tags: ['high_protein'],
    servings: 4,
    ingredients: [
      { fr: 'Poulet, lentilles', ar: 'دجاج، عدس', en: 'Chicken, lentils' },
      { fr: 'Msemen émietté', ar: 'مسمّن مفتّت', en: 'Shredded msemen' },
      { fr: 'Fenugrec, ras el hanout', ar: 'حلبة، رأس الحانوت', en: 'Fenugreek, ras el hanout' },
    ],
    steps: [
      { fr: 'Mijoter poulet, lentilles et épices.', ar: 'يُطهى الدجاج والعدس والتوابل.', en: 'Simmer chicken, lentils and spices.' },
      { fr: 'Servir sur le pain émietté, arroser de sauce.', ar: 'يُقدّم على الخبز المفتّت مع الصلصة.', en: 'Serve over shredded bread, ladle the sauce.' },
    ],
    healthySwaps: [
      { fr: 'Retirer la peau du poulet, dégraisser la sauce.', ar: 'انزع الجلد وأزل الدهون من الصلصة.', en: 'Remove skin, skim the sauce.' },
      { fr: 'Utiliser du msemen complet.', ar: 'استعمل مسمّناً كاملاً.', en: 'Use whole-wheat msemen.' },
    ],
  },
  {
    id: 'bissara',
    name: {
      fr: 'Bissara (velouté de fèves)',
      ar: 'بصارة (حساء الفول)',
      en: 'Bissara (fava bean soup)',
    },
    category: 'soup',
    kcal: 180, protein: 11, carbs: 26, fat: 4,
    tags: ['vegetarian', 'high_fiber'],
    servings: 4,
    ingredients: [
      { fr: 'Fèves sèches décortiquées', ar: 'فول مجفف مقشّر', en: 'Dried split fava beans' },
      { fr: 'Ail, cumin, paprika', ar: 'ثوم، كمون، بابريكا', en: 'Garlic, cumin, paprika' },
      { fr: 'Filet d’huile d’olive', ar: 'رشة زيت زيتون', en: 'Drizzle of olive oil' },
    ],
    steps: [
      { fr: 'Cuire les fèves avec l’ail jusqu’à tendreté.', ar: 'يُطهى الفول مع الثوم حتى ينضج.', en: 'Cook the beans with garlic until tender.' },
      { fr: 'Mixer en velouté, assaisonner.', ar: 'يُخلط حتى يصبح كريمياً ويُتبّل.', en: 'Blend smooth, season.' },
    ],
    healthySwaps: [
      { fr: 'Doser le filet d’huile au service.', ar: 'قلّل الزيت عند التقديم.', en: 'Go light on the finishing oil.' },
      { fr: 'Peu de sel pour la tension.', ar: 'قليل من الملح للضغط.', en: 'Little salt for blood pressure.' },
    ],
  },
  {
    id: 'mloukhia',
    name: {
      fr: 'Mloukhia (ragoût vert)',
      ar: 'ملوخية',
      en: 'Mloukhia (green stew)',
    },
    category: 'main',
    kcal: 300, protein: 24, carbs: 12, fat: 17,
    tags: ['high_protein', 'red_meat'],
    servings: 5,
    ingredients: [
      { fr: 'Poudre de corète (mloukhia)', ar: 'مسحوق الملوخية', en: 'Jute leaf (mloukhia) powder' },
      { fr: 'Bœuf maigre', ar: 'لحم بقر خالٍ من الدهن', en: 'Lean beef' },
      { fr: 'Ail, coriandre, huile d’olive', ar: 'ثوم، كزبرة، زيت الزيتون', en: 'Garlic, coriander, olive oil' },
    ],
    steps: [
      { fr: 'Cuire longuement la poudre avec l’huile.', ar: 'يُطهى المسحوق طويلاً مع الزيت.', en: 'Cook the powder slowly with the oil.' },
      { fr: 'Ajouter la viande, mijoter jusqu’à tendreté.', ar: 'يُضاف اللحم ويُطهى حتى ينضج.', en: 'Add the meat, simmer until tender.' },
    ],
    healthySwaps: [
      { fr: 'Réduire l’huile (plat traditionnellement gras).', ar: 'قلّل الزيت (طبق دسم عادةً).', en: 'Reduce the oil (traditionally a rich dish).' },
      { fr: 'Remplacer le bœuf par de la volaille (goutte/cholestérol).', ar: 'استبدل البقر بالدواجن (النقرس/الكوليسترول).', en: 'Swap beef for poultry (gout/cholesterol).' },
    ],
  },
  {
    id: 'batbout-farci',
    name: {
      fr: 'Batbout farci légumes',
      ar: 'بطبوط محشو بالخضار',
      en: 'Veg-stuffed batbout',
    },
    category: 'bread',
    kcal: 250, protein: 9, carbs: 42, fat: 5,
    tags: ['vegetarian', 'high_fiber'],
    servings: 6,
    ingredients: [
      { fr: 'Farine complète, semoule', ar: 'دقيق كامل، سميد', en: 'Whole-wheat flour, semolina' },
      { fr: 'Légumes grillés, herbes', ar: 'خضار مشوية، أعشاب', en: 'Grilled vegetables, herbs' },
    ],
    steps: [
      { fr: 'Cuire les petits pains à la poêle sèche.', ar: 'تُطهى الأرغفة على مقلاة جافة.', en: 'Cook the small breads on a dry pan.' },
      { fr: 'Ouvrir et garnir de légumes grillés.', ar: 'تُفتح وتُحشى بالخضار المشوية.', en: 'Open and fill with grilled vegetables.' },
    ],
    healthySwaps: [
      { fr: 'Farine complète pour l’index glycémique (diabète).', ar: 'دقيق كامل لمؤشر سكري أفضل.', en: 'Whole-wheat for a lower glycaemic load (diabetes).' },
      { fr: 'Garniture de légumes plutôt que fromage/charcuterie.', ar: 'حشوة خضار بدل الجبن/المصنّعات.', en: 'Veg filling instead of cheese/cold cuts.' },
    ],
  },
  {
    id: 'salade-fruits-frais',
    name: {
      fr: 'Salade de fruits frais',
      ar: 'سلطة فواكه طازجة',
      en: 'Fresh fruit salad',
    },
    category: 'dessert',
    kcal: 120, protein: 2, carbs: 28, fat: 1,
    tags: ['vegetarian', 'high_fiber'],
    servings: 4,
    ingredients: [
      { fr: 'Fruits de saison (orange, pomme, grenade)', ar: 'فواكه موسمية (برتقال، تفاح، رمّان)', en: 'Seasonal fruit (orange, apple, pomegranate)' },
      { fr: 'Fleur d’oranger, cannelle', ar: 'ماء الزهر، قرفة', en: 'Orange-blossom water, cinnamon' },
    ],
    steps: [
      { fr: 'Couper les fruits, mélanger.', ar: 'تُقطّع الفواكه وتُخلط.', en: 'Cut the fruit, mix.' },
      { fr: 'Parfumer, servir frais.', ar: 'تُعطّر وتُقدّم باردة.', en: 'Perfume, serve chilled.' },
    ],
    healthySwaps: [
      { fr: 'Aucun sucre ajouté (sucres naturels des fruits).', ar: 'بدون سكر مضاف (سكر الفاكهة الطبيعي).', en: 'No added sugar (natural fruit sugars).' },
      { fr: 'Portion modérée si diabète.', ar: 'حصة معتدلة في حال السكري.', en: 'Moderate portion if diabetic.' },
    ],
  },
  {
    id: 'lentilles-marocaines',
    name: {
      fr: 'Lentilles à la marocaine',
      ar: 'عدس على الطريقة المغربية',
      en: 'Moroccan-style lentils',
    },
    category: 'main',
    kcal: 250, protein: 15, carbs: 36, fat: 4,
    tags: ['vegetarian', 'high_fiber', 'high_protein'],
    servings: 4,
    ingredients: [
      { fr: 'Lentilles vertes', ar: 'عدس أخضر', en: 'Green lentils' },
      { fr: 'Tomate, oignon, ail', ar: 'طماطم، بصل، ثوم', en: 'Tomato, onion, garlic' },
      { fr: 'Cumin, gingembre, paprika', ar: 'كمون، زنجبيل، بابريكا', en: 'Cumin, ginger, paprika' },
    ],
    steps: [
      { fr: 'Revenir oignon, ail et épices.', ar: 'يُقلى البصل والثوم والتوابل.', en: 'Sauté onion, garlic and spices.' },
      { fr: 'Ajouter lentilles et tomate, mijoter.', ar: 'يُضاف العدس والطماطم ويُطهى.', en: 'Add lentils and tomato, simmer.' },
    ],
    healthySwaps: [
      { fr: 'Excellente source de fibres (diabète, satiété).', ar: 'مصدر ممتاز للألياف (السكري، الشبع).', en: 'Excellent fibre source (diabetes, satiety).' },
      { fr: 'Peu de sel pour la tension.', ar: 'قليل من الملح للضغط.', en: 'Little salt for blood pressure.' },
    ],
  },
  {
    id: 'grilled-sardines',
    name: {
      fr: 'Sardines grillées aux herbes',
      ar: 'سردين مشوي بالأعشاب',
      en: 'Herb-grilled sardines',
    },
    category: 'main',
    kcal: 220, protein: 25, carbs: 1, fat: 13,
    tags: ['fish', 'high_protein', 'high_purine'],
    servings: 3,
    ingredients: [
      { fr: 'Sardines fraîches', ar: 'سردين طازج', en: 'Fresh sardines' },
      { fr: 'Ail, persil, cumin, citron', ar: 'ثوم، بقدونس، كمون، ليمون', en: 'Garlic, parsley, cumin, lemon' },
    ],
    steps: [
      { fr: 'Mariner les sardines avec la charmoula.', ar: 'تُتبّل السردين بالشرمولة.', en: 'Marinate the sardines with charmoula.' },
      { fr: 'Griller quelques minutes de chaque côté.', ar: 'تُشوى دقائق على كل جانب.', en: 'Grill a few minutes per side.' },
    ],
    healthySwaps: [
      { fr: 'Grillé (pas frit) : riche en oméga-3.', ar: 'مشوي (غير مقلي): غني بأوميغا-3.', en: 'Grilled (not fried): rich in omega-3.' },
      { fr: 'À limiter en cas de goutte (purines).', ar: 'يُحدّ منه عند النقرس (البيورينات).', en: 'Limit if you have gout (purines).' },
    ],
  },
];

// ---------------------------------------------------------------------------
// FONCTIONS
// ---------------------------------------------------------------------------

/** Renvoie une recette par id, ou undefined. */
export function getRecipe(id: string): LocalRecipe | undefined {
  return LOCAL_RECIPES.find((r) => r.id === id);
}

/** Liste des catégories présentes dans la base (ordre d'apparition stable). */
export function listCategories(): RecipeCategory[] {
  const seen: RecipeCategory[] = [];
  for (const r of LOCAL_RECIPES) if (!seen.includes(r.category)) seen.push(r.category);
  return seen;
}

/** Liste les recettes, filtrées par catégorie optionnelle. */
export function listRecipes(opts?: { category?: RecipeCategory }): LocalRecipe[] {
  const cat = opts?.category;
  if (!cat) return [...LOCAL_RECIPES];
  return LOCAL_RECIPES.filter((r) => r.category === cat);
}

/** Convertit une recette en candidat scorable (par portion) pour scoreFood. */
function toCandidate(recipe: LocalRecipe): FoodCandidate {
  return {
    // Le nom fr sert de "hay" pour les heuristiques regex du scoring médical.
    name: recipe.name.fr,
    kcal: recipe.kcal,
    protein: recipe.protein,
    carbs: recipe.carbs,
    fat: recipe.fat,
    tags: recipe.tags,
  };
}

/**
 * Score une recette vs le contexte d'objectif du jour (réutilise scoreFood).
 * Renvoie le FoodScore complet (fit / verdict great|ok|avoid / reasons /
 * blocked). Robuste : jamais d'exception (scoreFood est déjà tolérant).
 */
export function scoreRecipe(recipe: LocalRecipe, ctx: ObjectiveContext): FoodScore {
  return scoreFood(toCandidate(recipe), ctx);
}

/** Recette + son score, pour l'affichage trié. */
export interface ScoredRecipe {
  recipe: LocalRecipe;
  score: FoodScore;
}

/** Rang de tri d'un verdict (great < ok < avoid). */
function verdictRank(v: FoodScore['verdict']): number {
  return v === 'great' ? 0 : v === 'ok' ? 1 : 2;
}

/**
 * Recommande les recettes pour l'utilisateur : score chaque recette, puis trie
 * par verdict (great → ok → avoid) puis par fit décroissant. Filtre par
 * catégorie optionnelle. Les recettes bloquées (allergie/interdit) restent en
 * fin de liste (verdict avoid) mais NE sont PAS retirées, pour transparence.
 */
export function recommendForMe(
  ctx: ObjectiveContext,
  opts?: { category?: RecipeCategory },
): ScoredRecipe[] {
  const list = listRecipes(opts);
  const scored: ScoredRecipe[] = list.map((recipe) => ({ recipe, score: scoreRecipe(recipe, ctx) }));
  scored.sort((a, b) => {
    const vr = verdictRank(a.score.verdict) - verdictRank(b.score.verdict);
    if (vr !== 0) return vr;
    return b.score.fit - a.score.fit;
  });
  return scored;
}

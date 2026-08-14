'use client';
// Libelles de l'espace personnel, dans les trois langues de l'app.
// ---------------------------------------------------------------------------
// La langue n'est PAS choisie ici : elle est lue dans `users/{uid}.language`, le
// champ que l'app mobile ecrit deja. Quelqu'un qui utilise Salorie en arabe sur son
// telephone ouvre donc le web en arabe, sans rien regler — et l'arabe entraine le
// sens de lecture, exactement comme la racine `direction: rtl` du mobile.
export type Langue = 'fr' | 'en' | 'ar';

type Dico = Record<string, string>;

const FR: Dico = {
  scanTitre: 'Scanner un repas',
  scanSous: 'Une photo de ton assiette suffit — la même reconnaissance que sur ton téléphone.',
  scanDepose: 'Dépose une photo ici, ou clique pour choisir',
  scanAide: 'JPEG ou PNG · la photo est compressée sur ton appareil avant l’envoi',
  scanEnCours: 'Analyse de ton assiette…',
  scanEchec: "La reconnaissance a échoué. Reprends la photo avec plus de lumière.",
  scanQuota: 'Trop de scans en peu de temps. Réessaie dans une minute.',
  scanPasImage: 'Ce fichier n’est pas une image.',
  scanBasePortion: 'Estimation basée sur',
  scanAjouteVoir: 'Ajouté ✓ Voir mon journal',
  scanNotePhoto: 'Ta photo n’est pas conservée : elle sert à l’analyse, puis elle est oubliée. Seul le résultat rejoint ton journal.',
  journal: 'Mon journal',
  aujourdhui: "Aujourd'hui",
  hier: 'Hier',
  jourPrecedent: 'Jour précédent',
  jourSuivant: 'Jour suivant',
  repas: 'Repas',
  activites: 'Activités',
  eau: 'Hydratation',
  aucuneLigne: 'Rien pour ce jour. Ajoute un repas ci-dessous.',
  ajouter: 'Ajouter',
  ajouterRepas: 'Ajouter au journal',
  nom: 'Aliment ou plat',
  calories: 'Calories',
  proteines: 'Protéines',
  glucides: 'Glucides',
  lipides: 'Lipides',
  type: 'Type',
  moment: 'Moment',
  petitDej: 'Petit-déjeuner',
  dejeuner: 'Déjeuner',
  collation: 'Collation',
  diner: 'Dîner',
  supprimer: 'Supprimer',
  confirmerSuppression: 'Supprimer cette ligne du journal ?',
  total: 'Total',
  objectif: 'Objectif',
  restant: 'restantes',
  brulees: 'brûlées',
  enregistrement: 'Enregistrement…',
  erreurEcriture: "L'enregistrement a échoué. Réessaie.",
  syncNote:
    'Ce journal est le même que sur ton téléphone : ce que tu ajoutes ici apparaît là-bas immédiatement.',
  scanner: 'Scanner une photo',
};

const EN: Dico = {
  scanTitre: 'Scan a meal',
  scanSous: 'One photo of your plate is enough — the same recognition as on your phone.',
  scanDepose: 'Drop a photo here, or click to choose',
  scanAide: 'JPEG or PNG · the photo is compressed on your device before upload',
  scanEnCours: 'Analysing your plate…',
  scanEchec: 'Recognition failed. Retake the photo with more light.',
  scanQuota: 'Too many scans in a short time. Try again in a minute.',
  scanPasImage: 'That file is not an image.',
  scanBasePortion: 'Estimate based on',
  scanAjouteVoir: 'Added ✓ Open my diary',
  scanNotePhoto: 'Your photo is not kept: it is used for the analysis, then forgotten. Only the result reaches your diary.',
  journal: 'My diary',
  aujourdhui: 'Today',
  hier: 'Yesterday',
  jourPrecedent: 'Previous day',
  jourSuivant: 'Next day',
  repas: 'Meals',
  activites: 'Activities',
  eau: 'Hydration',
  aucuneLigne: 'Nothing for this day. Add a meal below.',
  ajouter: 'Add',
  ajouterRepas: 'Add to diary',
  nom: 'Food or dish',
  calories: 'Calories',
  proteines: 'Protein',
  glucides: 'Carbs',
  lipides: 'Fat',
  type: 'Type',
  moment: 'Meal time',
  petitDej: 'Breakfast',
  dejeuner: 'Lunch',
  collation: 'Snack',
  diner: 'Dinner',
  supprimer: 'Delete',
  confirmerSuppression: 'Delete this diary entry?',
  total: 'Total',
  objectif: 'Goal',
  restant: 'left',
  brulees: 'burned',
  enregistrement: 'Saving…',
  erreurEcriture: 'Saving failed. Please try again.',
  syncNote: 'This is the same diary as on your phone: what you add here shows up there instantly.',
  scanner: 'Scan a photo',
};

const AR: Dico = {
  scanTitre: 'مسح وجبة',
  scanSous: 'صورة واحدة لطبقك تكفي — نفس التعرّف الموجود في هاتفك.',
  scanDepose: 'أفلت صورة هنا، أو انقر للاختيار',
  scanAide: 'JPEG أو PNG · تُضغط الصورة على جهازك قبل الإرسال',
  scanEnCours: 'جارٍ تحليل طبقك…',
  scanEchec: 'فشل التعرّف. أعد التقاط الصورة بإضاءة أفضل.',
  scanQuota: 'عدد كبير من عمليات المسح في وقت قصير. حاول بعد دقيقة.',
  scanPasImage: 'هذا الملف ليس صورة.',
  scanBasePortion: 'تقدير بناءً على',
  scanAjouteVoir: 'تمت الإضافة ✓ افتح مذكرتي',
  scanNotePhoto: 'لا يتم الاحتفاظ بصورتك: تُستخدم للتحليل ثم تُنسى. النتيجة وحدها تصل إلى مذكرتك.',
  journal: 'مذكرتي',
  aujourdhui: 'اليوم',
  hier: 'أمس',
  jourPrecedent: 'اليوم السابق',
  jourSuivant: 'اليوم التالي',
  repas: 'الوجبات',
  activites: 'الأنشطة',
  eau: 'الترطيب',
  aucuneLigne: 'لا شيء لهذا اليوم. أضف وجبة أدناه.',
  ajouter: 'إضافة',
  ajouterRepas: 'أضف إلى المذكرة',
  nom: 'طعام أو طبق',
  calories: 'سعرات',
  proteines: 'بروتين',
  glucides: 'كربوهيدرات',
  lipides: 'دهون',
  type: 'النوع',
  moment: 'الوقت',
  petitDej: 'الفطور',
  dejeuner: 'الغداء',
  collation: 'وجبة خفيفة',
  diner: 'العشاء',
  supprimer: 'حذف',
  confirmerSuppression: 'حذف هذا السطر من المذكرة؟',
  total: 'المجموع',
  objectif: 'الهدف',
  restant: 'متبقية',
  brulees: 'محروقة',
  enregistrement: 'جارٍ الحفظ…',
  erreurEcriture: 'فشل الحفظ. حاول مرة أخرى.',
  syncNote: 'هذه نفس المذكرة الموجودة على هاتفك: ما تضيفه هنا يظهر هناك فورًا.',
  scanner: 'مسح صورة',
};

const DICOS: Record<Langue, Dico> = { fr: FR, en: EN, ar: AR };

/** Traducteur pour une langue. Retombe sur le francais si une cle manque. */
export function traducteur(langue: Langue | undefined) {
  const d = DICOS[langue || 'fr'] || FR;
  return (cle: string): string => d[cle] || FR[cle] || cle;
}

/** Sens de lecture. L'arabe retourne toute la page, comme la racine du mobile. */
export const sensLecture = (langue: Langue | undefined): 'rtl' | 'ltr' =>
  langue === 'ar' ? 'rtl' : 'ltr';

/** Code de locale pour les dates, aligne sur la langue choisie dans l'app. */
export const locale = (langue: Langue | undefined): string =>
  langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR';

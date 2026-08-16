/**
 * Le reste du catalogue d'exercices.
 *
 * ## Pourquoi un fichier à part
 *
 * Les 43 exercices d'origine vivent dans `workout-details.tsx` et tirent leurs
 * libellés des clés `lift.*` de `lib/i18n.tsx`. Chacun exigeait aussi une image
 * et une vidéo tournée — c'est ce qui a maintenu le catalogue à 43 quand un
 * concurrent en aligne des milliers.
 *
 * Ceux-ci portent leurs libellés EN LIGNE, dans les trois langues. L'écran sait
 * déjà les lire (`ex.label[language]` avant `t(ex.labelKey)`), donc rien à
 * changer côté i18n. Ni image ni vidéo requise : l'écran retombe sur la
 * démonstration YouTube, puis sur un visuel neutre.
 *
 * ## Les MET, et pourquoi ils comptent
 *
 * Trois valeurs par exercice — intensité basse, moyenne, haute — qui servent au
 * calcul des calories. Elles suivent le Compendium of Physical Activities :
 * musculation légère ≈ 3, effort modéré ≈ 5, effort intense ≈ 6 à 8. Les
 * mouvements polyarticulaires (soulevé de terre, épaulé) montent plus haut que
 * l'isolation (élévation latérale), parce qu'ils recrutent bien plus de masse
 * musculaire pour le même temps passé.
 *
 * Inventer ces valeurs fausserait un chiffre que les gens lisent comme une
 * mesure. Dans le doute on reste BAS : sous-estimer une dépense est bien moins
 * grave que de laisser croire à quelqu'un qu'il a brûlé ce qu'il n'a pas brûlé.
 *
 * ## Les muscles
 *
 * Uniquement les clés `muscle.*` qui existent déjà dans i18n — en inventer une
 * afficherait la clé brute à l'écran.
 */

export type ExercicePlus = {
  id: string;
  label: { fr: string; en: string; ar: string };
  howto: { fr: string; en: string; ar: string };
  /** [basse, moyenne, haute] intensité. */
  mets: [number, number, number];
  muscles: string[];
  /** Sert au filtrage « à la maison / en salle ». */
  materiel: 'aucun' | 'halteres' | 'barre' | 'machine' | 'poulie' | 'kettlebell' | 'elastique';
};

export const EXERCICES_PLUS: ExercicePlus[] = [
  // ---------------------------------------------------------------- PECTORAUX
  {
    id: 'pushup',
    label: { fr: 'Pompes', en: 'Push-up', ar: 'ضغط الصدر' },
    howto: {
      fr: "Mains un peu plus larges que les épaules, corps aligné de la tête aux talons. Descendre jusqu'à frôler le sol, remonter sans creuser le bas du dos.",
      en: 'Hands slightly wider than shoulders, body in one line from head to heels. Lower until you graze the floor, press back up without arching the lower back.',
      ar: 'اليدان أوسع قليلاً من الكتفين، والجسم على استقامة واحدة من الرأس إلى الكعبين. انزل حتى تلامس الأرض ثم ادفع دون تقويس أسفل الظهر.',
    },
    mets: [3.8, 5, 8],
    muscles: ['muscle.chest', 'muscle.triceps', 'muscle.core'],
    materiel: 'aucun',
  },
  {
    id: 'diamond_pushup',
    label: { fr: 'Pompes diamant', en: 'Diamond push-up', ar: 'ضغط الماسة' },
    howto: {
      fr: 'Mains jointes sous la poitrine, index et pouces en losange. Coudes près du corps. Le travail passe des pectoraux aux triceps.',
      en: 'Hands together under the chest, index fingers and thumbs forming a diamond. Elbows close to the body. The work shifts from chest to triceps.',
      ar: 'اليدان متلاصقتان تحت الصدر بشكل معين. المرفقان قريبان من الجسم. ينتقل الجهد من الصدر إلى العضلة ثلاثية الرؤوس.',
    },
    mets: [3.8, 5, 8],
    muscles: ['muscle.triceps', 'muscle.chest'],
    materiel: 'aucun',
  },
  {
    id: 'decline_bench',
    label: { fr: 'Développé décliné', en: 'Decline bench press', ar: 'ضغط مائل للأسفل' },
    howto: {
      fr: 'Banc incliné vers le bas, pieds bloqués. La barre descend au bas des pectoraux. Amplitude plus courte que le développé couché.',
      en: 'Bench declined, feet secured. The bar comes down to the lower chest. Shorter range than the flat bench press.',
      ar: 'المقعد مائل للأسفل والقدمان مثبّتتان. ينزل البار إلى أسفل الصدر. المدى أقصر من الضغط المستوي.',
    },
    mets: [3, 5, 6],
    muscles: ['muscle.chest', 'muscle.triceps'],
    materiel: 'barre',
  },
  {
    id: 'dumbbell_press',
    label: { fr: 'Développé haltères', en: 'Dumbbell bench press', ar: 'ضغط بالدمبل' },
    howto: {
      fr: 'Un haltère dans chaque main, poignets au-dessus des coudes. Descendre jusqu’au niveau de la poitrine, sans cogner les haltères en haut.',
      en: 'A dumbbell in each hand, wrists stacked over elbows. Lower to chest level; don’t clang the dumbbells at the top.',
      ar: 'دمبل في كل يد، والمعصمان فوق المرفقين. انزل إلى مستوى الصدر دون طرق الدمبلين في الأعلى.',
    },
    mets: [3, 5, 6],
    muscles: ['muscle.chest', 'muscle.shoulders', 'muscle.triceps'],
    materiel: 'halteres',
  },
  {
    id: 'pec_deck',
    label: { fr: 'Pec-deck', en: 'Pec deck', ar: 'جهاز الفراشة' },
    howto: {
      fr: 'Dos plaqué, coudes à hauteur d’épaules. Rapprocher les bras devant soi en serrant la poitrine, revenir sans relâcher d’un coup.',
      en: 'Back flat, elbows at shoulder height. Bring the arms together in front, squeezing the chest; return under control.',
      ar: 'الظهر ملتصق والمرفقان بارتفاع الكتفين. اجمع الذراعين أمامك مع ضغط الصدر، وعُد ببطء.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.chest'],
    materiel: 'machine',
  },
  {
    id: 'incline_dumbbell_press',
    label: { fr: 'Développé incliné haltères', en: 'Incline dumbbell press', ar: 'ضغط مائل بالدمبل' },
    howto: {
      fr: 'Banc à 30-45°. Au-delà, le travail glisse vers les épaules et le haut des pectoraux ne reçoit plus grand-chose.',
      en: 'Bench at 30-45°. Steeper than that and the work slides to the shoulders, leaving the upper chest little to do.',
      ar: 'المقعد بزاوية 30-45 درجة. أكثر من ذلك ينتقل الجهد إلى الكتفين ولا يبقى للصدر العلوي شيء.',
    },
    mets: [3, 5, 6],
    muscles: ['muscle.chest', 'muscle.shoulders'],
    materiel: 'halteres',
  },

  // ------------------------------------------------------------------- DOS
  {
    id: 'chinup',
    label: { fr: 'Traction supination', en: 'Chin-up', ar: 'عقلة بقبضة عكسية' },
    howto: {
      fr: 'Paumes vers soi, largeur d’épaules. Tirer jusqu’à ce que le menton dépasse la barre. Les biceps travaillent plus qu’en traction pronation.',
      en: 'Palms facing you, shoulder-width. Pull until the chin clears the bar. The biceps work more than in a pull-up.',
      ar: 'الكفّان نحوك بعرض الكتفين. اسحب حتى يتجاوز الذقن البار. تعمل العضلة ذات الرأسين أكثر من العقلة العادية.',
    },
    mets: [3, 5, 8],
    muscles: ['muscle.back', 'muscle.biceps'],
    materiel: 'aucun',
  },
  {
    id: 'seated_row',
    label: { fr: 'Rowing assis à la poulie', en: 'Seated cable row', ar: 'تجديف جالس بالكابل' },
    howto: {
      fr: 'Dos droit, tirer la poignée vers le nombril en serrant les omoplates. Ne pas se balancer d’avant en arrière pour lancer la charge.',
      en: 'Back straight, pull the handle to the navel while squeezing the shoulder blades. Don’t rock back and forth to launch the weight.',
      ar: 'الظهر مستقيم، اسحب المقبض نحو السرة مع ضغط لوحي الكتف. لا تتأرجح لدفع الوزن.',
    },
    mets: [3, 4.5, 6],
    muscles: ['muscle.back', 'muscle.biceps'],
    materiel: 'poulie',
  },
  {
    id: 'tbar_row',
    label: { fr: 'Rowing T-bar', en: 'T-bar row', ar: 'تجديف تي بار' },
    howto: {
      fr: 'Buste penché vers 45°, dos gainé. Tirer la barre vers le ventre. Charge lourde possible, dos rond interdit.',
      en: 'Torso hinged to about 45°, back braced. Pull the bar to the stomach. Heavy loads are fine; a rounded back is not.',
      ar: 'الجذع مائل نحو 45 درجة والظهر مشدود. اسحب البار نحو البطن. الوزن الثقيل ممكن، وتقويس الظهر ممنوع.',
    },
    mets: [3.5, 5.5, 7],
    muscles: ['muscle.back', 'muscle.biceps', 'muscle.rear_delts'],
    materiel: 'barre',
  },
  {
    id: 'pullover',
    label: { fr: 'Pull-over', en: 'Pullover', ar: 'بول أوفر' },
    howto: {
      fr: 'Allongé, bras tendus au-dessus de la tête, descendre l’haltère derrière soi en gardant les coudes à peine fléchis.',
      en: 'Lying down, arms extended overhead, lower the dumbbell behind you keeping the elbows only slightly bent.',
      ar: 'مستلقياً والذراعان ممدودتان فوق الرأس، أنزل الدمبل خلفك مع ثني بسيط للمرفقين.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.back', 'muscle.chest'],
    materiel: 'halteres',
  },
  {
    id: 'straight_arm_pulldown',
    label: { fr: 'Pull-over à la poulie', en: 'Straight-arm pulldown', ar: 'سحب بذراعين ممدودتين' },
    howto: {
      fr: 'Debout face à la poulie haute, bras tendus. Descendre la barre jusqu’aux cuisses sans plier les coudes.',
      en: 'Standing at the high pulley, arms straight. Bring the bar down to the thighs without bending the elbows.',
      ar: 'قف أمام البكرة العلوية والذراعان ممدودتان. أنزل البار إلى الفخذين دون ثني المرفقين.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.back'],
    materiel: 'poulie',
  },
  {
    id: 'inverted_row',
    label: { fr: 'Rowing inversé', en: 'Inverted row', ar: 'تجديف مقلوب' },
    howto: {
      fr: 'Sous une barre basse, corps gainé en planche. Tirer la poitrine vers la barre. Plus les pieds sont loin, plus c’est dur.',
      en: 'Under a low bar, body braced in a plank. Pull the chest to the bar. The further the feet, the harder it gets.',
      ar: 'تحت بار منخفض والجسم مشدود كاللوح. اسحب الصدر نحو البار. كلما ابتعدت القدمان زادت الصعوبة.',
    },
    mets: [3, 4.5, 6],
    muscles: ['muscle.back', 'muscle.biceps', 'muscle.core'],
    materiel: 'aucun',
  },

  // ---------------------------------------------------------------- ÉPAULES
  {
    id: 'arnold_press',
    label: { fr: 'Développé Arnold', en: 'Arnold press', ar: 'ضغط أرنولد' },
    howto: {
      fr: 'Partir paumes vers soi, pivoter les mains vers l’extérieur en montant. La rotation sollicite les trois faisceaux de l’épaule.',
      en: 'Start with palms facing you, rotate the hands outward as you press up. The rotation hits all three heads of the shoulder.',
      ar: 'ابدأ والكفّان نحوك، ثم أدرهما للخارج أثناء الرفع. تُشرك الدورة رؤوس الكتف الثلاثة.',
    },
    mets: [3, 4.5, 6],
    muscles: ['muscle.shoulders', 'muscle.triceps'],
    materiel: 'halteres',
  },
  {
    id: 'upright_row',
    label: { fr: 'Tirage menton', en: 'Upright row', ar: 'سحب عمودي' },
    howto: {
      fr: 'Prise large, tirer la barre le long du corps jusqu’aux pectoraux. Une prise serrée coince l’épaule : rester large.',
      en: 'Wide grip, pull the bar up along the body to chest height. A narrow grip pinches the shoulder — stay wide.',
      ar: 'قبضة واسعة، اسحب البار بمحاذاة الجسم حتى الصدر. القبضة الضيقة تضغط على الكتف، فابقَ واسعاً.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.shoulders', 'muscle.back'],
    materiel: 'barre',
  },
  {
    id: 'reverse_fly',
    label: { fr: 'Oiseau', en: 'Reverse fly', ar: 'رفرفة خلفية' },
    howto: {
      fr: 'Buste penché, bras légèrement fléchis, ouvrir vers l’extérieur. Charge légère : c’est un petit muscle, pas un mouvement de force.',
      en: 'Torso hinged, arms slightly bent, open outwards. Go light — this is a small muscle, not a strength lift.',
      ar: 'الجذع مائل والذراعان مثنيتان قليلاً، افتح للخارج. وزن خفيف: عضلة صغيرة لا حركة قوة.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.rear_delts', 'muscle.back'],
    materiel: 'halteres',
  },
  {
    id: 'cable_lateral_raise',
    label: { fr: 'Élévation latérale poulie', en: 'Cable lateral raise', ar: 'رفرفة جانبية بالكابل' },
    howto: {
      fr: 'Poulie basse derrière soi, monter le bras jusqu’à l’horizontale. La poulie garde la tension même en bas, contrairement à l’haltère.',
      en: 'Low pulley behind you, raise the arm to horizontal. The cable keeps tension at the bottom, unlike a dumbbell.',
      ar: 'البكرة السفلية خلفك، ارفع الذراع حتى الأفقي. يحافظ الكابل على الشد في الأسفل بخلاف الدمبل.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.shoulders'],
    materiel: 'poulie',
  },
  {
    id: 'pike_pushup',
    label: { fr: 'Pompes pique', en: 'Pike push-up', ar: 'ضغط الرمح' },
    howto: {
      fr: 'Hanches hautes, corps en V inversé. Descendre le sommet du crâne vers le sol. Le développé militaire du poids de corps.',
      en: 'Hips high, body in an inverted V. Lower the crown of the head toward the floor. The bodyweight overhead press.',
      ar: 'الوركان مرتفعان والجسم على شكل V مقلوب. انزل بأعلى الرأس نحو الأرض. إنه ضغط الكتف بوزن الجسم.',
    },
    mets: [3.5, 5, 7],
    muscles: ['muscle.shoulders', 'muscle.triceps', 'muscle.core'],
    materiel: 'aucun',
  },

  // ------------------------------------------------------------------- BRAS
  {
    id: 'concentration_curl',
    label: { fr: 'Curl concentré', en: 'Concentration curl', ar: 'تركيز البايسبس' },
    howto: {
      fr: 'Assis, coude calé contre l’intérieur de la cuisse. Monter sans bouger le coude — c’est le calage qui fait tout le mouvement.',
      en: 'Seated, elbow braced against the inner thigh. Curl without moving the elbow — the brace is the whole point.',
      ar: 'جالساً والمرفق مسند إلى داخل الفخذ. ارفع دون تحريك المرفق؛ الإسناد هو جوهر الحركة.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.biceps'],
    materiel: 'halteres',
  },
  {
    id: 'cable_curl',
    label: { fr: 'Curl à la poulie', en: 'Cable curl', ar: 'كيرل بالكابل' },
    howto: {
      fr: 'Poulie basse, coudes collés au corps. Tension constante du début à la fin, ce que l’haltère ne donne pas en haut.',
      en: 'Low pulley, elbows pinned to the sides. Constant tension throughout, which a dumbbell loses at the top.',
      ar: 'البكرة السفلية والمرفقان ملتصقان بالجسم. شدّ ثابت طوال الحركة، وهو ما يفقده الدمبل في الأعلى.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.biceps'],
    materiel: 'poulie',
  },
  {
    id: 'overhead_tricep',
    label: { fr: 'Extension nuque', en: 'Overhead triceps extension', ar: 'تمديد خلف الرأس' },
    howto: {
      fr: 'Haltère à deux mains au-dessus de la tête, coudes serrés. Descendre derrière la nuque, remonter sans écarter les coudes.',
      en: 'Dumbbell overhead in both hands, elbows tucked. Lower behind the neck, press back up without flaring the elbows.',
      ar: 'دمبل بكلتا اليدين فوق الرأس والمرفقان مضمومان. انزل خلف الرقبة ثم ارفع دون فتح المرفقين.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.triceps'],
    materiel: 'halteres',
  },
  {
    id: 'rope_pushdown',
    label: { fr: 'Extension corde', en: 'Rope pushdown', ar: 'دفع بالحبل' },
    howto: {
      fr: 'Écarter les deux brins de la corde en bas de mouvement : c’est cet écartement qui recrute le chef long du triceps.',
      en: 'Split the two rope ends apart at the bottom — that spread is what recruits the long head of the triceps.',
      ar: 'افتح طرفي الحبل في نهاية الحركة؛ هذا الفتح هو ما يُشرك الرأس الطويل للعضلة ثلاثية الرؤوس.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.triceps'],
    materiel: 'poulie',
  },
  {
    id: 'reverse_curl',
    label: { fr: 'Curl inversé', en: 'Reverse curl', ar: 'كيرل عكسي' },
    howto: {
      fr: 'Paumes vers le sol. Charge nettement plus légère qu’un curl classique, et c’est normal : les avant-bras limitent.',
      en: 'Palms facing down. Noticeably lighter than a regular curl, and that’s normal — the forearms are the limit.',
      ar: 'الكفّان نحو الأسفل. الوزن أخف بكثير من الكيرل العادي، وهذا طبيعي لأن الساعدين هما الحد.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.forearms', 'muscle.biceps'],
    materiel: 'barre',
  },
  {
    id: 'wrist_curl',
    label: { fr: 'Curl poignets', en: 'Wrist curl', ar: 'كيرل المعصم' },
    howto: {
      fr: 'Avant-bras posés sur les cuisses, seuls les poignets bougent. Petites amplitudes, séries longues.',
      en: 'Forearms resting on the thighs, only the wrists move. Small range, long sets.',
      ar: 'الساعدان على الفخذين ولا يتحرك سوى المعصمين. مدى صغير ومجموعات طويلة.',
    },
    mets: [2, 3, 4],
    muscles: ['muscle.forearms'],
    materiel: 'halteres',
  },
  {
    id: 'close_grip_bench',
    label: { fr: 'Développé prise serrée', en: 'Close-grip bench press', ar: 'ضغط بقبضة ضيقة' },
    howto: {
      fr: 'Mains à largeur d’épaules, coudes le long du corps. Le meilleur mouvement lourd pour les triceps.',
      en: 'Hands shoulder-width, elbows tracking close to the body. The best heavy movement for the triceps.',
      ar: 'اليدان بعرض الكتفين والمرفقان بمحاذاة الجسم. أفضل حركة ثقيلة للعضلة ثلاثية الرؤوس.',
    },
    mets: [3, 5, 6],
    muscles: ['muscle.triceps', 'muscle.chest'],
    materiel: 'barre',
  },

  // ------------------------------------------------------------- JAMBES
  {
    id: 'goblet_squat',
    label: { fr: 'Goblet squat', en: 'Goblet squat', ar: 'سكوات الكأس' },
    howto: {
      fr: 'Un haltère tenu contre la poitrine. Le contrepoids devant aide à garder le buste droit : idéal pour apprendre le squat.',
      en: 'One dumbbell held against the chest. The front counterweight helps keep the torso upright — ideal for learning the squat.',
      ar: 'دمبل واحد أمام الصدر. الثقل الأمامي يساعد على إبقاء الجذع مستقيماً، وهو مثالي لتعلّم السكوات.',
    },
    mets: [3.5, 5.5, 7],
    muscles: ['muscle.quads', 'muscle.glutes', 'muscle.core'],
    materiel: 'halteres',
  },
  {
    id: 'hack_squat',
    label: { fr: 'Hack squat', en: 'Hack squat', ar: 'هاك سكوات' },
    howto: {
      fr: 'Dos plaqué contre le dossier de la machine. Descendre jusqu’à 90° au genou. La machine tient le dos à votre place.',
      en: 'Back flat against the machine pad. Descend to about 90° at the knee. The machine holds your back for you.',
      ar: 'الظهر ملتصق بمسند الجهاز. انزل حتى 90 درجة عند الركبة. الجهاز يثبّت ظهرك عنك.',
    },
    mets: [3.5, 5.5, 7.5],
    muscles: ['muscle.quads', 'muscle.glutes'],
    materiel: 'machine',
  },
  {
    id: 'step_up',
    label: { fr: 'Montée de banc', en: 'Step-up', ar: 'الصعود على المقعد' },
    howto: {
      fr: 'Monter en poussant sur le talon de la jambe posée, sans s’aider d’une impulsion de la jambe au sol.',
      en: 'Drive up through the heel of the working leg, without pushing off the trailing foot.',
      ar: 'اصعد بالدفع من كعب الساق العاملة دون الاستعانة بدفعة من الساق الأخرى.',
    },
    mets: [4, 6, 8],
    muscles: ['muscle.quads', 'muscle.glutes', 'muscle.hamstrings'],
    materiel: 'aucun',
  },
  {
    id: 'sumo_deadlift',
    label: { fr: 'Soulevé de terre sumo', en: 'Sumo deadlift', ar: 'رفعة سومو' },
    howto: {
      fr: 'Pieds très écartés, mains à l’intérieur des jambes. Buste plus droit qu’en conventionnel, dos moins sollicité.',
      en: 'Feet wide, hands inside the legs. More upright torso than conventional, less demand on the lower back.',
      ar: 'القدمان متباعدتان واليدان داخل الساقين. الجذع أكثر استقامة من الرفعة التقليدية وضغط أقل على الظهر.',
    },
    mets: [3.5, 6, 8],
    muscles: ['muscle.glutes', 'muscle.quads', 'muscle.back'],
    materiel: 'barre',
  },
  {
    id: 'glute_bridge',
    label: { fr: 'Pont fessier', en: 'Glute bridge', ar: 'جسر المؤخرة' },
    howto: {
      fr: 'Allongé au sol, pieds à plat. Monter le bassin en serrant les fessiers, marquer un temps en haut.',
      en: 'Lying on the floor, feet flat. Lift the hips by squeezing the glutes, pause at the top.',
      ar: 'مستلقياً على الأرض والقدمان مسطحتان. ارفع الحوض بضغط عضلات المؤخرة وتوقف لحظة في الأعلى.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.glutes', 'muscle.hamstrings'],
    materiel: 'aucun',
  },
  {
    id: 'nordic_curl',
    label: { fr: 'Nordic curl', en: 'Nordic hamstring curl', ar: 'كيرل نورديك' },
    howto: {
      fr: 'À genoux, chevilles bloquées, descendre le buste le plus lentement possible. Très exigeant : commencer assisté.',
      en: 'Kneeling with ankles anchored, lower the torso as slowly as you can. Very demanding — start assisted.',
      ar: 'راكعاً والكاحلان مثبّتان، انزل بالجذع ببطء شديد. حركة صعبة جداً، ابدأ بمساعدة.',
    },
    mets: [3, 5, 7],
    muscles: ['muscle.hamstrings', 'muscle.glutes'],
    materiel: 'aucun',
  },
  {
    id: 'wall_sit',
    label: { fr: 'Chaise', en: 'Wall sit', ar: 'وضعية الكرسي' },
    howto: {
      fr: 'Dos au mur, cuisses parallèles au sol. On tient le temps, on ne compte pas les répétitions.',
      en: 'Back against the wall, thighs parallel to the floor. Hold for time — there are no reps to count.',
      ar: 'الظهر إلى الحائط والفخذان موازيتان للأرض. تُحسب بالوقت لا بالتكرارات.',
    },
    mets: [3, 4, 5],
    muscles: ['muscle.quads'],
    materiel: 'aucun',
  },
  {
    id: 'standing_calf_raise',
    label: { fr: 'Mollets debout', en: 'Standing calf raise', ar: 'رفع السمانة واقفاً' },
    howto: {
      fr: 'Monter le plus haut possible sur la pointe, redescendre le talon SOUS le niveau de la marche pour l’étirement complet.',
      en: 'Rise as high as possible on the toes, then drop the heel BELOW the step for the full stretch.',
      ar: 'ارتفع على أطراف الأصابع قدر الإمكان، ثم أنزل الكعب تحت مستوى الدرجة للحصول على تمدد كامل.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.calves'],
    materiel: 'aucun',
  },
  {
    id: 'hip_abduction',
    label: { fr: 'Abduction hanches', en: 'Hip abduction', ar: 'إبعاد الورك' },
    howto: {
      fr: 'Assis sur la machine, écarter les genoux contre la résistance. Complément du travail d’adduction.',
      en: 'Seated on the machine, push the knees apart against the resistance. The counterpart to hip adduction.',
      ar: 'جالساً على الجهاز، افتح الركبتين ضد المقاومة. مكمّل لتمرين تقريب الورك.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.glutes'],
    materiel: 'machine',
  },
  {
    id: 'pistol_squat',
    label: { fr: 'Squat pistolet', en: 'Pistol squat', ar: 'سكوات المسدس' },
    howto: {
      fr: 'Sur une jambe, l’autre tendue devant. Demande autant d’équilibre que de force : s’aider d’un appui au début.',
      en: 'On one leg, the other extended in front. Needs as much balance as strength — hold a support at first.',
      ar: 'على ساق واحدة والأخرى ممدودة أماماً. يتطلب توازناً بقدر ما يتطلب قوة، فاستعن بمسند في البداية.',
    },
    mets: [4, 6, 8],
    muscles: ['muscle.quads', 'muscle.glutes', 'muscle.core'],
    materiel: 'aucun',
  },

  // ------------------------------------------------------------------ GAINAGE
  {
    id: 'side_plank',
    label: { fr: 'Gainage latéral', en: 'Side plank', ar: 'بلانك جانبي' },
    howto: {
      fr: 'Sur un avant-bras, corps aligné, hanches hautes. Le bassin ne doit pas s’affaisser vers le sol.',
      en: 'On one forearm, body in line, hips high. The pelvis must not sag toward the floor.',
      ar: 'على ساعد واحد والجسم على استقامة والوركان مرتفعان. لا يجب أن يهبط الحوض نحو الأرض.',
    },
    mets: [2.5, 3.5, 4.5],
    muscles: ['muscle.obliques', 'muscle.core'],
    materiel: 'aucun',
  },
  {
    id: 'dead_bug',
    label: { fr: 'Dead bug', en: 'Dead bug', ar: 'الحشرة الميتة' },
    howto: {
      fr: 'Sur le dos, bras et jambes en l’air. Tendre bras et jambe opposés en gardant le bas du dos collé au sol.',
      en: 'On your back, arms and legs up. Extend opposite arm and leg while keeping the lower back pressed to the floor.',
      ar: 'على الظهر والذراعان والساقان مرفوعتان. مُدّ الذراع والساق المتقابلتين مع إبقاء أسفل الظهر ملتصقاً بالأرض.',
    },
    mets: [2.5, 3.5, 4.5],
    muscles: ['muscle.core'],
    materiel: 'aucun',
  },
  {
    id: 'mountain_climber',
    label: { fr: 'Grimpeur', en: 'Mountain climber', ar: 'متسلق الجبال' },
    howto: {
      fr: 'En position de pompe, ramener les genoux vers la poitrine en alternance, hanches basses et stables.',
      en: 'In a push-up position, drive the knees to the chest alternately, hips low and steady.',
      ar: 'في وضعية الضغط، قرّب الركبتين نحو الصدر بالتناوب مع إبقاء الوركين منخفضين وثابتين.',
    },
    mets: [4, 7, 9],
    muscles: ['muscle.core', 'muscle.shoulders', 'muscle.quads'],
    materiel: 'aucun',
  },
  {
    id: 'leg_raise',
    label: { fr: 'Relevé de jambes', en: 'Lying leg raise', ar: 'رفع الساقين' },
    howto: {
      fr: 'Allongé, jambes tendues, monter jusqu’à la verticale. Garder le bas du dos au sol, sinon ce sont les hanches qui travaillent.',
      en: 'Lying flat, legs straight, raise to vertical. Keep the lower back down or the hips take over.',
      ar: 'مستلقياً والساقان ممدودتان، ارفع حتى العمودي. أبقِ أسفل الظهر على الأرض وإلا عمل الورك بدلاً منك.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.core'],
    materiel: 'aucun',
  },
  {
    id: 'cable_crunch',
    label: { fr: 'Crunch à la poulie', en: 'Cable crunch', ar: 'كرنش بالكابل' },
    howto: {
      fr: 'À genoux sous la poulie haute, enrouler le buste vers le sol. La flexion vient des abdos, pas des hanches.',
      en: 'Kneeling under the high pulley, curl the torso toward the floor. The flexion comes from the abs, not the hips.',
      ar: 'راكعاً تحت البكرة العلوية، لُفّ الجذع نحو الأرض. الانثناء من البطن لا من الورك.',
    },
    mets: [2.5, 3.5, 5],
    muscles: ['muscle.core'],
    materiel: 'poulie',
  },
  {
    id: 'hollow_hold',
    label: { fr: 'Hollow body', en: 'Hollow hold', ar: 'وضعية القارب' },
    howto: {
      fr: 'Sur le dos, épaules et jambes décollées, bas du dos plaqué. Tenir la position sans trembler du bassin.',
      en: 'On your back, shoulders and legs off the floor, lower back pressed down. Hold without letting the pelvis shake.',
      ar: 'على الظهر مع رفع الكتفين والساقين وإلصاق أسفل الظهر. حافظ على الوضعية دون اهتزاز الحوض.',
    },
    mets: [3, 4, 5],
    muscles: ['muscle.core'],
    materiel: 'aucun',
  },
  {
    id: 'ab_wheel',
    label: { fr: 'Roue abdominale', en: 'Ab wheel rollout', ar: 'عجلة البطن' },
    howto: {
      fr: 'À genoux, dérouler devant soi sans creuser le bas du dos. Aller seulement aussi loin que le gainage tient.',
      en: 'From the knees, roll out without arching the lower back. Go only as far as your brace holds.',
      ar: 'من وضع الركوع، ادفع العجلة أماماً دون تقويس أسفل الظهر. اذهب بقدر ما يتحمل شدّ البطن.',
    },
    mets: [3, 4.5, 6],
    muscles: ['muscle.core', 'muscle.shoulders'],
    materiel: 'aucun',
  },

  // ------------------------------------------------------- CORPS ENTIER
  {
    id: 'burpee',
    label: { fr: 'Burpee', en: 'Burpee', ar: 'بيربي' },
    howto: {
      fr: 'Squat, planche, pompe, retour, saut. Enchaîner sans pause : c’est le rythme qui en fait un exercice cardio.',
      en: 'Squat, plank, push-up, back, jump. Chain them without pausing — the pace is what makes it cardio.',
      ar: 'سكوات، لوح، ضغط، رجوع، قفزة. تابعها دون توقف؛ الإيقاع هو ما يجعلها تمريناً هوائياً.',
    },
    mets: [6, 8, 10],
    muscles: ['muscle.full_body'],
    materiel: 'aucun',
  },
  {
    id: 'kettlebell_swing',
    label: { fr: 'Swing kettlebell', en: 'Kettlebell swing', ar: 'أرجحة الكيتل بيل' },
    howto: {
      fr: 'La poussée vient des hanches, pas des bras. Le kettlebell monte tout seul jusqu’à l’horizontale.',
      en: 'The drive comes from the hips, not the arms. The kettlebell floats up to horizontal on its own.',
      ar: 'الدفع من الوركين لا من الذراعين. يرتفع الكيتل بيل من تلقاء نفسه حتى الأفقي.',
    },
    mets: [5, 8, 10],
    muscles: ['muscle.glutes', 'muscle.hamstrings', 'muscle.back', 'muscle.core'],
    materiel: 'kettlebell',
  },
  {
    id: 'thruster',
    label: { fr: 'Thruster', en: 'Thruster', ar: 'ثراستر' },
    howto: {
      fr: 'Front squat enchaîné avec un développé. La remontée du squat lance la barre : un seul mouvement, pas deux.',
      en: 'A front squat flowing into an overhead press. The drive out of the squat launches the bar — one movement, not two.',
      ar: 'سكوات أمامي متصل بضغط علوي. اندفاع الصعود يطلق البار: حركة واحدة لا اثنتان.',
    },
    mets: [5, 8, 10],
    muscles: ['muscle.full_body'],
    materiel: 'barre',
  },
  {
    id: 'clean',
    label: { fr: 'Épaulé', en: 'Power clean', ar: 'الرفعة إلى الكتف' },
    howto: {
      fr: 'Mouvement d’haltérophilie : la barre monte du sol aux épaules en une explosion de hanches. À apprendre léger.',
      en: 'An Olympic lift: the bar travels from floor to shoulders in one hip explosion. Learn it light.',
      ar: 'حركة رفع أثقال: يرتفع البار من الأرض إلى الكتفين بانفجار من الوركين. تعلّمها بوزن خفيف.',
    },
    mets: [5, 7.5, 10],
    muscles: ['muscle.full_body'],
    materiel: 'barre',
  },
  {
    id: 'farmer_walk',
    label: { fr: 'Marche du fermier', en: 'Farmer’s walk', ar: 'مشية المزارع' },
    howto: {
      fr: 'Marcher avec une charge lourde dans chaque main, épaules basses et gainage serré. Se mesure en distance.',
      en: 'Walk with a heavy load in each hand, shoulders down and core tight. Measured in distance.',
      ar: 'امشِ بحمل ثقيل في كل يد مع خفض الكتفين وشدّ البطن. تُقاس بالمسافة.',
    },
    mets: [4, 6, 8],
    muscles: ['muscle.forearms', 'muscle.core', 'muscle.full_body'],
    materiel: 'halteres',
  },
  {
    id: 'battle_rope',
    label: { fr: 'Cordes ondulatoires', en: 'Battle ropes', ar: 'حبال القتال' },
    howto: {
      fr: 'Ondes alternées ou simultanées, genoux fléchis. Très cardio malgré l’apparence d’un exercice de bras.',
      en: 'Alternating or simultaneous waves, knees bent. Very cardio despite looking like an arm exercise.',
      ar: 'موجات متبادلة أو متزامنة والركبتان مثنيتان. مجهود هوائي كبير رغم مظهره كتمرين ذراعين.',
    },
    mets: [5, 8, 10],
    muscles: ['muscle.shoulders', 'muscle.core', 'muscle.full_body'],
    materiel: 'aucun',
  },
  {
    id: 'jump_rope',
    label: { fr: 'Corde à sauter', en: 'Jump rope', ar: 'حبل القفز' },
    howto: {
      fr: 'Sauts bas et rapides, poignets qui tournent plutôt que les bras. Retomber sur l’avant du pied.',
      en: 'Low, fast hops, turning from the wrists rather than the arms. Land on the balls of the feet.',
      ar: 'قفزات منخفضة وسريعة، والدوران من المعصمين لا الذراعين. الهبوط على مقدمة القدم.',
    },
    mets: [8, 11, 12.3],
    muscles: ['muscle.calves', 'muscle.full_body'],
    materiel: 'aucun',
  },
  {
    id: 'box_jump',
    label: { fr: 'Saut sur box', en: 'Box jump', ar: 'القفز على الصندوق' },
    howto: {
      fr: 'Monter en sautant, REDESCENDRE EN MARCHANT. Sauter à la descente est la première cause de blessure sur ce mouvement.',
      en: 'Jump up, STEP DOWN. Jumping off the box is the leading cause of injury on this movement.',
      ar: 'اقفز للأعلى وانزل مشياً. القفز عند النزول هو السبب الأول للإصابة في هذه الحركة.',
    },
    mets: [5, 7, 9],
    muscles: ['muscle.quads', 'muscle.glutes', 'muscle.calves'],
    materiel: 'aucun',
  },

  // ------------------------------------------------------------- ÉLASTIQUES
  {
    id: 'band_pull_apart',
    label: { fr: 'Écarté élastique', en: 'Band pull-apart', ar: 'فتح المطاط' },
    howto: {
      fr: 'Bras tendus devant, écarter l’élastique jusqu’à la poitrine. Excellent échauffement d’épaules.',
      en: 'Arms straight in front, pull the band apart to chest level. An excellent shoulder warm-up.',
      ar: 'الذراعان ممدودتان أماماً، افتح المطاط حتى الصدر. إحماء ممتاز للكتفين.',
    },
    mets: [2.5, 3, 4],
    muscles: ['muscle.rear_delts', 'muscle.back'],
    materiel: 'elastique',
  },
  {
    id: 'band_squat',
    label: { fr: 'Squat élastique', en: 'Banded squat', ar: 'سكوات بالمطاط' },
    howto: {
      fr: 'Élastique au-dessus des genoux, pousser vers l’extérieur pendant tout le mouvement pour engager les fessiers.',
      en: 'Band above the knees, push outward throughout the movement to engage the glutes.',
      ar: 'المطاط فوق الركبتين، ادفع للخارج طوال الحركة لإشراك عضلات المؤخرة.',
    },
    mets: [3.5, 5, 6.5],
    muscles: ['muscle.quads', 'muscle.glutes'],
    materiel: 'elastique',
  },
  {
    id: 'band_row',
    label: { fr: 'Rowing élastique', en: 'Band row', ar: 'تجديف بالمطاط' },
    howto: {
      fr: 'Élastique ancré devant soi, tirer vers le ventre coudes serrés. Le dos complet, sans salle.',
      en: 'Band anchored in front, pull to the stomach with elbows close. A full back workout without a gym.',
      ar: 'المطاط مثبّت أمامك، اسحب نحو البطن والمرفقان قريبان. تمرين ظهر كامل دون صالة.',
    },
    mets: [3, 4.5, 6],
    muscles: ['muscle.back', 'muscle.biceps'],
    materiel: 'elastique',
  },
];

/** Index par identifiant, pour retrouver un exercice sans parcourir la liste. */
export const PAR_ID: Record<string, ExercicePlus> = Object.fromEntries(
  EXERCICES_PLUS.map((e) => [e.id, e])
);

/** Filtre par matériel — sert à un futur choix « à la maison / en salle ». */
export function parMateriel(materiel: ExercicePlus['materiel']): ExercicePlus[] {
  return EXERCICES_PLUS.filter((e) => e.materiel === materiel);
}

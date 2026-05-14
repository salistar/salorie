import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowLeft, Clock } from 'lucide-react-native';
import { Video, ResizeMode } from 'expo-av';
import { getLocalVideo } from '../assets/videos/registry';
import { Colors } from '../constants/Colors';
import { getUserFromFirestore } from '../lib/firebase';
import { useUser } from '@clerk/clerk-expo';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ScreenTopBar from '../components/ScreenTopBar';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { colorLog, explain } from '../lib/LocalDataStore';

const { width } = Dimensions.get('window');
console.log('\x1b[35m[workout-details.tsx] MODULE LOADED\x1b[0m');

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Images stock (Unsplash — libres de droit) pour chaque activite / exercice.
// NOTE : si une URL casse, l'Image onError log et on garde le fond couleur.
const RUN_ACTIVITIES = [
  {
    id: 'running',
    labelKey: 'act.running',
    image: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?w=800&q=70',
    mets: [7, 9.8, 12.5], // low/med/high
  },
  {
    id: 'walking',
    labelKey: 'act.walking',
    image: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=70',
    mets: [2.5, 3.5, 5.0],
  },
  {
    id: 'cycling',
    labelKey: 'act.cycling',
    image: 'https://images.unsplash.com/photo-1571068316344-75bc76f77890?w=800&q=70',
    mets: [4, 8, 12],
  },
  {
    id: 'swimming',
    labelKey: 'act.swimming',
    image: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800&q=70',
    mets: [5.8, 8.3, 10],
  },
  {
    id: 'hiking',
    labelKey: 'act.hiking',
    image: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=800&q=70',
    mets: [5, 6, 7.3],
  },
  {
    id: 'rowing',
    labelKey: 'act.rowing',
    image: 'https://images.pexels.com/photos/3721281/pexels-photo-3721281.jpeg?auto=compress&cs=tinysrgb&w=800',
    mets: [4.8, 7, 8.5],
  },
];

// 30 exercices de musculation. Chaque mouvement peut avoir une video demo MP4 locale
// enregistree dans assets/videos/registry.ts. Si la video existe, un bouton "Voir la
// video demo" apparait et ouvre un lecteur inline (expo-av). Sinon, pas de bouton.
// Chaque exercice a maintenant : muscles cibles (keys i18n muscle.*) + une cle howto
// (lift.howto.<id>) pointant vers un descriptif d execution traduit. Les METs sont
// calibres par exercice et servent au calcul de calories local (formule MET standard).
const LIFT_EXERCISES = [
  // Images Pexels verifiees par recherche specifique a chaque mouvement
  // (recherche "<exercice>" sur pexels.com et ID du premier resultat pertinent).
  { id: 'bench_press', labelKey: 'lift.bench_press', image: 'https://images.pexels.com/photos/3837781/pexels-photo-3837781.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 5, 6], muscles: ['muscle.chest', 'muscle.triceps', 'muscle.shoulders'] },
  { id: 'squat', labelKey: 'lift.squat', image: 'https://images.pexels.com/photos/1552106/pexels-photo-1552106.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3.5, 5.5, 8], muscles: ['muscle.quads', 'muscle.glutes', 'muscle.hamstrings', 'muscle.core'] },
  { id: 'deadlift', labelKey: 'lift.deadlift', image: 'https://images.pexels.com/photos/13822300/pexels-photo-13822300.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3.5, 6, 8], muscles: ['muscle.back', 'muscle.hamstrings', 'muscle.glutes', 'muscle.forearms'] },
  { id: 'shoulder_press', labelKey: 'lift.shoulder_press', image: 'https://images.pexels.com/photos/14099787/pexels-photo-14099787.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 4.5, 6], muscles: ['muscle.shoulders', 'muscle.triceps', 'muscle.core'] },
  { id: 'pullup', labelKey: 'lift.pullup', image: 'https://images.pexels.com/photos/7187872/pexels-photo-7187872.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 5, 8], muscles: ['muscle.back', 'muscle.biceps', 'muscle.forearms'] },
  { id: 'bicep_curl', labelKey: 'lift.bicep_curl', image: 'https://images.pexels.com/photos/5327466/pexels-photo-5327466.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.biceps', 'muscle.forearms'] },
  { id: 'incline_bench', labelKey: 'lift.incline_bench', image: 'https://images.pexels.com/photos/18060077/pexels-photo-18060077.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 5, 6], muscles: ['muscle.chest', 'muscle.shoulders', 'muscle.triceps'] },
  { id: 'dumbbell_row', labelKey: 'lift.dumbbell_row', image: 'https://images.pexels.com/photos/14604676/pexels-photo-14604676.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 5, 6.5], muscles: ['muscle.back', 'muscle.biceps'] },
  { id: 'barbell_row', labelKey: 'lift.barbell_row', image: 'https://images.pexels.com/photos/4720790/pexels-photo-4720790.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3.5, 5.5, 7], muscles: ['muscle.back', 'muscle.biceps', 'muscle.rear_delts'] },
  { id: 'lat_pulldown', labelKey: 'lift.lat_pulldown', image: 'https://images.pexels.com/photos/18060085/pexels-photo-18060085.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 4.5, 6], muscles: ['muscle.back', 'muscle.biceps'] },
  { id: 'leg_press', labelKey: 'lift.leg_press', image: 'https://images.pexels.com/photos/30789702/pexels-photo-30789702.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3.5, 5.5, 7.5], muscles: ['muscle.quads', 'muscle.glutes', 'muscle.hamstrings'] },
  { id: 'lunges', labelKey: 'lift.lunges', image: 'https://images.pexels.com/photos/5037402/pexels-photo-5037402.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 5, 7], muscles: ['muscle.quads', 'muscle.glutes', 'muscle.hamstrings'] },
  { id: 'romanian_dl', labelKey: 'lift.romanian_dl', image: 'https://images.pexels.com/photos/5837307/pexels-photo-5837307.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3.5, 6, 8], muscles: ['muscle.hamstrings', 'muscle.glutes', 'muscle.back'] },
  { id: 'tricep_dips', labelKey: 'lift.tricep_dips', image: 'https://images.pexels.com/photos/5496589/pexels-photo-5496589.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 5, 8], muscles: ['muscle.triceps', 'muscle.chest', 'muscle.shoulders'] },
  { id: 'tricep_pushdown', labelKey: 'lift.tricep_pushdown', image: 'https://images.pexels.com/photos/20594796/pexels-photo-20594796.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.triceps'] },
  { id: 'hammer_curl', labelKey: 'lift.hammer_curl', image: 'https://images.pexels.com/photos/14793884/pexels-photo-14793884.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.biceps', 'muscle.forearms'] },
  { id: 'preacher_curl', labelKey: 'lift.preacher_curl', image: 'https://images.pexels.com/photos/5837270/pexels-photo-5837270.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.biceps'] },
  { id: 'lateral_raise', labelKey: 'lift.lateral_raise', image: 'https://images.pexels.com/photos/6339688/pexels-photo-6339688.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.shoulders'] },
  { id: 'front_raise', labelKey: 'lift.front_raise', image: 'https://images.pexels.com/photos/3926636/pexels-photo-3926636.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.shoulders'] },
  { id: 'face_pull', labelKey: 'lift.face_pull', image: 'https://images.pexels.com/photos/5327494/pexels-photo-5327494.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.rear_delts', 'muscle.back'] },
  { id: 'chest_fly', labelKey: 'lift.chest_fly', image: 'https://images.pexels.com/photos/14616295/pexels-photo-14616295.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.chest'] },
  { id: 'cable_crossover', labelKey: 'lift.cable_crossover', image: 'https://images.pexels.com/photos/10754972/pexels-photo-10754972.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.chest'] },
  { id: 'calf_raise', labelKey: 'lift.calf_raise', image: 'https://images.pexels.com/photos/13965339/pexels-photo-13965339.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.5, 3.5, 5], muscles: ['muscle.calves'] },
  { id: 'leg_curl', labelKey: 'lift.leg_curl', image: 'https://images.pexels.com/photos/28731788/pexels-photo-28731788.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 4.5, 6], muscles: ['muscle.hamstrings'] },
  { id: 'leg_extension', labelKey: 'lift.leg_extension', image: 'https://images.pexels.com/photos/19722966/pexels-photo-19722966.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 4.5, 6], muscles: ['muscle.quads'] },
  { id: 'hip_thrust', labelKey: 'lift.hip_thrust', image: 'https://images.pexels.com/photos/4662331/pexels-photo-4662331.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 5, 7], muscles: ['muscle.glutes', 'muscle.hamstrings'] },
  { id: 'bulgarian_split', labelKey: 'lift.bulgarian_split', image: 'https://images.pexels.com/photos/13106607/pexels-photo-13106607.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3.5, 5.5, 8], muscles: ['muscle.quads', 'muscle.glutes', 'muscle.core'] },
  { id: 'plank', labelKey: 'lift.plank', image: 'https://images.pexels.com/photos/6339462/pexels-photo-6339462.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.8, 4, 5], muscles: ['muscle.core', 'muscle.shoulders', 'muscle.full_body'] },
  { id: 'crunches', labelKey: 'lift.crunches', image: 'https://images.pexels.com/photos/4971061/pexels-photo-4971061.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.8, 4, 5.5], muscles: ['muscle.core'] },
  { id: 'russian_twist', labelKey: 'lift.russian_twist', image: 'https://images.pexels.com/photos/5128466/pexels-photo-5128466.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [2.8, 4, 5.5], muscles: ['muscle.core', 'muscle.obliques'] },
  { id: 'hanging_knee', labelKey: 'lift.hanging_knee', image: 'https://images.pexels.com/photos/8038687/pexels-photo-8038687.jpeg?auto=compress&cs=tinysrgb&w=800', mets: [3, 4.5, 6], muscles: ['muscle.core', 'muscle.forearms'] },
];

function languageInstruction(lang: 'en' | 'fr' | 'ar'): string {
  if (lang === 'fr') return 'Respond in FRENCH. All text must be in French.';
  if (lang === 'ar') return 'Respond in ARABIC. All text must be in Arabic.';
  return 'Respond in ENGLISH.';
}

export default function WorkoutDetailsScreen() {
  const { user } = useUser();
  const params = useLocalSearchParams();
  const type = (params.type as string) || 'run'; // 'run' | 'lifting'

  const { colors, resolved } = useTheme();
  const { t, language, isRTL } = useTranslation();
  const isDark = resolved === 'dark';

  const [weight, setWeight] = useState(70);
  const [intensity, setIntensity] = useState(1); // 0 low, 1 medium, 2 high
  const [duration, setDuration] = useState('30');
  const [customDuration, setCustomDuration] = useState('');
  const [selectedId, setSelectedId] = useState<string>(
    type === 'run' ? RUN_ACTIVITIES[0].id : LIFT_EXERCISES[0].id
  );
  const [computing, setComputing] = useState(false);

  const items = type === 'run' ? RUN_ACTIVITIES : LIFT_EXERCISES;
  const selected = items.find((i) => i.id === selectedId) || items[0];
  const titleKey = type === 'run' ? 'workout.title_run' : 'workout.title_lifting';
  const subtitleKey = type === 'run' ? 'workout.subtitle_run' : 'workout.subtitle_lifting';
  const typeLabelKey = type === 'run' ? 'workout.activity_type' : 'workout.exercise_type';

  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (user && email) {
      explain('on recupere le poids du user pour un calcul MET precis');
      getUserFromFirestore(email, user.id).then((profile) => {
        if (profile?.weight) {
          setWeight(profile.weight);
          colorLog('CYAN', '[WorkoutDetails] poids user recupere', { weight: profile.weight });
        }
      });
    }
  }, [user]);

  console.log('\x1b[33m[WorkoutDetails] RENDER\x1b[0m', {
    type,
    selected: selectedId,
    intensity,
    duration: customDuration || duration,
    lang: language,
    theme: resolved,
  });

  const intensityLabels = [
    t('workout.intensity_low'),
    t('workout.intensity_medium'),
    t('workout.intensity_high'),
  ];
  const durationOptions = ['15', '30', '60', '90'];

  // Formule MET : kcal = (MET * 3.5 * weight / 200) * duration_min
  const computeMetCalories = (mets: number[], dur: number) => {
    const met = mets[intensity] || mets[1];
    return Math.round(((met * 3.5 * weight) / 200) * dur);
  };

  // Appel Gemini pour raffiner l'estimation (optionnel — fallback MET si echec)
  const refineWithGemini = async (dur: number): Promise<number | null> => {
    if (!GEMINI_API_KEY) return null;
    try {
      const model = genAI.getGenerativeModel({
        model: process.env.EXPO_PUBLIC_GEMINI_TEXT_MODEL || 'gemini-2.5-flash',
      });
      // Le prompt positionne Gemini comme un "professeur de calcul de calories",
      // incluant la masse musculaire engagee (muscles listes) et les METs de base.
      // Ca donne une estimation plus realiste qu un MET generique.
      const muscleCtx =
        type === 'lifting' && 'muscles' in selected && Array.isArray((selected as any).muscles)
          ? `Muscle groups engaged: ${((selected as any).muscles as string[])
              .map((k) => k.replace('muscle.', ''))
              .join(', ')}`
          : '';
      const prompt = `${languageInstruction(language)}
You are a professional sports calorie calculator with deep expertise in exercise physiology.
Compute a realistic estimate of calories burned for the session below.
Take into account: muscle mass engaged, exercise type, intensity, duration, user body weight,
typical work-to-rest ratios for the modality, and afterburn (EPOC) for strength work.
Return ONLY a JSON number (no text, no markdown, no unit).

Exercise ID: ${selected.id}
Category: ${type === 'run' ? 'cardio (steady state)' : 'resistance training (sets/reps)'}
${muscleCtx}
Base MET (low/medium/high): ${selected.mets.join(' / ')}
Selected intensity: ${intensityLabels[intensity]} (level ${intensity + 1}/3)
Duration: ${dur} minutes
User weight: ${weight} kg

Output a single integer (e.g. 247). No explanation.`;

      explain('Gemini raffine l estimation calories (plus realiste que MET seul)');
      colorLog('GREEN', '[API→Gemini] calorie refine REQUEST', {
        activity: selected.id,
        intensity: intensityLabels[intensity],
        dur,
        weight,
      });
      const t0 = Date.now();
      const result = await model.generateContent(prompt);
      const txt = (await result.response).text().trim();
      colorLog('BLUE', '[API←Gemini] calorie refine RESPONSE', {
        ms: Date.now() - t0,
        text: txt.slice(0, 100),
      });
      const n = parseFloat(txt.replace(/[^\d.]/g, ''));
      if (isFinite(n) && n > 0 && n < 5000) return Math.round(n);
      return null;
    } catch (e) {
      colorLog('RED', '[API←Gemini] calorie refine FAILED', { error: (e as Error).message });
      return null;
    }
  };

  const handleContinue = async () => {
    const finalDuration = parseInt(customDuration || duration);
    if (!finalDuration) return;

    setComputing(true);
    const metCals = computeMetCalories(selected.mets, finalDuration);
    colorLog('YELLOW', '[WorkoutDetails] calories MET initial', {
      met: selected.mets[intensity],
      dur: finalDuration,
      weight,
      kcal: metCals,
    });

    // On tente Gemini en parallele — si ca marche, moyenne MET + Gemini
    const geminiCals = await refineWithGemini(finalDuration);
    const finalCals = geminiCals ? Math.round((metCals + geminiCals) / 2) : metCals;
    colorLog('CYAN', '[WorkoutDetails] calories finales', {
      met: metCals,
      gemini: geminiCals,
      final: finalCals,
    });

    setComputing(false);

    const activityName = t(selected.labelKey as any);
    router.push({
      pathname: '/workout-result' as any,
      params: {
        calories: finalCals,
        name: `${activityName} (${intensityLabels[intensity]})`,
        duration: finalDuration,
        type,
        activityId: selected.id,
        image: selected.image,
        intensity: intensityLabels[intensity],
      },
    });
  };

  // Theme palette
  const bg = isDark ? '#0B0F14' : Colors.light.white;
  const textPrimary = isDark ? colors.gray[900] : Colors.light.gray[900];
  const textMuted = isDark ? colors.gray[400] : Colors.light.gray[400];
  const cardBg = isDark ? '#161C23' : Colors.light.gray[50];
  const cardBorder = isDark ? colors.gray[200] : Colors.light.gray[100];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: bg }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenTopBar showBrand showNotif={false} />

        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backBtn, { backgroundColor: cardBg }]}
            onPress={() => router.back()}
          >
            <ArrowLeft
              size={24}
              color={textPrimary}
              strokeWidth={2.5}
              style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text
            style={[styles.title, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
          >
            {t(titleKey as any)}
          </Text>
          <Text style={[styles.subtitle, { color: textMuted, textAlign: isRTL ? 'right' : 'left' }]}>
            {t(subtitleKey as any)}
          </Text>

          {/* Liste des exercices EN PREMIER — directement apres le titre musculation.
              Chaque carte = image + label. Cliquer change l exercice selectionne, ce qui
              met a jour le titre, l image hero, les muscles, la description et le bouton video. */}
          <Text style={[styles.sectionLabel, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
            {t(typeLabelKey as any)}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
          >
            {items.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.activityCard,
                    { backgroundColor: cardBg, borderColor: cardBorder },
                    isSelected && {
                      borderColor: Colors.light.primary,
                      backgroundColor: isDark ? '#1F2833' : Colors.light.white,
                    },
                  ]}
                  onPress={() => {
                    setSelectedId(item.id);
                    colorLog('CYAN', '[WorkoutDetails] exercise chip tapped', {
                      id: item.id,
                      hasVideo: !!getLocalVideo(item.id),
                    });
                  }}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: item.image }}
                    style={styles.activityImg}
                    resizeMode="cover"
                    onError={(e) =>
                      console.log(
                        '\x1b[31m[WorkoutDetails] chip Image ERROR:\x1b[0m',
                        item.id,
                        e.nativeEvent?.error
                      )
                    }
                  />
                  <Text
                    style={[
                      styles.activityLabel,
                      { color: textPrimary },
                      isSelected && { color: Colors.light.primary },
                    ]}
                    numberOfLines={1}
                  >
                    {t(item.labelKey as any)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Titre de l exercice actuellement selectionne (grand, lisible). */}
          <Text
            style={[
              styles.exerciseTitle,
              { color: textPrimary, textAlign: isRTL ? 'right' : 'left' },
            ]}
          >
            {t(selected.labelKey as any)}
          </Text>

          {/* Hero media : si une video locale existe pour cet exercice on l affiche
              directement en card inline (auto-play, loop, muted, controls natifs).
              Sinon on retombe sur l image statique. Plus de bouton/modal separe. */}
          <View style={[styles.heroImgWrap, { backgroundColor: cardBg }]}>
            {type === 'lifting' && getLocalVideo(selected.id) ? (
              <Video
                key={selected.id}
                source={getLocalVideo(selected.id)}
                style={styles.heroImg}
                resizeMode={ResizeMode.COVER}
                shouldPlay
                isLooping
                isMuted
                useNativeControls
                onError={(e) =>
                  colorLog('RED', '[WorkoutDetails] hero Video ERROR', {
                    exercise: selected.id,
                    error: String(e),
                  })
                }
                onLoad={() =>
                  colorLog('GREEN', '[WorkoutDetails] hero Video LOADED', {
                    exercise: selected.id,
                  })
                }
              />
            ) : (
              <Image
                source={{ uri: selected.image }}
                style={styles.heroImg}
                resizeMode="cover"
                onError={(e) =>
                  console.log(
                    '\x1b[31m[WorkoutDetails] hero Image ERROR:\x1b[0m',
                    e.nativeEvent?.error,
                    'url:',
                    selected.image
                  )
                }
                onLoad={() => console.log('\x1b[32m[WorkoutDetails] hero Image LOADED\x1b[0m')}
              />
            )}
          </View>

          {/* Muscles travailles + howto (musculation uniquement) */}
          {type === 'lifting' && 'muscles' in selected && (
            <View style={[styles.infoCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <Text
                style={[
                  styles.infoTitle,
                  { color: textPrimary, textAlign: isRTL ? 'right' : 'left' },
                ]}
              >
                {t('workout.muscles_worked')}
              </Text>
              <View style={[styles.muscleBadges, isRTL && { flexDirection: 'row-reverse' }]}>
                {((selected as any).muscles as string[]).map((mKey) => (
                  <View
                    key={mKey}
                    style={[
                      styles.muscleBadge,
                      { backgroundColor: isDark ? '#22303C' : '#FFEEED', borderColor: Colors.light.primary },
                    ]}
                  >
                    <Text style={[styles.muscleBadgeText, { color: Colors.light.primary }]}>
                      {t(mKey as any)}
                    </Text>
                  </View>
                ))}
              </View>
              <Text
                style={[
                  styles.infoTitle,
                  { color: textPrimary, marginTop: 14, textAlign: isRTL ? 'right' : 'left' },
                ]}
              >
                {t('workout.how_to')}
              </Text>
              <Text
                style={[
                  styles.howToText,
                  { color: textMuted, textAlign: isRTL ? 'right' : 'left' },
                ]}
              >
                {t(`lift.howto.${selected.id}` as any)}
              </Text>
            </View>
          )}

          {/* Intensity */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}>
              {t('workout.intensity')}
            </Text>
            <View style={[styles.sliderCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              <View style={styles.sliderTrack}>
                <View style={[styles.sliderFill, { width: `${(intensity / 2) * 100}%` }]} />
                <View style={styles.sliderPoints}>
                  {[0, 1, 2].map((point) => (
                    <TouchableOpacity
                      key={point}
                      onPress={() => setIntensity(point)}
                      style={[styles.sliderNode, intensity === point && styles.activeNode]}
                    />
                  ))}
                </View>
              </View>
              <View style={styles.sliderLabels}>
                {intensityLabels.map((label, idx) => (
                  <Text
                    key={label}
                    style={[
                      styles.label,
                      { color: textMuted },
                      intensity === idx && { color: Colors.light.primary, fontWeight: '800' },
                    ]}
                  >
                    {label}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {/* Duration */}
          <View style={styles.section}>
            <View style={[styles.row, isRTL && { flexDirection: 'row-reverse' }]}>
              <Clock size={18} color={textPrimary} />
              <Text style={[styles.sectionLabel, { color: textPrimary, marginBottom: 0 }]}>
                {t('workout.duration')}
              </Text>
            </View>

            <View style={styles.chipGrid}>
              {durationOptions.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.chip,
                    { backgroundColor: cardBg, borderColor: 'transparent' },
                    duration === opt && !customDuration && {
                      backgroundColor: '#FFEEED',
                      borderColor: Colors.light.primary,
                    },
                  ]}
                  onPress={() => {
                    setDuration(opt);
                    setCustomDuration('');
                  }}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: textMuted },
                      duration === opt && !customDuration && { color: Colors.light.primary },
                    ]}
                  >
                    {opt} min
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.inputWrapper, { backgroundColor: cardBg }]}>
              <TextInput
                style={[styles.input, { color: textPrimary, textAlign: isRTL ? 'right' : 'left' }]}
                placeholder={t('workout.manual_duration')}
                placeholderTextColor={textMuted}
                keyboardType="numeric"
                value={customDuration}
                onChangeText={(val) => {
                  setCustomDuration(val);
                  setDuration('');
                }}
              />
              <Text style={[styles.inputUnit, { color: textMuted }]}>min</Text>
            </View>
          </View>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: bg, borderTopColor: cardBorder }]}>
          <TouchableOpacity
            style={[styles.continueBtn, computing && styles.disabledBtn]}
            onPress={handleContinue}
            disabled={computing}
          >
            {computing ? (
              <>
                <ActivityIndicator color={Colors.light.white} />
                <Text style={[styles.continueText, { marginLeft: 8 }]}>
                  {t('workout.calculating')}
                </Text>
              </>
            ) : (
              <Text style={styles.continueText}>{t('workout.continue')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 4, marginBottom: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, paddingBottom: 130 },
  title: { fontSize: 32, fontWeight: '900', letterSpacing: -1, marginBottom: 4 },
  subtitle: { fontSize: 15, fontWeight: '500', marginTop: 2, marginBottom: 20 },
  exerciseTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 6,
    marginBottom: 12,
  },
  heroImgWrap: {
    width: '100%',
    height: 180,
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 24,
  },
  heroImg: { width: '100%', height: '100%' },
  videoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1.5,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 20,
    marginTop: -10,
  },
  videoBtnText: { fontSize: 15, fontWeight: '800' },
  infoCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  infoTitle: { fontSize: 14, fontWeight: '800', marginBottom: 10 },
  muscleBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muscleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  muscleBadgeText: { fontSize: 12, fontWeight: '800' },
  howToText: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  videoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  section: { marginBottom: 26 },
  sectionLabel: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  chipsRow: { gap: 10, paddingRight: 12, paddingBottom: 20 },
  activityCard: {
    width: 120,
    borderRadius: 18,
    padding: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 8,
  },
  activityImg: { width: '100%', height: 80, borderRadius: 12 },
  activityLabel: { fontSize: 13, fontWeight: '700' },
  sliderCard: { borderRadius: 24, padding: 20, paddingTop: 24, borderWidth: 1 },
  sliderTrack: {
    height: 6,
    backgroundColor: Colors.light.gray[200],
    borderRadius: 3,
    position: 'relative',
    justifyContent: 'center',
  },
  sliderFill: {
    height: 6,
    backgroundColor: Colors.light.primary,
    borderRadius: 3,
    position: 'absolute',
    left: 0,
  },
  sliderPoints: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'absolute',
    left: -10,
    right: -10,
  },
  sliderNode: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.light.white,
    borderWidth: 3,
    borderColor: Colors.light.gray[200],
  },
  activeNode: {
    borderColor: Colors.light.primary,
    backgroundColor: Colors.light.white,
    transform: [{ scale: 1.2 }],
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  label: { fontSize: 13, fontWeight: '600' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  chipText: { fontSize: 14, fontWeight: '700' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 52,
  },
  input: { flex: 1, fontSize: 15, fontWeight: '600' },
  inputUnit: { fontSize: 14, fontWeight: '700' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
  },
  continueBtn: {
    backgroundColor: Colors.light.primary,
    height: 56,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: Colors.light.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledBtn: { opacity: 0.7 },
  continueText: { fontSize: 17, fontWeight: '800', color: Colors.light.white },
});

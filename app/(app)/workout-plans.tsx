import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowLeft, ChevronDown, Dumbbell, Clock, BarChart3, Flame, CheckCircle2 } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import ScreenTopBar from '../../components/ScreenTopBar';
import PhotoStrip from '../../components/PhotoStrip';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { addNutritionLog, emailToDocId } from '../../lib/firebase';
import { useScreenGate } from '../../components/FeatureGate';

type Plan = {
  emoji: string; color: string; title: string; level: string; duration: string; focus: string; met: number;
  exercises: { name: string; detail: string }[];
};

const TXT: Record<string, { title: string; sub: string; cta: string; exercises: string; done: string; doneTitle: string; doneMsg: string }> = {
  en: { title: 'Workout plans', sub: 'Ready-made programs — pick one and start training.', cta: 'Log a workout', exercises: 'Exercises', done: 'I did this workout', doneTitle: 'Workout logged 💪', doneMsg: 'kcal added to your activity for today.' },
  fr: { title: 'Plans sportifs', sub: 'Des programmes prêts à l\'emploi — choisis et commence à t\'entraîner.', cta: 'Enregistrer une séance', exercises: 'Exercices', done: 'J\'ai effectué ce plan', doneTitle: 'Séance enregistrée 💪', doneMsg: 'kcal ajoutées à ton activité du jour.' },
  ar: { title: 'برامج رياضية', sub: 'برامج جاهزة — اختر وابدأ التمرين.', cta: 'تسجيل تمرين', exercises: 'التمارين', done: 'أنجزت هذا البرنامج', doneTitle: 'تم تسجيل التمرين 💪', doneMsg: 'سعرة أُضيفت إلى نشاط اليوم.' },
};

const PLANS: Record<string, Plan[]> = {
  en: [
    { emoji: '💪', color: '#298f50', title: 'Full Body', level: 'Beginner', duration: '40 min', focus: 'Whole body', met: 5, exercises: [
      { name: 'Squat', detail: '3 × 10' }, { name: 'Bench Press', detail: '3 × 10' }, { name: 'Dumbbell Row', detail: '3 × 12' }, { name: 'Shoulder Press', detail: '3 × 10' }, { name: 'Plank', detail: '3 × 30s' } ] },
    { emoji: '🏋️', color: '#2563eb', title: 'Push / Pull / Legs', level: 'Intermediate', duration: '55 min', focus: 'Strength split', met: 5.5, exercises: [
      { name: 'Bench Press', detail: '4 × 8' }, { name: 'Lat Pulldown', detail: '4 × 10' }, { name: 'Deadlift', detail: '3 × 6' }, { name: 'Lunges', detail: '3 × 12' }, { name: 'Lateral Raise', detail: '3 × 15' } ] },
    { emoji: '🔥', color: '#f59e0b', title: 'HIIT Cardio', level: 'All levels', duration: '25 min', focus: 'Fat burn', met: 9, exercises: [
      { name: 'Running', detail: '5 min' }, { name: 'Cycling', detail: '8 min' }, { name: 'HIIT intervals', detail: '6 × 1 min' }, { name: 'Walking (cooldown)', detail: '5 min' } ] },
    { emoji: '⚡', color: '#7c3aed', title: 'Muscle Gain', level: 'Advanced', duration: '60 min', focus: 'Hypertrophy', met: 6, exercises: [
      { name: 'Deadlift', detail: '4 × 6' }, { name: 'Squat', detail: '4 × 8' }, { name: 'Bench Press', detail: '4 × 8' }, { name: 'Pull-up', detail: '4 × max' }, { name: 'Barbell Row', detail: '4 × 10' } ] },
    { emoji: '🧘', color: '#0ea5e9', title: 'Core & Abs', level: 'All levels', duration: '20 min', focus: 'Core', met: 4.5, exercises: [
      { name: 'Plank', detail: '3 × 45s' }, { name: 'Crunches', detail: '3 × 20' }, { name: 'Russian Twist', detail: '3 × 30' }, { name: 'Hanging Knee Raise', detail: '3 × 12' } ] },
    { emoji: '🤸', color: '#db2777', title: 'Mobility & Stretch', level: 'Recovery', duration: '15 min', focus: 'Flexibility', met: 2.8, exercises: [
      { name: 'Dynamic warm-up', detail: '5 min' }, { name: 'Hip openers', detail: '4 min' }, { name: 'Hamstring stretch', detail: '3 min' }, { name: 'Shoulder mobility', detail: '3 min' } ] },
  ],
  fr: [
    { emoji: '💪', color: '#298f50', title: 'Full Body', level: 'Débutant', duration: '40 min', focus: 'Corps entier', met: 5, exercises: [
      { name: 'Squat', detail: '3 × 10' }, { name: 'Développé couché', detail: '3 × 10' }, { name: 'Rowing haltère', detail: '3 × 12' }, { name: 'Développé épaules', detail: '3 × 10' }, { name: 'Gainage', detail: '3 × 30s' } ] },
    { emoji: '🏋️', color: '#2563eb', title: 'Push / Pull / Legs', level: 'Intermédiaire', duration: '55 min', focus: 'Split force', met: 5.5, exercises: [
      { name: 'Développé couché', detail: '4 × 8' }, { name: 'Tirage vertical', detail: '4 × 10' }, { name: 'Soulevé de terre', detail: '3 × 6' }, { name: 'Fentes', detail: '3 × 12' }, { name: 'Élévations latérales', detail: '3 × 15' } ] },
    { emoji: '🔥', color: '#f59e0b', title: 'HIIT Cardio', level: 'Tous niveaux', duration: '25 min', focus: 'Brûle-graisse', met: 9, exercises: [
      { name: 'Course', detail: '5 min' }, { name: 'Vélo', detail: '8 min' }, { name: 'Intervalles HIIT', detail: '6 × 1 min' }, { name: 'Marche (retour au calme)', detail: '5 min' } ] },
    { emoji: '⚡', color: '#7c3aed', title: 'Prise de muscle', level: 'Avancé', duration: '60 min', focus: 'Hypertrophie', met: 6, exercises: [
      { name: 'Soulevé de terre', detail: '4 × 6' }, { name: 'Squat', detail: '4 × 8' }, { name: 'Développé couché', detail: '4 × 8' }, { name: 'Tractions', detail: '4 × max' }, { name: 'Rowing barre', detail: '4 × 10' } ] },
    { emoji: '🧘', color: '#0ea5e9', title: 'Abdos & Gainage', level: 'Tous niveaux', duration: '20 min', focus: 'Ceinture abdo', met: 4.5, exercises: [
      { name: 'Gainage', detail: '3 × 45s' }, { name: 'Crunchs', detail: '3 × 20' }, { name: 'Russian Twist', detail: '3 × 30' }, { name: 'Relevé de genoux suspendu', detail: '3 × 12' } ] },
    { emoji: '🤸', color: '#db2777', title: 'Mobilité & Étirements', level: 'Récupération', duration: '15 min', focus: 'Souplesse', met: 2.8, exercises: [
      { name: 'Échauffement dynamique', detail: '5 min' }, { name: 'Ouverture des hanches', detail: '4 min' }, { name: 'Étirement ischios', detail: '3 min' }, { name: 'Mobilité épaules', detail: '3 min' } ] },
  ],
  ar: [
    { emoji: '💪', color: '#298f50', title: 'الجسم كامل', level: 'مبتدئ', duration: '40 د', focus: 'الجسم بالكامل', met: 5, exercises: [
      { name: 'سكوات', detail: '3 × 10' }, { name: 'بنش برس', detail: '3 × 10' }, { name: 'تجديف دمبل', detail: '3 × 12' }, { name: 'ضغط الأكتاف', detail: '3 × 10' }, { name: 'بلانك', detail: '3 × 30ث' } ] },
    { emoji: '🏋️', color: '#2563eb', title: 'دفع / سحب / أرجل', level: 'متوسط', duration: '55 د', focus: 'تقسيم القوة', met: 5.5, exercises: [
      { name: 'بنش برس', detail: '4 × 8' }, { name: 'سحب علوي', detail: '4 × 10' }, { name: 'رفعة ميتة', detail: '3 × 6' }, { name: 'لانجز', detail: '3 × 12' }, { name: 'رفرفة جانبية', detail: '3 × 15' } ] },
    { emoji: '🔥', color: '#f59e0b', title: 'كارديو HIIT', level: 'كل المستويات', duration: '25 د', focus: 'حرق الدهون', met: 9, exercises: [
      { name: 'جري', detail: '5 د' }, { name: 'دراجة', detail: '8 د' }, { name: 'فترات HIIT', detail: '6 × دقيقة' }, { name: 'مشي (تهدئة)', detail: '5 د' } ] },
    { emoji: '⚡', color: '#7c3aed', title: 'بناء العضلات', level: 'متقدم', duration: '60 د', focus: 'تضخيم', met: 6, exercises: [
      { name: 'رفعة ميتة', detail: '4 × 6' }, { name: 'سكوات', detail: '4 × 8' }, { name: 'بنش برس', detail: '4 × 8' }, { name: 'عقلة', detail: '4 × أقصى' }, { name: 'تجديف بار', detail: '4 × 10' } ] },
    { emoji: '🧘', color: '#0ea5e9', title: 'البطن والثبات', level: 'كل المستويات', duration: '20 د', focus: 'عضلات الcore', met: 4.5, exercises: [
      { name: 'بلانك', detail: '3 × 45ث' }, { name: 'كرنش', detail: '3 × 20' }, { name: 'التواء روسي', detail: '3 × 30' }, { name: 'رفع الركبتين معلقًا', detail: '3 × 12' } ] },
    { emoji: '🤸', color: '#db2777', title: 'مرونة وإطالة', level: 'استشفاء', duration: '15 د', focus: 'المرونة', met: 2.8, exercises: [
      { name: 'إحماء ديناميكي', detail: '5 د' }, { name: 'فتح الورك', detail: '4 د' }, { name: 'إطالة أوتار الركبة', detail: '3 د' }, { name: 'مرونة الكتف', detail: '3 د' } ] },
  ],
};

// Explication courte de CHAQUE mouvement (clé = nom localisé de l'exercice).
const EX_HOW: Record<string, Record<string, string>> = {
  fr: {
    'Squat': 'Pieds largeur d’épaules, descends les hanches dos droit (genoux dans l’axe des pieds), puis remonte.',
    'Développé couché': 'Allongé sur le banc, descends la barre vers la poitrine puis pousse jusqu’à extension des bras.',
    'Rowing haltère': 'Buste penché dos plat, tire l’haltère vers la hanche en serrant l’omoplate.',
    'Développé épaules': 'Pousse les haltères au-dessus de la tête sans cambrer le bas du dos.',
    'Gainage': 'Avant-bras au sol, corps droit et gainé — ne creuse pas le dos, tiens la position.',
    'Tirage vertical': 'Tire la barre vers le haut de la poitrine en abaissant les omoplates.',
    'Soulevé de terre': 'Dos plat, pousse dans les jambes pour soulever la barre le long des tibias.',
    'Fentes': 'Grand pas en avant, plie les deux genoux à 90°, reviens et alterne les jambes.',
    'Élévations latérales': 'Lève les haltères sur les côtés jusqu’à l’horizontale, coudes légèrement fléchis.',
    'Course': 'Allure régulière, respiration contrôlée, foulée souple.',
    'Vélo': 'Pédale à intensité modérée à soutenue, dos droit.',
    'Intervalles HIIT': 'Alterne effort intense (~40 s) et récupération (~20 s).',
    'Marche (retour au calme)': 'Marche lente pour faire redescendre le rythme cardiaque.',
    'Tractions': 'Suspendu, tire-toi jusqu’au menton au-dessus de la barre, descends en contrôlant.',
    'Rowing barre': 'Buste penché, tire la barre vers le nombril en serrant le dos.',
    'Crunchs': 'Décolle les épaules en contractant les abdos, sans tirer sur la nuque.',
    'Russian Twist': 'Assis buste incliné, fais pivoter le tronc de gauche à droite (ballotté contrôlé).',
    'Relevé de genoux suspendu': 'Suspendu à la barre, remonte les genoux vers la poitrine en contrôlant.',
    'Échauffement dynamique': 'Mouvements amples (cercles de bras, montées de genoux) pour préparer le corps.',
    'Ouverture des hanches': 'Étirements actifs des hanches (fente, papillon), en douceur.',
    'Étirement ischios': 'Jambe tendue, penche-toi vers l’avant sans arrondir le dos.',
    'Mobilité épaules': 'Rotations et passages de bras pour mobiliser les épaules.',
  },
  en: {
    'Squat': 'Feet shoulder-width, lower hips with a straight back (knees over toes), then stand up.',
    'Bench Press': 'Lying on the bench, lower the bar to your chest, then push until arms extend.',
    'Dumbbell Row': 'Hinge forward with a flat back, pull the dumbbell to your hip, squeezing the shoulder blade.',
    'Shoulder Press': 'Press the dumbbells overhead without arching your lower back.',
    'Plank': 'Forearms on the floor, body straight and braced — don’t sag, hold the position.',
    'Lat Pulldown': 'Pull the bar to your upper chest while drawing your shoulder blades down.',
    'Deadlift': 'Flat back, drive through your legs to lift the bar along your shins.',
    'Lunges': 'Big step forward, bend both knees to 90°, return and alternate legs.',
    'Lateral Raise': 'Raise the dumbbells to the sides up to shoulder height, elbows slightly bent.',
    'Running': 'Steady pace, controlled breathing, relaxed stride.',
    'Cycling': 'Pedal at moderate-to-hard intensity, back straight.',
    'HIIT intervals': 'Alternate hard effort (~40 s) and recovery (~20 s).',
    'Walking (cooldown)': 'Slow walk to bring your heart rate back down.',
    'Pull-up': 'Hang, pull yourself until your chin is over the bar, lower under control.',
    'Barbell Row': 'Hinge forward, pull the bar to your navel, squeezing your back.',
    'Crunches': 'Lift your shoulders by contracting your abs, without pulling your neck.',
    'Russian Twist': 'Seated, lean back, rotate your torso side to side under control.',
    'Hanging Knee Raise': 'Hanging from the bar, raise your knees toward your chest, controlled.',
    'Dynamic warm-up': 'Large movements (arm circles, knee lifts) to prep the body.',
    'Hip openers': 'Active hip stretches (lunge, butterfly), gently.',
    'Hamstring stretch': 'Leg straight, hinge forward without rounding your back.',
    'Shoulder mobility': 'Rotations and arm pass-throughs to mobilize the shoulders.',
  },
  ar: {
    'سكوات': 'القدمان بعرض الكتفين، انزل بالوركين والظهر مستقيم ثم انهض.',
    'بنش برس': 'مستلقٍ على المقعد، انزل البار نحو الصدر ثم ادفع حتى تمدّ الذراعين.',
    'تجديف دمبل': 'انحنِ للأمام بظهر مستقيم واسحب الدمبل نحو الورك مع ضغط لوح الكتف.',
    'ضغط الأكتاف': 'ادفع الدمبل فوق الرأس دون تقويس أسفل الظهر.',
    'بلانك': 'الساعدان على الأرض والجسم مستقيم ومشدود — لا تُرخِ الظهر، اثبت.',
    'سحب علوي': 'اسحب البار نحو أعلى الصدر مع خفض لوحي الكتف.',
    'رفعة ميتة': 'ظهر مستقيم، ادفع بالساقين لرفع البار بمحاذاة الساقين.',
    'لانجز': 'خطوة كبيرة للأمام، اثنِ الركبتين 90°، عُد وبدّل.',
    'رفرفة جانبية': 'ارفع الدمبل للجانبين حتى مستوى الكتف، الكوعان مثنيان قليلاً.',
    'جري': 'إيقاع ثابت وتنفّس منتظم وخطوة مرنة.',
    'دراجة': 'دوّس بشدة متوسطة إلى عالية والظهر مستقيم.',
    'فترات HIIT': 'تبديل بين مجهود قوي (~40ث) واستراحة (~20ث).',
    'مشي (تهدئة)': 'مشي بطيء لخفض نبض القلب تدريجياً.',
    'عقلة': 'تعلّق واسحب نفسك حتى يتجاوز ذقنك البار، وانزل بتحكم.',
    'تجديف بار': 'انحنِ للأمام واسحب البار نحو السرّة مع ضغط الظهر.',
    'كرنش': 'ارفع كتفيك بشدّ البطن دون شدّ الرقبة.',
    'التواء روسي': 'اجلس ومِل للخلف ودوّر الجذع يميناً ويساراً بتحكم.',
    'رفع الركبتين معلقًا': 'تعلّق بالبار وارفع ركبتيك نحو الصدر بتحكم.',
    'إحماء ديناميكي': 'حركات واسعة (دوائر ذراع، رفع ركب) لتجهيز الجسم.',
    'فتح الورك': 'إطالات نشطة للورك (لانج، فراشة) بلطف.',
    'إطالة أوتار الركبة': 'الساق ممدودة، مِل للأمام دون تقويس الظهر.',
    'مرونة الكتف': 'تدوير وتمرير الذراعين لتحريك مفاصل الكتف.',
  },
};

export default function WorkoutPlansScreen() {
  const __gate = useScreenGate('workout-plans');
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const t = TXT[language] || TXT.en;
  const plans = PLANS[language] || PLANS.en;
  const [open, setOpen] = useState<number | null>(0);
  const { user } = useUser();
  const [weight, setWeight] = useState(70);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const email = user?.primaryEmailAddress?.emailAddress || '';
      if (!email) return;
      try { const raw = await AsyncStorage.getItem(`profile_${emailToDocId(email)}`); const p = raw ? JSON.parse(raw) : null; if (p?.weight) setWeight(Number(p.weight) || 70); } catch {}
    })();
  }, [user]);

  // "I did this plan" → estimate calories (MET formula) → log directly as an
  // activity (recent activity + calories + Firestore). No detour to a form.
  const doPlan = async (p: Plan, idx: number) => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    if (!email) return;
    const min = parseInt(String(p.duration).replace(/[^0-9]/g, '')) || 30;
    const kcal = Math.max(1, Math.round(((p.met * 3.5 * weight) / 200) * min));
    setBusy(idx);
    try {
      const d = new Date();
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await addNutritionLog({ userId: email, type: 'activity', name: `${p.emoji} ${p.title}`, calories: kcal, protein: 0, carbs: 0, fat: 0, date, duration: min, intensity: 'medium' } as any);
      // Go straight to Home so the new entry shows in "Activité récente" + calories update.
      Alert.alert(t.doneTitle, `${kcal} ${t.doneMsg}`, [{ text: 'OK', onPress: () => router.replace('/(tabs)' as any) }]);
    } catch (e) { console.warn('[plans] log failed', e); }
    finally { setBusy(null); }
  };

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#0f1419' : 'transparent';
  const row = (rev = false): any => ({ flexDirection: isRTL ? (rev ? 'row' : 'row-reverse') : (rev ? 'row-reverse' : 'row') });
  const ta: any = { textAlign: isRTL ? 'right' : 'left' };

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenTopBar showBack showBrand={false} showNotif={false} />

        <View style={[styles.titleRow, row()]}>
          <Dumbbell size={26} color={isDark ? Colors.dark.primary : Colors.light.primary} />
          <Text style={[styles.title, { color: text }, ta]}>{t.title}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub }, ta]}>{t.sub}</Text>
        <PhotoStrip category="sport" />

        {plans.map((p, i) => {
          const isOpen = open === i;
          return (
            <View key={i} style={[styles.planCard, { backgroundColor: card, borderColor: isOpen ? p.color : 'transparent' }]}>
              <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(isOpen ? null : i)} style={[styles.planHead, row()]}>
                <View style={[styles.emojiWrap, { backgroundColor: p.color + '1A' }]}><Text style={styles.emoji}>{p.emoji}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.planTitle, { color: text }, ta]}>{p.title}</Text>
                  <View style={[styles.metaRow, row()]}>
                    <View style={[styles.metaItem, row()]}><BarChart3 size={13} color={sub} /><Text style={[styles.metaTxt, { color: sub }]}>{p.level}</Text></View>
                    <View style={[styles.metaItem, row()]}><Clock size={13} color={sub} /><Text style={[styles.metaTxt, { color: sub }]}>{p.duration}</Text></View>
                    <View style={[styles.metaItem, row()]}><Flame size={13} color={sub} /><Text style={[styles.metaTxt, { color: sub }]}>{p.focus}</Text></View>
                  </View>
                </View>
                <ChevronDown size={22} color={sub} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.exList}>
                  <Text style={[styles.exHeader, { color: sub }, ta]}>{t.exercises}</Text>
                  {p.exercises.map((ex, j) => {
                    const how = (EX_HOW[language] || EX_HOW.en)[ex.name];
                    return (
                      <View key={j} style={[styles.exItem, { borderTopColor: isDark ? '#1e293b' : '#f1f5f9' }]}>
                        <View style={[styles.exRow, row()]}>
                          <View style={[styles.exDot, { backgroundColor: p.color }]} />
                          <Text style={[styles.exName, { color: text }, ta]}>{ex.name}</Text>
                          <Text style={[styles.exDetail, { color: p.color }]}>{ex.detail}</Text>
                        </View>
                        {!!how && <Text style={[styles.exHow, { color: sub }, ta]}>{how}</Text>}
                      </View>
                    );
                  })}
                  <TouchableOpacity style={[styles.doneBtn, { backgroundColor: p.color }]} onPress={() => doPlan(p, i)} disabled={busy === i} activeOpacity={0.85}>
                    {busy === i ? <ActivityIndicator color="#fff" /> : (<><CheckCircle2 size={18} color="#fff" /><Text style={styles.doneBtnTxt}>{t.done}</Text></>)}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        <TouchableOpacity
          style={styles.cta}
          onPress={() => { const i = open ?? 0; setOpen(i); doPlan(plans[i], i); }}
          disabled={busy !== null}
        >
          {busy !== null ? <ActivityIndicator color="#fff" /> : (<><Dumbbell size={18} color="#fff" /><Text style={styles.ctaTxt}>{t.cta}</Text></>)}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { alignItems: 'center', marginTop: 4 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? Colors.dark.gray[50] : Colors.light.gray[50] },
  titleRow: { alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 18, lineHeight: 20 },
  planCard: { borderRadius: 22, marginBottom: 14, borderWidth: 2, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  planHead: { alignItems: 'center', gap: 14, padding: 16 },
  emojiWrap: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 26 },
  planTitle: { fontSize: 17, fontWeight: '800' },
  metaRow: { alignItems: 'center', gap: 14, marginTop: 5, flexWrap: 'wrap' },
  metaItem: { alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 12, fontWeight: '600' },
  exList: { paddingHorizontal: 16, paddingBottom: 14 },
  exHeader: { fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  exItem: { borderTopWidth: 1, paddingVertical: 11 },
  exRow: { alignItems: 'center', gap: 10 },
  exHow: { fontSize: 12, lineHeight: 17, marginTop: 5, marginStart: 17 },
  exDot: { width: 7, height: 7, borderRadius: 4 },
  exName: { flex: 1, fontSize: 15, fontWeight: '600' },
  exDetail: { fontSize: 14, fontWeight: '800' },
  doneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 13, borderRadius: 14 },
  doneBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: Colors.light.primary, paddingVertical: 16, borderRadius: 16, marginTop: 10, shadowColor: isDark ? 'transparent' : Colors.light.primary, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  ctaTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

// Rangée « Découvrir » du Home : cartes VISUELLES (vraies photos) qui mènent aux
// univers clés — courses virtuelles (photo Street View live), défi Casablanca
// (photo bundlée), manger sain (photo bundlée). Composant autonome, trilingue + dark.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ImageBackground } from 'react-native';
import { router } from 'expo-router';
import { Compass } from 'lucide-react-native';
import { getActiveRaces } from '../lib/racesApi';
import { streetViewUrl } from '../lib/races';
import { poiPhoto } from '../assets/challenges/registry';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';

const GREEN = '#2E8B57';

const TXT: any = {
  en: { title: 'Discover', races: 'Virtual races', challenge: 'Casablanca challenge', eat: 'Eat healthy', paris: 'Paris Marathon', progress: 'My progress', workout: 'Train now', community: 'Community routes', ramadan: '🌙 Ramadan mode' },
  fr: { title: 'Découvrir', races: 'Courses virtuelles', challenge: 'Défi Casablanca', eat: 'Manger sain', paris: 'Marathon de Paris', progress: 'Ma progression', workout: 'M\'entraîner', community: 'Parcours communautaires', ramadan: '🌙 Mode Ramadan' },
  ar: { title: 'اكتشف', races: 'سباقات افتراضية', challenge: 'تحدي الدار البيضاء', eat: 'كُل صحياً', paris: 'ماراثون باريس', progress: 'تقدمي', workout: 'تمرّن الآن', community: 'مسارات المجتمع', ramadan: '🌙 وضع رمضان' },
};

export default function HomeDiscover() {
  const { resolved } = useTheme();
  const { language } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  // Accent thémé : GREEN est le vert CLAIR ; en sombre on utilise le token
  // dark officiel (contraste correct sur fond sombre).
  const accent = isDark ? '#4ade80' : GREEN;
  const [raceImg, setRaceImg] = useState<string | null>(null);

  // Photo Street View du départ de la 1re course active (image vivante, pilotée par l'admin).
  useEffect(() => {
    getActiveRaces().then((rs: any) => {
      const w0 = Array.isArray(rs) && rs[0]?.waypoints?.[0];
      if (w0) setRaceImg(streetViewUrl(w0.lat, w0.lng, 400, 300));
    }).catch(() => {});
  }, []);

  const CARDS = [
    { label: t.ramadan, img: require('../assets/images/illustrations/plan.jpg'), onPress: () => router.push('/ramadan' as any) },
    { label: t.races, img: raceImg ? { uri: raceImg } : poiPhoto('casa-loop', 1), onPress: () => router.push('/races' as any) },
    { label: t.challenge, img: poiPhoto('casa-loop', 0), onPress: () => router.push('/challenge?id=casa-loop' as any) },
    { label: t.eat, img: require('../assets/images/illustrations/healthy_food.jpg'), onPress: () => router.push('/ai-meal-plan' as any) },
    { label: t.paris, img: poiPhoto('paris-marathon', 0), onPress: () => router.push('/challenge?id=paris-marathon' as any) },
    { label: t.workout, img: require('../assets/images/abstraits/hero-duel.jpg'), onPress: () => router.push('/log-exercise' as any) },
    { label: t.progress, img: require('../assets/images/illustrations/analytics_cover.jpg'), onPress: () => router.push('/progress-photos' as any) },
    { label: t.community, img: poiPhoto('casa-loop', 2), onPress: () => router.push('/community-routes' as any) },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Compass size={16} color={accent} />
        <Text style={[styles.title, { color: isDark ? '#f1f5f9' : '#0F172A' }]}>{t.title}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CARDS.map((c, i) => (
          <TouchableOpacity key={i} activeOpacity={0.9} onPress={c.onPress}>
            <ImageBackground source={c.img as any} style={styles.card} imageStyle={styles.cardImg} resizeMode="cover">
              <View style={styles.shade} />
              <Text style={styles.cardTxt} numberOfLines={2}>{c.label}</Text>
            </ImageBackground>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginVertical: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '700' },
  row: { gap: 12 },
  card: { width: 150, height: 100, justifyContent: 'flex-end', padding: 10 },
  cardImg: { borderRadius: 16 },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.30)', borderRadius: 16 },
  cardTxt: { color: '#fff', fontWeight: '800', fontSize: 13.5, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
});

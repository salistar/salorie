import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, TextInput, ActivityIndicator, Image } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Trophy, UserPlus, Flame } from 'lucide-react-native';
import ScreenTopBar from '../components/ScreenTopBar';
import { Colors } from '../constants/Colors';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { loadEngagement } from '../lib/engagement';
import { publishStats, addFriend, getLeaderboard, LeaderRow } from '../lib/social';

const MEDAL = ['🥇', '🥈', '🥉'];

export default function SocialScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { t, language } = useTranslation() as any;
  const isDark = resolved === 'dark';

  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress || '';

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    try {
      const eng = await loadEngagement(email, language);
      const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.fullName || email.split('@')[0];
      await publishStats(email, { name, imageUrl: user?.imageUrl, streak: eng.streak, daysTracked: eng.daysTracked });
      setRows(await getLeaderboard(email));
    } catch (e) {
      console.warn('[social] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [email, language, user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAdd = async () => {
    if (!input.trim()) return;
    setAdding(true); setMsg(null);
    const r = await addFriend(email, input);
    setAdding(false);
    if (r.ok) {
      setInput(''); setMsg(`${t('social.added')} ✓`);
      load();
    } else {
      setMsg(r.reason === 'self' ? t('social.self') : r.reason === 'notfound' ? t('social.not_found') : t('social.error'));
    }
  };

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#000' : 'transparent';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={22} color={text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}><ScreenTopBar showBrand={false} showNotif={false} /></View>
        </View>

        <View style={styles.titleRow}>
          <Trophy size={26} color={Colors.light.primary} />
          <Text style={[styles.title, { color: text }]}>{t('social.title')}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub }]}>{t('social.subtitle')}</Text>
        <Image source={require('../assets/images/illustrations/weightlifting.jpg')} style={styles.hero} resizeMode="cover" />

        {/* Add friend */}
        <Text style={[styles.section, { color: text }]}>{t('social.add_friend')}</Text>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { backgroundColor: card, color: text }]}
            placeholder={t('social.email_ph')}
            placeholderTextColor={sub}
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            keyboardType="email-address"
            onSubmitEditing={onAdd}
          />
          <TouchableOpacity style={styles.addBtn} onPress={onAdd} disabled={adding}>
            {adding ? <ActivityIndicator size="small" color="#fff" /> : <><UserPlus size={18} color="#fff" /><Text style={styles.addBtnText}>{t('social.add')}</Text></>}
          </TouchableOpacity>
        </View>
        {!!msg && <Text style={[styles.msg, { color: sub }]}>{msg}</Text>}
        <Text style={[styles.code, { color: sub }]}>{t('social.your_code')}{email ? `:  ${email}` : ''}</Text>

        {/* Leaderboard */}
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator size="large" color={Colors.light.primary} /></View>
        ) : rows.length <= 1 ? (
          <View style={[styles.emptyBox, { backgroundColor: card }]}>
            <Trophy size={36} color={Colors.light.gray[300]} />
            <Text style={[styles.emptySub, { color: sub }]}>{t('social.empty')}</Text>
          </View>
        ) : (
          <View style={{ marginTop: 8 }}>
            {rows.map((r, i) => (
              <View key={r.email} style={[styles.row, { backgroundColor: card }, r.isMe && styles.rowMe]}>
                <Text style={styles.rank}>{i < 3 ? MEDAL[i] : `${i + 1}`}</Text>
                {r.imageUrl ? (
                  <Image source={{ uri: r.imageUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh]}><Text style={styles.avatarTxt}>{(r.name || '?').charAt(0).toUpperCase()}</Text></View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, { color: text }]} numberOfLines={1}>{r.isMe ? t('social.you') : r.name}</Text>
                  <Text style={[styles.daysTracked, { color: sub }]}>{r.daysTracked} {t('coach.days_tracked')}</Text>
                </View>
                <View style={styles.streakWrap}>
                  <Flame size={18} color="#f59e0b" />
                  <Text style={[styles.streakNum, { color: text }]}>{r.streak}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.gray[50] },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 14, lineHeight: 20 },
  hero: { width: '100%', height: 130, borderRadius: 18, marginBottom: 18 },
  section: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, height: 50, borderRadius: 14, paddingHorizontal: 16, fontSize: 15, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.light.primary, paddingHorizontal: 18, borderRadius: 14, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  msg: { fontSize: 13, marginTop: 8, fontWeight: '600' },
  code: { fontSize: 12, marginTop: 10, marginBottom: 18, lineHeight: 17 },
  loadingBox: { paddingVertical: 50, alignItems: 'center' },
  emptyBox: { borderRadius: 18, padding: 26, alignItems: 'center', gap: 12 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 12, marginBottom: 10 },
  rowMe: { borderWidth: 2, borderColor: Colors.light.primary },
  rank: { width: 30, textAlign: 'center', fontSize: 18, fontWeight: '900', color: '#64748B' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.light.gray[100] },
  avatarPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.light.primaryLight },
  avatarTxt: { fontSize: 18, fontWeight: '800', color: Colors.light.primary },
  name: { fontSize: 16, fontWeight: '800' },
  daysTracked: { fontSize: 12, marginTop: 2 },
  streakWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakNum: { fontSize: 18, fontWeight: '900' },
});

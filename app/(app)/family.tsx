import React, { useCallback, useState, useMemo } from 'react';
import { a11y } from '../../lib/a11y';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Image,
  Share,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Users, Home, LogIn, Share2, UserPlus, Target } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useFormTheme } from '../../components/FormKit';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import {
  Family,
  FamilyRole,
  FamilyWeekly,
  createFamily,
  joinFamily,
  getMyFamily,
  addMemberLocalProfile,
  familyWeeklyKm,
} from '../../lib/family';

type Lang = 'en' | 'fr' | 'ar';

// Chaînes LOCALES trilingues (convention : pas de clés i18n.tsx pour les NOUVELLES strings).
const S = {
  title: { en: 'My family', fr: 'Ma famille', ar: 'عائلتي' },
  subtitle: {
    en: 'A shared household: gather your loved ones and chase a weekly distance goal together.',
    fr: 'Un foyer partagé : réunis tes proches et visez ensemble un objectif de distance hebdomadaire.',
    ar: 'منزل مشترك: اجمع أحباءك واسعَوا معًا لتحقيق هدف المسافة الأسبوعي.',
  },
  // Empty state — create or join
  noFamily: { en: "You're not in a household yet.", fr: "Tu n'as pas encore de foyer.", ar: 'لست في منزل بعد.' },
  createTitle: { en: 'Create a household', fr: 'Créer un foyer', ar: 'إنشاء منزل' },
  namePh: { en: 'Household name (e.g. The Smiths)', fr: 'Nom du foyer (ex: Les Martin)', ar: 'اسم المنزل (مثال: آل أحمد)' },
  create: { en: 'Create', fr: 'Créer', ar: 'إنشاء' },
  or: { en: 'or', fr: 'ou', ar: 'أو' },
  joinTitle: { en: 'Join with a code', fr: 'Rejoindre avec un code', ar: 'الانضمام برمز' },
  codePh: { en: 'Invitation code or owner email', fr: "Code d'invitation ou e-mail du proprio", ar: 'رمز الدعوة أو بريد المالك' },
  join: { en: 'Join', fr: 'Rejoindre', ar: 'انضمام' },
  // Family view
  members: { en: 'Members', fr: 'Membres', ar: 'الأعضاء' },
  invite: { en: 'Invite', fr: 'Inviter', ar: 'دعوة' },
  inviteCode: { en: 'Invitation code', fr: "Code d'invitation", ar: 'رمز الدعوة' },
  shareMsg: {
    en: (name: string, code: string) => `Join my Salorie household "${name}" with the code: ${code}`,
    fr: (name: string, code: string) => `Rejoins mon foyer Salorie « ${name} » avec le code : ${code}`,
    ar: (name: string, code: string) => `انضم إلى منزلي في Salorie «${name}» بالرمز: ${code}`,
  } as Record<Lang, (name: string, code: string) => string>,
  addMember: { en: 'Add a profile', fr: 'Ajouter un profil', ar: 'إضافة ملف' },
  addMemberPh: { en: 'Name (child, senior…)', fr: 'Nom (enfant, senior…)', ar: 'الاسم (طفل، كبير سن…)' },
  add: { en: 'Add', fr: 'Ajouter', ar: 'إضافة' },
  // Roles
  roles: {
    adulte: { en: 'Adult', fr: 'Adulte', ar: 'بالغ' },
    enfant: { en: 'Child', fr: 'Enfant', ar: 'طفل' },
    senior: { en: 'Senior', fr: 'Senior', ar: 'كبير سن' },
  } as Record<FamilyRole, Record<Lang, string>>,
  // Challenge
  challengeTitle: { en: 'Family challenge', fr: 'Défi familial', ar: 'تحدي العائلة' },
  challengeSub: {
    en: 'Combined running distance this week',
    fr: 'Distance de course cumulée cette semaine',
    ar: 'مسافة الجري المجمعة هذا الأسبوع',
  },
  km: { en: 'km', fr: 'km', ar: 'كم' },
  goal: { en: 'Goal', fr: 'Objectif', ar: 'الهدف' },
  reached: { en: 'Goal reached! 🎉', fr: 'Objectif atteint ! 🎉', ar: 'تم تحقيق الهدف! 🎉' },
  you: { en: 'You', fr: 'Toi', ar: 'أنت' },
  // Feedback
  errCreate: { en: 'Could not create the household. Try again later.', fr: 'Impossible de créer le foyer. Réessaie plus tard.', ar: 'تعذر إنشاء المنزل. حاول لاحقًا.' },
  errNotFound: { en: 'No household found for this code/email.', fr: 'Aucun foyer trouvé pour ce code/e-mail.', ar: 'لا يوجد منزل لهذا الرمز/البريد.' },
  errJoin: { en: 'Could not join. Try again later.', fr: 'Impossible de rejoindre. Réessaie plus tard.', ar: 'تعذر الانضمام. حاول لاحقًا.' },
  joined: { en: 'Joined ✓', fr: 'Rejoint ✓', ar: 'تم الانضمام ✓' },
};

const WEEKLY_GOAL_KM = 25; // objectif de distance partagé par défaut (semaine)

const ROLE_COLOR: Record<FamilyRole, string> = {
  adulte: '#3B82F6',
  enfant: '#F59E0B',
  senior: '#8B5CF6',
};

export default function FamilyScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const lang: Lang = (['en', 'fr', 'ar'].includes(language) ? language : 'en') as Lang;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const th = useFormTheme();

  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [loading, setLoading] = useState(true);
  const [family, setFamily] = useState<Family | null>(null);
  const [weekly, setWeekly] = useState<FamilyWeekly>({ totalKm: 0, rows: [] });

  // Empty-state inputs
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Add-member input
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState<FamilyRole>('enfant');
  const [addingMember, setAddingMember] = useState(false);

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const bg = isDark ? '#0f1419' : 'transparent';

  const refreshWeekly = useCallback(async (fam: Family) => {
    try {
      const w = await familyWeeklyKm(fam, email);
      setWeekly(w);
    } catch (e) {
      console.warn('[family] weekly load failed', e);
    }
  }, [email]);

  const load = useCallback(async () => {
    if (!email) { setLoading(false); return; }
    setLoading(true);
    try {
      const fam = await getMyFamily(email);
      setFamily(fam);
      if (fam) await refreshWeekly(fam);
    } catch (e) {
      console.warn('[family] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [email, refreshWeekly]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onCreate = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      const fam = await createFamily(email, name.trim());
      if (fam) {
        setFamily(fam);
        setName('');
        await refreshWeekly(fam);
      } else {
        setMsg(S.errCreate[lang]);
      }
    } catch {
      setMsg(S.errCreate[lang]);
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    if (busy || !code.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await joinFamily(email, code.trim());
      if (r.ok && r.family) {
        setFamily(r.family);
        setCode('');
        setMsg(S.joined[lang]);
        await refreshWeekly(r.family);
      } else {
        setMsg(r.reason === 'notfound' ? S.errNotFound[lang] : S.errJoin[lang]);
      }
    } catch {
      setMsg(S.errJoin[lang]);
    } finally {
      setBusy(false);
    }
  };

  const onAddMember = async () => {
    if (!family || addingMember || !memberName.trim()) return;
    setAddingMember(true);
    try {
      const next = await addMemberLocalProfile(family, memberName.trim(), memberRole);
      if (next) {
        setFamily(next);
        setMemberName('');
        await refreshWeekly(next);
      }
    } catch (e) {
      console.warn('[family] add member failed', e);
    } finally {
      setAddingMember(false);
    }
  };

  const onShareInvite = async () => {
    if (!family) return;
    try {
      await Share.share({ message: S.shareMsg[lang](family.name, family.code) });
    } catch {}
  };

  const goalReached = weekly.totalKm >= WEEKLY_GOAL_KM;
  const progress = Math.min(1, WEEKLY_GOAL_KM > 0 ? weekly.totalKm / WEEKLY_GOAL_KM : 0);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[styles.backBtn, { backgroundColor: isDark ? 'rgba(40,50,60,0.6)' : Colors.light.gray[50] }]} onPress={() => router.back()}>
            <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}><ScreenTopBar showBrand={false} showNotif={false} /></View>
        </View>

        <View style={[styles.titleRow, { flexDirection: rowDir(isRTL) }]}>
          <Users size={26} color={isDark ? Colors.dark.primary : Colors.light.primary} />
          <Text style={[styles.title, { color: text }]}>{S.title[lang]}</Text>
        </View>
        <Text style={[styles.subtitle, { color: sub, textAlign: txtAlign(isRTL) }]}>{S.subtitle[lang]}</Text>

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator size="large" color={isDark ? Colors.dark.primary : Colors.light.primary} /></View>
        ) : !family ? (
          // ============ EMPTY STATE : créer ou rejoindre ============
          <View>
            <View style={[styles.emptyHint, { backgroundColor: card }]}>
              <Text style={[styles.emptyHintTxt, { color: sub, textAlign: txtAlign(isRTL) }]}>{S.noFamily[lang]}</Text>
            </View>

            {/* Créer */}
            <View style={[styles.cardBlock, { backgroundColor: card }]}>
              <View style={[styles.blockHead, { flexDirection: rowDir(isRTL) }]}>
                <Home size={18} color={isDark ? Colors.dark.primary : Colors.light.primary} />
                <Text style={[styles.blockTitle, { color: text }]}>{S.createTitle[lang]}</Text>
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: bg === 'transparent' ? '#fff' : card, color: text, borderColor: th.border, textAlign: txtAlign(isRTL) }]}
                placeholder={S.namePh[lang]}
                placeholderTextColor={sub}
                value={name}
                onChangeText={setName}
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={onCreate} disabled={busy}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                  <View style={[styles.btnInner, { flexDirection: rowDir(isRTL) }]}>
                    <Home size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{S.create[lang]}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.orTxt, { color: sub }]}>{S.or[lang]}</Text>

            {/* Rejoindre */}
            <View style={[styles.cardBlock, { backgroundColor: card }]}>
              <View style={[styles.blockHead, { flexDirection: rowDir(isRTL) }]}>
                <LogIn size={18} color={isDark ? Colors.dark.primary : Colors.light.primary} />
                <Text style={[styles.blockTitle, { color: text }]}>{S.joinTitle[lang]}</Text>
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: bg === 'transparent' ? '#fff' : card, color: text, borderColor: th.border, textAlign: txtAlign(isRTL) }]}
                placeholder={S.codePh[lang]}
                placeholderTextColor={sub}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                onSubmitEditing={onJoin}
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={onJoin} disabled={busy}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                  <View style={[styles.btnInner, { flexDirection: rowDir(isRTL) }]}>
                    <LogIn size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{S.join[lang]}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {!!msg && <Text style={[styles.msg, { color: sub }]}>{msg}</Text>}
          </View>
        ) : (
          // ============ FAMILY VIEW ============
          <View>
            {/* Nom du foyer + invite */}
            <View style={[styles.familyHeader, { backgroundColor: card, flexDirection: rowDir(isRTL) }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.familyName, { color: text, textAlign: txtAlign(isRTL) }]} numberOfLines={1}>{family.name}</Text>
                <Text style={[styles.familyCode, { color: sub, textAlign: txtAlign(isRTL) }]}>
                  {S.inviteCode[lang]}: <Text style={{ color: isDark ? Colors.dark.primary : Colors.light.primary, fontWeight: '900' }}>{family.code}</Text>
                </Text>
              </View>
              <TouchableOpacity style={[styles.inviteBtn, { flexDirection: rowDir(isRTL) }]} onPress={onShareInvite}>
                <Share2 size={16} color="#fff" />
                <Text style={styles.inviteBtnTxt}>{S.invite[lang]}</Text>
              </TouchableOpacity>
            </View>

            {/* Défi familial — barre cumulée */}
            <View style={[styles.cardBlock, { backgroundColor: card }]}>
              <View style={[styles.blockHead, { flexDirection: rowDir(isRTL) }]}>
                <Target size={18} color={isDark ? Colors.dark.primary : Colors.light.primary} />
                <Text style={[styles.blockTitle, { color: text }]}>{S.challengeTitle[lang]}</Text>
              </View>
              <Text style={[styles.challengeSub, { color: sub, textAlign: txtAlign(isRTL) }]}>{S.challengeSub[lang]}</Text>
              <View style={[styles.kmRow, { flexDirection: rowDir(isRTL) }]}>
                <Text style={[styles.bigKm, { color: text }]}>{weekly.totalKm}</Text>
                <Text style={[styles.bigKmUnit, { color: sub }]}> / {WEEKLY_GOAL_KM} {S.km[lang]}</Text>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: isDark ? '#222' : Colors.light.gray[100] }]}>
                <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: goalReached ? '#22C55E' : Colors.light.primary }]} />
              </View>
              {goalReached && <Text style={[styles.reachedTxt, { textAlign: txtAlign(isRTL) }]}>{S.reached[lang]}</Text>}

              {/* Détail par membre (barre cumulée) */}
              <View style={{ marginTop: 14, gap: 10 }}>
                {weekly.rows.map((r) => {
                  const share = WEEKLY_GOAL_KM > 0 ? Math.min(1, r.km / WEEKLY_GOAL_KM) : 0;
                  return (
                    <View key={r.uid}>
                      <View style={[styles.memberKmTop, { flexDirection: rowDir(isRTL) }]}>
                        <Text style={[styles.memberKmName, { color: text, textAlign: txtAlign(isRTL) }]} numberOfLines={1}>
                          {r.isMe ? S.you[lang] : r.name}
                        </Text>
                        <Text style={[styles.memberKmVal, { color: sub }]}>{r.km} {S.km[lang]}</Text>
                      </View>
                      <View style={[styles.progressTrackSm, { backgroundColor: isDark ? '#222' : Colors.light.gray[100] }]}>
                        <View style={[styles.progressFill, { width: `${share * 100}%`, backgroundColor: ROLE_COLOR[r.role] }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Membres */}
            <View style={[styles.cardBlock, { backgroundColor: card }]}>
              <View style={[styles.blockHead, { flexDirection: rowDir(isRTL) }]}>
                <Users size={18} color={isDark ? Colors.dark.primary : Colors.light.primary} />
                <Text style={[styles.blockTitle, { color: text }]}>{S.members[lang]} ({family.members.length})</Text>
              </View>
              {family.members.map((m) => (
                <View key={m.uid} style={[styles.memberRow, { flexDirection: rowDir(isRTL) }]}>
                  <View style={[styles.memberAvatar, { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight }]}>
                    <Text style={styles.memberAvatarTxt}>{(m.name || '?').charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.memberName, { color: text, textAlign: txtAlign(isRTL) }]} numberOfLines={1}>{m.name}</Text>
                  <View style={[styles.roleBadge, { backgroundColor: ROLE_COLOR[m.role] + '22' }]}>
                    <Text style={[styles.roleBadgeTxt, { color: ROLE_COLOR[m.role] }]}>{S.roles[m.role][lang]}</Text>
                  </View>
                </View>
              ))}

              {/* Ajouter un profil local */}
              <View style={[styles.blockHead, { flexDirection: rowDir(isRTL), marginTop: 16 }]}>
                <UserPlus size={16} color={sub} />
                <Text style={[styles.addTitle, { color: sub }]}>{S.addMember[lang]}</Text>
              </View>
              <TextInput
                style={[styles.input, { backgroundColor: bg === 'transparent' ? '#fff' : card, color: text, borderColor: th.border, textAlign: txtAlign(isRTL) }]}
                placeholder={S.addMemberPh[lang]}
                placeholderTextColor={sub}
                value={memberName}
                onChangeText={setMemberName}
              />
              <View style={[styles.roleChips, { flexDirection: rowDir(isRTL) }]}>
                {(['adulte', 'enfant', 'senior'] as FamilyRole[]).map((rl) => (
                  <TouchableOpacity
                    key={rl}
                    style={[styles.roleChip, { borderColor: th.border }, memberRole === rl && { backgroundColor: ROLE_COLOR[rl] + '22', borderColor: ROLE_COLOR[rl] }]}
                    onPress={() => setMemberRole(rl)}
                  >
                    <Text style={[styles.roleChipTxt, { color: memberRole === rl ? ROLE_COLOR[rl] : sub }]}>{S.roles[rl][lang]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={onAddMember} disabled={addingMember}>
                {addingMember ? <ActivityIndicator size="small" color="#fff" /> : (
                  <View style={[styles.btnInner, { flexDirection: rowDir(isRTL) }]}>
                    <UserPlus size={18} color="#fff" />
                    <Text style={styles.primaryBtnText}>{S.add[lang]}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 80 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 30, fontWeight: '900', letterSpacing: -1 },
  subtitle: { fontSize: 14, marginTop: 8, marginBottom: 18, lineHeight: 20 },
  loadingBox: { paddingVertical: 60, alignItems: 'center' },

  emptyHint: { borderRadius: 16, padding: 16, marginBottom: 14 },
  emptyHintTxt: { fontSize: 14, lineHeight: 20, fontWeight: '600' },

  cardBlock: { borderRadius: 18, padding: 16, marginBottom: 14 },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  blockTitle: { fontSize: 16, fontWeight: '800' },

  input: { height: 50, borderRadius: 14, paddingHorizontal: 16, fontSize: 15, fontWeight: '600', borderWidth: 1.5, marginBottom: 12 },
  primaryBtn: { backgroundColor: Colors.light.primary, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  orTxt: { textAlign: 'center', fontSize: 13, fontWeight: '700', marginVertical: 6, textTransform: 'uppercase', letterSpacing: 1 },
  msg: { fontSize: 13, marginTop: 8, fontWeight: '600', textAlign: 'center' },

  familyHeader: { alignItems: 'center', gap: 12, borderRadius: 18, padding: 16, marginBottom: 14 },
  familyName: { fontSize: 20, fontWeight: '900' },
  familyCode: { fontSize: 13, marginTop: 4, fontWeight: '600' },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.light.primary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  inviteBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  challengeSub: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  kmRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 8 },
  bigKm: { fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  bigKmUnit: { fontSize: 18, fontWeight: '700' },
  progressTrack: { height: 12, borderRadius: 6, overflow: 'hidden' },
  progressTrackSm: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', borderRadius: 6 },
  reachedTxt: { color: '#22C55E', fontWeight: '800', fontSize: 14, marginTop: 10 },
  memberKmTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberKmName: { fontSize: 14, fontWeight: '700', flex: 1, marginRight: 8 },
  memberKmVal: { fontSize: 13, fontWeight: '800' },

  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  memberAvatarTxt: { fontSize: 17, fontWeight: '800', color: isDark ? Colors.dark.primary : Colors.light.primary },
  memberName: { fontSize: 15, fontWeight: '700', flex: 1 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  roleBadgeTxt: { fontSize: 12, fontWeight: '800' },

  addTitle: { fontSize: 14, fontWeight: '800' },
  roleChips: { flexDirection: 'row', gap: 8 },
  roleChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  roleChipTxt: { fontSize: 13, fontWeight: '800' },
});

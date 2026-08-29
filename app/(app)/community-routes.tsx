import ScreenTopBar from '../../components/ScreenTopBar';
import { a11y } from '../../lib/a11y';
import { useTokens, Tokens } from '../../constants/tokens';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, MapPin, Plus, Trash2, Send, Clock, ChevronDown, ChevronRight, Route as RouteIcon, Flag } from 'lucide-react-native';
import PerfList from '../../components/PerfList';
import ModerationSheet from '../../components/ModerationSheet';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign, flipForRTL } from '../../lib/rtl';
import {
  submitRoute, getApprovedRoutes, getMySubmissions,
  CommunityRoute, RouteWaypoint,
} from '../../lib/communityRoutes';
import { emailToDocId } from '../../lib/firebase';


// NOUVELLES chaînes = objet LOCAL trilingue {en,fr,ar}.
const TXT: Record<string, any> = {
  en: {
    title: 'Community routes',
    proposeTitle: 'Propose a route',
    proposeSub: 'Share a route with the community. It will be reviewed before going public.',
    name: 'Route name',
    namePh: 'e.g. Corniche morning loop',
    description: 'Description',
    descriptionPh: 'A short description of the route',
    distance: 'Distance (km)',
    stops: 'Stops',
    stopName: 'Stop name',
    lat: 'Latitude',
    lng: 'Longitude',
    atKm: 'At km',
    addStop: 'Add a stop',
    submit: 'Submit route',
    submitting: 'Submitting...',
    submitted: 'Route submitted — waiting for moderation.',
    needName: 'Please enter a route name.',
    error: 'Something went wrong. Please try again.',
    approvedTitle: 'Approved routes',
    approvedEmpty: 'No community routes published yet. Be the first to propose one!',
    mySubsTitle: 'My submissions',
    statusPending: 'Pending',
    statusApproved: 'Approved',
    statusRejected: 'Rejected',
    km: 'km',
    stopsCount: 'stops',
    report: 'Report this route',
  },
  fr: {
    title: 'Parcours communautaires',
    proposeTitle: 'Proposer un parcours',
    proposeSub: 'Partage un parcours avec la communauté. Il sera vérifié avant publication.',
    name: 'Nom du parcours',
    namePh: 'ex. Boucle matinale de la Corniche',
    description: 'Description',
    descriptionPh: 'Une courte description du parcours',
    distance: 'Distance (km)',
    stops: 'Étapes',
    stopName: "Nom de l'étape",
    lat: 'Latitude',
    lng: 'Longitude',
    atKm: 'Au km',
    addStop: 'Ajouter une étape',
    submit: 'Soumettre le parcours',
    submitting: 'Envoi...',
    submitted: 'Parcours soumis — en attente de modération.',
    needName: 'Merci de saisir un nom de parcours.',
    error: 'Une erreur est survenue. Réessaie.',
    approvedTitle: 'Parcours approuvés',
    approvedEmpty: 'Aucun parcours communautaire publié pour le moment. Sois le premier à en proposer un !',
    mySubsTitle: 'Mes soumissions',
    statusPending: 'En attente',
    statusApproved: 'Approuvé',
    statusRejected: 'Rejeté',
    km: 'km',
    stopsCount: 'étapes',
    report: 'Signaler ce parcours',
  },
  ar: {
    title: 'مسارات المجتمع',
    proposeTitle: 'اقترح مساراً',
    proposeSub: 'شارك مساراً مع المجتمع. ستتم مراجعته قبل نشره.',
    name: 'اسم المسار',
    namePh: 'مثال: جولة الصباح على الكورنيش',
    description: 'الوصف',
    descriptionPh: 'وصف قصير للمسار',
    distance: 'المسافة (كم)',
    stops: 'المحطات',
    stopName: 'اسم المحطة',
    lat: 'خط العرض',
    lng: 'خط الطول',
    atKm: 'عند الكيلومتر',
    addStop: 'إضافة محطة',
    submit: 'إرسال المسار',
    submitting: 'جارٍ الإرسال...',
    submitted: 'تم إرسال المسار — في انتظار المراجعة.',
    needName: 'يرجى إدخال اسم المسار.',
    error: 'حدث خطأ ما. حاول مرة أخرى.',
    approvedTitle: 'المسارات المعتمدة',
    approvedEmpty: 'لا توجد مسارات مجتمعية منشورة بعد. كن أول من يقترح واحداً!',
    mySubsTitle: 'إرسالاتي',
    statusPending: 'قيد المراجعة',
    statusApproved: 'معتمد',
    statusRejected: 'مرفوض',
    km: 'كم',
    stopsCount: 'محطات',
    report: 'الإبلاغ عن هذا المسار',
  },
};

interface DraftStop { name: string; lat: string; lng: string; atKm: string; }
const emptyStop = (): DraftStop => ({ name: '', lat: '', lng: '', atKm: '' });

export default function CommunityRoutesScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || (email ? email.split('@')[0] : '');

  // --- Form state ---
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [distance, setDistance] = useState('');
  const [stops, setStops] = useState<DraftStop[]>([emptyStop()]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // --- Lists ---
  const [approved, setApproved] = useState<CommunityRoute[]>([]);
  const [mine, setMine] = useState<CommunityRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null); // détail inline (pas d'écran séparé dans ce lot)
  // SIGNALEMENT (exigence Play sur le contenu généré par les utilisateurs). `ModerationSheet`
  // existait et `ReportTargetType` prévoyait déjà 'route', mais la feuille n'était montée que
  // dans marketplace et social : les parcours communautaires — le seul UGC vraiment public
  // ici — n'étaient PAS signalables. Constaté à l'audit du 6 août 2026.
  const [modTarget, setModTarget] = useState<CommunityRoute | null>(null);

  const align = txtAlign(isRTL);
  const dir = rowDir(isRTL);

  const text = isDark ? '#fff' : k.text;
  const sub = isDark ? '#9BA1A6' : k.textMuted;
  const card = isDark ? k.surface : '#fff';
  const tok = useTokens();
  const bg = tok.bg;
  const field = k.border;

  const loadLists = useCallback(async () => {
    setLoading(true);
    try {
      const [ap, ms] = await Promise.all([
        getApprovedRoutes(),
        email ? getMySubmissions(email) : Promise.resolve([]),
      ]);
      setApproved(ap);
      setMine(ms);
    } catch (e) {
      console.warn('[community-routes] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { loadLists(); }, [loadLists]);

  const addStop = () => setStops((s) => [...s, emptyStop()]);
  const removeStop = (i: number) => setStops((s) => (s.length <= 1 ? s : s.filter((_, idx) => idx !== i)));
  const updateStop = (i: number, key: keyof DraftStop, val: string) =>
    setStops((s) => s.map((st, idx) => (idx === i ? { ...st, [key]: val } : st)));

  const onSubmit = async () => {
    if (submitting) return;
    setFormErr(null);
    setSubmitted(false);
    if (!name.trim()) { setFormErr(t.needName); return; }
    setSubmitting(true);
    try {
      const waypoints: Partial<RouteWaypoint>[] = stops
        .filter((s) => s.name.trim() && s.lat.trim() && s.lng.trim())
        .map((s) => ({
          name: s.name.trim(),
          lat: parseFloat(s.lat.replace(',', '.')),
          lng: parseFloat(s.lng.replace(',', '.')),
          atKm: parseFloat(s.atKm.replace(',', '.')) || 0,
        }));
      const id = await submitRoute(email, {
        name: name.trim(),
        description: description.trim(),
        totalKm: parseFloat(distance.replace(',', '.')) || 0,
        authorName: displayName,
        waypoints,
      });
      if (id) {
        setSubmitted(true);
        // reset le formulaire
        setName(''); setDescription(''); setDistance(''); setStops([emptyStop()]);
        loadLists(); // rafraîchit "Mes soumissions"
      } else {
        setFormErr(t.error);
      }
    } catch (e) {
      console.warn('[community-routes] submit failed', e);
      setFormErr(t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const statusLabel = (s: CommunityRoute['status']) =>
    s === 'approved' ? t.statusApproved : s === 'rejected' ? t.statusRejected : t.statusPending;
  const statusColor = (s: CommunityRoute['status']) =>
    s === 'approved' ? '#22c55e' : s === 'rejected' ? '#ef4444' : k.warning;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar />
      {/* Header */}
      <View style={[styles.header, { flexDirection: dir }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[styles.backBtn, { backgroundColor: card }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={text} style={flipForRTL(isRTL)} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>{t.title}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* PerfList sur les parcours APPROUVÉS — la seule liste non bornée ici (100 max
          côté Firestore), et chaque carte se déplie avec ses waypoints. Le formulaire de
          proposition et « mes soumissions » (bornée à mes propres parcours) restent en
          ListHeaderComponent : un seul conteneur défilant, pas d'imbrication. */}
      <PerfList
        data={loading ? [] : approved}
        keyExtractor={(r: CommunityRoute, i: number) => r.id ?? `route-${i}`}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
        {/* (a) PROPOSER UN PARCOURS */}
        <View style={[styles.sectionCard, { backgroundColor: card }]}>
          <Text style={[styles.sectionTitle, { color: text, textAlign: align }]}>{t.proposeTitle}</Text>
          <Text style={[styles.sectionSub, { color: sub, textAlign: align }]}>{t.proposeSub}</Text>

          <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.name}</Text>
          <TextInput
            value={name} onChangeText={setName}
            placeholder={t.namePh} placeholderTextColor={sub}
            style={[styles.input, { color: text, backgroundColor: field, textAlign: align }]}
          />

          <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.description}</Text>
          <TextInput
            value={description} onChangeText={setDescription}
            placeholder={t.descriptionPh} placeholderTextColor={sub}
            multiline
            style={[styles.input, styles.inputMulti, { color: text, backgroundColor: field, textAlign: align }]}
          />

          <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.distance}</Text>
          <TextInput
            value={distance} onChangeText={setDistance}
            keyboardType="numeric" placeholder="5" placeholderTextColor={sub}
            style={[styles.input, { color: text, backgroundColor: field, textAlign: align }]}
          />

          {/* Étapes (saisie texte nom + lat + lng + atKm — PAS de carte) */}
          <Text style={[styles.label, { color: sub, textAlign: align, marginTop: 14 }]}>{t.stops}</Text>
          {stops.map((s, i) => (
            <View key={i} style={[styles.stopCard, { backgroundColor: field }]}>
              <View style={[styles.stopHeader, { flexDirection: dir }]}>
                <View style={[styles.stopBadge, { flexDirection: dir }]}>
                  <MapPin size={13} color={k.accent} />
                  <Text style={styles.stopBadgeTxt}>{i + 1}</Text>
                </View>
                {stops.length > 1 && (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('supprimer')} onPress={() => removeStop(i)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Trash2 size={18} color="#ef4444" />
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                value={s.name} onChangeText={(v) => updateStop(i, 'name', v)}
                placeholder={t.stopName} placeholderTextColor={sub}
                style={[styles.stopInput, { color: text, backgroundColor: card, textAlign: align }]}
              />
              <View style={[styles.stopRow, { flexDirection: dir }]}>
                <TextInput
                  value={s.lat} onChangeText={(v) => updateStop(i, 'lat', v)}
                  keyboardType="numeric" placeholder={t.lat} placeholderTextColor={sub}
                  style={[styles.stopInput, styles.stopInputHalf, { color: text, backgroundColor: card, textAlign: align }]}
                />
                <TextInput
                  value={s.lng} onChangeText={(v) => updateStop(i, 'lng', v)}
                  keyboardType="numeric" placeholder={t.lng} placeholderTextColor={sub}
                  style={[styles.stopInput, styles.stopInputHalf, { color: text, backgroundColor: card, textAlign: align }]}
                />
              </View>
              <TextInput
                value={s.atKm} onChangeText={(v) => updateStop(i, 'atKm', v)}
                keyboardType="numeric" placeholder={t.atKm} placeholderTextColor={sub}
                style={[styles.stopInput, { color: text, backgroundColor: card, textAlign: align }]}
              />
            </View>
          ))}

          <TouchableOpacity style={[styles.addStopBtn, { flexDirection: dir, borderColor: k.accent }]} onPress={addStop} activeOpacity={0.8}>
            <Plus size={18} color={k.accent} />
            <Text style={styles.addStopTxt}>{t.addStop}</Text>
          </TouchableOpacity>

          {formErr && <Text style={[styles.errTxt, { textAlign: align }]}>{formErr}</Text>}
          {submitted && (
            <View style={[styles.okBox, { backgroundColor: k.accentSoft }]}>
              <Clock size={16} color={k.accent} />
              <Text style={[styles.okTxt, { textAlign: align }]}>{t.submitted}</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.submitBtn, { flexDirection: dir }]} onPress={onSubmit} disabled={submitting} activeOpacity={0.85}>
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : (<><Send size={18} color="#fff" /><Text style={styles.submitTxt}>{t.submit}</Text></>)}
          </TouchableOpacity>
        </View>

        {/* Mes soumissions (suivi de modération) */}
        {mine.length > 0 && (
          <>
            <Text style={[styles.listTitle, { color: text, textAlign: align }]}>{t.mySubsTitle}</Text>
            {mine.map((r) => (
              <View key={r.id} style={[styles.subRow, { backgroundColor: card, flexDirection: dir }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.routeName, { color: text, textAlign: align }]} numberOfLines={1}>{r.name}</Text>
                  <Text style={[styles.routeMeta, { color: sub, textAlign: align }]} numberOfLines={1}>
                    {r.totalKm} {t.km} · {(r.waypoints || []).length} {t.stopsCount}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(r.status) + '22' }]}>
                  <Text style={[styles.statusTxt, { color: statusColor(r.status) }]}>{statusLabel(r.status)}</Text>
                </View>
              </View>
            ))}
          </>
        )}

        {/* (b) PARCOURS APPROUVÉS (cliquables) */}
        <Text style={[styles.listTitle, { color: text, textAlign: align }]}>{t.approvedTitle}</Text>
          </>
        }
        ListEmptyComponent={
          loading ? (
          <View style={styles.loadingBox}><ActivityIndicator size="large" color={k.accent} /></View>
          ) : (
          <View style={[styles.emptyBox, { backgroundColor: card }]}>
            <RouteIcon size={34} color={k.textFaint} />
            <Text style={[styles.emptySub, { color: sub }]}>{t.approvedEmpty}</Text>
          </View>
          )
        }
        renderItem={({ item: r }: { item: CommunityRoute }) => {
            const open = expanded === r.id;
            return (
              <View key={r.id} style={[styles.routeCard, { backgroundColor: card }]}>
                <TouchableOpacity
                  style={[styles.routeRow, { flexDirection: dir }]}
                  activeOpacity={0.85}
                  onPress={() => setExpanded(open ? null : (r.id || null))}
                >
                  <View style={styles.routeIcon}>
                    <RouteIcon size={20} color={k.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.routeName, { color: text, textAlign: align }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[styles.routeMeta, { color: sub, textAlign: align }]} numberOfLines={1}>
                      {r.authorName ? `${r.authorName} · ` : ''}{r.totalKm} {t.km} · {(r.waypoints || []).length} {t.stopsCount}
                    </Text>
                  </View>
                  {open
                    ? <ChevronDown size={20} color={sub} />
                    : <ChevronRight size={20} color={sub} style={flipForRTL(isRTL)} />}
                </TouchableOpacity>
                {open && (
                  <View style={styles.routeDetail}>
                    {!!r.description && (
                      <Text style={[styles.routeDesc, { color: sub, textAlign: align }]}>{r.description}</Text>
                    )}
                    {(r.waypoints || []).map((w, i) => (
                      <View key={i} style={[styles.wpRow, { flexDirection: dir }]}>
                        <View style={styles.wpDot}><MapPin size={13} color={k.accent} /></View>
                        <Text style={[styles.wpName, { color: text, textAlign: align }]} numberOfLines={1}>
                          {w.name} · {w.atKm} {t.km}
                        </Text>
                      </View>
                    ))}
                    {/* On ne propose pas de se signaler soi-même : l'auteur voit déjà son
                        parcours dans « mes soumissions ». */}
                    {!!email && r.authorId !== emailToDocId(email) && (
                      <TouchableOpacity
                        style={[styles.reportBtn, { flexDirection: dir }]}
                        onPress={() => setModTarget(r)}
                        activeOpacity={0.7}
                      >
                        <Flag size={14} color={sub} />
                        <Text style={[styles.reportTxt, { color: sub }]}>{t.report}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
        }}
      />

      <ModerationSheet
        visible={!!modTarget}
        onClose={() => setModTarget(null)}
        targetType="route"
        targetId={modTarget?.id || ''}
        targetOwnerDocId={modTarget?.authorId}
        targetName={modTarget?.name}
        reporterEmail={email}
        // Bloquer un auteur retire ses parcours de la liste sans attendre un rechargement.
        onBlocked={(owner) => setApproved((list) => list.filter((x) => x.authorId !== owner))}
      />
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 },
  sectionCard: { borderRadius: 18, padding: 16, marginBottom: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  sectionSub: { fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 10 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputMulti: { minHeight: 70, textAlignVertical: 'top' },
  stopCard: { borderRadius: 14, padding: 12, marginBottom: 10 },
  stopHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  stopBadge: { alignItems: 'center', gap: 5, backgroundColor: k.accentSoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  stopBadgeTxt: { fontSize: 12, fontWeight: '800', color: k.accent },
  stopInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8 },
  stopRow: { gap: 8 },
  stopInputHalf: { flex: 1 },
  addStopBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, marginTop: 2 },
  addStopTxt: { color: k.accent, fontSize: 14, fontWeight: '800' },
  errTxt: { color: '#ef4444', fontSize: 13, fontWeight: '700', marginTop: 12 },
  okBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginTop: 12 },
  okTxt: { flex: 1, color: k.accent, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  submitBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: k.accent, borderRadius: 14, paddingVertical: 14, marginTop: 14 },
  submitTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  listTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3, marginTop: 6, marginBottom: 10 },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  emptyBox: { borderRadius: 18, padding: 26, alignItems: 'center', gap: 12 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  routeCard: { borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
  routeRow: { alignItems: 'center', gap: 12, padding: 14 },
  routeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: k.accentSoft, alignItems: 'center', justifyContent: 'center' },
  routeName: { fontSize: 16, fontWeight: '800' },
  routeMeta: { fontSize: 12, marginTop: 3 },
  routeDetail: { paddingHorizontal: 14, paddingBottom: 14 },
  routeDesc: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  wpRow: { alignItems: 'center', gap: 10, marginBottom: 8 },
  wpDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: k.accentSoft, alignItems: 'center', justifyContent: 'center' },
  wpName: { flex: 1, fontSize: 14, fontWeight: '700' },
  // Signalement : volontairement discret (gris, petit) — il doit être TROUVABLE sans
  // concurrencer le contenu. Zone tactile portée à 44 px de haut malgré la petite typo.
  reportBtn: { alignItems: 'center', gap: 6, marginTop: 10, paddingVertical: 12, alignSelf: 'flex-start' },
  reportTxt: { fontSize: 12, fontWeight: '700' },
  subRow: { alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusTxt: { fontSize: 11, fontWeight: '800' },
});

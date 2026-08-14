import ScreenTopBar from '../../components/ScreenTopBar';
import { useTokens } from '../../constants/tokens';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, ActivityIndicator, Image, Modal, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Trophy, Users, ChevronRight, MapPin, CheckCircle2, Sparkles, X, Route as RouteIcon, Flag } from 'lucide-react-native';
import { Card, PrimaryButton, SectionHeader } from '../../components/ui';
import { spacing, radius, type as typeToken } from '../../constants/theme';
import { poiPhoto } from '../../assets/challenges/registry';
import Medal from '../../components/Medal';
import { generateRoute, GeneratedRoute } from '../../lib/routeGen';

// Thème de cadre médaille par défi (couleurs variées ; sinon l'id → palette défaut).
const CH_FRAME: Record<string, string> = { 'casa-loop': 'casablanca', 'paris-marathon': 'rabat', 'great-wall': 'meknes', 'route66': 'merzouga' };
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import {
  listenOpenRaces, joinRace,
  CHALLENGES, getMyChallengeProgress, joinChallenge,
  Race, streetViewUrl,
} from '../../lib/races';
import { getActiveRaces } from '../../lib/racesApi';
import { useScreenGate } from '../../components/FeatureGate';

const PRIMARY = Colors.light.primary;

const TXT: Record<string, any> = {
  en: {
    title: 'Races',
    tabGroup: 'Group races',
    tabChallenges: 'Virtual challenges',
    goal: 'Goal',
    km: 'km',
    join: 'Join',
    open: 'Open',
    live: 'Live',
    done: 'Done',
    by: 'by',
    progress: 'Progress',
    notStarted: 'Not started',
    emptyRaces: 'No open races yet. Create one and invite your friends!',
    emptyChallenges: 'No challenges available.',
    genBtn: 'Generate a route (AI)',
    genTitle: 'AI route generator',
    genTheme: 'Theme',
    genThemePh: 'e.g. seaside run in Casablanca',
    genKm: 'Distance (km)',
    genGo: 'Generate',
    genGenerating: 'Generating...',
    genWaypoints: 'Waypoints',
    genMedal: 'Medal idea',
    genPreviewNote: 'Preview — ask the admin to add it to the catalog.',
    genError: 'Generation failed. Try again.',
    genClose: 'Close',
    genDistance: 'Distance',
    genRouteReady: 'Your AI route',
    genUseRoute: 'Got it',
    community: 'Community routes',
  },
  fr: {
    title: 'Courses',
    tabGroup: 'Courses de groupe',
    tabChallenges: 'Défis virtuels',
    goal: 'Objectif',
    km: 'km',
    join: 'Rejoindre',
    open: 'Ouverte',
    live: 'En direct',
    done: 'Terminée',
    by: 'par',
    progress: 'Progression',
    notStarted: 'Pas commencé',
    emptyRaces: 'Aucune course ouverte. Crées-en une et invite tes amis !',
    emptyChallenges: 'Aucun défi disponible.',
    genBtn: 'Générer un parcours (IA)',
    genTitle: 'Générateur de parcours IA',
    genTheme: 'Thème',
    genThemePh: 'ex. course en bord de mer à Casablanca',
    genKm: 'Distance (km)',
    genGo: 'Générer',
    genGenerating: 'Génération...',
    genWaypoints: 'Points de passage',
    genMedal: 'Idée de médaille',
    genPreviewNote: 'Aperçu — demande à l\'admin de l\'ajouter au catalogue.',
    genError: 'Échec de la génération. Réessaie.',
    genClose: 'Fermer',
    genDistance: 'Distance',
    genRouteReady: 'Ton parcours IA',
    genUseRoute: 'Compris',
    community: 'Parcours communautaires',
  },
  ar: {
    title: 'السباقات',
    tabGroup: 'سباقات جماعية',
    tabChallenges: 'تحديات افتراضية',
    goal: 'الهدف',
    km: 'كم',
    join: 'انضمام',
    open: 'مفتوح',
    live: 'مباشر',
    done: 'منتهٍ',
    by: 'بواسطة',
    progress: 'التقدّم',
    notStarted: 'لم يبدأ',
    emptyRaces: 'لا توجد سباقات مفتوحة بعد. أنشئ واحداً وادعُ أصدقاءك!',
    emptyChallenges: 'لا توجد تحديات متاحة.',
    genBtn: 'مسار بالذكاء الاصطناعي',
    genTitle: 'مولّد المسارات بالذكاء الاصطناعي',
    genTheme: 'الموضوع',
    genThemePh: 'مثال: جري على شاطئ الدار البيضاء',
    genKm: 'المسافة (كم)',
    genGo: 'توليد',
    genGenerating: 'جارٍ التوليد...',
    genWaypoints: 'نقاط المرور',
    genMedal: 'فكرة الميدالية',
    genPreviewNote: 'معاينة — اطلب من المشرف إضافته إلى الكتالوج.',
    genError: 'فشل التوليد. حاول مرة أخرى.',
    genClose: 'إغلاق',
    genDistance: 'المسافة',
    genRouteReady: 'مسارك بالذكاء الاصطناعي',
    genUseRoute: 'حسناً',
    community: 'مسارات المجتمع',
  },
};

export default function RacesScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const __gate = useScreenGate('races');

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || (email ? email.split('@')[0] : '');

  const [tab, setTab] = useState<'group' | 'challenges'>('group');

  // Group races
  const [races, setRaces] = useState<Race[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(true);

  // Challenges
  const [progress, setProgress] = useState<Record<string, number | null>>({});
  const [loadingChallenges, setLoadingChallenges] = useState(true);
  const [activeRaces, setActiveRaces] = useState<any[]>([]); // courses admin (Mongo)
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Génération IA de parcours (#5) — PREVIEW perso, aucune écriture backend.
  const [genOpen, setGenOpen] = useState(false);
  const [genTheme, setGenTheme] = useState('');
  const [genKm, setGenKm] = useState('5');
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<GeneratedRoute | null>(null);
  const [genErr, setGenErr] = useState(false);

  const onGenerate = async () => {
    if (genLoading) return;
    setGenLoading(true);
    setGenErr(false);
    setGenResult(null);
    try {
      const km = parseFloat(genKm.replace(',', '.'));
      const r = await generateRoute(genTheme, km, language);
      if (r) setGenResult(r); else setGenErr(true);
    } catch {
      setGenErr(true);
    } finally {
      setGenLoading(false);
    }
  };

  const closeGen = () => { setGenOpen(false); setGenResult(null); setGenErr(false); };

  useEffect(() => {
    setLoadingRaces(true);
    const unsub = listenOpenRaces((list) => {
      setRaces(list);
      setLoadingRaces(false);
    });
    return () => { unsub && unsub(); };
  }, []);

  const loadProgress = useCallback(async () => {
    if (!email) { setLoadingChallenges(false); return; }
    try {
      const entries = await Promise.all(
        CHALLENGES.map(async (c) => [c.id, await getMyChallengeProgress(c.id, email)] as const)
      );
      const next: Record<string, number | null> = {};
      entries.forEach(([id, p]) => { next[id] = p; });
      setProgress(next);
    } catch (e) {
      console.warn('[races] challenge progress failed', e);
    } finally {
      setLoadingChallenges(false);
    }
  }, [email]);

  useEffect(() => { loadProgress(); }, [loadProgress]);
  // Courses créées depuis l'admin (Mongo) — jouables via le MÊME écran défi.
  // Le `.catch(() => {})` d'origine avalait TOUT : quand EXPO_PUBLIC_API_URL manquait dans
  // les APK de la CI, `authFetch` jetait et l'écran affichait « aucun défi disponible » sans
  // le moindre indice. Une liste vide et une panne réseau se ressemblent trop pour rester
  // indiscernables — on trace la cause, sans changer le comportement visible.
  useEffect(() => {
    getActiveRaces()
      .then((r: any) => { if (Array.isArray(r)) setActiveRaces(r); })
      .catch((e) => console.warn('[races] chargement des courses admin impossible', e?.message || e));
  }, []);

  const onJoinRace = async (race: Race) => {
    try {
      await joinRace(race.id, email, displayName);
      // Forme objet plutot que concatenation : expo-router 6 type les chemins, et
      // surtout il encode lui-meme les parametres — un identifiant contenant un
      // caractere reserve cassait silencieusement l'URL construite a la main.
      router.push({ pathname: '/race-live', params: { id: race.id } });
    } catch (e) {
      console.warn('[races] join failed', e);
    }
  };

  const onJoinChallenge = async (id: string) => {
    if (busy[id]) return;
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      await joinChallenge(id, email, displayName);
      setProgress((p) => ({ ...p, [id]: 0 }));
    } catch (e) {
      console.warn('[races] join challenge failed', e);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const tok = useTokens();
  const bg = tok.bg;
  const track = isDark ? Colors.dark.gray[100] : Colors.light.gray[200];
  const rowDir = isRTL ? 'row-reverse' : 'row';
  const align: any = isRTL ? 'right' : 'left';

  const statusLabel = (s: Race['status']) => (s === 'live' ? t.live : s === 'done' ? t.done : t.open);

  if (!__gate.ok) return __gate.node;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar />
      {/* Header */}
      <View style={[styles.header, { flexDirection: rowDir }]}>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: card }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={text} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]}>{t.title}</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabs, { flexDirection: rowDir }]}>
        <TouchableOpacity style={[styles.tab, tab === 'group' && styles.tabActive]} onPress={() => setTab('group')}>
          <Users size={18} color={tab === 'group' ? PRIMARY : sub} />
          <Text style={[styles.tabTxt, { color: tab === 'group' ? PRIMARY : sub }]} numberOfLines={1}>{t.tabGroup}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'challenges' && styles.tabActive]} onPress={() => setTab('challenges')}>
          <Trophy size={18} color={tab === 'challenges' ? PRIMARY : sub} />
          <Text style={[styles.tabTxt, { color: tab === 'challenges' ? PRIMARY : sub }]} numberOfLines={1}>{t.tabChallenges}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {tab === 'group' ? (
          <>
            {/* Création de courses désormais UNIQUEMENT depuis le back-office web. */}

            {/* Lien vers la marketplace de parcours communautaires (UGC, modérés). */}
            <TouchableOpacity
              style={[styles.communityBtn, { backgroundColor: card, flexDirection: rowDir }]}
              activeOpacity={0.85}
              onPress={() => router.push('/community-routes')}
            >
              <View style={styles.communityIcon}><RouteIcon size={20} color={PRIMARY} /></View>
              <Text style={[styles.communityTxt, { color: text, textAlign: align }]} numberOfLines={1}>{t.community}</Text>
              <ChevronRight size={20} color={sub} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
            </TouchableOpacity>

            {/* Race list */}
            {loadingRaces ? (
              <View style={styles.loadingBox}><ActivityIndicator size="large" color={PRIMARY} /></View>
            ) : races.length === 0 ? (
              <View style={[styles.emptyBox, { backgroundColor: card }]}>
                <Users size={36} color={isDark ? Colors.dark.gray[300] : Colors.light.gray[300]} />
                <Text style={[styles.emptySub, { color: sub }]}>{t.emptyRaces}</Text>
              </View>
            ) : (
              races.map((r) => (
                <TouchableOpacity key={r.id} style={[styles.raceRow, { backgroundColor: card, flexDirection: rowDir }]} onPress={() => onJoinRace(r)}>
                  {/* Visuel : pastille dégradée avec icône (cartes plus vivantes) */}
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: r.status === 'live' ? '#dcfce7' : '#EAF4EE', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={20} color={PRIMARY} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.raceName, { color: text, textAlign: align }]} numberOfLines={1}>{r.name}</Text>
                    <Text style={[styles.raceMeta, { color: sub, textAlign: align }]} numberOfLines={1}>
                      {r.createdByName ? `${t.by} ${r.createdByName} · ` : ''}{t.goal} {r.goalKm} {t.km}
                    </Text>
                  </View>
                  <View style={[styles.badge, r.status === 'live' && styles.badgeLive]}>
                    <Text style={[styles.badgeTxt, r.status === 'live' && { color: '#fff' }]}>{statusLabel(r.status)}</Text>
                  </View>
                  <ChevronRight size={20} color={sub} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                </TouchableOpacity>
              ))
            )}
          </>
        ) : (
          <>
            {/* Génération IA de parcours (#5) — ouvre un aperçu perso (non persisté). */}
            <TouchableOpacity
              style={[styles.genBtn, { flexDirection: rowDir }]}
              activeOpacity={0.85}
              onPress={() => { setGenErr(false); setGenResult(null); setGenOpen(true); }}
            >
              <Sparkles size={18} color="#fff" />
              <Text style={styles.genBtnTxt} numberOfLines={1}>{t.genBtn}</Text>
            </TouchableOpacity>

            {/* Challenges */}
            {/* Courses créées depuis l'admin (Mongo) — médaille = le modèle conçu */}
            {activeRaces.map((r) => {
              const stops = (r.waypoints || []).length;
              const w0 = (r.waypoints || [])[0];
              return (
                <TouchableOpacity key={r._id} activeOpacity={0.9} style={[styles.challengeCard, { backgroundColor: card }]} onPress={() => router.push({ pathname: '/challenge', params: { id: r._id, src: 'mongo' } })}>
                  <View style={styles.heroWrap}>
                    {/* Photo héro = Street View du départ ; badge = la MÉDAILLE (pas d'émoji). */}
                    {w0 ? <Image source={{ uri: streetViewUrl(w0.lat, w0.lng, 640, 400) }} style={styles.hero} resizeMode="cover" /> : <View style={[styles.hero, { backgroundColor: '#dbe4ee' }]} />}
                    <View style={styles.heroShade} />
                    <View style={{ position: 'absolute', top: 6, left: 8 }}>
                      <Medal width={62} {...(r.medalSpec || {})} title={r.name} km={r.totalKm} />
                    </View>
                    <View style={[styles.heroBottom, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.heroName} numberOfLines={1}>{r.name}</Text>
                        <View style={styles.heroChips}>
                          <View style={styles.heroChip}><Text style={styles.heroChipTxt}>{r.totalKm} {t.km}</Text></View>
                          {stops > 0 && (<View style={styles.heroChip}><MapPin size={11} color="#fff" /><Text style={styles.heroChipTxt}> {stops}</Text></View>)}
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
            {/* UNIFIÉ : une seule liste = les courses admin (Mongo). Les 4 anciens
                défis intégrés ont été MIGRÉS en base avec leurs médailles. */}
            {activeRaces.length === 0 && (
              <View style={[styles.emptyBox, { backgroundColor: card }]}>
                <Trophy size={36} color={isDark ? Colors.dark.gray[300] : Colors.light.gray[300]} />
                <Text style={[styles.emptySub, { color: sub }]}>{t.emptyChallenges}</Text>
              </View>
            )}
            {false && CHALLENGES.map((c) => {
                const p = progress[c.id];
                const joined = p != null;
                const pct = joined ? Math.min(1, (p as number) / c.totalKm) : 0;
                const done = pct >= 1;
                const hero = poiPhoto(c.id, 0);
                const stops = (c.pois as any[])?.length || 0;
                return (
                  <TouchableOpacity key={c.id} activeOpacity={0.9} style={[styles.challengeCard, { backgroundColor: card }]} onPress={() => router.push({ pathname: '/challenge', params: { id: c.id } })}>
                    {/* GRANDE photo du lieu + médaille en BADGE (coin) */}
                    <View style={styles.heroWrap}>
                      {hero ? <Image source={hero} style={styles.hero} resizeMode="cover" /> : <View style={[styles.hero, { backgroundColor: '#cbd5e1' }]} />}
                      <View style={styles.heroShade} />
                      {/* Logo (emoji) REMPLACÉ par la médaille — photo du lieu conservée */}
                      <View style={{ position: 'absolute', top: 6, left: 8 }}>
                        <Medal width={62} frame={CH_FRAME[c.id] || c.id} title={c.name} km={c.totalKm} rank={done ? 1 : undefined} />
                      </View>
                      <View style={[styles.heroBottom, { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.heroName} numberOfLines={1}>{c.name}</Text>
                          <View style={styles.heroChips}>
                            <View style={styles.heroChip}><Text style={styles.heroChipTxt}>{c.totalKm} {t.km}</Text></View>
                            {stops > 0 && (<View style={styles.heroChip}><MapPin size={11} color="#fff" /><Text style={styles.heroChipTxt}> {stops}</Text></View>)}
                            {done && (<View style={[styles.heroChip, { backgroundColor: 'rgba(34,197,94,0.9)' }]}><CheckCircle2 size={11} color="#fff" /><Text style={styles.heroChipTxt}> 100%</Text></View>)}
                          </View>
                        </View>
                      {!joined && (
                        <TouchableOpacity style={styles.joinSmall} onPress={(e) => { e.stopPropagation?.(); onJoinChallenge(c.id); }} disabled={!!busy[c.id]}>
                          {busy[c.id] ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.joinBtnTxt}>{t.join}</Text>}
                        </TouchableOpacity>
                      )}
                      </View>
                    </View>
                    {joined && (
                      <View style={styles.progressWrap}>
                        <View style={[styles.progressTrack, { backgroundColor: track }]}>
                          <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: done ? '#22c55e' : PRIMARY }]} />
                        </View>
                        <Text style={[styles.progressTxt, { color: sub, textAlign: align }]}>
                          {t.progress}: {(p as number).toFixed(1)} / {c.totalKm} {t.km} · {Math.round(pct * 100)}%
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
          </>
        )}
      </ScrollView>

      {/* Modal — Génération IA de parcours (aperçu perso, AUCUNE persistance). */}
      <Modal visible={genOpen} animationType="slide" transparent onRequestClose={closeGen}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: card }]}>
            <View style={[styles.modalHeader, { flexDirection: rowDir }]}>
              <Text style={[styles.modalTitle, { color: text, textAlign: align }]} numberOfLines={1}>{t.genTitle}</Text>
              <TouchableOpacity onPress={closeGen} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color={sub} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Champs de saisie */}
              <Text style={[styles.fieldLabel, { color: sub, textAlign: align }]}>{t.genTheme}</Text>
              <TextInput
                value={genTheme}
                onChangeText={setGenTheme}
                placeholder={t.genThemePh}
                placeholderTextColor={sub}
                style={[styles.input, { color: text, backgroundColor: track, textAlign: align }]}
              />

              <Text style={[styles.fieldLabel, { color: sub, textAlign: align }]}>{t.genKm}</Text>
              <TextInput
                value={genKm}
                onChangeText={setGenKm}
                keyboardType="numeric"
                placeholder="5"
                placeholderTextColor={sub}
                style={[styles.input, { color: text, backgroundColor: track, textAlign: align }]}
              />

              <TouchableOpacity style={styles.genGo} activeOpacity={0.85} onPress={onGenerate} disabled={genLoading}>
                {genLoading
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.genGoTxt}>{t.genGo}</Text>}
              </TouchableOpacity>

              {genErr && <Text style={[styles.genErr, { textAlign: align }]}>{t.genError}</Text>}

              {/* Aperçu du résultat — enveloppé dans une Card premium (design-only). */}
              {genResult && (
                <Card variant="raised" style={styles.previewCard}>
                  <SectionHeader eyebrow={t.genRouteReady} title={genResult.name} icon={<RouteIcon size={20} color={PRIMARY} />} />

                  <View style={styles.previewBody}>
                  {!!genResult.description && (
                    <Text style={[styles.previewDesc, { color: sub, textAlign: align }]}>{genResult.description}</Text>
                  )}

                  {/* Méta : distance + thème, joliment présentés avec icônes lucide. */}
                  <View style={[styles.metaRow, { flexDirection: rowDir }]}>
                    <View style={[styles.metaChip, { backgroundColor: track, flexDirection: rowDir }]}>
                      <RouteIcon size={14} color={PRIMARY} />
                      <Text style={[styles.metaChipTxt, { color: text }]} numberOfLines={1}>
                        {t.genDistance}: {genKm} {t.km}
                      </Text>
                    </View>
                    {!!genTheme.trim() && (
                      <View style={[styles.metaChip, { backgroundColor: track, flexDirection: rowDir }]}>
                        <Flag size={14} color={PRIMARY} />
                        <Text style={[styles.metaChipTxt, { color: text }]} numberOfLines={1}>
                          {genTheme.trim()}
                        </Text>
                      </View>
                    )}
                  </View>

                  {genResult.waypoints.length > 0 && (
                    <>
                      <Text style={[styles.previewSection, { color: text, textAlign: align }]}>{t.genWaypoints}</Text>
                      {genResult.waypoints.map((w, i) => (
                        <View key={i} style={[styles.wpRow, { flexDirection: rowDir }]}>
                          <View style={styles.wpDot}><MapPin size={13} color={PRIMARY} /></View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.wpName, { color: text, textAlign: align }]} numberOfLines={1}>
                              {w.name} · {w.atKm} {t.km}
                            </Text>
                            {!!w.description && (
                              <Text style={[styles.wpDesc, { color: sub, textAlign: align }]}>{w.description}</Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {!!genResult.medalIdea && (
                    <>
                      <Text style={[styles.previewSection, { color: text, textAlign: align }]}>{t.genMedal}</Text>
                      <Text style={[styles.previewDesc, { color: sub, textAlign: align }]}>{genResult.medalIdea}</Text>
                    </>
                  )}

                  <View style={[styles.noteBox, { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight }]}>
                    <Text style={[styles.noteTxt, { textAlign: align }]}>{t.genPreviewNote}</Text>
                  </View>

                  {/* Bouton de validation normé (design-only : réutilise closeGen). */}
                  <PrimaryButton
                    title={t.genUseRoute}
                    onPress={closeGen}
                    icon={<CheckCircle2 size={18} color="#fff" />}
                    style={styles.previewCta}
                  />
                  </View>
                </Card>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  tabs: { paddingHorizontal: 16, gap: 10, marginBottom: 6 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
  tabActive: { borderColor: PRIMARY, backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight },
  tabTxt: { fontSize: 13, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 60 },
  loadingBox: { paddingVertical: 50, alignItems: 'center' },
  emptyBox: { borderRadius: 18, padding: 28, alignItems: 'center', gap: 14, marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  communityBtn: { alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 14 },
  communityIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center' },
  communityTxt: { flex: 1, fontSize: 16, fontWeight: '800' },
  raceRow: { alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 10 },
  raceName: { fontSize: 16, fontWeight: '800' },
  raceMeta: { fontSize: 12, marginTop: 3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight },
  badgeLive: { backgroundColor: PRIMARY },
  badgeTxt: { fontSize: 11, fontWeight: '800', color: PRIMARY },
  challengeCard: { borderRadius: 20, marginBottom: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  heroWrap: { height: 150, width: '100%', justifyContent: 'flex-end' },
  hero: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  heroEmoji: { position: 'absolute', top: 12, left: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  heroBottom: { padding: 14 },
  heroMedalWrap: { alignItems: 'center', paddingVertical: 14, backgroundColor: '#EAF4EE' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  infoName: { fontSize: 16, fontWeight: '800' },
  chipLite: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2f7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipLiteTxt: { fontSize: 12, fontWeight: '700', color: '#475569' },
  joinSmall: { backgroundColor: '#2E8B57', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  heroName: { color: '#fff', fontSize: 19, fontWeight: '900', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6 },
  heroChips: { flexDirection: 'row', gap: 8, marginTop: 8 },
  heroChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  heroChipTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  heroJoin: { position: 'absolute', top: 12, right: 12, backgroundColor: PRIMARY, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 30 },
  challengeName: { fontSize: 16, fontWeight: '800' },
  challengeMeta: { fontSize: 12, marginTop: 3 },
  joinBtn: { backgroundColor: PRIMARY, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  joinBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  progressWrap: { padding: 14, paddingTop: 12 },
  progressTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5, backgroundColor: PRIMARY },
  progressTxt: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  // Génération IA de parcours (#5)
  genBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, marginBottom: 14 },
  genBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28, maxHeight: '88%' },
  modalHeader: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { flex: 1, fontSize: 19, fontWeight: '900', letterSpacing: -0.3 },
  modalClose: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 6 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 4 },
  genGo: { backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  genGoTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  genErr: { color: '#ef4444', fontSize: 13, fontWeight: '700', marginTop: 12 },
  previewWrap: { marginTop: 18 },
  previewName: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  previewCard: { marginTop: spacing.lg },
  previewBody: { paddingHorizontal: spacing.xl },
  previewCta: { marginTop: spacing.lg },
  metaRow: { flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  metaChip: { alignItems: 'center', gap: 6, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  metaChipTxt: { ...(typeToken.micro as any), maxWidth: 180 },
  previewDesc: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  previewSection: { fontSize: 14, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  wpRow: { alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  wpDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  wpName: { fontSize: 14, fontWeight: '800' },
  wpDesc: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  noteBox: { borderRadius: 12, padding: 12, marginTop: 18 },
  noteTxt: { fontSize: 12, fontWeight: '700', color: PRIMARY, lineHeight: 17 },
});

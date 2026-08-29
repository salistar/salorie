// Marketplace UGC — catalogue des annonces communautaires (repas maison, coaching,
// matériel, produits, service…). Grille d'annonces approuvées + filtre par catégorie +
// bouton "Publier" + bouton "Mes annonces". PAS de paiement : le détail ouvre le contact
// vendeur. Trilingue (en/fr/ar) + dark + RTL + flèche retour. Firestore best-effort.
import ScreenTopBar from '../../components/ScreenTopBar';
import { a11y } from '../../lib/a11y';
import { useTokens, Tokens } from '../../constants/tokens';
import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Skeleton } from '../../components/ui';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Plus, Store, Tag, User as UserIcon, MapPin, MoreVertical } from 'lucide-react-native';
import PerfList from '../../components/PerfList';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign, flipForRTL } from '../../lib/rtl';
import { listListings, LISTING_CATEGORIES, ListingCategory, MarketplaceListing } from '../../lib/marketplace';
import ModerationSheet from '../../components/ModerationSheet';
import { getBlockedSet } from '../../lib/moderation';


const CAT_EMOJI: Record<ListingCategory, string> = {
  meal: '🍱', coaching: '🧑‍🏫', gear: '🏋️', produce: '🥦', service: '🛠️', other: '📦',
};

const TXT: Record<string, any> = {
  en: {
    title: 'Marketplace',
    sub: 'Community listings: home meals, coaching, gear and more. Contact sellers directly.',
    all: 'All',
    publish: 'Publish',
    myListings: 'My listings',
    empty: 'No listings yet. Be the first to publish one!',
    free: 'Free',
    cats: { meal: 'Meals', coaching: 'Coaching', gear: 'Gear', produce: 'Produce', service: 'Service', other: 'Other' },
  },
  fr: {
    title: 'Marketplace',
    sub: 'Annonces de la communauté : repas maison, coaching, matériel… Contactez les vendeurs directement.',
    all: 'Tout',
    publish: 'Publier',
    myListings: 'Mes annonces',
    empty: 'Aucune annonce pour le moment. Sois le premier à en publier une !',
    free: 'Gratuit',
    cats: { meal: 'Repas', coaching: 'Coaching', gear: 'Matériel', produce: 'Produits', service: 'Service', other: 'Autre' },
  },
  ar: {
    title: 'السوق',
    sub: 'إعلانات المجتمع: وجبات منزلية، تدريب، معدات… تواصل مع البائعين مباشرة.',
    all: 'الكل',
    publish: 'نشر',
    myListings: 'إعلاناتي',
    empty: 'لا توجد إعلانات بعد. كن أول من ينشر واحداً!',
    free: 'مجاني',
    cats: { meal: 'وجبات', coaching: 'تدريب', gear: 'معدات', produce: 'منتجات', service: 'خدمة', other: 'أخرى' },
  },
};

export default function MarketplaceScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [category, setCategory] = useState<ListingCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [modTarget, setModTarget] = useState<MarketplaceListing | null>(null); // annonce à signaler/bloquer
  const email = user?.primaryEmailAddress?.emailAddress || '';

  const align = txtAlign(isRTL);
  const dir = rowDir(isRTL);

  const text = isDark ? '#fff' : k.text;
  const sub = isDark ? '#9BA1A6' : k.textMuted;
  const card = isDark ? k.surface : '#fff';
  const tok = useTokens();
  const bg = tok.bg;
  const field = k.border;

  const load = useCallback(async (cat: ListingCategory | null) => {
    setLoading(true);
    try {
      const blk = await getBlockedSet(user?.primaryEmailAddress?.emailAddress || ''); // masque les vendeurs bloqués
      const rows = (await listListings(cat ? { category: cat } : {})).filter((l) => !blk.has(l.ownerUid));
      setListings(rows);
    } catch (e) {
      console.warn('[marketplace] load failed', e);
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Recharge à chaque focus (retour depuis publication → catalogue frais).
  useFocusEffect(useCallback(() => { load(category); }, [load, category]));

  const priceLabel = (l: MarketplaceListing) =>
    l.price > 0 ? `${l.price} MAD` : t.free;

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

      {/* PerfList : la grille montait les 100 annonces d'un coup dans un ScrollView —
          aucune virtualisation, et chaque carte porte une image distante. `numColumns`
          reproduit la grille 2 colonnes ; l'ancien en-tête (sous-titre, actions, chips
          de catégorie) devient ListHeaderComponent pour rester dans le même défilement. */}
      <PerfList
        data={loading ? [] : listings}
        numColumns={2}
        keyExtractor={(l: MarketplaceListing) => l.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
        <Text style={[styles.sub, { color: sub, textAlign: align }]}>{t.sub}</Text>

        {/* Actions : Publier + Mes annonces */}
        <View style={[styles.actionsRow, { flexDirection: dir }]}>
          <TouchableOpacity
            style={[styles.publishBtn, { flexDirection: dir }]}
            activeOpacity={0.85}
            onPress={() => router.push('/listing-create' as any)}
          >
            <Plus size={18} color="#fff" />
            <Text style={styles.publishTxt}>{t.publish}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mineBtn, { flexDirection: dir, backgroundColor: field }]}
            activeOpacity={0.85}
            onPress={() => router.push('/listing-create?mine=1' as any)}
          >
            <UserIcon size={17} color={k.accent} />
            <Text style={[styles.mineTxt, { color: text }]}>{t.myListings}</Text>
          </TouchableOpacity>
        </View>

        {/* Filtre catégorie */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: !category ? k.accent : field }]}
            activeOpacity={0.85}
            onPress={() => setCategory(null)}
          >
            <Text style={[styles.chipTxt, { color: !category ? '#fff' : text }]}>{t.all}</Text>
          </TouchableOpacity>
          {LISTING_CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.chip, { backgroundColor: active ? k.accent : field }]}
                activeOpacity={0.85}
                onPress={() => setCategory(c)}
              >
                <Text style={[styles.chipTxt, { color: active ? '#fff' : text }]}>
                  {CAT_EMOJI[c]} {t.cats[c]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        </>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.grid}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={[styles.gridCard, { backgroundColor: card }]}>
                  <Skeleton width="100%" height={120} round={0} />
                  <View style={styles.gridBody}>
                    <Skeleton width="85%" height={14} />
                    <View style={{ height: 8 }} />
                    <Skeleton width="45%" height={12} />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: card }]}>
              <Store size={34} color={k.textFaint} />
              <Text style={[styles.emptySub, { color: sub }]}>{t.empty}</Text>
            </View>
          )
        }
        renderItem={({ item: l }: { item: MarketplaceListing }) => (
              <TouchableOpacity
                key={l.id}
                style={[styles.gridCard, { backgroundColor: card }]}
                activeOpacity={0.85}
                onPress={() => router.push(('/listing-detail?id=' + l.id) as any)}
              >
                <TouchableOpacity onPress={() => setModTarget(l)} hitSlop={8} style={[styles.modBtn, isRTL ? { left: 6 } : { right: 6 }]} accessibilityLabel="Signaler ou bloquer">
                  <MoreVertical size={16} color="#fff" />
                </TouchableOpacity>
                {l.imageUrl ? (
                  <Image source={{ uri: l.imageUrl }} style={styles.gridImg} resizeMode="cover" />
                ) : (
                  <View style={[styles.gridImg, styles.gridImgPh, { backgroundColor: field }]}>
                    <Text style={styles.gridImgEmoji}>{CAT_EMOJI[l.category]}</Text>
                  </View>
                )}
                <View style={styles.gridBody}>
                  <Text style={[styles.gridTitle, { color: text, textAlign: align }]} numberOfLines={1}>{l.title}</Text>
                  <View style={[styles.gridMetaRow, { flexDirection: dir }]}>
                    <Tag size={12} color={k.accent} />
                    <Text style={[styles.gridPrice, { color: k.accent }]} numberOfLines={1}>{priceLabel(l)}</Text>
                  </View>
                  {!!l.placeName && (
                    <View style={[styles.gridMetaRow, { flexDirection: dir }]}>
                      <MapPin size={11} color={sub} />
                      <Text style={[styles.gridPlace, { color: sub }]} numberOfLines={1}>{l.placeName}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
        )}
      />
      <ModerationSheet
        visible={!!modTarget}
        onClose={() => setModTarget(null)}
        targetType="listing"
        targetId={modTarget?.id || ''}
        targetOwnerDocId={modTarget?.ownerUid}
        targetName={modTarget?.title}
        reporterEmail={email}
        onBlocked={(owner) => setListings((ls) => ls.filter((x) => x.ownerUid !== owner))}
      />
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  modBtn: { position: 'absolute', top: 6, zIndex: 2, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, padding: 4 },
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 },
  sub: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  actionsRow: { gap: 10, marginBottom: 14 },
  publishBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: k.accent, borderRadius: 14, paddingVertical: 13 },
  publishTxt: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
  mineBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13 },
  mineTxt: { fontSize: 14.5, fontWeight: '800' },
  chipsRow: { gap: 8, paddingVertical: 2, paddingBottom: 8 },
  chip: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  chipTxt: { fontSize: 13, fontWeight: '800' },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  emptyBox: { borderRadius: 18, padding: 26, alignItems: 'center', gap: 12, marginTop: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 4 },
  // numColumns gère la largeur de colonne : une largeur en % la casserait.
  gridCard: { flex: 1, marginHorizontal: 4, borderRadius: 16, marginBottom: 14, overflow: 'hidden' },
  gridImg: { width: '100%', height: 120 },
  gridImgPh: { alignItems: 'center', justifyContent: 'center' },
  gridImgEmoji: { fontSize: 38 },
  gridBody: { padding: 10 },
  gridTitle: { fontSize: 14, fontWeight: '800' },
  gridMetaRow: { alignItems: 'center', gap: 4, marginTop: 4 },
  gridPrice: { fontSize: 13, fontWeight: '900' },
  gridPlace: { fontSize: 11.5, fontWeight: '600', flex: 1 },
});

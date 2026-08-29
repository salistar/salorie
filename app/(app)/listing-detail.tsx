// Détail d'une annonce Marketplace + bouton "Contacter le vendeur".
// PAS de paiement in-app : le contact se fait hors app (mailto vers l'email du vendeur ;
// l'ownerUid EST l'email sanitizé). Trilingue (en/fr/ar) + dark + RTL + flèche retour.
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
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, MessageCircle, Tag, MapPin, User as UserIcon } from 'lucide-react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign, flipForRTL } from '../../lib/rtl';
import { getListing, ListingCategory, MarketplaceListing } from '../../lib/marketplace';


const CAT_EMOJI: Record<ListingCategory, string> = {
  meal: '🍱', coaching: '🧑‍🏫', gear: '🏋️', produce: '🥦', service: '🛠️', other: '📦',
};

const TXT: Record<string, any> = {
  en: {
    title: 'Listing',
    contact: 'Contact seller',
    seller: 'Seller',
    noPay: 'No in-app payment — arrange directly with the seller.',
    notFound: 'This listing is no longer available.',
    free: 'Free',
    cats: { meal: 'Meals', coaching: 'Coaching', gear: 'Gear', produce: 'Produce', service: 'Service', other: 'Other' },
    mailSubject: 'About your listing on Salorie',
  },
  fr: {
    title: 'Annonce',
    contact: 'Contacter le vendeur',
    seller: 'Vendeur',
    noPay: "Pas de paiement dans l'app — organisez-vous directement avec le vendeur.",
    notFound: "Cette annonce n'est plus disponible.",
    free: 'Gratuit',
    cats: { meal: 'Repas', coaching: 'Coaching', gear: 'Matériel', produce: 'Produits', service: 'Service', other: 'Autre' },
    mailSubject: 'À propos de votre annonce sur Salorie',
  },
  ar: {
    title: 'الإعلان',
    contact: 'تواصل مع البائع',
    seller: 'البائع',
    noPay: 'لا دفع داخل التطبيق — نسّق مباشرة مع البائع.',
    notFound: 'هذا الإعلان لم يعد متوفراً.',
    free: 'مجاني',
    cats: { meal: 'وجبات', coaching: 'تدريب', gear: 'معدات', produce: 'منتجات', service: 'خدمة', other: 'أخرى' },
    mailSubject: 'بخصوص إعلانك على Salorie',
  },
};

export default function ListingDetailScreen() {
  const { resolved } = useTheme();
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' ? params.id : '';

  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [loading, setLoading] = useState(true);

  const align = txtAlign(isRTL);
  const dir = rowDir(isRTL);

  const text = isDark ? '#fff' : k.text;
  const sub = isDark ? '#9BA1A6' : k.textMuted;
  const card = isDark ? k.surface : '#fff';
  const tok = useTokens();
  const bg = tok.bg;
  const field = k.border;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setListing(await getListing(id));
    } catch (e) {
      console.warn('[listing-detail] load failed', e);
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const contactSeller = () => {
    if (!listing?.ownerUid) return;
    // ownerUid = email sanitizé → mailto direct (pas de paiement in-app).
    const subject = encodeURIComponent(`${t.mailSubject}: ${listing.title}`);
    const url = `mailto:${listing.ownerUid}?subject=${subject}`;
    Linking.openURL(url).catch((e) => console.warn('[listing-detail] mailto failed', e));
  };

  const priceLabel = (l: MarketplaceListing) => (l.price > 0 ? `${l.price} MAD` : t.free);

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

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator size="large" color={k.accent} /></View>
      ) : !listing ? (
        <View style={styles.loadingBox}>
          <Text style={[styles.notFound, { color: sub }]}>{t.notFound}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Image / placeholder */}
          {listing.imageUrl ? (
            <Image source={{ uri: listing.imageUrl }} style={styles.hero} resizeMode="cover" />
          ) : (
            <View style={[styles.hero, styles.heroPh, { backgroundColor: field }]}>
              <Text style={{ fontSize: 64 }}>{CAT_EMOJI[listing.category]}</Text>
            </View>
          )}

          <Text style={[styles.listingTitle, { color: text, textAlign: align }]}>{listing.title}</Text>

          {/* Prix + catégorie */}
          <View style={[styles.metaRow, { flexDirection: dir }]}>
            <View style={[styles.metaChip, { flexDirection: dir, backgroundColor: k.accentSoft }]}>
              <Tag size={14} color={k.accent} />
              <Text style={[styles.metaChipTxt, { color: k.accent }]}>{priceLabel(listing)}</Text>
            </View>
            <View style={[styles.metaChip, { flexDirection: dir, backgroundColor: field }]}>
              <Text style={[styles.metaChipTxt, { color: text }]}>{CAT_EMOJI[listing.category]} {t.cats[listing.category]}</Text>
            </View>
          </View>

          {!!listing.placeName && (
            <View style={[styles.placeRow, { flexDirection: dir }]}>
              <MapPin size={15} color={sub} />
              <Text style={[styles.placeTxt, { color: sub, textAlign: align }]}>{listing.placeName}</Text>
            </View>
          )}

          {!!listing.description && (
            <Text style={[styles.desc, { color: text, textAlign: align }]}>{listing.description}</Text>
          )}

          {/* Vendeur */}
          <View style={[styles.sellerCard, { backgroundColor: card, flexDirection: dir }]}>
            <View style={styles.sellerIcon}><UserIcon size={18} color={k.accent} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sellerLabel, { color: sub, textAlign: align }]}>{t.seller}</Text>
              <Text style={[styles.sellerName, { color: text, textAlign: align }]} numberOfLines={1}>
                {listing.ownerUid.split('@')[0]}
              </Text>
            </View>
          </View>

          <Text style={[styles.noPay, { color: sub, textAlign: align }]}>{t.noPay}</Text>

          {/* Contacter (pas de paiement in-app) */}
          <TouchableOpacity style={[styles.contactBtn, { flexDirection: dir }]} onPress={contactSeller} activeOpacity={0.85}>
            <MessageCircle size={18} color="#fff" />
            <Text style={styles.contactTxt}>{t.contact}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  notFound: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  hero: { width: '100%', height: 220, borderRadius: 18 },
  heroPh: { alignItems: 'center', justifyContent: 'center' },
  listingTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4, marginTop: 16 },
  metaRow: { gap: 10, marginTop: 12, flexWrap: 'wrap' },
  metaChip: { alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  metaChipTxt: { fontSize: 14, fontWeight: '800' },
  placeRow: { alignItems: 'center', gap: 6, marginTop: 12 },
  placeTxt: { fontSize: 14, fontWeight: '600', flex: 1 },
  desc: { fontSize: 15, lineHeight: 22, marginTop: 14 },
  sellerCard: { alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginTop: 20 },
  sellerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: k.accentSoft, alignItems: 'center', justifyContent: 'center' },
  sellerLabel: { fontSize: 12, fontWeight: '700' },
  sellerName: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  noPay: { fontSize: 12.5, lineHeight: 18, marginTop: 16 },
  contactBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: k.accent, borderRadius: 14, paddingVertical: 15, marginTop: 12 },
  contactTxt: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
});

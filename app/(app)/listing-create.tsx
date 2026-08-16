// Publier une annonce Marketplace + gérer MES annonces (marquer vendu / retirer).
// Formulaire : titre, description, catégorie, prix (MAD), lieu, photo optionnelle
// (expo-image-picker → base64 data URI, léger, resize via ImageManipulator).
// Trilingue (en/fr/ar) + dark + RTL + flèche retour. Firestore best-effort.
import ScreenTopBar from '../../components/ScreenTopBar';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity,
  ActivityIndicator, TextInput, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ArrowLeft, Send, ImagePlus, Clock, CheckCircle2, Trash2, X } from 'lucide-react-native';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign, flipForRTL } from '../../lib/rtl';
import {
  createListing, myListings, markSold, removeListing,
  LISTING_CATEGORIES, ListingCategory, MarketplaceListing,
} from '../../lib/marketplace';

const PRIMARY = Colors.light.primary;

const CAT_EMOJI: Record<ListingCategory, string> = {
  meal: '🍱', coaching: '🧑‍🏫', gear: '🏋️', produce: '🥦', service: '🛠️', other: '📦',
};

const TXT: Record<string, any> = {
  en: {
    title: 'Publish a listing',
    formSub: 'Share something with the community. It will be reviewed before going public.',
    titleField: 'Title', titlePh: 'e.g. Homemade healthy meal prep',
    description: 'Description', descriptionPh: 'Describe what you offer',
    category: 'Category',
    price: 'Price (MAD)', pricePh: '0 = free',
    place: 'Place (optional)', placePh: 'e.g. Casablanca, Maârif',
    photo: 'Photo (optional)', addPhoto: 'Add a photo', changePhoto: 'Change photo', removePhoto: 'Remove',
    submit: 'Publish listing', submitting: 'Publishing...',
    submitted: 'Listing submitted — waiting for moderation.',
    needTitle: 'Please enter a title.',
    error: 'Something went wrong. Please try again.',
    mine: 'My listings',
    mineEmpty: 'You have no listings yet.',
    markSold: 'Mark sold', remove: 'Remove',
    free: 'Free',
    statusActive: 'Active', statusSold: 'Sold', statusRemoved: 'Removed', pending: 'Pending review',
    cats: { meal: 'Meals', coaching: 'Coaching', gear: 'Gear', produce: 'Produce', service: 'Service', other: 'Other' },
  },
  fr: {
    title: 'Publier une annonce',
    formSub: 'Partage quelque chose avec la communauté. Ce sera vérifié avant publication.',
    titleField: 'Titre', titlePh: 'ex. Repas maison équilibré prêt à emporter',
    description: 'Description', descriptionPh: 'Décris ce que tu proposes',
    category: 'Catégorie',
    price: 'Prix (MAD)', pricePh: '0 = gratuit',
    place: 'Lieu (optionnel)', placePh: 'ex. Casablanca, Maârif',
    photo: 'Photo (optionnelle)', addPhoto: 'Ajouter une photo', changePhoto: 'Changer la photo', removePhoto: 'Retirer',
    submit: "Publier l'annonce", submitting: 'Publication...',
    submitted: 'Annonce soumise — en attente de modération.',
    needTitle: 'Merci de saisir un titre.',
    error: 'Une erreur est survenue. Réessaie.',
    mine: 'Mes annonces',
    mineEmpty: "Tu n'as pas encore d'annonce.",
    markSold: 'Marquer vendu', remove: 'Retirer',
    free: 'Gratuit',
    statusActive: 'Active', statusSold: 'Vendue', statusRemoved: 'Retirée', pending: 'En attente',
    cats: { meal: 'Repas', coaching: 'Coaching', gear: 'Matériel', produce: 'Produits', service: 'Service', other: 'Autre' },
  },
  ar: {
    title: 'نشر إعلان',
    formSub: 'شارك شيئاً مع المجتمع. ستتم مراجعته قبل نشره.',
    titleField: 'العنوان', titlePh: 'مثال: وجبة منزلية صحية جاهزة',
    description: 'الوصف', descriptionPh: 'صف ما تقدمه',
    category: 'الفئة',
    price: 'السعر (درهم)', pricePh: '0 = مجاني',
    place: 'المكان (اختياري)', placePh: 'مثال: الدار البيضاء، المعاريف',
    photo: 'صورة (اختيارية)', addPhoto: 'إضافة صورة', changePhoto: 'تغيير الصورة', removePhoto: 'إزالة',
    submit: 'نشر الإعلان', submitting: 'جارٍ النشر...',
    submitted: 'تم إرسال الإعلان — في انتظار المراجعة.',
    needTitle: 'يرجى إدخال عنوان.',
    error: 'حدث خطأ ما. حاول مرة أخرى.',
    mine: 'إعلاناتي',
    mineEmpty: 'ليس لديك إعلانات بعد.',
    markSold: 'وُضع كمباع', remove: 'إزالة',
    free: 'مجاني',
    statusActive: 'نشط', statusSold: 'مباع', statusRemoved: 'مُزال', pending: 'قيد المراجعة',
    cats: { meal: 'وجبات', coaching: 'تدريب', gear: 'معدات', produce: 'منتجات', service: 'خدمة', other: 'أخرى' },
  },
};

export default function ListingCreateScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const email = user?.primaryEmailAddress?.emailAddress || '';

  // Form state
  const [listingTitle, setListingTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ListingCategory>('meal');
  const [price, setPrice] = useState('');
  const [place, setPlace] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  // Mes annonces
  const [mine, setMine] = useState<MarketplaceListing[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const align = txtAlign(isRTL);
  const dir = rowDir(isRTL);

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const tok = useTokens();
  const bg = tok.bg;
  const field = isDark ? Colors.dark.gray[100] : Colors.light.gray[100];

  const loadMine = useCallback(async () => {
    if (!email) { setLoadingMine(false); return; }
    setLoadingMine(true);
    try {
      const rows = await myListings(email);
      setMine(rows);
    } catch (e) {
      console.warn('[listing-create] loadMine failed', e);
    } finally {
      setLoadingMine(false);
    }
  }, [email]);

  useEffect(() => { loadMine(); }, [loadMine]);

  const pickImage = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7,
      });
      if (res.canceled || !res.assets?.[0]?.uri) return;
      // Resize + compress → data URI léger (pas de dépendance à un bucket Storage).
      const m = await ImageManipulator.manipulateAsync(
        res.assets[0].uri,
        [{ resize: { width: 800 } }],
        { base64: true, compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
      );
      if (m.base64) setImageUrl(`data:image/jpeg;base64,${m.base64}`);
    } catch (e) {
      console.warn('[listing-create] pickImage failed', e);
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    setFormErr(null);
    setSubmitted(false);
    if (!listingTitle.trim()) { setFormErr(t.needTitle); return; }
    setSubmitting(true);
    try {
      const id = await createListing(email, {
        title: listingTitle.trim(),
        description: description.trim(),
        category,
        price: parseFloat(price.replace(',', '.')) || 0,
        placeName: place.trim(),
        imageUrl,
      });
      if (id) {
        setSubmitted(true);
        setListingTitle(''); setDescription(''); setPrice(''); setPlace('');
        setCategory('meal'); setImageUrl(undefined);
        loadMine();
      } else {
        setFormErr(t.error);
      }
    } catch (e) {
      console.warn('[listing-create] submit failed', e);
      setFormErr(t.error);
    } finally {
      setSubmitting(false);
    }
  };

  const onMarkSold = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const r = await markSold(email, id);
      if (r.ok) setMine((cur) => cur.map((l) => (l.id === id ? { ...l, status: 'sold' } : l)));
    } finally { setBusyId(null); }
  };

  const onRemove = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const r = await removeListing(email, id);
      if (r.ok) setMine((cur) => cur.map((l) => (l.id === id ? { ...l, status: 'removed' } : l)));
    } finally { setBusyId(null); }
  };

  const priceLabel = (l: MarketplaceListing) => (l.price > 0 ? `${l.price} MAD` : t.free);
  const statusLabel = (l: MarketplaceListing) =>
    l.status === 'sold' ? t.statusSold : l.status === 'removed' ? t.statusRemoved
      : !l.approved ? t.pending : t.statusActive;
  const statusColor = (l: MarketplaceListing) =>
    l.status === 'sold' ? '#f59e0b' : l.status === 'removed' ? '#ef4444'
      : !l.approved ? Colors.light.secondary : '#22c55e';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar />
      {/* Header */}
      <View style={[styles.header, { flexDirection: dir }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[styles.backBtn, { backgroundColor: card }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={text} style={flipForRTL(isRTL)} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>{t.title}</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* FORMULAIRE */}
        <View style={[styles.sectionCard, { backgroundColor: card }]}>
          <Text style={[styles.sectionSub, { color: sub, textAlign: align }]}>{t.formSub}</Text>

          <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.titleField}</Text>
          <TextInput
            value={listingTitle} onChangeText={setListingTitle}
            placeholder={t.titlePh} placeholderTextColor={sub}
            style={[styles.input, { color: text, backgroundColor: field, textAlign: align }]}
          />

          <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.description}</Text>
          <TextInput
            value={description} onChangeText={setDescription}
            placeholder={t.descriptionPh} placeholderTextColor={sub}
            multiline
            style={[styles.input, styles.inputMulti, { color: text, backgroundColor: field, textAlign: align }]}
          />

          {/* Catégorie */}
          <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.category}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {LISTING_CATEGORIES.map((c) => {
              const active = category === c;
              return (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, { backgroundColor: active ? PRIMARY : field }]}
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

          {/* Prix + Lieu */}
          <View style={[styles.twoCol, { flexDirection: dir }]}>
            <View style={styles.col}>
              <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.price}</Text>
              <TextInput
                value={price} onChangeText={setPrice}
                keyboardType="numeric" placeholder={t.pricePh} placeholderTextColor={sub}
                style={[styles.input, { color: text, backgroundColor: field, textAlign: align }]}
              />
            </View>
            <View style={styles.col}>
              <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.place}</Text>
              <TextInput
                value={place} onChangeText={setPlace}
                placeholder={t.placePh} placeholderTextColor={sub}
                style={[styles.input, { color: text, backgroundColor: field, textAlign: align }]}
              />
            </View>
          </View>

          {/* Photo optionnelle */}
          <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.photo}</Text>
          {imageUrl ? (
            <View>
              <Image source={{ uri: imageUrl }} style={styles.preview} resizeMode="cover" />
              <View style={[styles.photoActions, { flexDirection: dir }]}>
                <TouchableOpacity style={[styles.photoBtn, { flexDirection: dir, backgroundColor: field }]} onPress={pickImage} activeOpacity={0.85}>
                  <ImagePlus size={16} color={PRIMARY} />
                  <Text style={[styles.photoBtnTxt, { color: text }]}>{t.changePhoto}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.photoBtn, { flexDirection: dir, backgroundColor: field }]} onPress={() => setImageUrl(undefined)} activeOpacity={0.85}>
                  <X size={16} color="#ef4444" />
                  <Text style={[styles.photoBtnTxt, { color: text }]}>{t.removePhoto}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={[styles.addPhotoBtn, { flexDirection: dir, borderColor: PRIMARY }]} onPress={pickImage} activeOpacity={0.85}>
              <ImagePlus size={18} color={PRIMARY} />
              <Text style={styles.addPhotoTxt}>{t.addPhoto}</Text>
            </TouchableOpacity>
          )}

          {formErr && <Text style={[styles.errTxt, { textAlign: align }]}>{formErr}</Text>}
          {submitted && (
            <View style={[styles.okBox, { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight }]}>
              <Clock size={16} color={PRIMARY} />
              <Text style={[styles.okTxt, { textAlign: align }]}>{t.submitted}</Text>
            </View>
          )}

          <TouchableOpacity style={[styles.submitBtn, { flexDirection: dir }]} onPress={onSubmit} disabled={submitting} activeOpacity={0.85}>
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : (<><Send size={18} color="#fff" /><Text style={styles.submitTxt}>{t.submit}</Text></>)}
          </TouchableOpacity>
        </View>

        {/* MES ANNONCES */}
        <Text style={[styles.listTitle, { color: text, textAlign: align }]}>{t.mine}</Text>
        {loadingMine ? (
          <View style={styles.loadingBox}><ActivityIndicator size="large" color={PRIMARY} /></View>
        ) : mine.length === 0 ? (
          <Text style={[styles.emptySub, { color: sub, textAlign: align }]}>{t.mineEmpty}</Text>
        ) : (
          mine.map((l) => (
            <View key={l.id} style={[styles.mineCard, { backgroundColor: card }]}>
              <View style={[styles.mineTop, { flexDirection: dir }]}>
                {l.imageUrl ? (
                  <Image source={{ uri: l.imageUrl }} style={styles.mineThumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.mineThumb, styles.mineThumbPh, { backgroundColor: field }]}>
                    <Text style={{ fontSize: 22 }}>{CAT_EMOJI[l.category]}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.mineName, { color: text, textAlign: align }]} numberOfLines={1}>{l.title}</Text>
                  <Text style={[styles.mineMeta, { color: sub, textAlign: align }]} numberOfLines={1}>
                    {priceLabel(l)}{l.placeName ? ` · ${l.placeName}` : ''}
                  </Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(l) + '22' }]}>
                  <Text style={[styles.statusTxt, { color: statusColor(l) }]}>{statusLabel(l)}</Text>
                </View>
              </View>
              {l.status === 'active' && (
                <View style={[styles.mineActions, { flexDirection: dir }]}>
                  <TouchableOpacity
                    style={[styles.mineActBtn, { flexDirection: dir, backgroundColor: field }]}
                    disabled={busyId === l.id}
                    onPress={() => onMarkSold(l.id)}
                    activeOpacity={0.85}
                  >
                    <CheckCircle2 size={15} color="#f59e0b" />
                    <Text style={[styles.mineActTxt, { color: text }]}>{t.markSold}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.mineActBtn, { flexDirection: dir, backgroundColor: field }]}
                    disabled={busyId === l.id}
                    onPress={() => onRemove(l.id)}
                    activeOpacity={0.85}
                  >
                    <Trash2 size={15} color="#ef4444" />
                    <Text style={[styles.mineActTxt, { color: text }]}>{t.remove}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (isDark: boolean) => StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 },
  sectionCard: { borderRadius: 18, padding: 16, marginBottom: 18 },
  sectionSub: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 12 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputMulti: { minHeight: 80, textAlignVertical: 'top' },
  chipsRow: { gap: 8, paddingVertical: 2, paddingBottom: 4 },
  chip: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  chipTxt: { fontSize: 13, fontWeight: '800' },
  twoCol: { gap: 12 },
  col: { flex: 1 },
  preview: { width: '100%', height: 170, borderRadius: 12 },
  photoActions: { gap: 10, marginTop: 8 },
  photoBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10 },
  photoBtnTxt: { fontSize: 13, fontWeight: '700' },
  addPhotoBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingVertical: 14 },
  addPhotoTxt: { color: PRIMARY, fontSize: 14, fontWeight: '800' },
  errTxt: { color: '#ef4444', fontSize: 13, fontWeight: '700', marginTop: 12 },
  okBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginTop: 12 },
  okTxt: { flex: 1, color: PRIMARY, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  submitBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  submitTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  listTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3, marginTop: 4, marginBottom: 10 },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  emptySub: { fontSize: 14, lineHeight: 20, paddingVertical: 8 },
  mineCard: { borderRadius: 16, padding: 12, marginBottom: 10 },
  mineTop: { alignItems: 'center', gap: 12 },
  mineThumb: { width: 52, height: 52, borderRadius: 10 },
  mineThumbPh: { alignItems: 'center', justifyContent: 'center' },
  mineName: { fontSize: 15, fontWeight: '800' },
  mineMeta: { fontSize: 12, marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusTxt: { fontSize: 11, fontWeight: '800' },
  mineActions: { gap: 10, marginTop: 10 },
  mineActBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, paddingVertical: 10 },
  mineActTxt: { fontSize: 13, fontWeight: '700' },
});

// Réserver un terrain : liste des terrains approuvés, affichage des créneaux déjà réservés,
// réservation d'un nouveau créneau avec détection de conflit, et proposition d'un terrain
// (modération admin). Firestore best-effort.
import ScreenTopBar from '../../components/ScreenTopBar';
import { a11y } from '../../lib/a11y';
import { useTokens } from '../../constants/tokens';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import {
  ArrowLeft, MapPin, Plus, Send, Clock, CalendarRange, ChevronDown, ChevronRight, CheckCircle2,
  Calendar, Pencil, DollarSign,
} from 'lucide-react-native';
import { Input } from '../../components/ui';
import { Colors } from '../../constants/Colors';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign, flipForRTL } from '../../lib/rtl';
import {
  listFields, reserveField, listFieldReservations, proposeField,
  SportField, SportReservation, Sport, SPORTS,
} from '../../lib/groupSports';

const PRIMARY = Colors.light.primary;

const SPORT_EMOJI: Record<Sport, string> = {
  football: '⚽', tennis: '🎾', basketball: '🏀', volleyball: '🏐',
  badminton: '🏸', running: '🏃', padel: '🥎', other: '🤸',
};

const TXT: Record<string, any> = {
  en: {
    title: 'Reserve a field',
    fieldsTitle: 'Approved fields',
    empty: 'No approved field yet. Propose one below!',
    perHour: '/h', reserve: 'Reserve',
    booked: 'Booked slots', noBooked: 'No confirmed slot yet.',
    date: 'Date', datePh: 'YYYY-MM-DD', start: 'Start', end: 'End', timePh: 'HH:MM',
    confirm: 'Confirm reservation', reserving: 'Reserving...',
    reserved: 'Reservation confirmed!', conflict: 'This slot overlaps an existing reservation.',
    needSlot: 'Please enter a valid date and time range.',
    error: 'Something went wrong. Please try again.',
    proposeTitle: 'Propose a field',
    proposeSub: 'Add a field. It will be reviewed before becoming reservable.',
    name: 'Field name', namePh: 'e.g. Riverside courts',
    sports: 'Sports', address: 'Address', addressPh: 'Street, city', price: 'Price / hour (optional)',
    propose: 'Submit field', proposed: 'Field submitted — waiting for moderation.',
    needName: 'Please enter a field name.',
    sportNames: {
      football: 'Football', tennis: 'Tennis', basketball: 'Basketball', volleyball: 'Volleyball',
      badminton: 'Badminton', running: 'Running', padel: 'Padel', other: 'Other',
    },
  },
  fr: {
    title: 'Réserver un terrain',
    fieldsTitle: 'Terrains approuvés',
    empty: 'Aucun terrain approuvé pour le moment. Propose-en un ci-dessous !',
    perHour: '/h', reserve: 'Réserver',
    booked: 'Créneaux réservés', noBooked: 'Aucun créneau confirmé pour le moment.',
    date: 'Date', datePh: 'AAAA-MM-JJ', start: 'Début', end: 'Fin', timePh: 'HH:MM',
    confirm: 'Confirmer la réservation', reserving: 'Réservation...',
    reserved: 'Réservation confirmée !', conflict: 'Ce créneau chevauche une réservation existante.',
    needSlot: 'Merci de saisir une date et une plage horaire valides.',
    error: 'Une erreur est survenue. Réessaie.',
    proposeTitle: 'Proposer un terrain',
    proposeSub: 'Ajoute un terrain. Il sera vérifié avant de devenir réservable.',
    name: 'Nom du terrain', namePh: 'ex. Terrains de la rive',
    sports: 'Sports', address: 'Adresse', addressPh: 'Rue, ville', price: 'Prix / heure (optionnel)',
    propose: 'Soumettre le terrain', proposed: 'Terrain soumis — en attente de modération.',
    needName: 'Merci de saisir un nom de terrain.',
    sportNames: {
      football: 'Football', tennis: 'Tennis', basketball: 'Basketball', volleyball: 'Volley-ball',
      badminton: 'Badminton', running: 'Course', padel: 'Padel', other: 'Autre',
    },
  },
  ar: {
    title: 'حجز ملعب',
    fieldsTitle: 'الملاعب المعتمدة',
    empty: 'لا يوجد ملعب معتمد بعد. اقترح واحداً أدناه!',
    perHour: '/س', reserve: 'حجز',
    booked: 'المواعيد المحجوزة', noBooked: 'لا يوجد موعد مؤكد بعد.',
    date: 'التاريخ', datePh: 'سنة-شهر-يوم', start: 'البداية', end: 'النهاية', timePh: 'سا:دق',
    confirm: 'تأكيد الحجز', reserving: 'جارٍ الحجز...',
    reserved: 'تم تأكيد الحجز!', conflict: 'هذا الموعد يتعارض مع حجز موجود.',
    needSlot: 'يرجى إدخال تاريخ ونطاق زمني صحيحين.',
    error: 'حدث خطأ ما. حاول مرة أخرى.',
    proposeTitle: 'اقترح ملعباً',
    proposeSub: 'أضف ملعباً. ستتم مراجعته قبل أن يصبح قابلاً للحجز.',
    name: 'اسم الملعب', namePh: 'مثال: ملاعب النهر',
    sports: 'الرياضات', address: 'العنوان', addressPh: 'الشارع، المدينة', price: 'السعر / ساعة (اختياري)',
    propose: 'إرسال الملعب', proposed: 'تم إرسال الملعب — في انتظار المراجعة.',
    needName: 'يرجى إدخال اسم الملعب.',
    sportNames: {
      football: 'كرة القدم', tennis: 'التنس', basketball: 'كرة السلة', volleyball: 'الكرة الطائرة',
      badminton: 'الريشة', running: 'الجري', padel: 'بادل', other: 'أخرى',
    },
  },
};

/** Parse "YYYY-MM-DD" + "HH:MM" en timestamp ms (heure locale). null si invalide. */
function parseDateTime(dateStr: string, timeStr: string): number | null {
  const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((dateStr || '').trim());
  const tm = /^(\d{1,2}):(\d{2})$/.exec((timeStr || '').trim());
  if (!dm || !tm) return null;
  const y = +dm[1], mo = +dm[2] - 1, d = +dm[3];
  const h = +tm[1], mi = +tm[2];
  if (mo < 0 || mo > 11 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ts = new Date(y, mo, d, h, mi, 0, 0).getTime();
  return Number.isFinite(ts) ? ts : null;
}

export default function FieldReserveScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(isDark), [isDark]);

  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [fields, setFields] = useState<SportField[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Record<string, SportReservation[]>>({});

  // Formulaire de réservation (par terrain déplié)
  const [rDate, setRDate] = useState('');
  const [rStart, setRStart] = useState('');
  const [rEnd, setREnd] = useState('');
  const [reserving, setReserving] = useState(false);
  const [slotMsg, setSlotMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  // Formulaire "proposer un terrain"
  const [pName, setPName] = useState('');
  const [pSports, setPSports] = useState<Sport[]>(['football']);
  const [pAddress, setPAddress] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [proposing, setProposing] = useState(false);
  const [proposeMsg, setProposeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const align = txtAlign(isRTL);
  const dir = rowDir(isRTL);

  const text = isDark ? '#fff' : Colors.light.gray[900];
  const sub = isDark ? '#9BA1A6' : Colors.light.gray[500];
  const card = isDark ? Colors.dark.card : '#fff';
  const tok = useTokens();
  const bg = tok.bg;
  const field = isDark ? Colors.dark.gray[100] : Colors.light.gray[100];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listFields();
      setFields(rows);
    } catch (e) {
      console.warn('[field-reserve] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleExpand = async (f: SportField) => {
    const open = expanded === f.id;
    setSlotMsg(null);
    setExpanded(open ? null : f.id);
    if (!open && !reservations[f.id]) {
      const list = await listFieldReservations(f.id);
      setReservations((r) => ({ ...r, [f.id]: list }));
    }
  };

  const slotLabel = (r: SportReservation) => {
    try {
      const locale = language === 'ar' ? 'ar' : language === 'fr' ? 'fr-FR' : 'en-US';
      const s = new Date(r.startTs);
      const e = new Date(r.endTs);
      const dayFmt: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
      const timeFmt: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
      return `${s.toLocaleDateString(locale, dayFmt)} · ${s.toLocaleTimeString(locale, timeFmt)} – ${e.toLocaleTimeString(locale, timeFmt)}`;
    } catch {
      return '';
    }
  };

  const onReserve = async (f: SportField) => {
    if (reserving) return;
    setSlotMsg(null);
    const startTs = parseDateTime(rDate, rStart);
    const endTs = parseDateTime(rDate, rEnd);
    if (!startTs || !endTs || endTs <= startTs) {
      setSlotMsg({ id: f.id, ok: false, text: t.needSlot });
      return;
    }
    setReserving(true);
    try {
      const res = await reserveField(email, { fieldId: f.id, startTs, endTs });
      if (res.ok) {
        setSlotMsg({ id: f.id, ok: true, text: t.reserved });
        setRDate(''); setRStart(''); setREnd('');
        const list = await listFieldReservations(f.id);
        setReservations((r) => ({ ...r, [f.id]: list }));
      } else if (res.reason === 'conflict') {
        setSlotMsg({ id: f.id, ok: false, text: t.conflict });
      } else {
        setSlotMsg({ id: f.id, ok: false, text: t.error });
      }
    } finally {
      setReserving(false);
    }
  };

  const togglePSport = (sp: Sport) =>
    setPSports((cur) => (cur.includes(sp) ? cur.filter((s) => s !== sp) : [...cur, sp]));

  const onPropose = async () => {
    if (proposing) return;
    setProposeMsg(null);
    if (!pName.trim()) { setProposeMsg({ ok: false, text: t.needName }); return; }
    setProposing(true);
    try {
      const id = await proposeField(email, {
        name: pName.trim(),
        sport: pSports.length ? pSports : ['other'],
        address: pAddress.trim(),
        pricePerHour: pPrice ? parseFloat(pPrice.replace(',', '.')) : undefined,
      });
      if (id) {
        setProposeMsg({ ok: true, text: t.proposed });
        setPName(''); setPAddress(''); setPPrice(''); setPSports(['football']);
      } else {
        setProposeMsg({ ok: false, text: t.error });
      }
    } catch (e) {
      console.warn('[field-reserve] propose failed', e);
      setProposeMsg({ ok: false, text: t.error });
    } finally {
      setProposing(false);
    }
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.container, { backgroundColor: bg }]}>
      <ScreenTopBar />
      <View style={[styles.header, { flexDirection: dir }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={a11y('retour')} style={[styles.backBtn, { backgroundColor: card }]} onPress={() => router.back()}>
          <ArrowLeft size={22} color={text} style={flipForRTL(isRTL)} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: text }]} numberOfLines={1}>{t.title}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Terrains approuvés */}
        <Text style={[styles.listTitle, { color: text, textAlign: align }]}>{t.fieldsTitle}</Text>
        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator size="large" color={PRIMARY} /></View>
        ) : fields.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: card }]}>
            <CalendarRange size={34} color={isDark ? Colors.dark.gray[300] : Colors.light.gray[300]} />
            <Text style={[styles.emptySub, { color: sub }]}>{t.empty}</Text>
          </View>
        ) : (
          fields.map((f) => {
            const open = expanded === f.id;
            const slots = reservations[f.id] || [];
            return (
              <View key={f.id} style={[styles.fieldCard, { backgroundColor: card }]}>
                <TouchableOpacity style={[styles.fieldRow, { flexDirection: dir }]} activeOpacity={0.85} onPress={() => toggleExpand(f)}>
                  <View style={styles.fieldIcon}><MapPin size={20} color={PRIMARY} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldName, { color: text, textAlign: align }]} numberOfLines={1}>{f.name}</Text>
                    <Text style={[styles.fieldMeta, { color: sub, textAlign: align }]} numberOfLines={1}>
                      {f.sport.map((s) => SPORT_EMOJI[s]).join(' ')}
                      {f.address ? ` · ${f.address}` : ''}
                      {f.pricePerHour ? ` · ${f.pricePerHour}${t.perHour}` : ''}
                    </Text>
                  </View>
                  {open
                    ? <ChevronDown size={20} color={sub} />
                    : <ChevronRight size={20} color={sub} style={flipForRTL(isRTL)} />}
                </TouchableOpacity>

                {open && (
                  <View style={styles.fieldDetail}>
                    {/* Créneaux déjà réservés */}
                    <Text style={[styles.detailLabel, { color: text, textAlign: align }]}>{t.booked}</Text>
                    {slots.length === 0 ? (
                      <Text style={[styles.detailSub, { color: sub, textAlign: align }]}>{t.noBooked}</Text>
                    ) : (
                      slots.map((r) => (
                        <View key={r.id} style={[styles.slotRow, { flexDirection: dir }]}>
                          <Clock size={14} color={sub} />
                          <Text style={[styles.slotTxt, { color: sub, textAlign: align }]}>{slotLabel(r)}</Text>
                        </View>
                      ))
                    )}

                    {/* Réserver un nouveau créneau */}
                    <Text style={[styles.detailLabel, { color: text, textAlign: align, marginTop: 14 }]}>{t.reserve}</Text>
                    <Input
                      label={t.date}
                      icon={<Calendar size={18} color={sub} />}
                      value={rDate} onChangeText={setRDate}
                      placeholder={t.datePh}
                    />
                    <View style={[styles.twoCol, { flexDirection: dir }]}>
                      <View style={styles.col}>
                        <Input
                          label={t.start}
                          icon={<Clock size={18} color={sub} />}
                          value={rStart} onChangeText={setRStart}
                          placeholder={t.timePh}
                        />
                      </View>
                      <View style={styles.col}>
                        <Input
                          label={t.end}
                          icon={<Clock size={18} color={sub} />}
                          value={rEnd} onChangeText={setREnd}
                          placeholder={t.timePh}
                        />
                      </View>
                    </View>

                    {slotMsg && slotMsg.id === f.id && (
                      <Text style={[slotMsg.ok ? styles.okTxt : styles.errTxt, { textAlign: align }]}>{slotMsg.text}</Text>
                    )}

                    <TouchableOpacity
                      style={[styles.submitBtn, { flexDirection: dir }]}
                      onPress={() => onReserve(f)}
                      disabled={reserving}
                      activeOpacity={0.85}
                    >
                      {reserving
                        ? <ActivityIndicator size="small" color="#fff" />
                        : (<><CheckCircle2 size={18} color="#fff" /><Text style={styles.submitTxt}>{t.confirm}</Text></>)}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}

        {/* Proposer un terrain (modération admin) */}
        <View style={[styles.sectionCard, { backgroundColor: card, marginTop: 20 }]}>
          <Text style={[styles.sectionTitle, { color: text, textAlign: align }]}>{t.proposeTitle}</Text>
          <Text style={[styles.sectionSub, { color: sub, textAlign: align }]}>{t.proposeSub}</Text>

          <Input
            label={t.name}
            icon={<Pencil size={18} color={sub} />}
            value={pName} onChangeText={setPName}
            placeholder={t.namePh}
          />

          <Text style={[styles.miniLabel, { color: sub, textAlign: align, marginTop: 12 }]}>{t.sports}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            {SPORTS.map((sp) => {
              const active = pSports.includes(sp);
              return (
                <TouchableOpacity
                  key={sp}
                  style={[styles.chip, { backgroundColor: active ? PRIMARY : field }]}
                  activeOpacity={0.85}
                  onPress={() => togglePSport(sp)}
                >
                  <Text style={[styles.chipTxt, { color: active ? '#fff' : text }]}>
                    {SPORT_EMOJI[sp]} {t.sportNames[sp]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={{ marginTop: 12 }}>
            <Input
              label={t.address}
              icon={<MapPin size={18} color={sub} />}
              value={pAddress} onChangeText={setPAddress}
              placeholder={t.addressPh}
            />
          </View>

          <Input
            label={t.price}
            icon={<DollarSign size={18} color={sub} />}
            value={pPrice} onChangeText={setPPrice}
            keyboardType="numeric" placeholder="0"
          />

          {proposeMsg && (
            proposeMsg.ok ? (
              <View style={[styles.okBox, { backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight }]}>
                <Clock size={16} color={PRIMARY} />
                <Text style={[styles.okBoxTxt, { textAlign: align }]}>{proposeMsg.text}</Text>
              </View>
            ) : (
              <Text style={[styles.errTxt, { textAlign: align }]}>{proposeMsg.text}</Text>
            )
          )}

          <TouchableOpacity style={[styles.submitBtn, { flexDirection: dir }]} onPress={onPropose} disabled={proposing} activeOpacity={0.85}>
            {proposing
              ? <ActivityIndicator size="small" color="#fff" />
              : (<><Send size={18} color="#fff" /><Text style={styles.submitTxt}>{t.propose}</Text></>)}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  listTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3, marginBottom: 10 },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  emptyBox: { borderRadius: 18, padding: 26, alignItems: 'center', gap: 12 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  fieldCard: { borderRadius: 16, marginBottom: 10, overflow: 'hidden' },
  fieldRow: { alignItems: 'center', gap: 12, padding: 14 },
  fieldIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? Colors.dark.primaryLight : Colors.light.primaryLight, alignItems: 'center', justifyContent: 'center' },
  fieldName: { fontSize: 16, fontWeight: '800' },
  fieldMeta: { fontSize: 12, marginTop: 3 },
  fieldDetail: { paddingHorizontal: 14, paddingBottom: 14 },
  detailLabel: { fontSize: 14, fontWeight: '800', marginBottom: 6 },
  detailSub: { fontSize: 13, lineHeight: 18 },
  slotRow: { alignItems: 'center', gap: 8, marginBottom: 6 },
  slotTxt: { flex: 1, fontSize: 13, fontWeight: '600' },
  miniLabel: { fontSize: 12.5, fontWeight: '700', marginBottom: 6, marginTop: 8 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, marginBottom: 4 },
  twoCol: { gap: 12 },
  col: { flex: 1 },
  errTxt: { color: '#ef4444', fontSize: 13, fontWeight: '700', marginTop: 10 },
  okTxt: { color: PRIMARY, fontSize: 13, fontWeight: '700', marginTop: 10 },
  submitBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: PRIMARY, borderRadius: 14, paddingVertical: 13, marginTop: 14 },
  submitTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sectionCard: { borderRadius: 18, padding: 16 },
  sectionTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  sectionSub: { fontSize: 13, lineHeight: 18, marginTop: 4, marginBottom: 8 },
  chipsRow: { gap: 8, paddingVertical: 2, paddingBottom: 4 },
  chip: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  chipTxt: { fontSize: 13, fontWeight: '800' },
  okBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginTop: 12 },
  okBoxTxt: { flex: 1, color: PRIMARY, fontSize: 13, fontWeight: '700', lineHeight: 18 },
});

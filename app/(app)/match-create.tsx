// Créer un match de sport de groupe : sport, lieu/terrain, date/heure, durée, capacité.
// Saisie texte (pas de carte/date-picker natif) pour rester léger et cohérent avec les
// autres formulaires de l'app. Firestore best-effort.
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
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import { ArrowLeft, Send, MapPin, Hash, Calendar, Clock, Timer, Users } from 'lucide-react-native';
import { Input } from '../../components/ui';
import { spacing, radius } from '../../constants/theme';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign, flipForRTL } from '../../lib/rtl';
import { createMatch, listFields, Sport, SPORTS, SportField } from '../../lib/groupSports';


const SPORT_EMOJI: Record<Sport, string> = {
  football: '⚽', tennis: '🎾', basketball: '🏀', volleyball: '🏐',
  badminton: '🏸', running: '🏃', padel: '🥎', other: '🤸',
};

const TXT: Record<string, any> = {
  en: {
    title: 'Create a match',
    sport: 'Sport',
    titleField: 'Title (optional)', titlePh: 'e.g. Sunday 5-a-side',
    place: 'Place / field', placePh: 'e.g. City stadium, court 3',
    fieldOptional: 'Pick an approved field (optional)', noField: 'Free place',
    date: 'Date', datePh: 'YYYY-MM-DD',
    time: 'Time', timePh: 'HH:MM',
    duration: 'Duration (min)', capacity: 'Capacity (players)',
    submit: 'Create match', submitting: 'Creating...',
    needPlace: 'Please enter a place or pick a field.',
    needDate: 'Please enter a valid date and time.',
    error: 'Something went wrong. Please try again.',
    sports: {
      football: 'Football', tennis: 'Tennis', basketball: 'Basketball', volleyball: 'Volleyball',
      badminton: 'Badminton', running: 'Running', padel: 'Padel', other: 'Other',
    },
  },
  fr: {
    title: 'Créer un match',
    sport: 'Sport',
    titleField: 'Titre (optionnel)', titlePh: 'ex. Foot du dimanche',
    place: 'Lieu / terrain', placePh: 'ex. Stade municipal, court 3',
    fieldOptional: 'Choisir un terrain approuvé (optionnel)', noField: 'Lieu libre',
    date: 'Date', datePh: 'AAAA-MM-JJ',
    time: 'Heure', timePh: 'HH:MM',
    duration: 'Durée (min)', capacity: 'Capacité (joueurs)',
    submit: 'Créer le match', submitting: 'Création...',
    needPlace: 'Merci de saisir un lieu ou de choisir un terrain.',
    needDate: 'Merci de saisir une date et une heure valides.',
    error: 'Une erreur est survenue. Réessaie.',
    sports: {
      football: 'Football', tennis: 'Tennis', basketball: 'Basketball', volleyball: 'Volley-ball',
      badminton: 'Badminton', running: 'Course', padel: 'Padel', other: 'Autre',
    },
  },
  ar: {
    title: 'إنشاء مباراة',
    sport: 'الرياضة',
    titleField: 'العنوان (اختياري)', titlePh: 'مثال: كرة الأحد',
    place: 'المكان / الملعب', placePh: 'مثال: الملعب البلدي، الملعب 3',
    fieldOptional: 'اختر ملعباً معتمداً (اختياري)', noField: 'مكان حر',
    date: 'التاريخ', datePh: 'سنة-شهر-يوم',
    time: 'الوقت', timePh: 'سا:دق',
    duration: 'المدة (دقيقة)', capacity: 'السعة (لاعبون)',
    submit: 'إنشاء المباراة', submitting: 'جارٍ الإنشاء...',
    needPlace: 'يرجى إدخال مكان أو اختيار ملعب.',
    needDate: 'يرجى إدخال تاريخ ووقت صحيحين.',
    error: 'حدث خطأ ما. حاول مرة أخرى.',
    sports: {
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

export default function MatchCreateScreen() {
  const { user } = useUser();
  const { resolved } = useTheme();
  const k = useTokens();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const styles = useMemo(() => makeStyles(k), [k]);
  const params = useLocalSearchParams<{ fieldId?: string }>();

  const email = user?.primaryEmailAddress?.emailAddress || '';

  const [sport, setSport] = useState<Sport>('football');
  const [matchTitle, setMatchTitle] = useState('');
  const [place, setPlace] = useState('');
  const [fieldId, setFieldId] = useState<string | undefined>(undefined);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('60');
  const [capacity, setCapacity] = useState('10');
  const [fields, setFields] = useState<SportField[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const align = txtAlign(isRTL);
  const dir = rowDir(isRTL);

  const text = k.text;
  const sub = k.textMuted;
  const card = k.surface;
  const tok = useTokens();
  const bg = tok.bg;
  const field = k.border;

  // Charge les terrains approuvés du sport sélectionné (pour le sélecteur optionnel).
  const loadFields = useCallback(async (sp: Sport) => {
    try {
      const rows = await listFields({ sport: sp });
      setFields(rows);
    } catch {
      setFields([]);
    }
  }, []);

  useEffect(() => { loadFields(sport); }, [sport, loadFields]);

  // Pré-sélection d'un terrain passé en paramètre (depuis field-reserve).
  useEffect(() => {
    if (params?.fieldId && typeof params.fieldId === 'string') setFieldId(params.fieldId);
  }, [params?.fieldId]);

  const onSubmit = async () => {
    if (submitting) return;
    setFormErr(null);
    const selectedField = fields.find((f) => f.id === fieldId);
    const placeName = (place.trim() || selectedField?.name || '').trim();
    if (!placeName) { setFormErr(t.needPlace); return; }
    const dateTs = parseDateTime(date, time);
    if (!dateTs) { setFormErr(t.needDate); return; }

    setSubmitting(true);
    try {
      const id = await createMatch(email, {
        sport,
        title: matchTitle.trim(),
        fieldId,
        placeName,
        lat: selectedField?.lat,
        lng: selectedField?.lng,
        dateTs,
        durationMin: parseInt(duration, 10) || 60,
        capacity: parseInt(capacity, 10) || 2,
      });
      if (id) {
        router.back();
      } else {
        setFormErr(t.error);
      }
    } catch (e) {
      console.warn('[match-create] submit failed', e);
      setFormErr(t.error);
    } finally {
      setSubmitting(false);
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
        {/* Sport */}
        <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.sport}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {SPORTS.map((sp) => {
            const active = sport === sp;
            return (
              <TouchableOpacity
                key={sp}
                style={[styles.chip, { backgroundColor: active ? k.accent : field }]}
                activeOpacity={0.85}
                onPress={() => setSport(sp)}
              >
                <Text style={[styles.chipTxt, { color: active ? k.onAccent : text }]}>
                  {SPORT_EMOJI[sp]} {t.sports[sp]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Titre */}
        <Input
          label={t.titleField}
          icon={<Hash size={18} color={sub} />}
          value={matchTitle} onChangeText={setMatchTitle}
          placeholder={t.titlePh}
        />

        {/* Terrain approuvé (optionnel) */}
        {fields.length > 0 && (
          <>
            <Text style={[styles.label, { color: sub, textAlign: align }]}>{t.fieldOptional}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: !fieldId ? k.accent : field }]}
                activeOpacity={0.85}
                onPress={() => setFieldId(undefined)}
              >
                <Text style={[styles.chipTxt, { color: !fieldId ? k.onAccent : text }]}>{t.noField}</Text>
              </TouchableOpacity>
              {fields.map((f) => {
                const active = fieldId === f.id;
                return (
                  <TouchableOpacity
                    key={f.id}
                    style={[styles.chip, { flexDirection: dir, gap: 5, backgroundColor: active ? k.accent : field }]}
                    activeOpacity={0.85}
                    onPress={() => setFieldId(f.id)}
                  >
                    <MapPin size={13} color={active ? k.onAccent : k.accent} />
                    <Text style={[styles.chipTxt, { color: active ? k.onAccent : text }]} numberOfLines={1}>{f.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </>
        )}

        {/* Lieu libre */}
        <Input
          label={t.place}
          icon={<MapPin size={18} color={sub} />}
          value={place} onChangeText={setPlace}
          placeholder={t.placePh}
        />

        {/* Date + Heure */}
        <View style={[styles.twoCol, { flexDirection: dir }]}>
          <View style={styles.col}>
            <Input
              label={t.date}
              icon={<Calendar size={18} color={sub} />}
              value={date} onChangeText={setDate}
              placeholder={t.datePh}
            />
          </View>
          <View style={styles.col}>
            <Input
              label={t.time}
              icon={<Clock size={18} color={sub} />}
              value={time} onChangeText={setTime}
              placeholder={t.timePh}
            />
          </View>
        </View>

        {/* Durée + Capacité */}
        <View style={[styles.twoCol, { flexDirection: dir }]}>
          <View style={styles.col}>
            <Input
              label={t.duration}
              icon={<Timer size={18} color={sub} />}
              value={duration} onChangeText={setDuration}
              keyboardType="numeric" placeholder="60"
            />
          </View>
          <View style={styles.col}>
            <Input
              label={t.capacity}
              icon={<Users size={18} color={sub} />}
              value={capacity} onChangeText={setCapacity}
              keyboardType="numeric" placeholder="10"
            />
          </View>
        </View>

        {formErr && <Text style={[styles.errTxt, { textAlign: align }]}>{formErr}</Text>}

        <TouchableOpacity style={[styles.submitBtn, { flexDirection: dir }]} onPress={onSubmit} disabled={submitting} activeOpacity={0.85}>
          {submitting
            ? <ActivityIndicator size="small" color={k.onAccent} />
            : (<><Send size={18} color={k.onAccent} /><Text style={styles.submitTxt}>{t.submit}</Text></>)}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// Style de chip consolidé (row sport + row terrain) : une seule source alignée sur les
// tokens (radius.lg, spacing) avec hauteur tactile minimale de 44px. Réutilisable tel
// quel si une puce partagée est extraite entre match-create et field-reserve.
const CHIP: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.sm,
  borderRadius: radius.lg,
};

// Fabrique thémée : un StyleSheet est évalué au chargement du module, où `isDark`
// n'existe pas. Le composant l'appelle via useMemo, recalculé au changement de thème.
const makeStyles = (k: Tokens) => StyleSheet.create({
  container: { flex: 1 },
  header: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  backBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 60 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 14 },
  input: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  chipsRow: { gap: 8, paddingVertical: 2, paddingBottom: 4 },
  chip: CHIP,
  chipTxt: { fontSize: 13, fontWeight: '800' },
  twoCol: { gap: 12 },
  col: { flex: 1 },
  errTxt: { color: k.danger, fontSize: 13, fontWeight: '700', marginTop: 14 },
  submitBtn: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: k.accent, borderRadius: 14, paddingVertical: 14, marginTop: 20 },
  submitTxt: { color: k.onAccent, fontSize: 15, fontWeight: '800' },
});

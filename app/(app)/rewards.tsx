import React, { useEffect, useState } from 'react';
import { useTokens } from '../../constants/tokens';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Gift, Coffee, Dumbbell, ShoppingBasket, Lock, Check, Ticket } from 'lucide-react-native';
import ScreenTopBar from '../../components/ScreenTopBar';
import { useTheme } from '../../lib/ThemeContext';
import { useTranslation } from '../../lib/i18n';
import { rowDir, txtAlign } from '../../lib/rtl';
import { REWARDS, Reward, getTotalKm, unlockable, kmRemaining, getGeneratedCodes, generateCode } from '../../lib/rewards';

const TXT: any = {
  en: {
    title: 'Local rewards',
    sub: 'Turn your kilometers into perks at local partners. Walk, run — then claim your voucher in store.',
    distance: 'Your cumulative distance',
    km: 'km',
    unlocked: 'Unlocked',
    locked: 'Locked',
    leftToUnlock: 'left to unlock',
    getCode: 'Get the code',
    yourCode: 'Your voucher code',
    partnerNote: 'Show this code to the partner staff. Demo voucher — no payment, validated in store.',
  },
  fr: {
    title: 'Récompenses locales',
    sub: 'Transforme tes kilomètres en avantages chez des partenaires locaux. Marche, cours — puis récupère ton bon en boutique.',
    distance: 'Ta distance cumulée',
    km: 'km',
    unlocked: 'Débloqué',
    locked: 'Verrouillé',
    leftToUnlock: 'avant de débloquer',
    getCode: 'Obtenir le code',
    yourCode: 'Ton code de bon',
    partnerNote: 'Présente ce code chez le partenaire. Bon de démonstration — sans paiement, validé en boutique.',
  },
  ar: {
    title: 'مكافآت محلية',
    sub: 'حوّل كيلومتراتك إلى امتيازات لدى شركاء محليين. امشِ، اركض — ثم احصل على قسيمتك في المتجر.',
    distance: 'مسافتك التراكمية',
    km: 'كلم',
    unlocked: 'مفتوح',
    locked: 'مقفل',
    leftToUnlock: 'لفتح المكافأة',
    getCode: 'احصل على الرمز',
    yourCode: 'رمز قسيمتك',
    partnerNote: 'اعرض هذا الرمز لدى الشريك. قسيمة تجريبية — بدون دفع، تُفعَّل في المتجر.',
  },
};

const CAT_ICON: Record<Reward['category'], any> = { cafe: Coffee, gym: Dumbbell, grocery: ShoppingBasket };

export default function Rewards() {
  const { colors, resolved } = useTheme();
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language] || TXT.en;
  const isDark = resolved === 'dark';
  const GREEN = colors.primary;
  const tok = useTokens();
  const bg = tok.bg;
  const card = tok.surface;
  const text = tok.text;
  const sub = tok.textMuted;
  const lockTint = isDark ? '#334155' : '#94a3b8';
  const codeBg = isDark ? '#14331f' : '#EAF4EE';
  const align: any = { textAlign: txtAlign(isRTL) };
  const L = (o: { en: string; fr: string; ar: string }) => o[language as 'en' | 'fr' | 'ar'] || o.en;

  const [loading, setLoading] = useState(true);
  const [km, setKm] = useState(0);
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    Promise.all([getTotalKm(), getGeneratedCodes()])
      .then(([v, c]) => { if (alive) { setKm(v); setCodes(c); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const onGetCode = async (id: string) => {
    const code = await generateCode(id);
    setCodes((prev) => ({ ...prev, [id]: code }));
  };

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: bg }]}>
      <ScreenTopBar showBack showBrand showNotif={false} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={[s.head, { flexDirection: rowDir(isRTL) }]}>
          <Gift size={26} color={GREEN} />
          <Text style={[s.title, { color: text }, align]}>{t.title}</Text>
        </View>
        <Text style={[s.sub, { color: sub }, align]}>{t.sub}</Text>

        {loading ? (
          <ActivityIndicator color={GREEN} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Distance cumulée */}
            <View style={[s.card, { backgroundColor: card }]}>
              <Text style={[s.kmLabel, { color: sub }, align]}>{t.distance}</Text>
              <View style={[s.kmRow, { flexDirection: rowDir(isRTL) }]}>
                <Text style={[s.kmValue, { color: GREEN }]}>{km.toFixed(1)}</Text>
                <Text style={[s.kmUnit, { color: sub }]}>{t.km}</Text>
              </View>
            </View>

            {/* Liste des bons */}
            {REWARDS.map((r) => {
              const open = unlockable(r, km);
              const remain = kmRemaining(r, km);
              const Icon = CAT_ICON[r.category];
              const code = codes[r.id];
              return (
                <View key={r.id} style={[s.card, { backgroundColor: card, opacity: open ? 1 : 0.92 }]}>
                  <View style={[s.rewardTop, { flexDirection: rowDir(isRTL) }]}>
                    <View style={[s.iconWrap, { backgroundColor: open ? 'rgba(46,139,87,0.12)' : (isDark ? '#0f1419' : '#f1f5f9') }]}>
                      <Icon size={22} color={open ? GREEN : lockTint} />
                    </View>
                    <View style={s.rewardInfo}>
                      <Text style={[s.partner, { color: text }, align]}>{r.emoji} {L(r.partner)}</Text>
                      <Text style={[s.offer, { color: sub }, align]}>{L(r.offer)}</Text>
                    </View>
                  </View>

                  {/* Statut : débloqué / verrouillé + km restants */}
                  <View style={[s.statusRow, { flexDirection: rowDir(isRTL) }]}>
                    {open ? (
                      <View style={[s.badge, { backgroundColor: 'rgba(46,139,87,0.14)', flexDirection: rowDir(isRTL) }]}>
                        <Check size={13} color={GREEN} />
                        <Text style={[s.badgeTxt, { color: GREEN }]}>{t.unlocked}</Text>
                      </View>
                    ) : (
                      <View style={[s.badge, { backgroundColor: isDark ? '#0f1419' : '#f1f5f9', flexDirection: rowDir(isRTL) }]}>
                        <Lock size={13} color={lockTint} />
                        <Text style={[s.badgeTxt, { color: lockTint }]}>{r.kmRequired} {t.km}</Text>
                      </View>
                    )}
                    {!open && (
                      <Text style={[s.remain, { color: sub }]}>{remain.toFixed(1)} {t.km} {t.leftToUnlock}</Text>
                    )}
                  </View>

                  {/* Action / code (débloqués seulement) */}
                  {open && (
                    code ? (
                      <View style={[s.codeBox, { backgroundColor: codeBg }]}>
                        <View style={[s.codeHead, { flexDirection: rowDir(isRTL) }]}>
                          <Ticket size={16} color={GREEN} />
                          <Text style={[s.codeLabel, { color: GREEN }, align]}>{t.yourCode}</Text>
                        </View>
                        <Text style={[s.code, { color: text }]} selectable>{code}</Text>
                        <Text style={[s.note, { color: sub }, align]}>{t.partnerNote}</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[s.getBtn, { backgroundColor: GREEN, flexDirection: rowDir(isRTL) }]}
                        activeOpacity={0.85}
                        onPress={() => onGetCode(r.id)}
                      >
                        <Ticket size={18} color="#fff" />
                        <Text style={s.getTxt}>{t.getCode}</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f3f6f4' },
  body: { padding: 18, paddingBottom: 90 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  title: { fontSize: 26, fontWeight: '800', color: '#1B2A33' },
  sub: { fontSize: 13, color: '#667085', marginTop: 6, lineHeight: 19 },
  card: { borderRadius: 16, padding: 16, marginTop: 14 },
  kmLabel: { fontSize: 13, fontWeight: '600' },
  kmRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 6 },
  kmValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1 },
  kmUnit: { fontSize: 16, fontWeight: '700', marginBottom: 7 },
  rewardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  rewardInfo: { flex: 1, minWidth: 0 },
  partner: { fontSize: 15.5, fontWeight: '800' },
  offer: { fontSize: 13, fontWeight: '600', marginTop: 3, lineHeight: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  badgeTxt: { fontSize: 12, fontWeight: '800' },
  remain: { fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  getBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 13, marginTop: 14 },
  getTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
  codeBox: { borderRadius: 14, padding: 14, marginTop: 14 },
  codeHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  codeLabel: { fontSize: 12.5, fontWeight: '800' },
  code: { fontSize: 24, fontWeight: '900', letterSpacing: 2, color: '#1B2A33', marginTop: 8, textAlign: 'center' },
  note: { fontSize: 11.5, marginTop: 10, lineHeight: 16 },
});

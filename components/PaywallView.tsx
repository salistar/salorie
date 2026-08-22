// Paywall — vue PARTAGÉE entre la fin d'onboarding et l'entrée « Premium » du Profil.
//
// Elle a été extraite parce que le bouton Premium du Profil appelait
// `PurchasesService.showPaywall()`, qui repose sur `PurchasesUI.presentPaywall` : sans
// clé RevenueCat de production ET sans paywall configuré côté dashboard, ce bouton ne
// faisait **rien** — un utilisateur qui refusait à l'onboarding n'avait plus aucun moyen
// de s'abonner. Une seule vue, deux points d'entrée.
//
// Trois règles de conception :
//  1. **S'effacer s'il n'y a rien à vendre.** Sans offering, `onDone()` est appelé tout
//     de suite : zéro régression aujourd'hui, activation automatique le jour où les
//     produits existent — aucun code à retoucher.
//  2. **Sortie évidente.** Google Play exige un moyen clair de refuser. Le lien de sortie
//     est lisible, pas un gris 4 % planqué en bas.
//  3. **Prix jamais reformatés.** `priceString` vient du Store, déjà localisé et dans la
//     bonne devise (MAD au Maroc). Le recalculer serait faux sur la moitié des marchés.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Check, Sparkles, ShieldCheck } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from '../lib/i18n';
import { useTheme } from '../lib/ThemeContext';
import { rowDir, txtAlign } from '../lib/rtl';
import { PurchasesService, type SellablePackage } from '../lib/PurchasesService';
import { FREE_LIMITS } from '../lib/freemium';

const TXT: Record<string, any> = {
  fr: {
    eyebrow: 'Votre plan est prêt',
    title: 'Allez plus loin avec Premium',
    sub: (kcal: string) =>
      `Objectif ${kcal} kcal/jour calculé. Premium vous aide à le tenir.`,
    benefits: [
      { t: 'Scans illimités', s: (n: number) => `Au lieu de ${n} par jour en gratuit` },
      { t: 'Coach IA sans limite', s: (n: number) => `Au lieu de ${n} questions par jour` },
      { t: 'Plans de repas illimités', s: (n: number) => `Au lieu de ${n} par jour` },
      { t: 'Suivi avancé', s: () => 'TDEE adaptatif, jumeau métabolique, analyses détaillées' },
    ],
    trial: (d: number) => `${d} jours d'essai gratuit`,
    thenPrice: (p: string, per: string) => `puis ${p} / ${per}`,
    perMonth: 'mois', perYear: 'an', perWeek: 'semaine', perOther: 'période', lifetime: 'à vie',
    best: 'Meilleure offre',
    cta: 'Commencer l\'essai gratuit',
    ctaNoTrial: 'Passer à Premium',
    skip: 'Continuer gratuitement',
    later: 'Plus tard',
    restore: 'Restaurer mes achats',
    legal: 'Résiliable à tout moment depuis le Play Store. Aucun prélèvement pendant l\'essai.',
    restored: 'Achats restaurés — Premium activé.',
    noRestore: 'Aucun achat à restaurer sur ce compte.',
    failed: 'L\'achat n\'a pas pu aboutir. Réessayez plus tard.',
  },
  en: {
    eyebrow: 'Your plan is ready',
    title: 'Go further with Premium',
    sub: (kcal: string) =>
      `Your ${kcal} kcal/day target is set. Premium helps you hit it.`,
    benefits: [
      { t: 'Unlimited scans', s: (n: number) => `Instead of ${n} per day on free` },
      { t: 'Unlimited AI coach', s: (n: number) => `Instead of ${n} questions per day` },
      { t: 'Unlimited meal plans', s: (n: number) => `Instead of ${n} per day` },
      { t: 'Advanced tracking', s: () => 'Adaptive TDEE, metabolic twin, detailed analytics' },
    ],
    trial: (d: number) => `${d}-day free trial`,
    thenPrice: (p: string, per: string) => `then ${p} / ${per}`,
    perMonth: 'month', perYear: 'year', perWeek: 'week', perOther: 'period', lifetime: 'lifetime',
    best: 'Best value',
    cta: 'Start free trial',
    ctaNoTrial: 'Get Premium',
    skip: 'Continue for free',
    later: 'Maybe later',
    restore: 'Restore purchases',
    legal: 'Cancel anytime in the Play Store. You are not charged during the trial.',
    restored: 'Purchases restored — Premium is active.',
    noRestore: 'No purchase to restore on this account.',
    failed: 'The purchase could not be completed. Please try again later.',
  },
  ar: {
    eyebrow: 'خطتك جاهزة',
    title: 'اذهب أبعد مع بريميوم',
    sub: (kcal: string) => `هدفك ${kcal} سعرة/يوم محسوب. بريميوم يساعدك على الالتزام به.`,
    benefits: [
      { t: 'مسح غير محدود', s: (n: number) => `بدل ${n} في اليوم مجاناً` },
      { t: 'مدرب ذكي بلا حدود', s: (n: number) => `بدل ${n} أسئلة في اليوم` },
      { t: 'خطط وجبات غير محدودة', s: (n: number) => `بدل ${n} في اليوم` },
      { t: 'تتبع متقدم', s: () => 'أيض تكيفي، توأم أيضي، تحليلات مفصلة' },
    ],
    trial: (d: number) => `${d} أيام تجربة مجانية`,
    thenPrice: (p: string, per: string) => `ثم ${p} / ${per}`,
    perMonth: 'شهر', perYear: 'سنة', perWeek: 'أسبوع', perOther: 'فترة', lifetime: 'مدى الحياة',
    best: 'أفضل عرض',
    cta: 'ابدأ التجربة المجانية',
    ctaNoTrial: 'احصل على بريميوم',
    skip: 'المتابعة مجاناً',
    later: 'لاحقاً',
    restore: 'استعادة المشتريات',
    legal: 'يمكنك الإلغاء في أي وقت من متجر Play. لا خصم أثناء التجربة.',
    restored: 'تمت استعادة المشتريات — بريميوم مفعّل.',
    noRestore: 'لا توجد مشتريات لاستعادتها.',
    failed: 'تعذّر إتمام الشراء. حاول لاحقاً.',
  },
};

/** Offres factices du mode aperçu — jamais utilisées hors `?preview=1`. */
const PREVIEW_PACKAGES: SellablePackage[] = [
  { id: 'preview_yearly', priceString: '399,00 MAD', period: 'yearly', trialDays: 7, raw: null },
  { id: 'preview_monthly', priceString: '49,00 MAD', period: 'monthly', trialDays: 0, raw: null },
];

export type PaywallViewProps = {
  /** Appelé après un achat abouti OU un refus — c'est l'appelant qui décide de la suite. */
  onDone: () => void;
  /** Objectif calorique, pour personnaliser l'accroche (vide = accroche générique). */
  kcal?: string;
  /** Offres factices, achat neutralisé. Réservé à la validation visuelle. */
  preview?: boolean;
  /** Change le libellé de sortie : fin d'onboarding vs consultation depuis le Profil. */
  context?: 'onboarding' | 'app';
};

export default function PaywallView({ onDone, kcal = '', preview = false, context = 'onboarding' }: PaywallViewProps) {
  const { language, isRTL } = useTranslation() as any;
  const t = TXT[language as string] || TXT.en;
  const { colors, resolved } = useTheme();
  const isDark = resolved === 'dark';


  const [pkgs, setPkgs] = useState<SellablePackage[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Un seul commit+navigation possible, quelle que soit la voie (achat, skip, auto-skip).
  const leavingRef = useRef(false);

  const C = {
    bg: isDark ? '#0f1419' : '#F8FAFC',
    card: isDark ? colors.card : '#fff',
    border: isDark ? '#2d3543' : '#E2E8F0',
    title: isDark ? '#fff' : '#1E293B',
    sub: isDark ? '#9BA1A6' : '#64748B',
    accent: isDark ? '#4ade80' : colors.primary,
  };

  const leave = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    onDone();
  }, [onDone]);

  // Chargement des offres. Rien à vendre → on s'efface immédiatement.
  // `loadedRef` : `leave` dépend d'`onDone`, souvent recréé à chaque rendu par
  // l'appelant — sans ce verrou l'effet se rejouerait et rappellerait le Store.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let alive = true;
    (async () => {
      const list = preview ? PREVIEW_PACKAGES : await PurchasesService.getPackages();
      if (!alive) return;
      if (list.length === 0) {
        console.log('[Paywall] aucune offre vendable → écran sauté');
        leave();
        return;
      }
      setPkgs(list);
      // Pré-sélection de l'annuel s'il existe : c'est l'offre à meilleure valeur
      // perçue, et la pré-sélectionner augmente mécaniquement sa part.
      const yearly = list.find((p) => p.period === 'yearly');
      setSelected((yearly || list[0]).id);
      console.log('[Paywall] affiché', { offres: list.length });
    })();
    return () => { alive = false; };
  }, [leave]);

  // Entrée en douceur (fade + léger glissement) — l'écran arrive après une attente,
  // une apparition sèche donne l'impression d'un pop-up publicitaire.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!pkgs) return;
    Animated.timing(anim, {
      toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [pkgs, anim]);

  const periodLabel = (p: SellablePackage['period']) =>
    p === 'yearly' ? t.perYear : p === 'monthly' ? t.perMonth
      : p === 'weekly' ? t.perWeek : p === 'lifetime' ? t.lifetime : t.perOther;

  const onBuy = async () => {
    const pkg = pkgs?.find((p) => p.id === selected);
    if (!pkg || busy) return;
    // En aperçu on n'appelle PAS le Store et on ne simule aucun achat.
    if (preview) { setNote('Aperçu — aucun achat réel.'); return; }
    setBusy(true); setNote('');
    const res = await PurchasesService.purchase(pkg);
    setBusy(false);
    if (res === 'purchased') { leave(); return; }
    // Annulation = choix délibéré, on ne culpabilise pas : on laisse l'écran tel quel.
    if (res === 'error') setNote(t.failed);
  };

  const onRestore = async () => {
    if (busy) return;
    setBusy(true); setNote('');
    const ok = await PurchasesService.restorePurchases();
    setBusy(false);
    if (ok) { setNote(t.restored); leave(); } else setNote(t.noRestore);
  };

  // Tant que les offres ne sont pas connues : écran neutre, jamais un paywall vide.
  if (!pkgs) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]}>
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      </SafeAreaView>
    );
  }

  const sel = pkgs.find((p) => p.id === selected);
  const trialDays = sel?.trialDays ?? 0;
  const limits = FREE_LIMITS;
  const freeCounts = [limits.scan, limits['ai-coach'], limits['ai-meal-plan'], 0];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.bg }]}>
      <Animated.View
        style={{
          flex: 1,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
        }}
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.badge, { backgroundColor: isDark ? 'rgba(74,222,128,0.12)' : '#ECFDF5', flexDirection: rowDir(isRTL) }]}>
            <Sparkles size={14} color={C.accent} />
            <Text style={[styles.badgeTxt, { color: C.accent }]}>{t.eyebrow}</Text>
          </View>

          <Text style={[styles.h1, { color: C.title, textAlign: txtAlign(isRTL) }]}>{t.title}</Text>
          {!!kcal && (
            <Text style={[styles.lead, { color: C.sub, textAlign: txtAlign(isRTL) }]}>{t.sub(kcal)}</Text>
          )}

          <View style={{ marginTop: 16 }}>
            {t.benefits.map((b: any, i: number) => (
              <View key={i} style={[styles.benefit, { flexDirection: rowDir(isRTL) }]}>
                <View style={[styles.tick, { backgroundColor: isDark ? 'rgba(74,222,128,0.14)' : '#ECFDF5' }]}>
                  <Check size={14} color={C.accent} strokeWidth={3} />
                </View>
                {/* Bénéfice sur UNE ligne (titre + comparatif en gris) : sur deux lignes,
                    les 4 bénéfices débordaient sous la ligne de flottaison et un seul
                    restait visible au-dessus du pied de page collant. */}
                <Text style={[styles.benefitT, { color: C.title, textAlign: txtAlign(isRTL), flex: 1 }]} numberOfLines={2}>
                  {b.t}
                  <Text style={[styles.benefitS, { color: C.sub }]}>{'  ·  ' + b.s(freeCounts[i])}</Text>
                </Text>
              </View>
            ))}
          </View>


          {!!note && (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.note, { color: C.sub, textAlign: txtAlign(isRTL) }]}
            >{note}</Text>
          )}

          {/* Secondaires : ils vivent dans le défilement, pas dans le pied de page collant,
              qui doit rester assez court pour laisser voir les bénéfices. */}
          <View style={[styles.legalRow, { flexDirection: rowDir(isRTL), marginTop: 18 }]}>
            <ShieldCheck size={12} color={C.sub} />
            <Text style={[styles.legal, { color: C.sub, textAlign: txtAlign(isRTL) }]}>{t.legal}</Text>
          </View>

          <TouchableOpacity onPress={onRestore} disabled={busy} accessibilityRole="button">
            <Text style={[styles.restore, { color: C.sub }]}>{t.restore}</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={[
          styles.footer,
          { borderTopColor: C.border, backgroundColor: C.bg },
          // Depuis le Profil, la barre d'onglets flottante (rendue globalement) recouvrait
          // le bas du pied de page — « Restaurer mes achats » passait dessous.
          { paddingBottom: context === 'app' ? 68 : (Platform.OS === 'ios' ? 8 : 14) },
        ]}>
          {/* Les offres vivent dans le pied de page COLLANT, pas dans le défilement :
              elles étaient sous la ligne de flottaison, si bien que le bouton annonçait
              « puis 399 MAD/an » avant que l'utilisateur ait vu le moindre prix. */}
          {/* Offres CÔTE À CÔTE : deux cartes pleine largeur empilées mangeaient la moitié
            de l'écran et il ne restait qu'un bénéfice visible au-dessus. Le 2-colonnes
            est aussi le motif habituel pour comparer annuel et mensuel d'un coup d'œil.
            Au-delà de 2 offres on repasse en colonne, sinon les prix deviennent illisibles. */}
        <View style={{ flexDirection: pkgs.length > 2 ? 'column' : rowDir(isRTL), gap: 10, marginBottom: 2 }}>
          {pkgs.map((p) => {
            const active = p.id === selected;
            const isYear = p.period === 'yearly';
            return (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.85}
                onPress={() => setSelected(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={
                  `${p.priceString} / ${periodLabel(p.period)}` +
                  (p.trialDays > 0 ? `, ${t.trial(p.trialDays)}` : '')
                }
                style={[
                  styles.plan,
                  {
                    flex: pkgs.length > 2 ? undefined : 1,
                    backgroundColor: C.card,
                    borderColor: active ? C.accent : C.border,
                    borderWidth: active ? 2 : 1,
                  },
                ]}
              >
                {isYear && (
                  <View style={[styles.bestTag, { backgroundColor: C.accent }]}>
                    <Text style={styles.bestTxt}>{t.best}</Text>
                  </View>
                )}
                <Text style={[styles.planPrice, { color: C.title }]} numberOfLines={1} adjustsFontSizeToFit>
                  {p.priceString}
                </Text>
                <Text style={[styles.planPer, { color: C.sub }]}>/ {periodLabel(p.period)}</Text>
                {p.trialDays > 0 && (
                  // Deux lignes, pas une : « 7 jours d'essai gratuit » ne tient pas
                  // dans une demi-largeur de carte et s'affichait « 7 jours d'ess… ».
                  // Vu à l'écran le 16 août 2026. Sur la surface qui vend l'abonnement,
                  // c'est précisément le mot « gratuit » qui disparaissait.
                  <Text style={[styles.planTrial, { color: C.accent }]} numberOfLines={2}>
                    {t.trial(p.trialDays)}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={onBuy}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy, busy }}
            accessibilityLabel={trialDays > 0 ? t.cta : t.ctaNoTrial}
          >
            <LinearGradient
              colors={busy ? ['#94A3B8', '#94A3B8'] : [C.accent, isDark ? '#22c55e' : '#1f7a4d']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              {busy
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.ctaTxt}>{trialDays > 0 ? t.cta : t.ctaNoTrial}</Text>}
            </LinearGradient>
          </TouchableOpacity>

          {/* Sortie explicite — exigence Play, et un refus lisible vaut mieux qu'un
              utilisateur piégé qui désinstalle. */}
          <TouchableOpacity onPress={leave} disabled={busy} accessibilityRole="button" style={styles.skipBtn}>
            <Text style={[styles.skip, { color: C.sub }]}>{context === 'app' ? t.later : t.skip}</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 12 },
  badge: { alignSelf: 'flex-start', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  h1: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5, marginTop: 8, lineHeight: 28 },
  lead: { fontSize: 14, lineHeight: 19, marginTop: 6 },
  benefit: { alignItems: 'center', gap: 10, marginBottom: 11 },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  benefitT: { fontSize: 15, fontWeight: '800', lineHeight: 20 },
  benefitS: { fontSize: 12.5, fontWeight: '500' },
  plan: { alignItems: 'center', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 12, gap: 1 },
  planPrice: { fontSize: 19, fontWeight: '900', textAlign: 'center' },
  planPer: { fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  planTrial: { fontSize: 12, fontWeight: '800', marginTop: 3, textAlign: 'center' },
  bestTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, marginBottom: 4 },
  bestTxt: { color: '#fff', fontSize: 10.5, fontWeight: '900' },
  note: { fontSize: 13, marginTop: 14 },
  footer: { paddingHorizontal: 22, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  cta: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  ctaTxt: { color: '#fff', fontSize: 16.5, fontWeight: '900' },
  then: { fontSize: 12.5, textAlign: 'center' },
  skipBtn: { paddingVertical: 6 },
  skip: { fontSize: 14.5, fontWeight: '700', textAlign: 'center', textDecorationLine: 'underline' },
  legalRow: { alignItems: 'center', gap: 6, justifyContent: 'center' },
  legal: { fontSize: 11, lineHeight: 15, flex: 1 },
  restore: { fontSize: 12.5, textAlign: 'center', paddingVertical: 4 },
});

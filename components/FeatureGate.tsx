// FeatureGate (Lot 4 / Étape 3) — composants de gating d'UI branchés sur les
// feature-flags + le statut Premium (voir lib/FlagsContext.tsx).
//
// Deux niveaux de gating :
//   - useScreenGate(key) : pour gater un ÉCRAN entier. Renvoie { ok, node }.
//       ok=true  → l'écran s'affiche normalement (node=null).
//       ok=false → l'écran doit rendre `node` (<ScreenDisabled/> plein écran).
//   - <FeatureGate flag> : pour gater un BLOC dans un écran (rendu conditionnel).
//       ok       → children.
//       disabled → null si hideWhenDisabled, sinon un fallback discret.
//       locked   → petit CTA Premium inline (pas plein écran).
import React from 'react';
import { View, Text, Pressable, StyleSheet, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useSegments } from 'expo-router';
import { useTheme } from '../lib/ThemeContext';
import { useTranslation } from '../lib/i18n';
import { spacing, radius, type } from '../constants/theme';
import { PurchasesService } from '../lib/PurchasesService';
import { useFeature, useFlagsCtx } from '../lib/FlagsContext';
import { flagForRoute } from '../lib/navFlags';
import { PrimaryButton, SecondaryButton } from './ui/Button';

import { useTokens } from '../constants/tokens';
type GateKind = 'disabled' | 'premium';

/** Ouvre le paywall RevenueCat (tolère les deux API sans crash). */
function openPaywall() {
  try {
    const svc: any = PurchasesService;
    if (typeof svc.showPaywall === 'function') { svc.showPaywall(); return; }
    if (typeof svc.showPaywallIfNeeded === 'function') { svc.showPaywallIfNeeded(); }
  } catch { /* best-effort */ }
}

/**
 * ScreenDisabled — écran plein, thémé (sombre/clair), i18n FR/EN/AR.
 *   kind='disabled' → feature coupée (titre + message neutres).
 *   kind='premium'  → feature verrouillée derrière Premium (+ bouton "Passer Premium").
 * Toujours un bouton retour (router.back()).
 */
export function ScreenDisabled({ kind = 'disabled' }: { kind?: GateKind }) {
  const k = useTokens();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const isPremium = kind === 'premium';
  const iconName = isPremium ? 'lock-closed' : 'ban-outline';
  const title = isPremium ? t('feature.premium_title') : t('feature.disabled_title');
  const message = isPremium ? t('feature.premium_msg') : t('feature.disabled_msg');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md }}>
      <View style={{
        width: 72, height: 72, borderRadius: radius.pill, backgroundColor: colors.primaryLight,
        alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
      }}>
        <Ionicons name={iconName as any} size={34} color={colors.primary} />
      </View>

      <Text style={{ ...(type.h2 as TextStyle), color: colors.gray[900], textAlign: 'center' }}>
        {title}
      </Text>
      <Text style={{ ...(type.sub as TextStyle), color: colors.gray[500], textAlign: 'center', lineHeight: 20, maxWidth: 320 }}>
        {message}
      </Text>

      <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg, maxWidth: 360, width: '100%' }}>
        {isPremium && (
          <PrimaryButton
            title={t('feature.go_premium')}
            icon={<Ionicons name="star" size={18} color={k.onAccent} />}
            onPress={openPaywall}
          />
        )}
        <SecondaryButton
          title={t('feature.back')}
          icon={<Ionicons name="arrow-back" size={18} color={colors.primary} />}
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}

/** CTA Premium inline (compact) — utilisé par <FeatureGate> quand locked. */
function InlinePremiumCta() {
  const k = useTokens();
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={openPaywall}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
        backgroundColor: colors.primaryLight, borderRadius: radius.md,
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Ionicons name="lock-closed" size={16} color={colors.primary} />
      <Text style={{ ...(type.sub as TextStyle), color: colors.primary, flex: 1 }}>
        {t('feature.premium_msg')}
      </Text>
      <Text style={{ ...(type.micro as TextStyle), color: colors.primary, fontWeight: '800' }}>
        {t('feature.go_premium')}
      </Text>
    </Pressable>
  );
}

/**
 * useScreenGate(key) — hook pour gater un écran entier.
 * ok = enabled && !locked. Si !ok, `node` est le composant plein écran à rendre.
 */
export function useScreenGate(key: string): { ok: boolean; node: React.ReactNode } {
  const { enabled, locked } = useFeature(key);
  if (enabled && !locked) return { ok: true, node: null };
  return { ok: false, node: <ScreenDisabled kind={locked ? 'premium' : 'disabled'} /> };
}

/**
 * RouteFlagGate — gating par ÉCRAN AUTOMATIQUE et EXHAUSTIF, monté une seule fois
 * autour du <Slot/> racine (app/_layout). Déduit la clé de flag depuis la route
 * courante (via flagForRoute + navFlags) : plus besoin d'ajouter useScreenGate dans
 * chaque écran, et les deep-links vers une feature coupée sont bloqués aussi.
 *
 * NON-INTRUSIF : ne gate QUE les routes « gérées » (flag ∈ FLAG_KEYS) ET seulement
 * si le flag est explicitement OFF / verrouillé Premium. Défaut permissif → si aucun
 * flag n'est désactivé, le comportement de navigation est INCHANGÉ (zéro régression).
 */
export function RouteFlagGate({ children }: { children: React.ReactNode }) {
  const segments = useSegments() as string[];
  // Première portion de route qui mappe vers un flag géré (gère aussi les routes
  // à sous-chemins / groupes : ['(app)','fasting'] → 'fasting').
  let key: string | null = null;
  for (const seg of segments) { const k = flagForRoute(seg); if (k) { key = k; break; } }
  // Hook appelé inconditionnellement (Rules of Hooks) ; clé vide → flag absent → activé.
  const { enabled, locked } = useFeature(key || '');
  const { ready } = useFlagsCtx();
  // FIX anti-boucle (audit) : children = le NAVIGATEUR RACINE (~90 routes). L'ancienne
  // version le REMPLAÇAIT par <ScreenDisabled/> quand un flag gatait la route → chaque flip
  // asynchrone (hydratation cache → fetch → premium) DÉMONTAIT/REMONTAIT le navigateur
  // entier = tempête d'updates imbriquées ("Maximum update depth"). Désormais :
  //  1. children reste TOUJOURS monté — le gate est un OVERLAY absolu au-dessus ;
  //  2. on ne gate qu'après `ready` (une décision STABLE, pas d'alternance à l'hydratation).
  const blocked = !!key && ready && (!enabled || locked);
  return (
    <View style={{ flex: 1 }}>
      {children}
      {blocked && (
        <View style={StyleSheet.absoluteFill}>
          <ScreenDisabled kind={locked ? 'premium' : 'disabled'} />
        </View>
      )}
    </View>
  );
}

interface FeatureGateProps {
  flag: string;
  hideWhenDisabled?: boolean;
  children: React.ReactNode;
}

/**
 * <FeatureGate flag hideWhenDisabled> — gate d'un bloc dans un écran.
 *   ok       → children.
 *   disabled → null (si hideWhenDisabled) sinon <ScreenDisabled kind='disabled'/>.
 *   locked   → petit CTA Premium inline (jamais plein écran).
 */
export default function FeatureGate({ flag, hideWhenDisabled, children }: FeatureGateProps) {
  const k = useTokens();
  const { enabled, locked } = useFeature(flag);

  if (enabled && !locked) return <>{children}</>;
  if (locked) return <InlinePremiumCta />;
  // disabled (feature coupée)
  return hideWhenDisabled ? null : <ScreenDisabled kind="disabled" />;
}

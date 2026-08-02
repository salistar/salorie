// Paywall de fin d'onboarding — le moment de plus forte intention du parcours :
// l'utilisateur vient de VOIR son plan personnalisé, il sait déjà ce que l'app calcule
// pour lui. On vend la SUITE de ce qu'il vient d'obtenir, pas une liste de features.
//
// L'écran ne contient que le CÂBLAGE ; la vue est partagée avec l'entrée « Premium »
// du Profil (components/PaywallView.tsx).
//
// C'est aussi ici qu'on VALIDE réellement l'onboarding — voir lib/onboardingSave.ts
// pour le pourquoi de ce placement (le garde de app/_layout.tsx éjecte vers /(tabs)
// dès que le statut passe à `onboarded`).
import React, { useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useUser } from '@clerk/clerk-expo';
import PaywallView from '../../components/PaywallView';
import { commitOnboarding } from '../../lib/onboardingSave';

export default function OnboardingPremiumScreen() {
  const router = useRouter();
  const { user } = useUser();
  const params = useLocalSearchParams();

  const next = (params.next as string) || '/(tabs)';
  const kcal = (params.kcal as string) || '';

  /**
   * Mode APERÇU — rend l'écran avec des offres factices pour pouvoir le valider
   * visuellement tant que les produits n'existent pas côté Play Console.
   * Atteignable UNIQUEMENT par `?preview=1`, que `results.tsx` ne passe jamais :
   * aucun utilisateur ne peut y arriver. L'achat y est neutralisé.
   *
   *   adb shell am start -a android.intent.action.VIEW -d "salorie://premium?preview=1&kcal=1850"
   *
   * Deux détails qui font échouer le test si on les ignore :
   *  - expo-router n'inclut PAS les groupes dans l'URL → `salorie://premium`, pas
   *    `salorie://(onboarding)/premium`.
   *  - le garde de `app/_layout.tsx` renvoie vers `/(tabs)` dès que l'utilisateur est
   *    onboardé → cet aperçu-ci n'est atteignable que TANT QUE l'onboarding n'est pas
   *    fini. Pour un compte déjà onboardé, passer par `salorie://upgrade?preview=1`.
   */
  const preview = params.preview === '1';

  const onDone = useCallback(async () => {
    const email = user?.primaryEmailAddress?.emailAddress || '';
    await commitOnboarding(user?.id && email ? { id: user.id, email } : null);
    router.replace(next as any);
  }, [next, router, user]);

  return <PaywallView onDone={onDone} kcal={kcal} preview={preview} context="onboarding" />;
}

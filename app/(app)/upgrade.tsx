// Entrée « Premium » depuis le Profil — route /upgrade.
// (Le nom `premium` est déjà pris par (onboarding)/premium.tsx : deux fichiers de même
//  nom dans deux groupes résolvent vers la MÊME URL /premium, donc collision.)
//
// Corrige un bouton mort : `handleUpgrade` appelait `PurchasesService.showPaywall()`,
// qui repose sur `PurchasesUI.presentPaywall` — sans clé RevenueCat de production ET
// sans paywall configuré côté dashboard, l'appui ne produisait rien. Un utilisateur
// qui déclinait à l'onboarding n'avait donc plus AUCUN chemin vers l'abonnement.
//
// Ici, pas d'onboarding à valider : refuser ou acheter renvoie simplement en arrière.
// S'il n'y a rien à vendre, `PaywallView` appelle `onDone()` immédiatement et l'écran
// se referme tout seul — jamais de page de vente vide.
import React, { useCallback } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import PaywallView from '../../components/PaywallView';

export default function UpgradeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const onDone = useCallback(() => {
    // `router.back()` remontait jusqu'à l'ACCUEIL et non au Profil : une pression sur un
    // onglet ne laisse pas d'entrée d'historique, la pile n'a donc rien à dépiler vers
    // le Profil. On vise la destination explicitement — indépendant de l'état de la pile,
    // et le Profil est aujourd'hui le seul point d'entrée in-app.
    router.replace('/(tabs)/profile' as any);
  }, [router]);

  return (
    <PaywallView
      onDone={onDone}
      kcal={(params.kcal as string) || ''}
      // Aperçu atteignable pour un compte DÉJÀ onboardé (le groupe (app) passe le garde) :
      //   adb shell am start -a android.intent.action.VIEW -d "salorie://upgrade?preview=1&kcal=1850"
      preview={params.preview === '1'}
      context="app"
    />
  );
}

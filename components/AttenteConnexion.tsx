import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, Image, TouchableOpacity } from 'react-native';
import { Colors } from '../constants/Colors';
import { useTranslation } from '../lib/i18n';

/**
 * Ce qu'on montre pendant que Clerk s'initialise.
 *
 * Sans réseau, l'init de Clerk n'échoue pas : elle n'aboutit jamais. Le fallback
 * `<ClerkLoading>` tournait donc indéfiniment et l'utilisateur n'avait aucun moyen
 * de savoir que c'était sa connexion. Constaté le 16 août 2026 sur R83L20HWJTE,
 * forfait data épuisé : spinner vert pendant 90 s sans un mot. Sur un marché où la
 * couverture se perd — et pour un testeur Play sur réseau bridé — un écran qui ne
 * dit rien se lit comme une app cassée.
 *
 * Au bout de 7 s on explique, en distinguant les deux cas : le téléphone est hors
 * ligne, ou c'est nous qui traînons. Le geste à faire n'est pas le même, et
 * accuser à tort la connexion de quelqu'un est le pire des deux messages.
 *
 * Les libellés sont posés ici plutôt que dans les traductions : cet écran s'affiche
 * avant tout le reste, et il ne doit dépendre de rien qui puisse ne pas être chargé.
 */
const ATTENTE: Record<string, Record<string, string>> = {
  fr: {
    horsLigne: 'Aucune connexion internet',
    horsLigneAide: 'Vérifie tes données mobiles ou le Wi-Fi, puis réessaie.',
    lent: 'La connexion est lente',
    lentAide: 'On y est presque…',
    reessayer: 'Réessayer',
  },
  en: {
    horsLigne: 'No internet connection',
    horsLigneAide: 'Check your mobile data or Wi-Fi, then try again.',
    lent: 'The connection is slow',
    lentAide: 'Almost there…',
    reessayer: 'Try again',
  },
  ar: {
    horsLigne: 'لا يوجد اتصال بالإنترنت',
    horsLigneAide: 'تحقّق من بيانات الهاتف أو الواي-فاي ثم أعد المحاولة.',
    lent: 'الاتصال بطيء',
    lentAide: 'أوشكنا على الانتهاء…',
    reessayer: 'إعادة المحاولة',
  },
};

/** Délai avant d'expliquer. En deçà, l'attente est normale et parler serait du bruit. */
export const DELAI_EXPLICATION_MS = 7000;

export default function AttenteConnexion({ onReessayer }: { onReessayer: () => void }) {
  const { language, isRTL } = useTranslation();
  const m = ATTENTE[language] || ATTENTE.fr;
  const [tarde, setTarde] = useState(false);
  const [horsLigne, setHorsLigne] = useState(false);

  useEffect(() => {
    const minuteur = setTimeout(async () => {
      setTarde(true);
      // On ne demande l'état du réseau qu'à ce moment : avant, l'attente est
      // normale et poser la question ne servirait à rien.
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const reseau = require('expo-network');
        const etat = await reseau.getNetworkStateAsync();
        setHorsLigne(!etat.isInternetReachable);
      } catch {
        // Le module a échoué : on garde le message neutre « connexion lente »
        // plutôt que d'accuser à tort le réseau de l'utilisateur.
      }
    }, DELAI_EXPLICATION_MS);
    return () => clearTimeout(minuteur);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.light.primary,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
        paddingHorizontal: 32,
        direction: isRTL ? 'rtl' : 'ltr',
      }}
    >
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 32,
          backgroundColor: 'rgba(255,255,255,0.15)',
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.3)',
        }}
      >
        <Image source={require('../assets/images/fire.png')} style={{ width: 80, height: 80 }} resizeMode="contain" />
      </View>
      <Text style={{ fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1 }}>Salorie</Text>
      <ActivityIndicator size="large" color="#ffffff" />
      {tarde && (
        <>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff', textAlign: 'center' }}>
            {horsLigne ? m.horsLigne : m.lent}
          </Text>
          <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 20 }}>
            {horsLigne ? m.horsLigneAide : m.lentAide}
          </Text>
          {horsLigne && (
            <TouchableOpacity
              onPress={onReessayer}
              accessibilityRole="button"
              accessibilityLabel={m.reessayer}
              style={{
                marginTop: 4,
                paddingVertical: 12,
                paddingHorizontal: 28,
                borderRadius: 14,
                backgroundColor: 'rgba(255,255,255,0.18)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>{m.reessayer}</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

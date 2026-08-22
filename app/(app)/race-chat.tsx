// Écran du salon d'une course. Volontairement une ROUTE à part plutôt qu'un onglet
// ajouté à race-live.tsx : cet écran-là dépasse le millier de lignes et pilote déjà
// le GPS, la carte et la progression. Y greffer un chat, c'est mélanger une session
// de course en cours avec de la messagerie — et rendre les deux plus fragiles.
import {
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useTokens } from '../../constants/tokens';
import { useTranslation } from '../../lib/i18n';
import ScreenTopBar from '../../components/ScreenTopBar';
import RaceChat from '../../components/RaceChat';

const TITRES: Record<string, string> = {
  fr: 'Salon de la course',
  en: 'Race chat',
  ar: 'دردشة السباق',
};

export default function EcranChatCourse() {
  const tok = useTokens();
  const { language } = useTranslation();
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.safe, { backgroundColor: tok.bg }]}>
      <ScreenTopBar showBack title={TITRES[String(language)] || TITRES.fr} showNotif={false} />
      <RaceChat raceId={String(id || '')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1 } });

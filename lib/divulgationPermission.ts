/**
 * La divulgation préalable, exigée par Google Play.
 * ---------------------------------------------------------------------------
 * Google impose que l'application explique **elle-même**, AVANT que la boîte de
 * dialogue Android n'apparaisse, quelles données sensibles elle va lire, pour
 * quoi faire, et ce qu'elle en fait. La boîte du système ne suffit pas : elle
 * dit « Autoriser Salorie à accéder au micro ? » sans dire pourquoi, et une
 * application qui s'en contente est un motif de rejet documenté.
 *
 * ⚠ AU 10/09/2026, LES DIX POINTS DE DEMANDE APPELAIENT LE SYSTÈME DIRECTEMENT.
 * `Audio.requestPermissionsAsync()` et `Location.requestForegroundPermissionsAsync()`
 * étaient invoqués sans un mot d'explication. Trois écrans (`ar-ghost`,
 * `challenge-ar`, `race-live`) affichaient bien un texte — mais APRÈS un refus,
 * ce qui est l'inverse de ce qui est demandé.
 *
 * ⚠ UNE SEULE PORTE, ET C'EST TOUT L'INTÉRÊT.
 * Dix appels directs, c'est dix endroits où l'oubli est possible, et un audit
 * de plus pour s'en apercevoir. Ici, demander la permission SANS divulgation
 * n'est plus quelque chose qu'on peut faire par distraction : il faudrait
 * réimporter `expo-av` ou `expo-location` exprès. `__tests__/divulgation.test.ts`
 * refuse d'ailleurs qu'un écran le fasse.
 *
 * ⚠ CE MODULE NE PARLE PAS AU RÉSEAU ET NE STOCKE RIEN.
 * Il ne fait que poser une question et transmettre la réponse. S'il échoue, on
 * n'accorde rien — refuser par défaut est le seul sens acceptable pour une
 * permission.
 */
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as Location from 'expo-location';

type Langue = 'fr' | 'en' | 'ar';

const TEXTES: Record<Langue, Record<string, string>> = {
  fr: {
    micro_titre: 'Pourquoi le micro ?',
    micro_corps:
      "Salorie écoute ce que tu dictes pour transcrire ton repas ou ta question au coach. "
      + "L'enregistrement part chiffré vers nos serveurs, sert uniquement à produire ce texte, "
      + "et n'est jamais conservé ni partagé.",
    lieu_titre: 'Pourquoi la position ?',
    lieu_corps:
      "Salorie lit ta position pendant une course ou une marche, pour mesurer la distance, "
      + "l'allure et le tracé du parcours. Elle n'est lue que pendant la séance, "
      + "et jamais quand l'application est fermée.",
    continuer: 'Continuer',
    plus_tard: 'Plus tard',
  },
  en: {
    micro_titre: 'Why the microphone?',
    micro_corps:
      'Salorie listens to what you dictate in order to transcribe your meal or your question '
      + 'to the coach. The recording is sent encrypted to our servers, is used only to produce '
      + 'that text, and is never kept or shared.',
    lieu_titre: 'Why your location?',
    lieu_corps:
      'Salorie reads your location during a run or a walk, to measure distance, pace and the '
      + 'route you took. It is read only during the session, never while the app is closed.',
    continuer: 'Continue',
    plus_tard: 'Later',
  },
  ar: {
    micro_titre: 'لماذا الميكروفون؟',
    micro_corps:
      'يستمع Salorie إلى ما تمليه لتحويل وجبتك أو سؤالك للمدرّب إلى نص. '
      + 'يُرسل التسجيل مشفّرًا إلى خوادمنا، ويُستخدم فقط لإنتاج هذا النص، '
      + 'ولا يُحفظ ولا يُشارك أبدًا.',
    lieu_titre: 'لماذا موقعك؟',
    lieu_corps:
      'يقرأ Salorie موقعك أثناء الجري أو المشي لقياس المسافة والإيقاع والمسار. '
      + 'يُقرأ فقط أثناء الجلسة، ولا يُقرأ أبدًا والتطبيق مغلق.',
    continuer: 'متابعة',
    plus_tard: 'لاحقًا',
  },
};

const textes = (langue?: string) => TEXTES[(langue as Langue)] || TEXTES.fr;

/**
 * Pose la question, et ne rend `true` que sur un geste EXPLICITE de l'utilisateur.
 * Fermer la boîte sans choisir vaut refus — Google exige une action positive.
 */
function demanderAccord(titre: string, corps: string, oui: string, non: string): Promise<boolean> {
  return new Promise((resoudre) => {
    Alert.alert(
      titre,
      corps,
      [
        { text: non, style: 'cancel', onPress: () => resoudre(false) },
        { text: oui, onPress: () => resoudre(true) },
      ],
      { cancelable: true, onDismiss: () => resoudre(false) },
    );
  });
}

/**
 * Micro : divulgation puis demande système.
 * Rend `true` si la permission est accordée à la fin.
 *
 * Si elle est DÉJÀ accordée, on ne redemande rien : réexpliquer à chaque appui
 * transformerait une exigence de transparence en gêne, et pousserait à la
 * contourner.
 */
export async function demanderMicro(langue?: string): Promise<boolean> {
  try {
    const deja = await Audio.getPermissionsAsync();
    if (deja.granted) return true;

    const t = textes(langue);
    const accord = await demanderAccord(t.micro_titre, t.micro_corps, t.continuer, t.plus_tard);
    if (!accord) return false;

    const r = await Audio.requestPermissionsAsync();
    return !!r.granted;
  } catch {
    // Refuser par defaut : c'est le seul sens acceptable pour une permission.
    return false;
  }
}

/** Position : divulgation puis demande système. Même contrat que le micro. */
export async function demanderLocalisation(langue?: string): Promise<boolean> {
  try {
    const deja = await Location.getForegroundPermissionsAsync();
    if (deja.granted) return true;

    const t = textes(langue);
    const accord = await demanderAccord(t.lieu_titre, t.lieu_corps, t.continuer, t.plus_tard);
    if (!accord) return false;

    const r = await Location.requestForegroundPermissionsAsync();
    return r.status === 'granted';
  } catch {
    return false;
  }
}

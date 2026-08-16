// Libelles d'accessibilite des boutons a ICONE SEULE.
// ---------------------------------------------------------------------------
// Un bouton qui affiche son texte est deja lu par TalkBack : lui ajouter un
// libelle est redondant, et nuisible s'il diverge du texte visible. Ce module ne
// concerne donc QUE les boutons sans texte — ceux qu'un lecteur d'ecran annonce
// « bouton », et rien de plus.
//
// Volontairement une fonction et non un crochet : ces libelles se posent sur des
// boutons qui n'ont aucun autre besoin du contexte, et exiger `useTranslation`
// dans quarante-cinq ecrans pour nommer une fleche de retour serait un cout sans
// contrepartie. La langue vient du miroir hors React de lib/i18n.
import { langueActuelle } from './i18n';

const LIBELLES = {
  retour: { fr: 'Retour', en: 'Go back', ar: 'رجوع' },
  fermer: { fr: 'Fermer', en: 'Close', ar: 'إغلاق' },
  supprimer: { fr: 'Supprimer', en: 'Delete', ar: 'حذف' },
  ajouter: { fr: 'Ajouter', en: 'Add', ar: 'إضافة' },
  retirer: { fr: 'Retirer', en: 'Remove', ar: 'إزالة' },
  modifier: { fr: 'Modifier', en: 'Edit', ar: 'تعديل' },
  rafraichir: { fr: 'Rafraîchir', en: 'Refresh', ar: 'تحديث' },
  recommencer: { fr: 'Recommencer', en: 'Start over', ar: 'إعادة' },
  envoyer: { fr: 'Envoyer', en: 'Send', ar: 'إرسال' },
  valider: { fr: 'Valider', en: 'Confirm', ar: 'تأكيد' },
  arreter: { fr: 'Arrêter', en: 'Stop', ar: 'إيقاف' },
  photo: { fr: 'Prendre une photo', en: 'Take a photo', ar: 'التقاط صورة' },
  scanner: { fr: 'Scanner un code-barres', en: 'Scan a barcode', ar: 'مسح الباركود' },
  lire: { fr: 'Lire à voix haute', en: 'Read aloud', ar: 'قراءة بصوت عالٍ' },
  favori: { fr: 'Mettre en favori', en: 'Add to favourites', ar: 'إضافة إلى المفضلة' },
  suivant: { fr: 'Suivant', en: 'Next', ar: 'التالي' },
} as const;

export type ActionA11y = keyof typeof LIBELLES;

/** Libelle de l'action, dans la langue courante de l'app. */
export function a11y(action: ActionA11y): string {
  const e = LIBELLES[action];
  if (!e) return '';
  // Lecture DEFENSIVE de la langue : cette fonction est appelee au rendu de
  // quarante-cinq ecrans. Si la source est indisponible — module simule dans un
  // test, ordre d'import inattendu — un libelle en francais vaut infiniment mieux
  // qu'un ecran blanc. Un nom de bouton ne justifie jamais un plantage.
  let l = 'fr';
  try {
    l = (typeof langueActuelle === 'function' && langueActuelle()) || 'fr';
  } catch {
    /* on garde le francais */
  }
  return (e as any)[l] || e.fr;
}

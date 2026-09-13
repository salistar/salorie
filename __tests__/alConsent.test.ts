/**
 * Le consentement à la collecte de photos : opt-in, et il doit le rester.
 * ---------------------------------------------------------------------------
 * `lib/alConsent.ts` garde la seule autorisation qui fait sortir une PHOTO DE
 * REPAS de l'appareil. Se tromper ici n'est pas un bug d'affichage : c'est
 * envoyer l'image du dîner de quelqu'un sans qu'il l'ait voulu.
 *
 * ⚠ TOUT CE MODULE ÉCHOUE DANS LE SENS DU REFUS, et c'est ce que les tests
 * ci-dessous verrouillent. Stockage illisible → pas de collecte. Doute sur « lui
 * a-t-on déjà posé la question » → on ne la repose pas. Ce sont deux directions
 * opposées et toutes deux prudentes : la première protège la donnée, la seconde
 * protège la personne du harcèlement.
 *
 * Écran concerné : `/preferences` (499 lignes), et le moment de la demande vit
 * dans le parcours de correction d'un scan.
 */
const magasin = new Map<string, string>();
let enPanne = false;

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => {
    if (enPanne) throw new Error('stockage indisponible');
    return magasin.has(k) ? magasin.get(k)! : null;
  }),
  setItem: jest.fn(async (k: string, v: string) => {
    if (enPanne) throw new Error('stockage indisponible');
    magasin.set(k, v);
  }),
}));

// `proposerConsentementApresCorrection` fait un `require('react-native')` PARESSEUX,
// a l'interieur de la fonction : le double doit donc exister au moment de
// l'appel, pas de l'import.
const alertes: Array<{ titre: string; corps: string; boutons: any[] }> = [];
jest.mock('react-native', () => ({
  Alert: {
    alert: (titre: string, corps: string, boutons: any[]) => {
      alertes.push({ titre, corps, boutons });
    },
  },
}));

import {
  consentementDejaDemande, getMLConsent, marquerConsentementDemande,
  proposerConsentementApresCorrection, setMLConsent,
} from '../lib/alConsent';

const CLE = 'al_consent_v1';
const CLE_DEMANDE = 'al_consent_demande_v1';

/** Rejoue le choix de l'utilisateur dans la derniere boite affichee. */
const repondre = (choix: 'oui' | 'non') => {
  const b = alertes[alertes.length - 1].boutons;
  const bouton = choix === 'oui' ? b[1] : b[0];
  bouton.onPress?.();
};

beforeEach(() => {
  magasin.clear();
  alertes.length = 0;
  enPanne = false;
});

describe('getMLConsent — l autorisation elle-meme', () => {
  it('⚠ DESACTIVE PAR DEFAUT : rien ne part avant un oui', () => {
    // C'est la promesse ecrite dans l'entete du module et dans le formulaire
    // « Securite des donnees » de la console Play. Un defaut a `true` serait
    // une collecte non declaree.
    return expect(getMLConsent()).resolves.toBe(false);
  });

  it('ne reconnait QUE la chaine exacte « true »', () => {
    // Une valeur heritee d'une ancienne version ('1', 'yes', 'TRUE') ne doit
    // pas etre interpretee genereusement : dans le doute, on ne collecte pas.
    for (const v of ['1', 'yes', 'TRUE', 'True', 'oui', '']) {
      magasin.set(CLE, v);
      expect(magasin.get(CLE)).toBe(v);
    }
    magasin.set(CLE, 'TRUE');
    return expect(getMLConsent()).resolves.toBe(false);
  });

  it('se souvient d un oui, et d un non', async () => {
    await setMLConsent(true);
    expect(magasin.get(CLE)).toBe('true');
    expect(await getMLConsent()).toBe(true);

    await setMLConsent(false);
    expect(magasin.get(CLE)).toBe('false');
    expect(await getMLConsent()).toBe(false);
  });

  it('un stockage en panne vaut REFUS', async () => {
    await setMLConsent(true);
    enPanne = true;
    expect(await getMLConsent()).toBe(false);
    // Et enregistrer malgre la panne ne jette pas au milieu d'un ecran.
    await expect(setMLConsent(true)).resolves.toBeUndefined();
  });
});

describe('consentementDejaDemande — ne pas harceler', () => {
  it('au premier lancement, la question n a pas encore ete posee', () => {
    return expect(consentementDejaDemande()).resolves.toBe(false);
  });

  it('une fois marquee, elle ne revient pas', async () => {
    await marquerConsentementDemande();
    expect(magasin.get(CLE_DEMANDE)).toBe('true');
    expect(await consentementDejaDemande()).toBe(true);
  });

  it('⚠ EN PANNE, ON SUPPOSE QU ON A DEJA DEMANDE', () => {
    // Direction inverse de `getMLConsent`, et c'est voulu : ici l'erreur
    // couteuse serait de reposer la question a chaque repas. Mieux vaut rater
    // une occasion de recruter un contributeur que devenir agacant.
    enPanne = true;
    return expect(consentementDejaDemande()).resolves.toBe(true);
  });
});

describe('proposerConsentementApresCorrection — le bon moment', () => {
  it('demande apres une correction, une seule fois', async () => {
    await proposerConsentementApresCorrection('fr');
    expect(alertes).toHaveLength(1);
    expect(alertes[0].titre).toBe('Merci pour la correction');

    // Deuxieme correction : plus de question.
    await proposerConsentementApresCorrection('fr');
    expect(alertes).toHaveLength(1);
  });

  it('⚠ LA QUESTION EST MARQUEE AVANT D ETRE POSEE', () => {
    // `marquerConsentementDemande()` est attendu AVANT `Alert.alert`. Si
    // l'application est tuee pendant que la boite est a l'ecran, on ne
    // redemandera jamais. C'est le bon arbitrage — l'inverse rouvrirait la
    // boite a chaque redemarrage — mais il faut savoir qu'une occasion perdue
    // l'est definitivement, et que ca fait partie des raisons possibles d'un
    // pipeline de corrections vide.
    return proposerConsentementApresCorrection('fr').then(() => {
      expect(magasin.get(CLE_DEMANDE)).toBe('true');
    });
  });

  it('ne demande rien a qui a deja consenti', async () => {
    await setMLConsent(true);
    await proposerConsentementApresCorrection('fr');
    expect(alertes).toHaveLength(0);
  });

  it('« Oui » active la collecte', async () => {
    await proposerConsentementApresCorrection('fr');
    repondre('oui');
    expect(magasin.get(CLE)).toBe('true');
  });

  it('⚠ « Non merci » NE MARQUE RIEN, il laisse le defaut', async () => {
    // Le bouton de refus n'a pas d'`onPress` : rien n'est ecrit. Le
    // consentement reste donc a son defaut — absent — ce qui vaut refus. Le
    // resultat est correct ; la subtilite est qu'un refus EXPLICITE n'est pas
    // distinguable d'une absence de reponse dans le stockage.
    await proposerConsentementApresCorrection('fr');
    repondre('non');
    expect(magasin.get(CLE)).toBeUndefined();
    expect(await getMLConsent()).toBe(false);
    // Mais la question, elle, a bien ete marquee : on ne la reposera pas.
    expect(await consentementDejaDemande()).toBe(true);
  });

  it('fermer la boite sans choisir ne consent a rien', async () => {
    // Aucun `onPress` declenche : le silence n'est pas un oui.
    await proposerConsentementApresCorrection('fr');
    expect(await getMLConsent()).toBe(false);
  });

  it('parle les trois langues, et tolere un code regional', async () => {
    for (const [langue, attendu] of [
      ['fr', 'Merci pour la correction'],
      ['en', 'Thanks for the correction'],
      ['ar', 'شكرا على التصحيح'],
      ['fr-MA', 'Merci pour la correction'],   // `slice(0, 2)`
      ['ar-MA', 'شكرا على التصحيح'],
    ] as const) {
      magasin.clear();
      alertes.length = 0;
      await proposerConsentementApresCorrection(langue);
      expect(alertes[0].titre).toBe(attendu);
    }
  });

  it('une langue inconnue ou absente retombe sur le francais', async () => {
    await proposerConsentementApresCorrection('es');
    expect(alertes[0].titre).toBe('Merci pour la correction');
    magasin.clear(); alertes.length = 0;
    await proposerConsentementApresCorrection(undefined);
    expect(alertes[0].titre).toBe('Merci pour la correction');
  });

  it('le texte dit ce qu on envoie, et qu on peut revenir en arriere', async () => {
    // Les deux elements qu'un consentement doit porter pour en etre un.
    await proposerConsentementApresCorrection('fr');
    expect(alertes[0].corps).toMatch(/sans votre identité/);
    expect(alertes[0].corps).toMatch(/changer d'avis/);
    await (async () => { magasin.clear(); alertes.length = 0; })();
    await proposerConsentementApresCorrection('ar');
    expect(alertes[0].corps).toMatch(/دون هويتك/);
  });
});

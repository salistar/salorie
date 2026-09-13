/**
 * Le quota gratuit : la seule porte entre l'usage libre et le paywall.
 * ---------------------------------------------------------------------------
 * `lib/freemium.ts` décide si une action gratuite est encore permise. Se tromper
 * ne lève rien et ne s'affiche pas :
 *
 *   - trop permissif → Premium ne sert à rien, et personne ne le signale ;
 *   - trop strict    → un utilisateur gratuit se voit refuser une action qui lui
 *     restait, juste avant un écran qui lui demande de payer. C'est la pire
 *     minute possible pour un bug.
 *
 * Le module est délibérément **permissif en cas de panne** (« défaut permissif,
 * jamais throw »). Ce choix est bon, mais il a une conséquence qu'il vaut mieux
 * avoir écrite noir sur blanc que découvrir : tout ce qui rate laisse passer.
 *
 * Écran concerné : `/scan-camera` (375 lignes, aucun test avant le 13/09/2026).
 */

// Un vrai magasin en memoire : `consume()` relit ce qu'il vient d'ecrire, et un
// double mock naif (getItem -> null) rendrait le compteur muet, donc le test
// faux-vert.
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

import {
  FREE_LIMITS, canUseFree, consume, freeLimit, getUsage, remainingFree,
} from '../lib/freemium';
import { ymd } from '../lib/format';

const AUJOURD_HUI = ymd(new Date());

beforeEach(() => {
  magasin.clear();
  enPanne = false;
});

describe('freeLimit — combien d usages gratuits', () => {
  it('rend le quota annonce pour les trois features connues', () => {
    expect(freeLimit('scan')).toBe(3);
    expect(freeLimit('ai-coach')).toBe(5);
    expect(freeLimit('ai-meal-plan')).toBe(1);
    // Le tableau public et la fonction ne doivent pas diverger.
    for (const [f, n] of Object.entries(FREE_LIMITS)) expect(freeLimit(f)).toBe(n);
  });

  it('⚠ UNE FEATURE INCONNUE EST ILLIMITEE, PAS BLOQUEE', () => {
    // `FREE_LIMITS[feature] ?? 0` et « 0 = illimite » se combinent ainsi : une
    // feature absente du tableau n'a AUCUNE limite. C'est le bon defaut — on ne
    // veut pas qu'un oubli bloque une fonctionnalite — mais ca veut dire qu'une
    // FAUTE DE FRAPPE dans le nom rend le quota silencieusement inoperant.
    expect(freeLimit('scans')).toBe(0);      // pluriel de trop
    expect(freeLimit('ai_coach')).toBe(0);   // tiret bas au lieu du tiret
    expect(freeLimit('')).toBe(0);
  });

  it('un flag peut surcharger le quota a chaud, zero compris', () => {
    // Le levier sans redeploiement : ouvrir pendant une operation, resserrer
    // apres. `0` doit vouloir dire « illimite », pas « plus rien ».
    expect(freeLimit('scan', { scan: 10 })).toBe(10);
    expect(freeLimit('scan', { scan: 0 })).toBe(0);
    expect(freeLimit('scan', { autre: 99 })).toBe(3);
    expect(freeLimit('scan', null)).toBe(3);
    expect(freeLimit('scan', {} as any)).toBe(3);
  });

  it('une surcharge non numerique est ignoree, pas interpretee', () => {
    // Un flag mal saisi dans l'admin ne doit pas devenir `NaN` ni `"3"`.
    expect(freeLimit('scan', { scan: '10' } as any)).toBe(3);
    expect(freeLimit('scan', { scan: null } as any)).toBe(3);
  });
});

describe('canUseFree — la decision', () => {
  it('Premium ne consulte meme pas le compteur', async () => {
    magasin.set(`free_usage:scan:${AUJOURD_HUI}`, '999');
    expect(await canUseFree('scan', true)).toBe(true);
    expect(await remainingFree('scan', true)).toBe(Infinity);
  });

  it('un gratuit consomme exactement son quota, puis bute', async () => {
    // Trois scans gratuits : les trois passent, le quatrieme est refuse.
    for (let i = 0; i < 3; i++) {
      expect(await canUseFree('scan', false)).toBe(true);
      await consume('scan');
    }
    expect(await canUseFree('scan', false)).toBe(false);
    expect(await remainingFree('scan', false)).toBe(0);
  });

  it('le decompte affiche suit la consommation', async () => {
    expect(await remainingFree('scan', false)).toBe(3);
    await consume('scan');
    expect(await remainingFree('scan', false)).toBe(2);
    await consume('scan');
    await consume('scan');
    await consume('scan'); // un de trop : le reste ne devient pas negatif
    expect(await remainingFree('scan', false)).toBe(0);
  });

  it('les features ont des compteurs SEPARES', async () => {
    // Epuiser les scans ne doit pas fermer le coach IA.
    for (let i = 0; i < 3; i++) await consume('scan');
    expect(await canUseFree('scan', false)).toBe(false);
    expect(await canUseFree('ai-coach', false)).toBe(true);
    expect(await remainingFree('ai-coach', false)).toBe(5);
  });

  it('une limite nulle ou negative vaut illimite', async () => {
    for (let i = 0; i < 50; i++) await consume('scan');
    expect(await canUseFree('scan', false, { scan: 0 })).toBe(true);
    expect(await canUseFree('scan', false, { scan: -1 })).toBe(true);
    expect(await remainingFree('scan', false, { scan: 0 })).toBe(Infinity);
  });
});

describe('freemium — la cle du jour', () => {
  it('le compteur est range sous la date LOCALE', async () => {
    await consume('scan');
    expect(magasin.get(`free_usage:scan:${AUJOURD_HUI}`)).toBe('1');
  });

  it('⚠ le quota se remet a zero a MINUIT LOCAL, pas UTC', async () => {
    // `ymd()` lit le fuseau de l'appareil. Consequence a connaitre : un
    // utilisateur qui change de fuseau change de cle, et retrouve ses trois
    // scans. Personne ne triche ainsi par accident, mais un vol vers l'est
    // suffit — et un `toISOString()` aurait fait bien pire : a Casablanca en
    // ete, le quota aurait saute des 23 h, tous les soirs, pour tout le monde.
    const hier = new Date(Date.now() - 86_400_000);
    magasin.set(`free_usage:scan:${ymd(hier)}`, '3');
    expect(await getUsage('scan')).toBe(0);
    expect(await canUseFree('scan', false)).toBe(true);
  });

  it('un compteur illisible vaut zero, jamais NaN', async () => {
    // `NaN < 3` vaut false : sans le garde-fou, une valeur corrompue FERMERAIT
    // la porte au lieu de l'ouvrir — l'inverse du defaut permissif voulu.
    for (const sale of ['', 'abc', '{}', 'null']) {
      magasin.set(`free_usage:scan:${AUJOURD_HUI}`, sale);
      expect(await getUsage('scan')).toBe(0);
      expect(await canUseFree('scan', false)).toBe(true);
    }
  });
});

describe('freemium — quand le stockage tombe', () => {
  it('⚠ TOUT DEVIENT GRATUIT, ET C EST LE CHOIX ASSUME', async () => {
    // `getUsage` rattrape l'erreur et rend 0 : le quota ne se ferme jamais si
    // AsyncStorage est indisponible. C'est ecrit dans l'entete du module
    // (« defaut permissif, jamais throw ») et c'est le bon arbitrage — refuser
    // une action payee a cause d'un stockage muet serait pire. Mais il faut le
    // dire : il n'existe AUCUN garde-fou cote serveur derriere celui-ci.
    for (let i = 0; i < 3; i++) await consume('scan');
    enPanne = true;
    expect(await getUsage('scan')).toBe(0);
    expect(await canUseFree('scan', false)).toBe(true);
    expect(await remainingFree('scan', false)).toBe(3);
  });

  it('consommer malgre la panne ne jette pas', async () => {
    // Le compteur est best-effort : une action deja rendue a l'utilisateur ne
    // doit pas echouer parce qu'on n'a pas su l'enregistrer.
    enPanne = true;
    await expect(consume('scan')).resolves.toBeUndefined();
  });
});

describe('freemium — ce que la production n utilise pas encore', () => {
  it('⚠ `/scan-camera` appelle canUseFree SANS surcharge', () => {
    // Verifie le 13/09/2026 : `canUseFree('scan', isPremium)` et
    // `freeLimit('scan')`, sans troisieme argument. Le levier « changer le
    // quota par un flag, sans redeploiement » existe, est teste ci-dessus, et
    // n'est branche nulle part. Ce test le CONSIGNE pour qu'on ne croie pas
    // pouvoir ouvrir les vannes depuis l'admin en attendant.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'app', '(app)', 'scan-camera.tsx'), 'utf8',
    );
    expect(source).toMatch(/canUseFree\('scan',\s*isPremium\)/);
    expect(source).not.toMatch(/canUseFree\('scan',\s*isPremium,/);
  });
});

/**
 * La vibration qui confirme : petite, et elle ne doit jamais faire échouer un geste.
 * ---------------------------------------------------------------------------
 * `lib/haptique.ts` est le dernier module de `/duo-walk` (316 lignes) et de
 * `/log-food-details` (591) sans test. Il ne calcule rien — et c'est justement
 * ce qui le rend testable utilement : ce qu'on vérifie ici n'est pas un
 * résultat, c'est une **garantie de non-nuisance**.
 *
 * ⚠ UNE VIBRATION QUI ÉCHOUE NE DOIT JAMAIS EMPORTER L'ACTION QU'ELLE CONFIRME.
 * `expo-haptics` rejette sur un appareil sans moteur, ou quand le retour est
 * désactivé dans les réglages du système. Laisser cette erreur remonter ferait
 * échouer l'enregistrement d'un repas parce que le téléphone n'a pas su vibrer.
 *
 * Et un vocabulaire réduit : cinq intentions, pas six façons de vibrer. Une
 * application qui vibre pour tout ne dit plus rien.
 */
let plateforme = 'ios';
jest.mock('react-native', () => ({ get Platform() { return { OS: plateforme }; } }));

const joues: Array<{ type: string; arg: any }> = [];
let moteurCasse = false;

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
  NotificationFeedbackType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
  impactAsync: jest.fn(async (s: string) => {
    if (moteurCasse) throw new Error('pas de moteur haptique');
    joues.push({ type: 'impact', arg: s });
  }),
  notificationAsync: jest.fn(async (t: string) => {
    if (moteurCasse) throw new Error('retour desactive');
    joues.push({ type: 'notification', arg: t });
  }),
}));

import { haptique } from '../lib/haptique';

beforeEach(() => {
  joues.length = 0;
  moteurCasse = false;
  plateforme = 'ios';
});

describe('le vocabulaire : cinq intentions, et cinq seulement', () => {
  it('expose exactement les cinq gestes prevus', () => {
    // Ajouter une sixieme forme demande de se demander ce qu'elle DIT de plus.
    // Ce test est la pour poser la question, pas pour interdire la reponse.
    expect(Object.keys(haptique).sort()).toEqual(['alerte', 'appui', 'choix', 'erreur', 'succes']);
  });

  it('chaque intention joue le retour qui lui correspond', async () => {
    await haptique.appui();
    await haptique.choix();
    await haptique.succes();
    await haptique.alerte();
    await haptique.erreur();
    expect(joues).toEqual([
      { type: 'impact', arg: 'LIGHT' },          // appui : discret
      { type: 'impact', arg: 'MEDIUM' },         // choix : engageant
      { type: 'notification', arg: 'SUCCESS' },
      { type: 'notification', arg: 'WARNING' },
      { type: 'notification', arg: 'ERROR' },
    ]);
  });

  it('⚠ APPUI ET CHOIX NE SE CONFONDENT PAS', async () => {
    // Si les deux jouaient la meme chose, le retour cesserait de distinguer un
    // effleurement d'un engagement — et ne signifierait plus rien.
    await haptique.appui();
    await haptique.choix();
    expect(joues[0].arg).not.toBe(joues[1].arg);
  });

  it('les trois notifications sont distinctes entre elles', async () => {
    await haptique.succes();
    await haptique.alerte();
    await haptique.erreur();
    expect(new Set(joues.map((j) => j.arg)).size).toBe(3);
  });
});

describe('⚠ la garantie de non-nuisance', () => {
  it('un moteur absent ou desactive ne fait JAMAIS rejeter', async () => {
    // Le cas reel : `expo-haptics` rejette, et l'appelant est en plein
    // enregistrement de repas. Sans ce rattrapage, le repas ne serait pas
    // enregistre parce que le telephone n'a pas su vibrer.
    moteurCasse = true;
    for (const geste of Object.values(haptique)) {
      await expect(geste()).resolves.toBeUndefined();
    }
    expect(joues).toHaveLength(0);
  });

  it('sur le web, rien n est meme tente', async () => {
    // `Platform.OS === 'web'` sort avant l'import : pas de module charge, pas
    // d'erreur a rattraper, et surtout aucun poids ajoute a une page.
    plateforme = 'web';
    await haptique.succes();
    await haptique.appui();
    expect(joues).toHaveLength(0);
  });

  it('rend une promesse, pour que l appelant puisse ne PAS l attendre', async () => {
    // Les ecrans appellent `haptique.succes()` sans `await` : la vibration ne
    // doit pas retarder l'affichage. Le contrat est donc qu'elle rende toujours
    // une promesse deja sure de se resoudre.
    const p = haptique.appui();
    expect(typeof p.then).toBe('function');
    await expect(p).resolves.toBeUndefined();
  });

  it('appele en rafale, il ne casse pas', async () => {
    // Une liste qui vibre a chaque element serait un defaut d'usage — mais le
    // module ne doit pas s'effondrer si ca arrive.
    await Promise.all(Array.from({ length: 20 }, () => haptique.appui()));
    expect(joues).toHaveLength(20);
  });
});

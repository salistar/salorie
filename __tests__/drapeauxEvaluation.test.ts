/**
 * L'évaluation d'un drapeau : ce qui décide de ce que chaque utilisateur voit.
 * ---------------------------------------------------------------------------
 * `isEnabled` est appelée par tous les hubs et par chaque `useScreenGate`. Une
 * erreur ici ne se voit sur AUCUN écran de développement : elle se voit chez des
 * utilisateurs qu'on ne regarde pas, sur des versions qu'on n'a plus.
 *
 * Trois mécanismes, et chacun a un piège classique :
 *
 *   COMPARAISON DE VERSIONS  '1.10.0' est-il >= '1.9.0' ? En comparant les
 *                            chaînes, non — et une fonctionnalité disparaît chez
 *                            tous ceux qui ont mis à jour.
 *   ROLLOUT PROGRESSIF       un hash mal écrit ne « déploie » pas à 10 % : il
 *                            déploie à 0 % ou à 100 %, et les deux ressemblent à
 *                            un fonctionnement normal vu de la console admin.
 *   DÉFAUTS PERMISSIFS       le module refuse de masquer quand il lui manque une
 *                            information. C'est un CHOIX, et un choix inhabituel
 *                            — sans test, quelqu'un le « corrigera ».
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined),
}));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('../lib/firebase', () => ({ db: {} }));

import { isEnabled, inRollout, versionGte, flagRequiresPremium, flagConfig } from '../lib/featureFlags';

describe('versionGte', () => {
  it('compare des NOMBRES, pas des chaines', () => {
    // Le piege : en comparaison lexicographique, '1.10.0' < '1.9.0'. La
    // fonctionnalite disparaitrait donc precisement chez ceux qui ont mis a jour.
    expect(versionGte('1.10.0', '1.9.0')).toBe(true);
    expect(versionGte('1.9.0', '1.10.0')).toBe(false);
    expect(versionGte('2.0.0', '10.0.0')).toBe(false);
  });

  it('tolere les longueurs inegales', () => {
    expect(versionGte('1.2', '1.2.0')).toBe(true);
    expect(versionGte('1.2.0', '1.2')).toBe(true);
    expect(versionGte('1.2', '1.2.1')).toBe(false);
  });

  it('egalite = autorise', () => {
    expect(versionGte('3.4.5', '3.4.5')).toBe(true);
  });

  it('segments non numeriques comptes pour zero, sans jeter', () => {
    // Une version de build ('1.2.0-rc1') ne doit pas faire planter le gating.
    expect(versionGte('1.2.x', '1.2.0')).toBe(true);
    expect(versionGte('', '0.0.1')).toBe(false);
    expect(versionGte('1.0.0', '')).toBe(true);
  });
});

describe('inRollout', () => {
  it('est stable : le meme utilisateur tombe toujours du meme cote', () => {
    // Sans ca, une fonctionnalite clignoterait d'un ecran a l'autre.
    const a = inRollout('user-42', 'battle', 50);
    for (let i = 0; i < 20; i++) expect(inRollout('user-42', 'battle', 50)).toBe(a);
  });

  it('separe les drapeaux : un meme utilisateur n est pas dans tous ou aucun', () => {
    // Si le hash ignorait la cle, un utilisateur « chanceux » verrait TOUS les
    // deploiements progressifs et un autre AUCUN.
    const vrais = ['battle', 'races', 'streaks', 'fasting', 'social',
      'medals', 'vitals', 'microbiome', 'strava', 'family'];
    const vus = vrais.map((k) => inRollout('user-42', k, 50));
    expect(new Set(vus).size).toBe(2);
  });

  it('⚠ des cles qui ne different QUE par leur dernier caractere sont correlees', () => {
    // Ce n'est pas un defaut a corriger, c'est une propriete de djb2 qu'il faut
    // CONNAITRE. `h = h*33 + c` : a prefixe egal, deux cles voisines donnent deux
    // empreintes voisines, donc deux seaux consecutifs.
    //
    // Mesure : 'user-42:a'..'user-42:h' tombent dans 66,67,68,69,70,71,72,73.
    // Les huit sont du meme cote d'un seuil a 50 %.
    //
    // Sans consequence sur les drapeaux reels ('battle', 'races'...), qui
    // different partout — le test au-dessus le verifie. Mais un jour ou l'autre
    // quelqu'un voudra un test A/B nomme 'variante-a' / 'variante-b' / 'variante-c'
    // et les trois groupes se recouvriront presque parfaitement. Ce test existe
    // pour que ce jour-la, la cause soit ecrite quelque part.
    const seau = (u: string, k: string) => {
      const s = `${u}:${k}`;
      let h = 5381;
      for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
      return h % 100;
    };
    const suite = ['a', 'b', 'c', 'd'].map((k) => seau('user-42', k));
    expect(suite).toEqual([suite[0], suite[0] + 1, suite[0] + 2, suite[0] + 3]);
  });

  it('deploie a peu pres le pourcentage demande', () => {
    // Un hash casse rend 0 % ou 100 %, et les deux passent inapercus depuis la
    // console admin. On mesure donc la distribution reelle sur 2 000 tirages.
    const n = 2000;
    let dedans = 0;
    for (let i = 0; i < n; i++) if (inRollout('u' + i, 'races', 30)) dedans += 1;
    const pct = (dedans / n) * 100;
    expect(pct).toBeGreaterThan(24);
    expect(pct).toBeLessThan(36);
  });

  it('bornes : 0 n ouvre a personne, 100 ouvre a tous', () => {
    expect(inRollout('u1', 'k', 0)).toBe(false);
    expect(inRollout('u1', 'k', -5)).toBe(false);
    expect(inRollout('u1', 'k', 100)).toBe(true);
    expect(inRollout('u1', 'k', 150)).toBe(true);
  });

  it('sans identite stable : on laisse passer', () => {
    // ⚠ CHOIX ASSUME. Sans `userKey`, un bucket serait tire au hasard a chaque
    // session et la fonctionnalite clignoterait. On prefere ne pas masquer.
    expect(inRollout('', 'k', 1)).toBe(true);
  });
});

describe('isEnabled : le defaut est ACTIVE', () => {
  it('drapeau absent, carte vide, carte nulle → active', () => {
    expect(isEnabled({}, 'inconnu')).toBe(true);
    expect(isEnabled(null, 'inconnu')).toBe(true);
    expect(isEnabled(undefined, 'inconnu')).toBe(true);
    expect(isEnabled({ autre: false }, 'inconnu')).toBe(true);
  });

  it('ne masque QUE sur un refus explicite', () => {
    expect(isEnabled({ k: false }, 'k')).toBe(false);
    expect(isEnabled({ k: true }, 'k')).toBe(true);
    expect(isEnabled({ k: { enabled: false } }, 'k')).toBe(false);
    expect(isEnabled({ k: { enabled: true } }, 'k')).toBe(true);
    // `enabled` absent d'un objet riche n'est pas un refus.
    expect(isEnabled({ k: { premium: true } }, 'k')).toBe(true);
  });

  it('un type inattendu n eteint rien', () => {
    // Un admin qui tape « oui » dans Firestore ne doit pas eteindre l ecran.
    expect(isEnabled({ k: 'oui' } as any, 'k')).toBe(true);
    expect(isEnabled({ k: 42 } as any, 'k')).toBe(true);
  });
});

describe('isEnabled : rollout et version ne s appliquent QUE si le contexte existe', () => {
  it('rollout ignore sans userKey', () => {
    // ⚠ Consequence assumee : un deploiement a 1 % est visible par 100 % des
    // clients qui n'ont pas d'identite stable. Le module prefere montrer que
    // masquer par accident. C'est ecrit ici pour que personne ne le « corrige »
    // sans mesurer ce que ca coupe.
    expect(isEnabled({ k: { rollout: 1 } }, 'k')).toBe(true);
    expect(isEnabled({ k: { rollout: 1 } }, 'k', {})).toBe(true);
  });

  it('rollout applique des qu il y a un userKey', () => {
    expect(isEnabled({ k: { rollout: 0 } }, 'k', { userKey: 'u1' })).toBe(false);
    expect(isEnabled({ k: { rollout: 100 } }, 'k', { userKey: 'u1' })).toBe(true);
  });

  it('minVersion ignoree sans appVersion, appliquee avec', () => {
    const f = { k: { minVersion: '2.0.0' } };
    expect(isEnabled(f, 'k')).toBe(true);
    expect(isEnabled(f, 'k', { appVersion: '1.9.9' })).toBe(false);
    expect(isEnabled(f, 'k', { appVersion: '2.0.0' })).toBe(true);
    // Le cas qui casserait avec une comparaison de chaines.
    expect(isEnabled({ k: { minVersion: '1.9.0' } }, 'k', { appVersion: '1.10.0' })).toBe(true);
  });

  it('un refus explicite bat tout le reste', () => {
    // `enabled:false` est teste AVANT rollout et minVersion : l'interrupteur
    // d'urgence ne doit dependre d'aucun contexte pour fonctionner.
    const f = { k: { enabled: false, rollout: 100, minVersion: '0.0.1' } };
    expect(isEnabled(f, 'k', { userKey: 'u1', appVersion: '9.9.9' })).toBe(false);
  });
});

describe('premium et config', () => {
  it('premium n est vrai que sur un objet qui le dit', () => {
    expect(flagRequiresPremium({ k: { premium: true } }, 'k')).toBe(true);
    expect(flagRequiresPremium({ k: true }, 'k')).toBe(false);
    expect(flagRequiresPremium({ k: { premium: false } }, 'k')).toBe(false);
    expect(flagRequiresPremium(null, 'k')).toBe(false);
  });

  it('config rend toujours un objet, jamais undefined', () => {
    // Les ecrans font `flagConfig(...).champ` sans garde.
    expect(flagConfig({ k: { config: { max: 3 } } }, 'k')).toEqual({ max: 3 });
    expect(flagConfig({ k: true }, 'k')).toEqual({});
    expect(flagConfig(null, 'k')).toEqual({});
  });
});

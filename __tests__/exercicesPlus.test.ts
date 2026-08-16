import { EXERCICES_PLUS, PAR_ID, parMateriel } from '../lib/exercicesPlus';

/**
 * Le catalogue d'exercices.
 *
 * Ce ne sont pas des données décoratives : les MET servent au calcul des
 * calories, et les clés de muscle s'affichent à l'écran. Une valeur inventée
 * fausse un chiffre que les gens lisent comme une mesure ; une clé inexistante
 * affiche `muscle.machin` en toutes lettres.
 */

/** Les seules clés de muscle qui existent dans lib/i18n.tsx. */
const MUSCLES_CONNUS = new Set([
  'muscle.back', 'muscle.biceps', 'muscle.calves', 'muscle.chest', 'muscle.core',
  'muscle.forearms', 'muscle.full_body', 'muscle.glutes', 'muscle.hamstrings',
  'muscle.legs', 'muscle.obliques', 'muscle.quads', 'muscle.rear_delts',
  'muscle.shoulders', 'muscle.triceps',
]);

describe('intégrité du catalogue', () => {
  it('a des identifiants uniques', () => {
    const vus = EXERCICES_PLUS.map((e) => e.id);
    expect(new Set(vus).size).toBe(vus.length);
  });

  it('ne cite que des muscles qui existent en traduction', () => {
    for (const e of EXERCICES_PLUS) {
      for (const m of e.muscles) {
        expect(`${e.id} → ${m}`).toBe(MUSCLES_CONNUS.has(m) ? `${e.id} → ${m}` : 'CLÉ INCONNUE');
      }
    }
  });

  it('donne un nom ET une consigne dans les trois langues', () => {
    // Un champ vide passerait le typage sans broncher et laisserait un trou à
    // l'écran, en arabe seulement — donc invisible en développement.
    for (const e of EXERCICES_PLUS) {
      for (const lg of ['fr', 'en', 'ar'] as const) {
        expect(`${e.id}.label.${lg}`).toBe(e.label[lg]?.trim() ? `${e.id}.label.${lg}` : 'VIDE');
        expect(`${e.id}.howto.${lg}`).toBe(e.howto[lg]?.trim() ? `${e.id}.howto.${lg}` : 'VIDE');
      }
    }
  });

  it('a des consignes réellement traduites, pas recopiées', () => {
    // Copier l'anglais dans le champ arabe est l'erreur la plus facile à commettre
    // et la plus difficile à voir quand on ne lit pas la langue.
    for (const e of EXERCICES_PLUS) {
      expect(`${e.id}: fr≠en`).toBe(e.howto.fr !== e.howto.en ? `${e.id}: fr≠en` : 'RECOPIÉ');
      expect(`${e.id}: ar arabe`).toBe(/[؀-ۿ]/.test(e.howto.ar) ? `${e.id}: ar arabe` : 'PAS EN ARABE');
    }
  });
});

describe('les MET', () => {
  it('vont du plus bas au plus haut', () => {
    for (const e of EXERCICES_PLUS) {
      expect(`${e.id}`).toBe(e.mets[0] <= e.mets[1] && e.mets[1] <= e.mets[2] ? `${e.id}` : 'DÉSORDONNÉ');
    }
  });

  it('restent dans les bornes du Compendium', () => {
    // Sous 2, on ne bouge pas ; au-dessus de 15, on est au-delà du sprint. Une
    // valeur hors de ces bornes est une faute de frappe, et elle se traduit
    // directement en calories fausses.
    for (const e of EXERCICES_PLUS) {
      for (const m of e.mets) {
        expect(`${e.id}: ${m}`).toBe(m >= 2 && m <= 15 ? `${e.id}: ${m}` : 'HORS BORNES');
      }
    }
  });

  it('donne aux polyarticulaires plus qu’aux isolations', () => {
    // Un burpee doit coûter plus qu'un curl de poignet. Si l'inverse arrivait,
    // c'est que les valeurs ont été posées au hasard.
    const burpee = PAR_ID['burpee'];
    const poignet = PAR_ID['wrist_curl'];
    expect(burpee.mets[2]).toBeGreaterThan(poignet.mets[2] * 2);
  });
});

describe('filtrage par matériel', () => {
  it('sépare vraiment le sans-matériel du reste', () => {
    const sansRien = parMateriel('aucun');
    expect(sansRien.length).toBeGreaterThan(10);
    expect(sansRien.every((e) => e.materiel === 'aucun')).toBe(true);
  });

  it('couvre chaque type de matériel', () => {
    for (const m of ['aucun', 'halteres', 'barre', 'machine', 'poulie', 'elastique'] as const) {
      expect(`${m}: ${parMateriel(m).length}`).not.toBe(`${m}: 0`);
    }
  });
});

describe("l'index", () => {
  it('retrouve chaque exercice par son identifiant', () => {
    expect(Object.keys(PAR_ID)).toHaveLength(EXERCICES_PLUS.length);
    expect(PAR_ID['pushup']?.label.fr).toBe('Pompes');
  });
});

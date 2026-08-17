import { prioriteSubstitution, consigneSubstitution, consignePriorite } from '../web/lib/substitutions';

/**
 * L'ordre des priorités de santé.
 *
 * C'est la seule partie de l'écran de substitutions qui peut produire un
 * MAUVAIS conseil : si la priorité est fausse, l'IA classe les alternatives
 * selon le mauvais critère et recommande en premier ce qu'il faudrait éviter.
 */

describe('prioriteSubstitution', () => {
  it('place l’hypertension avant tout le reste', () => {
    // LE cas qui justifie l'ordre : hypertendu ET en perte de poids. Classer
    // par calories lui mettrait en tete un produit moins calorique et plus
    // sale — exactement l'inverse de ce qu'il lui faut.
    expect(prioriteSubstitution({ conditions: ['hypertension'], goal: 'lose' })).toBe('sel');
  });

  it('place le diabète avant la perte de poids', () => {
    expect(prioriteSubstitution({ conditions: ['diabetes'], goal: 'lose' })).toBe('sucre');
  });

  it('retient l’hypertension quand les deux conditions coexistent', () => {
    expect(prioriteSubstitution({ conditions: ['diabetes', 'hypertension'] })).toBe('sel');
  });

  it('tombe sur les calories pour une perte de poids sans condition', () => {
    expect(prioriteSubstitution({ conditions: [], goal: 'lose' })).toBe('calories');
  });

  it('reste neutre quand rien ne s’applique', () => {
    // Mieux vaut un classement neutre qu'un classement invente.
    expect(prioriteSubstitution({ conditions: [], goal: 'maintain' })).toBeNull();
    expect(prioriteSubstitution(null)).toBeNull();
    expect(prioriteSubstitution(undefined)).toBeNull();
  });

  it('survit à un champ conditions mal formé', () => {
    // Un profil ancien peut porter une chaine la ou on attend un tableau ;
    // `.includes` sur une chaine renverrait un resultat fortuit.
    expect(prioriteSubstitution({ conditions: 'hypertension' as any, goal: 'lose' })).toBe('calories');
  });
});

describe('consigneSubstitution', () => {
  it('inclut l’aliment et la consigne de priorité', () => {
    const c = consigneSubstitution('pizza surgelée', 'sel');
    expect(c).toContain('pizza surgelée');
    expect(c).toContain('moins de sel');
  });

  it('n’ajoute rien quand la priorité est neutre', () => {
    expect(consignePriorite(null)).toBe('');
  });

  it('borne la longueur du nom d’aliment', () => {
    // Un champ libre part dans la consigne envoyee au modele : le tronquer
    // evite qu'un collage de plusieurs milliers de caracteres ne parte tel quel.
    const c = consigneSubstitution('a'.repeat(500), null);
    expect(c).not.toContain('a'.repeat(81));
  });
});

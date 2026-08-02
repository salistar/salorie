// Épingle le framework A/B minimal côté client (lib/experiments.ts).
// On teste UNIQUEMENT assignVariant : logique PURE (hash déterministe), pas de
// réseau, pas de rendu RN, pas de Date.now() → tests déterministes et rapides.
// (useExperiment n'est qu'un wrapper hook + log ; le cœur testable est assignVariant.)
import { assignVariant } from '../lib/experiments';

describe('assignVariant', () => {
  const variants = ['control', 'variant_a', 'variant_b'];

  test('DÉTERMINISTE : même (userId, key) → même variante sur plusieurs appels', () => {
    const a = assignVariant('user-42', 'coach_cta_v1', variants);
    const b = assignVariant('user-42', 'coach_cta_v1', variants);
    const c = assignVariant('user-42', 'coach_cta_v1', variants);
    expect(a).toBe(b);
    expect(b).toBe(c);
    // la variante retournée fait bien partie de la liste fournie
    expect(variants).toContain(a);
  });

  test('la variante appartient toujours à la liste fournie', () => {
    for (let i = 0; i < 200; i++) {
      const v = assignVariant(`u${i}`, 'exp', variants);
      expect(variants).toContain(v);
    }
  });

  test('des userId différents ne donnent PAS tous la même variante', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(assignVariant(`user-${i}`, 'exp', variants));
    }
    // la répartition n'est pas constante : au moins 2 variantes apparaissent
    expect(seen.size).toBeGreaterThan(1);
  });

  test('des clés d’expérience différentes peuvent router le même user ailleurs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seen.add(assignVariant('user-fixe', `exp_${i}`, variants));
    }
    // en variant la clé (user figé), on ne tombe pas systématiquement sur la même variante
    expect(seen.size).toBeGreaterThan(1);
  });

  // --- Cas limites : ne doivent JAMAIS jeter ---
  test('variants vide → retourne "" (ne jette pas)', () => {
    expect(() => assignVariant('user-1', 'exp', [])).not.toThrow();
    expect(assignVariant('user-1', 'exp', [])).toBe('');
  });

  test('une seule variante → toujours celle-là', () => {
    expect(assignVariant('user-1', 'exp', ['only'])).toBe('only');
    expect(assignVariant('', 'exp', ['only'])).toBe('only');
  });

  test('userId vide → ne jette pas et reste DÉTERMINISTE', () => {
    expect(() => assignVariant('', 'exp', variants)).not.toThrow();
    const a = assignVariant('', 'exp', variants);
    const b = assignVariant('', 'exp', variants);
    expect(a).toBe(b);
    expect(variants).toContain(a);
  });

  // --- Répartition approximativement équilibrée sur ~1000 userIds synthétiques ---
  test('répartition ~équilibrée sur 1000 userIds : chaque variante a une part raisonnable', () => {
    const N = 1000;
    const counts: Record<string, number> = { control: 0, variant_a: 0, variant_b: 0 };
    for (let i = 0; i < N; i++) {
      counts[assignVariant(`synthetic-user-${i}`, 'balance_exp', variants)]++;
    }
    const expected = N / variants.length; // ~333 par variante
    for (const v of variants) {
      // aucune variante vide, et chacune dans une fenêtre large mais non triviale
      expect(counts[v]).toBeGreaterThan(0);
      expect(counts[v]).toBeGreaterThan(expected * 0.5); // > ~166
      expect(counts[v]).toBeLessThan(expected * 1.5); // < ~500
    }
    // somme cohérente
    expect(counts.control + counts.variant_a + counts.variant_b).toBe(N);
  });

  test('répartition binaire (A/B) ~50/50 sur 1000 users', () => {
    const N = 1000;
    let a = 0;
    for (let i = 0; i < N; i++) {
      if (assignVariant(`bin-user-${i}`, 'ab_exp', ['A', 'B']) === 'A') a++;
    }
    // tolérance large : entre 35 % et 65 %
    expect(a).toBeGreaterThan(N * 0.35);
    expect(a).toBeLessThan(N * 0.65);
  });
});

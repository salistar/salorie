/**
 * Quatre modules fabriquent la même clé de date. Ils doivent dire la même chose.
 * ---------------------------------------------------------------------------
 * `'YYYY-MM-DD'` sert de clé pour ranger une journée : les repas, les mesures
 * de tension, le quota gratuit, les entrées de suivi. Quatre endroits la
 * produisent, chacun avec son propre bout de code :
 *
 *   - `lib/format.ymd(date)`            — la source unique annoncée
 *   - `lib/tracking.todayStr()`         — suivi (mesures, sommeil, humeur)
 *   - `lib/rapportSanteHtml.dayStr(ts)` — export santé
 *   - `lib/vitals` (privée, non exportée) — glycémie et tension
 *
 * ⚠ SI DEUX D'ENTRE ELLES DIVERGEAIENT, UNE JOURNÉE SE RANGERAIT SOUS DEUX
 * CLÉS. La moitié des données disparaîtrait de l'écran qui les relit — sans
 * erreur, sans trou visible : juste un jour qui paraît plus léger. C'est le
 * genre de défaut qu'on attribue à l'utilisateur (« j'ai dû oublier de logger »).
 *
 * Ce test ne teste donc pas un module : il teste un ACCORD entre quatre.
 */

// `lib/tracking` importe Firestore au chargement. On ne teste pas ses ecritures
// ici — seulement sa fabrication de cle — d'ou ces doubles minimaux.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(), addDoc: jest.fn(), getDocs: jest.fn(), query: jest.fn(),
  orderBy: jest.fn(), limit: jest.fn(), serverTimestamp: jest.fn(), doc: jest.fn(),
  deleteDoc: jest.fn(),
}));
jest.mock('../lib/firebase', () => ({ db: {}, emailToDocId: (e: string) => e }));

import fs from 'fs';
import path from 'path';
import { ymd } from '../lib/format';
import { todayStr } from '../lib/tracking';
import { dayStr } from '../lib/rapportSanteHtml';

describe('la cle du jour, vue par les trois modules qui l exportent', () => {
  it('rendent EXACTEMENT la meme chaine pour maintenant', () => {
    const maintenant = new Date();
    const attendu = ymd(maintenant);
    expect(todayStr()).toBe(attendu);
    expect(dayStr(maintenant.getTime())).toBe(attendu);
  });

  it('la forme est bien YYYY-MM-DD, zeros compris', () => {
    // `2026-3-7` se trierait apres `2026-12-31` dans une comparaison de
    // chaines — et c'est ainsi que `healthExport` filtre sa fenetre
    // (`w.date >= sinceStr`). Les zeros ne sont pas cosmetiques.
    const d = new Date(2026, 2, 7, 12, 0, 0);
    expect(ymd(d)).toBe('2026-03-07');
    expect(dayStr(d.getTime())).toBe('2026-03-07');
    expect(ymd(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('⚠ ELLES SUIVENT LE FUSEAU LOCAL, PAS UTC', () => {
    // `toISOString()` aurait bascule au lendemain des 23 h a Casablanca en ete.
    // Les repas du soir seraient comptes sur le jour suivant, la serie cassee
    // pour tout le monde a la meme heure, et le quota gratuit remis a zero en
    // pleine soiree.
    const soir = new Date(2026, 5, 15, 23, 30);
    expect(ymd(soir)).toBe('2026-06-15');
    expect(dayStr(soir.getTime())).toBe('2026-06-15');
  });

  it('le passage d annee ne decale rien', () => {
    const saintSylvestre = new Date(2026, 11, 31, 23, 59, 59);
    const nouvelAn = new Date(2027, 0, 1, 0, 0, 1);
    expect(ymd(saintSylvestre)).toBe('2026-12-31');
    expect(ymd(nouvelAn)).toBe('2027-01-01');
    expect(dayStr(nouvelAn.getTime())).toBe('2027-01-01');
  });

  it('les trois se comportent pareil sur une annee bissextile', () => {
    const bissextile = new Date(2028, 1, 29, 10, 0, 0);
    expect(ymd(bissextile)).toBe('2028-02-29');
    expect(dayStr(bissextile.getTime())).toBe('2028-02-29');
  });
});

describe('la quatrieme, celle de lib/vitals, qui n est pas exportee', () => {
  it('⚠ EST ECRITE A L IDENTIQUE — verifie sur le SOURCE, faute de pouvoir l appeler', () => {
    // `todayStr(ts)` de `lib/vitals.ts` est privee : elle date les mesures de
    // glycemie et de tension. On ne peut pas l'importer, mais on peut exiger
    // qu'elle reste construite comme les autres — meme ordre, memes zeros,
    // meme `getFullYear/getMonth/getDate` (donc meme fuseau).
    //
    // Une cinquieme copie ecrite un jour avec `toISOString()` rangerait les
    // mesures du soir sous le lendemain, tandis que le rapport sante les
    // chercherait sous la veille. Le rapport serait vide et personne ne saurait
    // pourquoi.
    const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'vitals.ts'), 'utf8');
    const corps = source.slice(source.indexOf('function todayStr'));
    expect(corps).toMatch(/getFullYear\(\)/);
    expect(corps).toMatch(/getMonth\(\) \+ 1/);
    expect(corps).toMatch(/padStart\(2, '0'\)/);
    expect(corps).not.toMatch(/toISOString/);
  });
});

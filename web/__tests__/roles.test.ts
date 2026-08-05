import fs from 'fs';
import path from 'path';

/**
 * Filet contre la route mutante non gardée.
 *
 * Jusqu'au 5 août 2026, tout compte du back-office pouvait tout faire : il n'existait
 * aucun rôle. C'était le principal reproche de l'audit de sécurité. Les rôles ajoutés,
 * le risque se déplace — une route POST/PUT/DELETE écrite demain avec `requireAdmin`
 * au lieu de `requireWriter` laisserait un compte en lecture seule modifier les données,
 * et rien ne le signalerait.
 *
 * Ce test parcourt les fichiers plutôt que d'énumérer une liste : toute route nouvelle
 * est couverte sans que personne ait à y penser.
 */
const RACINE = path.join(__dirname, '..', 'app', 'api');

function routes(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return routes(p);
    return e.name === 'route.ts' ? [p] : [];
  });
}

// /api/auth/* gère sa propre logique : on ne peut pas exiger d'être connecté pour se
// connecter. Ces routes ont leurs propres protections (limitation de tentatives,
// clé d'installation).
const HORS_PERIMETRE = (p: string) => p.replace(/\\/g, '/').includes('/api/auth/');

describe('back-office — aucune route mutante sans contrôle du rôle', () => {
  const fichiers = routes(RACINE).filter((p) => !HORS_PERIMETRE(p));

  it('trouve des routes (sinon le test ne prouve rien)', () => {
    expect(fichiers.length).toBeGreaterThan(5);
  });

  it('chaque POST/PUT/PATCH/DELETE passe par requireWriter', () => {
    const fautifs: string[] = [];
    for (const f of fichiers) {
      const src = fs.readFileSync(f, 'utf8');
      const re = /export async function (POST|PUT|PATCH|DELETE)\([^)]*\)\s*\{([\s\S]*?)\n\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (!m[2].includes('requireWriter')) {
          fautifs.push(`${path.relative(RACINE, f).replace(/\\/g, '/')} ${m[1]}`);
        }
      }
    }
    expect(fautifs).toEqual([]);
  });
});

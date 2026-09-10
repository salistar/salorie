/**
 * Le Node du conteneur doit satisfaire ce que les dépendances exigent.
 * ---------------------------------------------------------------------------
 * `firebase-admin` 14 déclare `engines: { node: ">=22" }`. Rien n'empêche
 * pourtant de l'installer et de le lancer sur un Node 20 : npm émet un
 * avertissement, l'image se construit, le conteneur démarre. Ce qui casse casse
 * plus tard, à l'exécution — et ici, l'exécution en question est
 * `verifyIdToken`, c'est-à-dire l'authentification de toutes les requêtes
 * mobiles.
 *
 * ⚠ CE TEST COMPARE DEUX ENDROITS QUI NE SE PARLENT PAS : le `FROM node:XX` du
 * Dockerfile, et le `engines` du paquet réellement installé. Rien d'autre ne les
 * tient ensemble.
 *
 * Jumeau de `web/__tests__/socleNode.test.ts` : les deux conteneurs partagent le
 * SDK, ils doivent partager le socle.
 */
import * as fs from 'fs';
import * as path from 'path';

const RACINE = path.join(__dirname, '..');
const DOCKERFILE = fs.readFileSync(path.join(RACINE, 'Dockerfile'), 'utf8');

function majorsDuDockerfile(): number[] {
  return [...DOCKERFILE.matchAll(/^FROM node:(\d+)-alpine/gm)].map((m) => Number(m[1]));
}

function minimumExige(paquet: string): number | null {
  const p = path.join(RACINE, 'node_modules', paquet, 'package.json');
  if (!fs.existsSync(p)) return null;
  const exigence = JSON.parse(fs.readFileSync(p, 'utf8'))?.engines?.node as string | undefined;
  const m = exigence?.match(/>=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

describe('socle Node — le conteneur et les dependances', () => {
  it('les deux etages demandent le MEME major', () => {
    const majors = majorsDuDockerfile();
    expect(majors.length).toBe(2);
    expect(new Set(majors).size).toBe(1);
  });

  it('⚠ ce major satisfait ce que firebase-admin exige', () => {
    const [major] = majorsDuDockerfile();
    const exige = minimumExige('firebase-admin');
    expect(exige).not.toBeNull();
    expect(major).toBeGreaterThanOrEqual(exige as number);
  });

  it('le SDK est bien celui qui coupe la chaine google-cloud', () => {
    // La 13 laissait passer firestore, storage, google-gax, retry-request et
    // teeny-request : c'est la 14 qui les coupe, et elle seule.
    const p = path.join(RACINE, 'node_modules', 'firebase-admin', 'package.json');
    const version = JSON.parse(fs.readFileSync(p, 'utf8')).version as string;
    expect(Number(version.split('.')[0])).toBeGreaterThanOrEqual(14);
  });
});

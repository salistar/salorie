/**
 * Le Node du conteneur doit satisfaire ce que les dépendances exigent.
 * ---------------------------------------------------------------------------
 * `firebase-admin` 14 déclare `engines: { node: ">=22" }`. Rien n'empêche
 * pourtant d'installer ce paquet et de le lancer sur un Node 20 : npm émet un
 * avertissement, l'image se construit, le conteneur démarre. Ce qui casse
 * casse plus tard, à l'exécution, sur un appel précis — et donc en production.
 *
 * ⚠ CE TEST COMPARE DEUX ENDROITS QUI NE SE PARLENT PAS : le `FROM node:XX` du
 * Dockerfile, et le `engines` du paquet réellement installé. Rien d'autre ne
 * les tient ensemble. Le jour où une dépendance montera son exigence, ce test
 * échouera au lieu de laisser passer une image qui plante à la première
 * requête.
 *
 * Contexte du 10/09/2026 : la montée de `firebase-admin` 12 → 14 (pour couper
 * une chaîne de huit alertes) a entraîné Node 20 → 22 avec elle. Node 20 était
 * de toute façon en fin de vie depuis avril 2026 — ces conteneurs tournaient
 * sur un runtime sans correctif de sécurité.
 */
import fs from 'fs';
import path from 'path';

const RACINE = path.join(__dirname, '..');
const DOCKERFILE = fs.readFileSync(path.join(RACINE, 'Dockerfile'), 'utf8');

/** Le major de Node demandé par le Dockerfile, une fois par étage. */
function majorsDuDockerfile(): number[] {
  return [...DOCKERFILE.matchAll(/^FROM node:(\d+)-alpine/gm)].map((m) => Number(m[1]));
}

/** Le minimum exigé par un paquet installé, lu dans son `engines.node`. */
function minimumExige(paquet: string): number | null {
  const p = path.join(RACINE, 'node_modules', paquet, 'package.json');
  if (!fs.existsSync(p)) return null;
  const exigence = JSON.parse(fs.readFileSync(p, 'utf8'))?.engines?.node as string | undefined;
  const m = exigence?.match(/>=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

describe('socle Node — le conteneur et les dependances', () => {
  it('les deux etages demandent le MEME major', () => {
    // Construire sur un Node et servir sur un autre, c'est tester une chose et
    // en livrer une seconde.
    const majors = majorsDuDockerfile();
    expect(majors.length).toBe(2);
    expect(new Set(majors).size).toBe(1);
  });

  it('⚠ ce major satisfait ce que firebase-admin exige', () => {
    const [major] = majorsDuDockerfile();
    const exige = minimumExige('firebase-admin');
    expect(exige).not.toBeNull();
    expect(major).toBeGreaterThanOrEqual(exige!);
  });

  it('et ce que Next exige', () => {
    const [major] = majorsDuDockerfile();
    const exige = minimumExige('next');
    expect(exige).not.toBeNull();
    expect(major).toBeGreaterThanOrEqual(exige!);
  });

  it('le Node du poste de travail le satisfait aussi', () => {
    // Sinon le build local ne prouve rien sur celui du conteneur — et c'est
    // exactement le genre d'ecart qui a coute deux deploiements ce jour-la.
    const [major] = majorsDuDockerfile();
    const ici = Number(process.versions.node.split('.')[0]);
    expect(ici).toBeGreaterThanOrEqual(minimumExige('firebase-admin')!);
    expect(major).toBeGreaterThan(0);
  });
});

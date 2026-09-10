/**
 * La racine Turbopack, et l'arbre que le conteneur doit reproduire.
 * ---------------------------------------------------------------------------
 * Les pages de `/me` importent les modules de calcul du dépôt mobile plutôt que
 * d'en garder des copies qui divergeraient : `../../../../lib/nutriScore`,
 * `../../../../assets/data/local-foods.json`. Ces fichiers vivent HORS de
 * `web/`.
 *
 * ⚠ NEXT 16 COMPILE AVEC TURBOPACK, QUI NE RÉSOUT RIEN HORS DE LA RACINE DU
 * PROJET — et devine cette racine en cherchant un fichier de verrouillage.
 *   • En local, `salorie/package-lock.json` existe : racine = le dépôt entier,
 *     `salorie/lib` est dedans, le build passe.
 *   • Dans l'image, seul `web/package-lock.json` est copié : racine = `web/`,
 *     et les mêmes imports tombent dehors.
 *
 * Le 10/09/2026, le premier déploiement après la montée en Next 16 est donc
 * mort sur neuf « Module not found » — alors que le build local venait de
 * passer. Reproduit ensuite à l'identique en local, simplement en cachant le
 * `package-lock.json` du dépôt.
 *
 * Ce test garde les deux moitiés du remède, parce qu'aucune des deux ne se
 * défend toute seule : `next.config.mjs` fixe la racine, le `Dockerfile` place
 * l'arbre dedans. Enlever l'une casse un déploiement, pas un build local — le
 * pire endroit où découvrir une erreur.
 */
import fs from 'fs';
import path from 'path';

const RACINE = path.join(__dirname, '..');
const CONFIG = fs.readFileSync(path.join(RACINE, 'next.config.mjs'), 'utf8');
const DOCKERFILE = fs.readFileSync(path.join(RACINE, 'Dockerfile'), 'utf8');

/** Les imports qui sortent de `web/`, tels qu'ils sont écrits dans les pages. */
function importsHorsWeb(): string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string) => {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
      const p = path.join(dossier, e.name);
      if (e.isDirectory()) parcourir(p);
      else if (/\.tsx?$/.test(e.name)) {
        for (const m of fs.readFileSync(p, 'utf8').matchAll(/from '((?:\.\.\/){3,}[^']+)'/g)) {
          trouves.push(m[1]);
        }
      }
    }
  };
  parcourir(path.join(RACINE, 'app'));
  return trouves;
}

describe('racine Turbopack — ce qui fait passer le build en conteneur', () => {
  it('des pages importent bien hors de web/ (sinon ce test n a plus d objet)', () => {
    const imports = importsHorsWeb();
    expect(imports.length).toBeGreaterThan(0);
    // Les modules de calcul et les deux tables, nommes pour qu'un futur
    // deplacement se voie ici plutot qu'au deploiement.
    expect(imports.some((i) => i.includes('lib/nutriScore'))).toBe(true);
    expect(imports.some((i) => i.includes('assets/data/'))).toBe(true);
  });

  it('⚠ next.config.mjs FIXE la racine au parent de web/', () => {
    // La laisser deviner, c'est la faire dependre de l'endroit ou traine un
    // fichier de verrouillage — different en local et dans l'image.
    expect(CONFIG).toMatch(/turbopack:\s*{\s*root:\s*path\.join\(ICI,\s*'\.\.'\)\s*}/);
  });

  it('le Dockerfile place web/, lib/ et assets/ sous la MEME racine', () => {
    // `/app/web` + `/app/lib` + `/app/assets/data` : l'arbre du depot.
    expect(DOCKERFILE).toMatch(/WORKDIR \/app\/web/);
    expect(DOCKERFILE).toMatch(/COPY lib\/ \/app\/lib\//);
    expect(DOCKERFILE).toMatch(/COPY assets\/data\/ \/app\/assets\/data\//);
  });

  it('⚠ plus aucune copie vers la RACINE du systeme de fichiers', () => {
    // L'ancien montage posait `lib/` dans `/lib` et comptait sur le fait que
    // `../../../../` depuis `/app/app/me/<page>/` retombe sur `/`. Ca marchait
    // par coincidence, et Turbopack y a mis fin.
    expect(DOCKERFILE).not.toMatch(/COPY lib\/ \/lib\//);
    expect(DOCKERFILE).not.toMatch(/COPY assets\/data\/ \/assets\/data\//);
  });

  it('l etage final va chercher le build la ou il est vraiment', () => {
    // Un WORKDIR deplace sans ces quatre lignes donne une image qui se
    // construit, demarre, et sert du vide.
    for (const chemin of ['.next', 'node_modules', 'package.json', 'public']) {
      expect(DOCKERFILE).toContain(`COPY --from=build /app/web/${chemin}`);
    }
  });

  it('⚠ les DEUX etages vivent au MEME chemin absolu', () => {
    // Next 16 depose dans `.next/node_modules/` des liens symboliques ABSOLUS
    // vers les paquets externalises, sous des noms haches
    // (`require-in-the-middle-0b638d63113f337b`). Ils pointent vers le chemin
    // qu'avait `node_modules` au moment du build.
    //
    // Servir ce meme `.next` depuis un autre chemin les fait pendre dans le
    // vide : le 10/09/2026, l'image se construisait, le conteneur demarrait,
    // et TOUTE page rendait 500 sur « Cannot find module
    // 'require-in-the-middle-0b638d63113f337b' » — deploiement vert compris.
    const workdirs = [...DOCKERFILE.matchAll(/^WORKDIR (\S+)/gm)].map((m) => m[1]);
    expect(workdirs.length).toBe(2);
    expect(new Set(workdirs).size).toBe(1);
    expect(workdirs[0]).toBe('/app/web');
  });
});

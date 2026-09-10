/**
 * Un point dans l'URL ne fait pas d'elle un fichier public.
 * ---------------------------------------------------------------------------
 * Le middleware laisse passer les fichiers servis à la racine par la landing
 * (`robots.txt`, `og.png`, `screenshots/*`) sans exiger de session. La règle
 * était : « un point dans le dernier segment = un fichier statique ».
 *
 * ⚠ LES IDENTIFIANTS D'UTILISATEUR DE CETTE APPLICATION SONT DES COURRIELS.
 * `/users/test@example.com` se termine par « .com ». Le middleware le prenait
 * donc pour un fichier et n'exigeait **aucune authentification** : `/users`
 * rendait 307 vers `/login`, `/users/<courriel>` rendait 200.
 *
 * Constaté le 10/09/2026 en vérifiant la montée en Next 16 — le même
 * comportement existait en production sous Next 14, donc ce n'était pas une
 * régression de la montée, mais c'est elle qui l'a fait voir.
 *
 * ⚠ AUCUNE DONNÉE NE FUYAIT, et c'est important de le dire précisément :
 * `requireAdmin` refuse à l'intérieur de la page, dont le corps ne contenait
 * que « unauthorized ». C'est la défense en profondeur qui a tenu, pas cette
 * règle. Un écran d'administration qui oublierait son propre contrôle aurait
 * été, lui, entièrement ouvert — et c'est exactement le genre d'oubli qu'une
 * seconde barrière est censée rattraper.
 *
 * Ce test porte sur la RÈGLE, pas sur le rendu : il lit l'expression du
 * middleware et l'exerce sur les deux familles de chemins.
 */
import fs from 'fs';
import path from 'path';

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'middleware.ts'), 'utf8');

/** Extrait l'expression réellement écrite dans le middleware. */
function regleFichiers(): RegExp {
  const m = SOURCE.match(/const EXTENSIONS_PUBLIQUES = (\/.+\/[a-z]*);/);
  if (!m) throw new Error('EXTENSIONS_PUBLIQUES introuvable dans middleware.ts');
  const [, corps] = m;
  const dernier = corps.lastIndexOf('/');
  return new RegExp(corps.slice(1, dernier), corps.slice(dernier + 1));
}

const EST_FICHIER = regleFichiers();

describe('middleware — ce qui passe sans session', () => {
  it('⚠ un chemin finissant par un domaine n est PAS un fichier', () => {
    // Le défaut d'origine, dans les deux formes qu'il prenait.
    expect(EST_FICHIER.test('/users/test@example.com')).toBe(false);
    expect(EST_FICHIER.test('/users/idriss@salistar.com')).toBe(false);
    expect(EST_FICHIER.test('/users/a@b.fr')).toBe(false);
    expect(EST_FICHIER.test('/users/a@b.ma')).toBe(false);
  });

  it('un identifiant quelconque avec un point n est pas un fichier', () => {
    expect(EST_FICHIER.test('/emails/abc.def')).toBe(false);
    expect(EST_FICHIER.test('/orgs/v1.2')).toBe(false);
  });

  it('les vrais fichiers de public/ passent toujours', () => {
    // Les casser reviendrait à échanger une faille contre une landing sans
    // images ni robots.txt — le remède serait pire.
    for (const f of [
      '/robots.txt', '/sitemap.xml', '/og.png', '/icon.png',
      '/favicon.svg', '/logo-wordmark.png', '/screenshots/01-home.png',
    ]) {
      expect(EST_FICHIER.test(f)).toBe(true);
    }
  });

  it('l extension est reconnue quelle que soit la casse', () => {
    expect(EST_FICHIER.test('/OG.PNG')).toBe(true);
    expect(EST_FICHIER.test('/Robots.Txt')).toBe(true);
  });

  it('la liste reste fermee : une extension inconnue n echappe pas au controle', () => {
    // Ajouter `.*` ici ramènerait exactement le défaut d'origine.
    expect(EST_FICHIER.test('/export/donnees.csv')).toBe(false);
    expect(EST_FICHIER.test('/sauvegarde.zip')).toBe(false);
    expect(EST_FICHIER.test('/config.json')).toBe(false);
  });

  it('la regle s applique en FIN de chemin, pas au milieu', () => {
    // Sinon `/og.png/../users/x` ou `/a.png/secret` passeraient.
    expect(EST_FICHIER.test('/og.png/users/secret')).toBe(false);
  });
});

describe('tunnel Sentry — public par necessite', () => {
  it('⚠ /monitoring sort AVANT le controle de session', () => {
    // `tunnelRoute: '/monitoring'` fait passer les rapports du navigateur par
    // notre domaine, les bloqueurs coupant *.sentry.io. Tombee dans la regle
    // generale, la route rendait 307 vers /login et le SDK jetait le rapport :
    // aucune erreur d'un visiteur non connecte n'arrivait — landing, /me et
    // page de connexion comprises. Verifie en production le 10/09/2026.
    expect(SOURCE).toMatch(/const TUNNEL_SENTRY = '\/monitoring'/);
    // Et la sortie doit se faire AVANT la lecture du cookie, sinon elle ne sert
    // a rien.
    const sortie = SOURCE.indexOf('TUNNEL_SENTRY + ');
    const controle = SOURCE.indexOf('req.cookies.get(AUTH_COOKIE)');
    expect(sortie).toBeGreaterThan(-1);
    expect(sortie).toBeLessThan(controle);
  });

  it('les trois pieces du tunnel nomment le MEME chemin', () => {
    // Le tunnel tient en trois fichiers : le navigateur qui l'emprunte, la
    // route qui relaie, et la sortie du portail. Les desaccorder rouvrirait le
    // trou en silence — un rapport perdu ne fait pas d'erreur.
    const client = fs.readFileSync(path.join(__dirname, '..', 'instrumentation-client.ts'), 'utf8');
    expect(client).toMatch(/tunnel:\s*'\/monitoring'/);
    expect(fs.existsSync(path.join(__dirname, '..', 'app', 'monitoring', 'route.ts'))).toBe(true);
  });

  it('⚠ le fichier client porte le nom que Turbopack lit encore', () => {
    // `sentry.client.config.ts` n'est plus charge sous Turbopack : le build
    // passe, et la surveillance navigateur s'arrete sans rien dire. Mesure du
    // 10/09/2026 : le DSN n'etait dans aucun fichier de `.next/static/`.
    expect(fs.existsSync(path.join(__dirname, '..', 'instrumentation-client.ts'))).toBe(true);
    expect(fs.existsSync(path.join(__dirname, '..', 'sentry.client.config.ts'))).toBe(false);
  });
});

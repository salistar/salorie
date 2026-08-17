// Aller chercher une page web dont l'URL vient de l'utilisateur.
// ---------------------------------------------------------------------------
// C'est la definition meme d'une SSRF si on le fait naivement : le serveur se
// trouve DANS le reseau prive, et une URL comme `http://169.254.169.254/` ou
// `http://127.0.0.1:6379/` lui fait interroger des choses que l'appelant
// n'atteindrait jamais lui-meme.
//
// Trois lignes de defense, parce qu'aucune ne suffit seule :
//
//   1. Le schema : uniquement http et https. `file://`, `gopher://`, `redis://`
//      n'ont rien a faire ici.
//   2. Les ADRESSES RESOLUES, pas le nom d'hote. Interdire « localhost » ne sert
//      a rien : `lvh.me` et mille autres noms publics resolvent vers 127.0.0.1.
//      On resout et on inspecte chaque adresse obtenue.
//   3. Chaque REDIRECTION est revalidee. Un serveur public qui renvoie un 302
//      vers 169.254.169.254 contournerait un controle fait une seule fois.
//
// Reste une faille connue et non fermee ici : le rebinding DNS, ou le nom change
// d'adresse entre la verification et la connexion. La parade complete demande de
// se connecter a l'IP validee en portant le nom en SNI, ce que `fetch` ne permet
// pas. Ce qui limite serieusement la portee : cette fonction ne rend JAMAIS le
// corps recupere a l'appelant — seul un resume produit par le modele ressort.
// Un attaquant ne peut donc pas lire une reponse interne, au mieux deviner
// qu'une adresse repond.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** Un octet de tete suffit rarement : on compare des plages entieres. */
function ipv4Interdite(ip: string): boolean {
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = o;
  return (
    a === 0 ||                          // 0.0.0.0/8 — « cet hote »
    a === 10 ||                         // prive
    a === 127 ||                        // boucle locale
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) ||         // lien-local — metadonnees cloud
    (a === 172 && b >= 16 && b <= 31) || // prive
    (a === 192 && b === 168) ||         // prive
    (a === 192 && b === 0) ||           // IETF protocol assignments
    (a === 198 && b >= 18 && b <= 19) || // bancs de test
    a >= 224                            // multicast et reserve
  );
}

function ipv6Interdite(ip: string): boolean {
  const x = ip.toLowerCase().replace(/^\[|\]$/g, '');

  // Une adresse IPv4 encapsulee doit repasser par le controle v4, sinon la boucle
  // locale rentre par la porte de derriere.
  //
  // ATTENTION — elle s'ecrit de DEUX facons, et c'est le piege : on peut la taper
  // `::ffff:127.0.0.1`, mais `new URL()` la normalise en `::ffff:7f00:1`. Un
  // controle qui ne reconnait que la forme pointee laisse donc passer exactement
  // ce qu'il croyait bloquer — verifie par un test avant d'etre corrige ici.
  const pointee = x.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (pointee) return ipv4Interdite(pointee[1]);

  const hexa = x.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexa) {
    const haut = parseInt(hexa[1], 16);
    const bas = parseInt(hexa[2], 16);
    const v4 = `${(haut >> 8) & 0xff}.${haut & 0xff}.${(bas >> 8) & 0xff}.${bas & 0xff}`;
    return ipv4Interdite(v4);
  }

  return (
    x === '::' || x === '::1' ||        // non specifiee, boucle locale
    x.startsWith('fe80') ||             // lien-local
    x.startsWith('fc') || x.startsWith('fd') || // uniques locales
    x.startsWith('ff') ||               // multicast
    x.startsWith('64:ff9b')             // NAT64 — peut viser du prive v4
  );
}

/** Vrai si l'URL est sure a demander. Resout le nom et inspecte CHAQUE adresse. */
export async function urlAutorisee(u: URL): Promise<boolean> {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  // Un port exotique vise presque toujours un service interne.
  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (port !== 80 && port !== 443 && port !== 8080) return false;

  const hote = u.hostname.replace(/^\[|\]$/g, '');
  // Une IP litterale ne passe pas par le resolveur : on la controle directement.
  const version = isIP(hote);
  if (version === 4) return !ipv4Interdite(hote);
  if (version === 6) return !ipv6Interdite(hote);

  let adresses: { address: string; family: number }[];
  try {
    adresses = await lookup(hote, { all: true });
  } catch {
    return false;
  }
  if (!adresses.length) return false;
  // TOUTES doivent etre publiques. Un nom qui resout vers une adresse publique et
  // une privee servirait a l'attaquant a jouer sur l'ordre de tirage.
  return adresses.every((a) => (a.family === 4 ? !ipv4Interdite(a.address) : !ipv6Interdite(a.address)));
}

const TAILLE_MAX = 400_000;   // octets lus, avant nettoyage
const DELAI_MS = 12_000;
const REDIRECTIONS_MAX = 3;

/**
 * Recupere le HTML d'une page, nettoye et tronque. Leve une erreur explicite
 * plutot que de rendre une chaine vide : « rien trouve » et « adresse refusee »
 * appellent des messages differents cote utilisateur.
 */
export async function lirePage(urlBrute: string, maxCaracteres = 9000): Promise<string> {
  let courante: URL;
  try {
    courante = new URL(/^https?:\/\//i.test(urlBrute) ? urlBrute : `https://${urlBrute}`);
  } catch {
    throw new Error('url-invalide');
  }

  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS);
  try {
    let reponse: Response | null = null;
    for (let saut = 0; saut <= REDIRECTIONS_MAX; saut++) {
      if (!(await urlAutorisee(courante))) throw new Error('adresse-refusee');
      // `manual` : on suit nous-memes, pour revalider chaque etape. En laissant
      // `fetch` suivre, seule la PREMIERE adresse serait controlee.
      const r = await fetch(courante.toString(), {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SalorieBot/1.0; +https://salorie.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (r.status >= 300 && r.status < 400) {
        const suite = r.headers.get('location');
        if (!suite) throw new Error('redirection-sans-cible');
        courante = new URL(suite, courante);
        continue;
      }
      reponse = r;
      break;
    }
    if (!reponse) throw new Error('trop-de-redirections');
    if (!reponse.ok) throw new Error(`page-${reponse.status}`);

    const type = reponse.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(type)) throw new Error('pas-une-page');

    // Lecture BORNEE : un `text()` sur un flux infini remplirait la memoire du
    // serveur, et c'est une URL choisie par l'appelant.
    const lecteur = reponse.body?.getReader();
    if (!lecteur) throw new Error('corps-absent');
    const morceaux: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      if (value) {
        morceaux.push(value);
        total += value.length;
        if (total >= TAILLE_MAX) {
          await lecteur.cancel();
          break;
        }
      }
    }
    const html = Buffer.concat(morceaux.map((m) => Buffer.from(m))).toString('utf8');

    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .slice(0, maxCaracteres);
  } finally {
    clearTimeout(minuteur);
  }
}

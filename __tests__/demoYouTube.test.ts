import { YOUTUBE_PAR_EXERCICE, aUneVideoYouTube, urlLecteur, urlRecherche } from '../lib/demoYouTube';

/**
 * Les démos YouTube.
 *
 * L'enjeu n'est pas de vérifier qu'une URL se construit — c'est de tenir deux
 * promesses faites à YouTube et à Google Play : on n'emploie QUE le lecteur
 * officiel (extraire le flux fait retirer l'application), et on ne charge rien
 * tant que personne n'a demandé la vidéo.
 */

describe('la table des identifiants', () => {
  it("n'accepte que des identifiants YouTube plausibles", () => {
    // Onze caractères de l'alphabet YouTube. Un identifiant plus court est une
    // faute de frappe, et une faute de frappe affiche « vidéo indisponible » —
    // ce que l'utilisateur lit comme une panne de l'app.
    for (const [exercice, vid] of Object.entries(YOUTUBE_PAR_EXERCICE)) {
      expect(`${exercice}: ${vid}`).toMatch(/: [\w-]{11}$/);
    }
  });

  it('reste vide tant que rien n’a été vérifié — et ce n’est pas un manque', () => {
    // Sans identifiant, l'app propose une RECHERCHE, qui marche pour tous les
    // exercices. Mieux vaut ça qu'un identifiant inventé.
    expect(typeof YOUTUBE_PAR_EXERCICE).toBe('object');
  });
});

describe('urlLecteur', () => {
  it("rend null quand l'exercice n'a pas d'identifiant", () => {
    expect(urlLecteur('exercice_inconnu')).toBeNull();
    expect(aUneVideoYouTube('exercice_inconnu')).toBe(false);
  });

  it('emploie le lecteur officiel, sur le domaine sans cookie', () => {
    (YOUTUBE_PAR_EXERCICE as any).essai = 'dQw4w9WgXcQ';
    const url = urlLecteur('essai') || '';
    // `/embed/` = lecteur officiel. Toute autre forme d'URL signifierait qu'on
    // manipule le flux, ce que les conditions de YouTube interdisent.
    expect(url).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(url).toContain('playsinline=1');
    // Pas de recommandations vers d'autres chaînes : on n'envoie personne au
    // hasard depuis une app de santé.
    expect(url).toContain('rel=0');
    delete (YOUTUBE_PAR_EXERCICE as any).essai;
  });

  it("encode l'identifiant plutôt que de le coller tel quel", () => {
    (YOUTUBE_PAR_EXERCICE as any).essai = 'a b&c';
    expect(urlLecteur('essai')).toContain('a%20b%26c');
    delete (YOUTUBE_PAR_EXERCICE as any).essai;
  });
});

describe('urlRecherche — le repli qui marche toujours', () => {
  it('cherche le nom TRADUIT, pas l’identifiant technique', () => {
    // « développé couché » donne de bien meilleurs résultats que « bench_press »
    // pour quelqu'un qui lit en français.
    const url = urlRecherche('développé couché', 'fr');
    expect(decodeURIComponent(url)).toContain('développé couché');
    expect(url).not.toContain('bench_press');
  });

  it('ajoute un terme de technique pour écarter les compilations', () => {
    expect(decodeURIComponent(urlRecherche('squat', 'fr'))).toContain('technique');
    expect(decodeURIComponent(urlRecherche('squat', 'en'))).toContain('proper form');
    expect(decodeURIComponent(urlRecherche('squat', 'ar'))).toContain('تمرين');
  });

  it('retombe sur le français pour une langue inconnue', () => {
    expect(decodeURIComponent(urlRecherche('squat', 'zz'))).toContain('technique');
  });

  it('encode ce qui casserait l’URL', () => {
    const url = urlRecherche('curl & extension', 'fr');
    expect(url).not.toContain(' ');
    expect(url).not.toContain('&search');
    expect(decodeURIComponent(url.split('search_query=')[1])).toContain('curl & extension');
  });
});

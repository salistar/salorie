import { urlAutorisee } from '../src/ai/lecture-page';

/**
 * Garde-fous SSRF de la lecture de page.
 *
 * Cette fonction fait sortir une requete DU SERVEUR vers une adresse choisie par
 * l'appelant. Sans controle, elle donne acces au reseau interne : metadonnees
 * cloud sur 169.254.169.254, Redis sur 127.0.0.1:6379, services voisins en
 * 10.x. Chaque cas ci-dessous correspond a une facon reelle de contourner un
 * controle trop simple.
 */

const u = (s: string) => new URL(s);

describe('urlAutorisee — ce qui doit etre REFUSE', () => {
  it('refuse les schemas autres que http/https', async () => {
    await expect(urlAutorisee(u('file:///etc/passwd'))).resolves.toBe(false);
    await expect(urlAutorisee(u('ftp://exemple.com/x'))).resolves.toBe(false);
  });

  it('refuse la boucle locale, en IP litterale', async () => {
    await expect(urlAutorisee(u('http://127.0.0.1/'))).resolves.toBe(false);
    await expect(urlAutorisee(u('http://127.1.2.3/'))).resolves.toBe(false);
  });

  it('refuse les metadonnees cloud (169.254.169.254)', async () => {
    // La cible la plus recherchee : elle rend des jetons d'identite sur AWS,
    // GCP et Azure, sans authentification.
    await expect(urlAutorisee(u('http://169.254.169.254/latest/meta-data/'))).resolves.toBe(false);
  });

  it('refuse les plages privees', async () => {
    await expect(urlAutorisee(u('http://10.0.0.5/'))).resolves.toBe(false);
    await expect(urlAutorisee(u('http://192.168.1.1/'))).resolves.toBe(false);
    await expect(urlAutorisee(u('http://172.16.0.1/'))).resolves.toBe(false);
    await expect(urlAutorisee(u('http://172.31.255.254/'))).resolves.toBe(false);
  });

  it('refuse le CGNAT et 0.0.0.0/8', async () => {
    await expect(urlAutorisee(u('http://100.64.0.1/'))).resolves.toBe(false);
    await expect(urlAutorisee(u('http://0.0.0.0/'))).resolves.toBe(false);
  });

  it('refuse la boucle locale IPv6, y compris encapsulee en v4', async () => {
    await expect(urlAutorisee(u('http://[::1]/'))).resolves.toBe(false);
    // Le contournement classique : une adresse v4 privee ecrite en v6. Un
    // controle qui ne regarde que le prefixe v6 la laisse passer.
    await expect(urlAutorisee(u('http://[::ffff:127.0.0.1]/'))).resolves.toBe(false);
    await expect(urlAutorisee(u('http://[fd00::1]/'))).resolves.toBe(false);
    await expect(urlAutorisee(u('http://[fe80::1]/'))).resolves.toBe(false);
  });

  it('refuse les ports qui ne servent pas le web', async () => {
    // 6379 = Redis, 5432 = Postgres, 27017 = Mongo. Un site public n'ecoute pas
    // la, mais nos propres services si.
    await expect(urlAutorisee(u('http://exemple.com:6379/'))).resolves.toBe(false);
    await expect(urlAutorisee(u('http://exemple.com:27017/'))).resolves.toBe(false);
  });

  it('refuse un nom PUBLIC qui resout vers la boucle locale', async () => {
    // C'est le cas qui condamne les listes noires de noms : interdire
    // « localhost » ne sert a rien, des milliers de noms publics pointent vers
    // 127.0.0.1. Seule la resolution compte.
    // 'localtest.me' et 'lvh.me' resolvent publiquement vers 127.0.0.1.
    const r = await urlAutorisee(u('http://localtest.me/'));
    expect(r).toBe(false);
  });
});

describe('urlAutorisee — ce qui doit etre ACCEPTE', () => {
  it('accepte un site public ordinaire en https', async () => {
    await expect(urlAutorisee(u('https://www.marmiton.org/recettes/x.aspx'))).resolves.toBe(true);
  });

  it('accepte le port 443 explicite', async () => {
    await expect(urlAutorisee(u('https://example.com:443/page'))).resolves.toBe(true);
  });
});

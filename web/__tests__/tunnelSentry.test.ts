/**
 * Le tunnel Sentry ne doit relayer QUE vers notre projet.
 * ---------------------------------------------------------------------------
 * `app/monitoring/route.ts` est publique par nécessité : les erreurs qu'on veut
 * voir sont celles des visiteurs NON connectés. Une route publique qui repost le
 * corps reçu vers l'hôte que ce corps indique est un **relais ouvert** —
 * n'importe qui ferait émettre notre serveur vers n'importe où, depuis notre IP
 * et sous notre nom.
 *
 * L'enveloppe Sentry annonce son DSN dans sa première ligne. On le compare au
 * nôtre, hôte ET numéro de projet. Ce test exerce les deux familles : ce qui
 * doit passer, et tout ce qui doit être refusé.
 */
import { POST } from '../app/monitoring/route';

const DSN = 'https://3ab9cffb80c59c027358fcf098a67ff6@o4509622074081280.ingest.de.sentry.io/4511913448767568';

/** Une enveloppe minimale, telle que le SDK navigateur l'envoie. */
function enveloppe(dsn: string): string {
  return [
    JSON.stringify({ event_id: 'a'.repeat(32), sent_at: new Date().toISOString(), dsn }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify({ message: 'boum' }),
  ].join('\n');
}

const requete = (corps: string) =>
  new Request('https://app.salorie.com/monitoring', { method: 'POST', body: corps }) as any;

describe('tunnel Sentry — ce qu il relaie, et ce qu il refuse', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn(async () => new Response(null, { status: 200 }));
  });

  it('relaie une enveloppe de NOTRE projet vers l ingestion Sentry', async () => {
    const r = await POST(requete(enveloppe(DSN)));
    expect(r.status).toBe(200);
    const [url, opts] = (global as any).fetch.mock.calls[0];
    // L'URL est reconstruite a partir de NOTRE DSN, jamais de celui recu.
    expect(url).toBe('https://o4509622074081280.ingest.de.sentry.io/api/4511913448767568/envelope/');
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/x-sentry-envelope');
  });

  it('⚠ REFUSE un autre hote — sinon c est un relais ouvert', () => {
    const attaques = [
      'https://cle@evil.example.com/4511913448767568',   // hote pirate, bon projet
      'http://cle@localhost:8080/4511913448767568',      // vers l interieur du reseau
      'https://cle@o4509622074081280.ingest.us.sentry.io/4511913448767568', // meme SaaS, autre region
    ];
    return Promise.all(attaques.map(async (dsn) => {
      const r = await POST(requete(enveloppe(dsn)));
      expect(r.status).toBe(403);
      expect((global as any).fetch).not.toHaveBeenCalled();
    }));
  });

  it('refuse un AUTRE projet du meme hote', async () => {
    // Emettre vers le projet d un tiers polluerait ses donnees a nos frais.
    const r = await POST(requete(enveloppe('https://cle@o4509622074081280.ingest.de.sentry.io/99999999')));
    expect(r.status).toBe(403);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('refuse une enveloppe sans DSN, illisible, ou vide', async () => {
    expect((await POST(requete(enveloppe('')))).status).toBe(403);
    expect((await POST(requete('pas du json\nsuite'))).status).toBe(204);
    expect((await POST(requete(''))).status).toBe(413);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('refuse un corps demesure sans meme le lire', async () => {
    const r = await POST(requete('x'.repeat(1_000_001)));
    expect(r.status).toBe(413);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('rend le statut d amont, pour que le SDK sache s il doit reessayer', async () => {
    (global as any).fetch = jest.fn(async () => new Response(null, { status: 429 }));
    expect((await POST(requete(enveloppe(DSN)))).status).toBe(429);
  });

  it('un amont injoignable ne provoque pas une erreur de plus', async () => {
    // Un rapport d'erreur perdu est un incident mineur ; une 500 sur la route
    // qui collecte les erreurs en serait un autre, et il masquerait le premier.
    (global as any).fetch = jest.fn(async () => { throw new Error('reseau'); });
    expect((await POST(requete(enveloppe(DSN)))).status).toBe(204);
  });
});

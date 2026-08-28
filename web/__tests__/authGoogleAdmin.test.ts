// Le refus d'une adresse Google inconnue — un garde-fou, pas un bug.
// ---------------------------------------------------------------------------
// POURQUOI CE TEST EXISTE
// La route `/api/auth/google` authentifie via Google puis vérifie que l'adresse
// figure dans la table des administrateurs. Si elle CRÉAIT un compte au lieu de
// refuser, toute personne possédant une adresse Gmail deviendrait
// administratrice — l'erreur classique des ponts SSO, et elle ne se voit pas :
// la connexion « fonctionne », simplement pour tout le monde.
//
// Le prompt le disait explicitement : le test DOIT vérifier le refus.
//
// ⚠ POURQUOI UN TEST UNITAIRE ET NON UN PARCOURS PLAYWRIGHT
// La branche à couvrir demande un jeton Firebase VALIDE portant une adresse
// vérifiée mais non administratrice. Fabriquer un tel jeton exige les clés de
// service du projet — un navigateur ne peut pas le faire, et un parcours e2e
// n'atteindrait donc jamais cette ligne. En simulant la vérification, on teste
// exactement la décision qui compte : ce que la route fait d'une identité
// authentique mais non autorisée.

const verifyIdToken = jest.fn();
const trouverCompte = jest.fn();
const signToken = jest.fn(async (_e: string, _r: string, _s: string[]) => 'jeton-de-session');

jest.mock('../lib/firebaseAdmin', () => ({
  authAdmin: () => ({ verifyIdToken }),
}));
jest.mock('../lib/adminAuth', () => ({
  trouverCompte: (e: string) => trouverCompte(e),
}));
jest.mock('../lib/jwt', () => ({
  signToken: (e: string, r: string, s: string[]) => signToken(e, r, s),
  AUTH_COOKIE: 'salorie_admin',
}));

// `NextResponse.json` a besoin de l'environnement Next : on charge la route
// APRÈS les mocks, sans quoi le vrai firebaseAdmin serait importé et tenterait
// de joindre Google.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { POST } = require('../app/api/auth/google/route');

/** Une requête minimale, avec une IP distincte à chaque appel. */
let n = 0;
function requete(corps: unknown) {
  n += 1;
  return {
    json: async () => corps,
    // ⚠ IP DIFFÉRENTE À CHAQUE TEST. La route limite à 10 tentatives par IP
    // et par quart d'heure ; en réutilisant la même, les derniers tests
    // recevraient un 429 et sembleraient échouer pour la mauvaise raison.
    headers: { get: (h: string) => (h === 'x-forwarded-for' ? `10.0.0.${n}` : null) },
  } as any;
}

beforeEach(() => {
  verifyIdToken.mockReset();
  trouverCompte.mockReset();
  signToken.mockClear();
});

describe('connexion Google au back-office', () => {
  it('REFUSE une adresse authentifiee mais non administratrice', async () => {
    verifyIdToken.mockResolvedValue({ email: 'inconnu@gmail.com', email_verified: true });
    trouverCompte.mockResolvedValue(null); // l'adresse n'est pas dans la table

    const res = await POST(requete({ jeton: 'jeton-valide' }));

    expect(res.status).toBe(403);
    // La preuve qui compte : AUCUNE session n'est ouverte.
    expect(signToken).not.toHaveBeenCalled();
    expect(res.cookies.get('salorie_admin')).toBeUndefined();
  });

  it('ne cree JAMAIS de compte pour une adresse inconnue', async () => {
    verifyIdToken.mockResolvedValue({ email: 'inconnu@gmail.com', email_verified: true });
    trouverCompte.mockResolvedValue(null);

    await POST(requete({ jeton: 'jeton-valide' }));

    // `trouverCompte` est consulte, et rien d'autre : la route ne dispose
    // d'aucun moyen d'ecrire. Si quelqu'un ajoutait un `creerCompte` ici, ce
    // test ne le verrait pas — mais le precedent verrait la session ouverte.
    expect(trouverCompte).toHaveBeenCalledTimes(1);
    expect(trouverCompte).toHaveBeenCalledWith('inconnu@gmail.com');
  });

  it('refuse une adresse NON VERIFIEE, meme si elle est administratrice', async () => {
    // Certains fournisseurs laissent declarer une adresse qu'on ne possede pas.
    // Sans ce controle, il suffirait d'annoncer l'adresse d'un administrateur.
    verifyIdToken.mockResolvedValue({ email: 'admin@salistar.com', email_verified: false });
    trouverCompte.mockResolvedValue({ role: 'admin', scopes: ['*'] });

    const res = await POST(requete({ jeton: 'jeton-valide' }));

    expect(res.status).toBe(403);
    expect(trouverCompte).not.toHaveBeenCalled(); // on s'arrete AVANT la table
    expect(signToken).not.toHaveBeenCalled();
  });

  it('refuse un jeton invalide avec 401, sans consulter la table', async () => {
    verifyIdToken.mockRejectedValue(new Error('signature invalide'));

    const res = await POST(requete({ jeton: 'jeton-forge' }));

    expect(res.status).toBe(401);
    expect(trouverCompte).not.toHaveBeenCalled();
  });

  it('ACCEPTE une adresse verifiee et administratrice, et ouvre la session', async () => {
    // Le contre-exemple est indispensable : un test qui ne verifie que des
    // refus resterait vert si la route refusait TOUT LE MONDE.
    verifyIdToken.mockResolvedValue({ email: 'admin@salistar.com', email_verified: true });
    trouverCompte.mockResolvedValue({ role: 'admin', scopes: ['*'] });

    const res = await POST(requete({ jeton: 'jeton-valide' }));

    expect(res.status).toBe(200);
    expect(signToken).toHaveBeenCalledWith('admin@salistar.com', 'admin', ['*']);
    const c = res.cookies.get('salorie_admin');
    expect(c?.value).toBe('jeton-de-session');
    // Le cookie de session ne doit etre lisible ni par un script, ni en clair.
    expect(c?.httpOnly).toBe(true);
    expect(c?.secure).toBe(true);
  });
});

'use client';
// Base d'aliments — chercher, et surtout COMPARER.
// ---------------------------------------------------------------------------
// Chercher, c'est taper : un clavier bat un pouce. Comparer deux aliments, c'est
// les voir ensemble : un grand ecran bat un petit. Le telephone rate les deux, et
// c'est exactement ce qu'on fait quand on decide quoi acheter.
//
// La source est OpenFoodFacts, la meme que le mobile — une API publique en HTTP
// simple, donc utilisable depuis un navigateur sans passer par notre backend.
import { useCallback, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

type Aliment = {
  code: string;
  nom: string;
  marque: string;
  kcal: number;
  prot: number;
  gluc: number;
  lip: number;
  image?: string;
};

/** Les champs demandes a OFF. En demander moins, c'est charger moins. */
const CHAMPS = 'code,product_name,brands,nutriments,image_small_url';

function versAliment(p: any): Aliment | null {
  const n = p?.nutriments || {};
  const nom = String(p?.product_name || '').trim();
  // Un produit sans nom ou sans calories n'aide a rien : on l'ecarte plutot que
  // d'afficher une ligne vide qui fait douter du reste.
  const kcal = Number(n['energy-kcal_100g'] ?? n['energy-kcal']);
  if (!nom || !Number.isFinite(kcal) || kcal <= 0) return null;
  return {
    code: String(p?.code || ''),
    nom,
    marque: String(p?.brands || '').split(',')[0].trim(),
    kcal: Math.round(kcal),
    prot: Math.round(Number(n.proteins_100g) || 0),
    gluc: Math.round(Number(n.carbohydrates_100g) || 0),
    lip: Math.round(Number(n.fat_100g) || 0),
    image: p?.image_small_url,
  };
}

export default function PageAliments() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [terme, setTerme] = useState('');
  const [resultats, setResultats] = useState<Aliment[]>([]);
  const [cherche, setCherche] = useState(false);
  const [erreur, setErreur] = useState('');
  // Les aliments epingles pour comparaison. C'est la raison d'etre de cet ecran.
  const [compares, setCompares] = useState<Aliment[]>([]);

  const chercher = useCallback(async () => {
    const q = terme.trim();
    if (q.length < 2) return;
    setCherche(true);
    setErreur('');
    try {
      const url =
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}` +
        `&search_simple=1&action=process&json=1&page_size=24&fields=${CHAMPS}`;
      const rep = await fetch(url);
      const j = await rep.json();
      const liste = (Array.isArray(j?.products) ? j.products : [])
        .map(versAliment)
        .filter(Boolean) as Aliment[];
      setResultats(liste);
      if (!liste.length) setErreur(t('alimentsAucun'));
    } catch {
      setErreur(t('alimentsErreur'));
    } finally {
      setCherche(false);
    }
  }, [terme, t]);

  const basculer = (a: Aliment) => {
    setCompares((prev) =>
      prev.some((x) => x.code === a.code)
        ? prev.filter((x) => x.code !== a.code)
        // Trois maximum : au-dela, le tableau devient illisible et la comparaison
        // perd son interet. Le plus ancien sort.
        : [...prev, a].slice(-3),
    );
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('alimentsTitre')}</h1>
        <p className="me-sous">{t('alimentsSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <input
            className="champ-amis"
            value={terme}
            onChange={(e) => setTerme(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && chercher()}
            placeholder={t('alimentsChamp')}
            aria-label={t('alimentsChamp')}
          />
          <button className="btn btn-primary" onClick={chercher} disabled={terme.trim().length < 2 || cherche}>
            {cherche ? t('alimentsRecherche') : t('alimentsChercher')}
          </button>
        </div>
        {erreur ? <p className="me-erreur">{erreur}</p> : null}
      </section>

      {compares.length > 0 ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('alimentsComparer')}</h2>
          <div className="cadre">
            <table className="tableau-compare">
              <thead>
                <tr>
                  <th>{t('alimentsPour100')}</th>
                  {compares.map((a) => (
                    <th key={a.code}>{a.nom}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {([
                  ['alimentsKcal', 'kcal'],
                  ['alimentsProt', 'prot'],
                  ['alimentsGluc', 'gluc'],
                  ['alimentsLip', 'lip'],
                ] as const).map(([cle, champ]) => (
                  <tr key={champ}>
                    <td>{t(cle)}</td>
                    {compares.map((a) => (
                      <td key={a.code} className="n">{a[champ]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {resultats.length > 0 ? (
        <ul className="grille-aliments">
          {resultats.map((a) => {
            const pris = compares.some((x) => x.code === a.code);
            return (
              <li key={a.code} className={`carte-aliment${pris ? ' choisi' : ''}`}>
                {a.image ? <img src={a.image} alt="" className="aliment-img" /> : <div className="aliment-img vide" />}
                <div className="aliment-corps">
                  <strong>{a.nom}</strong>
                  {a.marque ? <span className="me-sous">{a.marque}</span> : null}
                  <span className="aliment-kcal">{a.kcal} kcal / 100 g</span>
                </div>
                <button className="btn btn-ghost" onClick={() => basculer(a)}>
                  {pris ? t('alimentsRetirer') : t('alimentsAjouter')}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <p className="me-note">{t('alimentsSource')}</p>
    </div>
  );
}

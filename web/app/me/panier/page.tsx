'use client';
// Panier du souk — composer une semaine de courses dans un budget.
// ---------------------------------------------------------------------------
// L'écran de la liste qui gagne le plus à la largeur : le résultat se lit
// ÉTAL PAR ÉTAL, et sur un téléphone il faut faire défiler cinq blocs pour
// comparer. Ici, les cinq tiennent côte à côte — ce qui correspond à la façon
// dont on parcourt réellement un marché.
//
// `composerPanier` et `parEtal` sont importés du mobile (`lib/panierSouk.ts`,
// sans aucun import, déjà couvert par ses propres tests), et le catalogue vient
// du même JSON. Deux paniers différents pour le même budget seraient absurdes.
import { useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { composerPanier, parEtal, type Produit } from '../../../../lib/panierSouk';
import TABLE from '../../../../assets/data/prix-souk.json';
import { ajouterArticles } from '../../../lib/listeCoursesWeb';

const PRODUITS = (TABLE as any).produits as Produit[];
const ETALS = (TABLE as any).etals as Record<string, { n: string; ar: string }>;

export default function PagePanier() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [budget, setBudget] = useState('400');
  const [personnes, setPersonnes] = useState('2');
  const [jours, setJours] = useState('7');
  const [message, setMessage] = useState('');

  const n = (s: string, defaut: number) => {
    const v = parseInt(s, 10);
    return Number.isFinite(v) && v > 0 ? v : defaut;
  };

  const panier = useMemo(
    () => composerPanier(PRODUITS, n(budget, 0), n(personnes, 2), n(jours, 7)),
    [budget, personnes, jours],
  );
  const etals = useMemo(() => parEtal(panier), [panier]);

  const nomEtal = (cle: string) =>
    langue === 'ar' ? ETALS[cle]?.ar || cle : ETALS[cle]?.n || cle;
  const nomProduit = (p: Produit) => (langue === 'ar' && p.ar ? p.ar : p.n);

  const versCourses = async () => {
    if (!uid || !panier.lignes.length) return;
    try {
      const noms = panier.lignes.map(
        (l) => `${nomProduit(l.produit)} — ${l.quantite} ${l.produit.unite}`,
      );
      const ajoutes = await ajouterArticles(uid, noms);
      setMessage(`${ajoutes} ${t('panierAjoutes')}`);
    } catch {
      setMessage(t('panierErreurAjout'));
    }
  };

  // La couverture est le chiffre qui décide si le budget « tient » : au-dessous
  // de 1, la semaine n'est pas couverte en énergie, et c'est l'information la
  // plus utile de la page.
  const couverturePct = Math.round(panier.couverture * 100);
  const tient = panier.couverture >= 1;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('panierTitre')}</h1>
        <p className="me-sous">{t('panierSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ" style={{ flexWrap: 'wrap' }}>
          {([['panierBudget', budget, setBudget], ['panierPersonnes', personnes, setPersonnes],
             ['panierJours', jours, setJours]] as const).map(([cle, val, set]) => (
            <label key={cle} className="champ-bloc">
              <span className="me-sous">{t(cle)}</span>
              <input
                className="champ-amis" style={{ width: 110 }} inputMode="numeric"
                value={val} onChange={(e) => set(e.target.value.replace(/[^0-9]/g, ''))}
                aria-label={t(cle)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('panierResultat')}</h2>
        <div className="grille-series">
          <div className="tuile-serie">
            <span className="serie-nombre">{Math.round(panier.cout)}</span>
            <span className="me-sous">{t('panierCout')}</span>
          </div>
          <div className="tuile-serie">
            <span className="serie-nombre">{Math.round(panier.proteines)}</span>
            <span className="me-sous">{t('panierProteines')}</span>
          </div>
          <div className="tuile-serie">
            <span className="serie-nombre">{Math.round(panier.kcal / 1000)}k</span>
            <span className="me-sous">kcal</span>
          </div>
          <div className="tuile-serie">
            <span className="serie-nombre" style={{ color: tient ? undefined : 'var(--rouge, #b3261e)' }}>
              {couverturePct}%
            </span>
            <span className="me-sous">{t('panierCouverture')}</span>
          </div>
        </div>
        <p className={tient ? 'me-note' : 'me-erreur'}>
          {tient ? t('panierTient') : t('panierNeTientPas')}
        </p>

        {panier.lignes.length ? (
          <div className="ligne-champ" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={versCourses} disabled={!uid}>
              {t('panierVersCourses')}
            </button>
            {message ? <span className="me-note">{message}</span> : null}
          </div>
        ) : null}
      </section>

      {etals.length === 0 ? (
        <section className="carte-amis"><p className="me-sous">{t('panierBudgetTropBas')}</p></section>
      ) : (
        <section className="carte-amis">
          <h2 className="me-h2">{t('panierParEtal')}</h2>
          <div className="grille-etals">
            {etals.map((e) => (
              <div key={e.etal} className="carte-etal">
                <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                  <strong>{nomEtal(e.etal)}</strong>
                  <span className="me-sous">{Math.round(e.cout)} {t('panierDirhams')}</span>
                </div>
                <ul className="liste-nue">
                  {e.lignes.map((l) => (
                    <li key={l.produit.id} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                      <span>{nomProduit(l.produit)}</span>
                      <span className="me-sous">{l.quantite} {l.produit.unite}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="me-note">{t('panierNotePrix')}</p>
        </section>
      )}
    </div>
  );
}

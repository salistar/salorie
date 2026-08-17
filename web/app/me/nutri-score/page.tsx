'use client';
// Nutri-Score — calculer la note d'un aliment à partir de son étiquette.
// ---------------------------------------------------------------------------
// Sept nombres à saisir. Sur un téléphone, c'est sept changements de clavier ;
// ici, sept tabulations, avec l'étiquette du produit posée à côté du clavier.
//
// L'algorithme n'est PAS recopié : la page importe `lib/nutriScore.ts`, le
// fichier que le mobile utilise déjà. C'est volontaire — j'ai dû recopier la
// formule de niveau XP dans /me/progression faute de pouvoir l'importer, et
// deux copies d'une même règle finissent toujours par diverger. Ce fichier-ci
// n'a aucun import, donc rien n'empêchait de le partager.
import { useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { nutriScore, GRADE_COLOR, type NutriGrade } from '../../../../lib/nutriScore';

type Champ = { cle: string; valeur: string; unite: string };

const CHAMPS: { cle: string; unite: string }[] = [
  { cle: 'energyKcal', unite: 'kcal' },
  { cle: 'sugars', unite: 'g' },
  { cle: 'satFat', unite: 'g' },
  { cle: 'sodiumMg', unite: 'mg' },
  { cle: 'fiber', unite: 'g' },
  { cle: 'protein', unite: 'g' },
  { cle: 'fruitVegPct', unite: '%' },
];

export default function PageNutriScore() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [vals, setVals] = useState<Record<string, string>>({});
  const [nom, setNom] = useState('');

  const n = (c: string) => {
    const v = parseFloat((vals[c] || '').replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };

  // Au moins l'énergie doit être saisie : sans elle, tout produit sort en A, ce
  // qui donnerait un « A » rassurant à un écran vide.
  const pret = (vals.energyKcal || '').trim() !== '';
  const res = pret
    ? nutriScore({
        energyKcal: n('energyKcal'), sugars: n('sugars'), satFat: n('satFat'),
        sodiumMg: n('sodiumMg'), fiber: n('fiber'), protein: n('protein'),
        fruitVegPct: n('fruitVegPct'),
      })
    : null;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('nsTitre')}</h1>
        <p className="me-sous">{t('nsSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('nsPour100')}</h2>
        <div className="ligne-champ">
          <input
            className="champ-amis" style={{ flex: '1 1 240px' }}
            value={nom} onChange={(e) => setNom(e.target.value)}
            placeholder={t('nsNomProduit')} aria-label={t('nsNomProduit')}
          />
        </div>
        <div className="ligne-champ" style={{ flexWrap: 'wrap', marginTop: 8 }}>
          {CHAMPS.map(({ cle, unite }) => (
            <label key={cle} className="champ-bloc">
              <span className="me-sous">{t(`ns_${cle}`)} ({unite})</span>
              <input
                className="champ-amis" style={{ width: 108 }} inputMode="decimal"
                value={vals[cle] || ''}
                onChange={(e) => setVals((v) => ({ ...v, [cle]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                aria-label={`${t(`ns_${cle}`)} (${unite})`}
              />
            </label>
          ))}
        </div>
        <p className="me-note">{t('nsNoteFruits')}</p>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('nsResultat')}</h2>
        {!res ? (
          <p className="me-sous">{t('nsSaisirEnergie')}</p>
        ) : (
          <>
            <div className="ligne-champ" style={{ alignItems: 'center', gap: 14 }}>
              <span
                className="ns-pastille"
                style={{ background: GRADE_COLOR[res.grade as NutriGrade] }}
                aria-label={`${t('nsNote')} ${res.grade}`}
              >
                {res.grade}
              </span>
              <span>
                {nom ? <strong>{nom}</strong> : null}
                <span className="me-sous"> {t('nsScore')} : {res.score}</span>
              </span>
            </div>
            <p className="me-note">{t('nsNoteAlgo')}</p>
          </>
        )}
      </section>
    </div>
  );
}

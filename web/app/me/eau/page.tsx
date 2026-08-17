'use client';
// Eau — enregistrer ce qu'on boit, et connaître son objectif.
// ---------------------------------------------------------------------------
// Deux écrans mobiles réunis ici : `add-water` (enregistrer) et
// `smart-hydration` (calculer l'objectif). Sur un téléphone ils sont séparés
// parce qu'un pouce ne peut pas tout faire d'un écran ; sur un grand écran,
// voir son objectif et le remplir côte à côte est justement l'intérêt.
import { useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useJournal, totaux, jourLocal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { ajouterEau, supprimerLog } from '../../../lib/ecrireLog';
import { objectifEau, type Activite } from '../../../lib/calculsNutrition';

/** Verres proposés — exactement ceux du mobile, pour que l'habitude se transfère. */
const VERRES = [100, 200, 250, 300, 1000];

export default function PageEau() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const aujourdhui = jourLocal();
  const { lignes, charge } = useJournal(uid, aujourdhui);
  const [activite, setActivite] = useState<Activite>('modere');
  const [chaleur, setChaleur] = useState(false);
  const [libre, setLibre] = useState('');
  const [occupe, setOccupe] = useState(false);

  const bu = useMemo(() => totaux(lignes).eauMl, [lignes]);
  const poids = Number((profil as any)?.weight) || 0;
  const objectif = objectifEau(poids, activite, chaleur);
  const pct = Math.min(100, Math.round((bu / Math.max(1, objectif)) * 100));

  const verresEau = useMemo(
    () => lignes.filter((l) => l.type === 'water').sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [lignes],
  );

  const boire = async (ml: number) => {
    if (!uid || occupe || !(ml > 0)) return;
    setOccupe(true);
    try {
      await ajouterEau(uid, ml);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('eauTitre')}</h1>
        <p className="me-sous">{t('eauSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('eauAujourdhui')}</h2>
        <div className="prog-piste">
          <div className="prog-remplissage prog-eau" style={{ width: `${pct}%` }} />
        </div>
        <div className="grille-series">
          <div className="tuile-serie">
            <span className="serie-nombre">{bu}</span>
            <span className="me-sous">{t('eauBu')} (ml)</span>
          </div>
          <div className="tuile-serie">
            <span className="serie-nombre">{objectif}</span>
            <span className="me-sous">{t('eauObjectif')} (ml)</span>
          </div>
          <div className="tuile-serie">
            <span className="serie-nombre">{Math.max(0, objectif - bu)}</span>
            <span className="me-sous">{t('eauRestant')}</span>
          </div>
        </div>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('eauAjouter')}</h2>
        <div className="ligne-champ" style={{ flexWrap: 'wrap' }}>
          {VERRES.map((ml) => (
            <button key={ml} className="btn btn-ghost" onClick={() => boire(ml)} disabled={occupe || !uid}>
              +{ml} ml
            </button>
          ))}
        </div>
        <div className="ligne-champ" style={{ marginTop: 10 }}>
          <input
            className="champ-amis" style={{ flex: '0 1 140px' }} inputMode="numeric"
            value={libre}
            onChange={(e) => setLibre(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && libre) {
                boire(Number(libre));
                setLibre('');
              }
            }}
            placeholder={t('eauQuantite')}
            aria-label={t('eauQuantite')}
          />
          <button
            className="btn btn-primary"
            onClick={() => { boire(Number(libre)); setLibre(''); }}
            disabled={!libre || occupe}
          >
            {t('eauBoire')}
          </button>
        </div>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('eauCalcul')}</h2>
        <p className="me-sous">
          {poids > 0 ? `${t('eauDapresPoids')} ${poids} kg` : t('eauPoidsInconnu')}
        </p>
        <div className="ligne-champ" style={{ flexWrap: 'wrap' }}>
          {(['sedentaire', 'modere', 'intense'] as Activite[]).map((a) => (
            <button
              key={a}
              className={`btn ${activite === a ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActivite(a)}
            >
              {t(`eauAct_${a}`)}
            </button>
          ))}
          <button className={`btn ${chaleur ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setChaleur((c) => !c)}>
            {t('eauChaleur')}
          </button>
        </div>
        <p className="me-note">{t('eauNoteCalcul')}</p>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('eauHistorique')}</h2>
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : verresEau.length === 0 ? (
          <p className="me-sous">{t('eauRien')}</p>
        ) : (
          <ul className="liste-nue">
            {verresEau.map((l) => (
              <li key={l.id} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                <span>{l.calories} ml</span>
                {/* Corriger une saisie fausse doit etre possible : sans cela, un
                    « +1000 » tape par erreur fausse la journee sans recours. */}
                <button
                  className="btn btn-ghost"
                  onClick={() => uid && supprimerLog(uid, l.id)}
                  aria-label={t('eauSupprimer')}
                >
                  {t('eauSupprimer')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

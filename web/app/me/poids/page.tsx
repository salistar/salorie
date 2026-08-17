'use client';
// Poids — enregistrer une pesée, voir la courbe.
// ---------------------------------------------------------------------------
// Le web LISAIT déjà `weight_history` (via `useHistoriquePoids`, utilisé par le
// rapport) sans jamais pouvoir y écrire. C'est l'écart le plus absurde de la
// liste : la courbe était consultable mais un point ne pouvait pas s'ajouter.
//
// La courbe est en SVG plutôt qu'en canvas : elle se redimensionne proprement,
// reste nette sur un écran à haute densité, et n'exige aucune bibliothèque.
import { useCallback, useMemo, useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { useProfil, useHistoriquePoids, jourLocal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';

export default function PagePoids() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  // Ce hook renvoie le tableau DIRECTEMENT, contrairement a `useProfil` et
  // `useJournal` qui renvoient un objet. Le destructurer donnait un `points`
  // toujours indefini, donc une page vide sans erreur visible.
  const points = useHistoriquePoids(uid);
  const [valeur, setValeur] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  const serie = useMemo(
    () => points.filter((p) => Number(p.weight) > 0).slice(-60),
    [points],
  );

  const enregistrer = useCallback(async () => {
    const kg = parseFloat(valeur.replace(',', '.'));
    // Bornes larges mais reelles : au-dela, c'est une faute de frappe, et un
    // point aberrant ecrase toute l'echelle de la courbe pour des mois.
    if (!uid || !Number.isFinite(kg) || kg < 20 || kg > 400 || occupe) {
      if (Number.isFinite(kg)) setMessage(t('poidsHorsBornes'));
      return;
    }
    setOccupe(true);
    setMessage('');
    try {
      await addDoc(collection(firestore(), 'users', uid, 'weight_history'), {
        weight: Math.round(kg * 10) / 10,
        date: jourLocal(),
        timestamp: Date.now(),
      });
      setValeur('');
      setMessage(t('poidsEnregistre'));
    } catch {
      setMessage(t('poidsErreur'));
    } finally {
      setOccupe(false);
    }
  }, [uid, valeur, occupe, t]);

  // Géométrie de la courbe. Bornes élargies de 1 kg pour que le premier et le
  // dernier point ne collent pas au bord du cadre.
  const courbe = useMemo(() => {
    if (serie.length < 2) return null;
    const vals = serie.map((p) => Number(p.weight));
    const min = Math.min(...vals) - 1;
    const max = Math.max(...vals) + 1;
    const etendue = Math.max(0.1, max - min);
    const L = 600;
    const H = 160;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * L;
      const y = H - ((v - min) / etendue) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { d: `M ${pts.join(' L ')}`, min, max, L, H };
  }, [serie]);

  const dernier = serie.length ? Number(serie[serie.length - 1].weight) : null;
  const premier = serie.length ? Number(serie[0].weight) : null;
  const delta = dernier != null && premier != null ? Math.round((dernier - premier) * 10) / 10 : null;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('poidsTitre')}</h1>
        <p className="me-sous">{t('poidsSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <input
            className="champ-amis" style={{ flex: '0 1 140px' }} inputMode="decimal"
            value={valeur}
            onChange={(e) => setValeur(e.target.value.replace(/[^0-9.,]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
            placeholder={t('poidsKg')} aria-label={t('poidsKg')}
          />
          <button className="btn btn-primary" onClick={enregistrer} disabled={!valeur || occupe}>
            {t('poidsEnregistrer')}
          </button>
          {message ? <span className="me-note">{message}</span> : null}
        </div>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('poidsCourbe')}</h2>
        {!courbe ? (
          <p className="me-sous">{t('poidsPasAssez')}</p>
        ) : (
          <>
            <div className="poids-cadre">
              <svg viewBox={`0 0 ${courbe.L} ${courbe.H}`} className="poids-svg" role="img"
                   aria-label={`${t('poidsCourbe')} : ${serie.length} ${t('poidsMesures')}`}>
                <path d={courbe.d} fill="none" stroke="currentColor" strokeWidth="2.5"
                      strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                <span className="me-sous">{courbe.min.toFixed(1)} kg</span>
                <span className="me-sous">{courbe.max.toFixed(1)} kg</span>
              </div>
            </div>
            <div className="grille-series">
              <div className="tuile-serie">
                <span className="serie-nombre">{dernier?.toFixed(1)}</span>
                <span className="me-sous">{t('poidsActuel')}</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{delta != null && delta > 0 ? `+${delta}` : delta}</span>
                <span className="me-sous">{t('poidsVariation')}</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{serie.length}</span>
                <span className="me-sous">{t('poidsMesures')}</span>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('poidsDernieres')}</h2>
        {serie.length === 0 ? (
          <p className="me-sous">{t('poidsRien')}</p>
        ) : (
          <ul className="liste-nue">
            {serie.slice(-12).reverse().map((p) => (
              <li key={p.id} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                <span className="me-sous">
                  {p.date
                    ? new Date(`${p.date}T00:00:00`).toLocaleDateString(locale(langue), {
                        day: 'numeric', month: 'short',
                      })
                    : '—'}
                </span>
                <span><strong>{Number(p.weight).toFixed(1)}</strong> kg</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

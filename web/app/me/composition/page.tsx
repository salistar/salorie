'use client';
// Composition corporelle — poids, masse grasse, masse musculaire.
// ---------------------------------------------------------------------------
// Saisie manuelle : ces valeurs viennent d'une balance à impédancemétrie ou
// d'une pince à plis cutanés, pas d'un capteur du téléphone. Le navigateur
// n'est donc pas moins bien placé — et il est mieux placé pour comparer huit
// relevés d'affilée, ce que le mobile ne montre que par petits bouts.
//
// L'avertissement du mobile est repris tel quel : ce sont des mesures de suivi,
// pas un diagnostic. Le retirer parce qu'il y a plus de place serait le pire
// usage possible de cette place.
import { useCallback, useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../lib/i18nMe';
import { ajouterMesure, lireMesures, supprimerMesure } from '../../../lib/suivi';

const SOUS = 'body_composition';

type Mesure = { id: string; date?: string; weight?: number; bodyFat?: number; muscle?: number };

const CHAMPS = [
  { cle: 'weight', unite: 'kg', min: 20, max: 400 },
  { cle: 'bodyFat', unite: '%', min: 1, max: 70 },
  { cle: 'muscle', unite: '%', min: 1, max: 80 },
] as const;

export default function PageComposition() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [vals, setVals] = useState<Record<string, string>>({});
  const [hist, setHist] = useState<Mesure[]>([]);
  const [charge, setCharge] = useState(false);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);

  const recharger = useCallback(async () => {
    if (!uid) return;
    setHist((await lireMesures(uid, SOUS, 8)) as Mesure[]);
    setCharge(true);
  }, [uid]);

  useEffect(() => { recharger(); }, [recharger]);

  const n = (c: string) => {
    const v = parseFloat((vals[c] || '').replace(',', '.'));
    return Number.isFinite(v) ? v : null;
  };

  // Chaque champ a ses bornes : une masse grasse a 300 % n'est pas une mesure,
  // c'est une faute de frappe, et elle fausserait toute comparaison ulterieure.
  const horsBornes = CHAMPS.filter(({ cle, min, max }) => {
    const v = n(cle);
    return v != null && (v < min || v > max);
  });
  const auMoinsUn = CHAMPS.some(({ cle }) => n(cle) != null);

  const enregistrer = async () => {
    if (!uid || !auMoinsUn || horsBornes.length > 0 || occupe) return;
    setOccupe(true);
    setMessage('');
    const donnees: Record<string, number> = {};
    for (const { cle } of CHAMPS) {
      const v = n(cle);
      if (v != null) donnees[cle] = Math.round(v * 10) / 10;
    }
    const ok = await ajouterMesure(uid, SOUS, donnees);
    setMessage(ok ? t('compEnregistre') : t('compErreur'));
    if (ok) { setVals({}); await recharger(); }
    setOccupe(false);
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('compTitre')}</h1>
        <p className="me-sous">{t('compSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ" style={{ flexWrap: 'wrap' }}>
          {CHAMPS.map(({ cle, unite }) => (
            <label key={cle} className="champ-bloc">
              <span className="me-sous">{t(`comp_${cle}`)} ({unite})</span>
              <input
                className="champ-amis" style={{ width: 110 }} inputMode="decimal"
                value={vals[cle] || ''}
                onChange={(e) => setVals((v) => ({ ...v, [cle]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                onKeyDown={(e) => e.key === 'Enter' && enregistrer()}
                aria-label={`${t(`comp_${cle}`)} (${unite})`}
              />
            </label>
          ))}
        </div>

        {horsBornes.length > 0 ? (
          <p className="me-erreur">
            {t('compHorsBornes')} {horsBornes.map((c) => t(`comp_${c.cle}`)).join(', ')}
          </p>
        ) : null}

        <div className="ligne-champ" style={{ marginTop: 8 }}>
          <button
            className="btn btn-primary" onClick={enregistrer}
            disabled={!auMoinsUn || horsBornes.length > 0 || occupe}
          >
            {t('compEnregistrer')}
          </button>
          {message ? <span className="me-note">{message}</span> : null}
        </div>

        <p className="me-note">{t('compAvertissement')}</p>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('compHistorique')}</h2>
        {!charge ? (
          <p className="me-sous">{t('communChargement')}</p>
        ) : hist.length === 0 ? (
          <p className="me-sous">{t('compRien')}</p>
        ) : (
          <div className="cadre-table">
            <table className="table-mesures">
              <thead>
                <tr>
                  <th>{t('compDate')}</th>
                  {CHAMPS.map(({ cle, unite }) => <th key={cle}>{t(`comp_${cle}`)} ({unite})</th>)}
                  <th />
                </tr>
              </thead>
              <tbody>
                {hist.map((m) => (
                  <tr key={m.id}>
                    <td className="me-sous">
                      {m.date
                        ? new Date(`${m.date}T00:00:00`).toLocaleDateString(locale(langue), {
                            day: 'numeric', month: 'short',
                          })
                        : '—'}
                    </td>
                    {CHAMPS.map(({ cle }) => (
                      <td key={cle}>{(m as any)[cle] != null ? (m as any)[cle] : '—'}</td>
                    ))}
                    <td>
                      <button
                        className="btn btn-ghost"
                        onClick={async () => { if (uid) { await supprimerMesure(uid, SOUS, m.id); recharger(); } }}
                      >
                        {t('compSupprimer')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

'use client';
// Dernière séance — le récapitulatif d'un entraînement terminé.
// ---------------------------------------------------------------------------
// L'écran mobile `workout-result` s'affiche à la fin d'une séance et reçoit ses
// chiffres en paramètres de navigation. Il ne persiste RIEN.
//
// Le porter tel quel aurait donné une page qui attend des paramètres
// n'arrivant jamais, puisque aucune séance ne se termine dans un navigateur.
// Cette page lit donc la source qui existe : la dernière activité du journal,
// écrite par le téléphone. Même récapitulatif, alimenté par une donnée réelle
// au lieu d'une donnée de passage.
import { useMemo } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useLogsDepuis, type LigneJournal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, locale, type Langue } from '../../../lib/i18nMe';

/** Fenêtre de lecture : 30 jours. Au-delà, « la dernière séance » n'est plus
 *  un récapitulatif, c'est de l'archéologie. */
const JOURS = 30;

function depuisJours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function PageSeance() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  // Ce hook renvoie un OBJET, contrairement a `useHistoriquePoids` qui renvoie
  // le tableau. Les deux conventions coexistent dans le meme fichier.
  const { lignes: logs } = useLogsDepuis(uid, depuisJours(JOURS));

  const activites = useMemo(
    () =>
      (logs as LigneJournal[])
        .filter((l) => l.type === 'activity')
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
    [logs],
  );

  const derniere = activites[0];
  const total = useMemo(
    () => activites.reduce((a, l) => a + (Number(l.calories) || 0), 0),
    [activites],
  );

  const quand = (l: LigneJournal) => {
    const ms = Number(l.timestamp);
    if (Number.isFinite(ms) && ms > 0) {
      return new Date(ms).toLocaleString(locale(langue), {
        weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      });
    }
    return l.date || '';
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('seanceTitre')}</h1>
        <p className="me-sous">{t('seanceSous')}</p>
      </header>

      {!derniere ? (
        <section className="carte-amis">
          <p className="me-sous">{t('seanceAucune')}</p>
        </section>
      ) : (
        <>
          <section className="carte-amis">
            <h2 className="me-h2">{derniere.name || t('seanceSansNom')}</h2>
            <p className="me-sous">{quand(derniere)}</p>
            <div className="grille-series">
              <div className="tuile-serie">
                <span className="serie-nombre">{Math.round(Number(derniere.calories) || 0)}</span>
                <span className="me-sous">kcal</span>
              </div>
              {derniere.intensity ? (
                <div className="tuile-serie">
                  <span className="serie-nombre">{derniere.intensity}</span>
                  <span className="me-sous">{t('seanceIntensite')}</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('seanceBilan')} {JOURS} {t('seanceJours')}</h2>
            <div className="grille-series">
              <div className="tuile-serie">
                <span className="serie-nombre">{activites.length}</span>
                <span className="me-sous">{t('seanceNbSeances')}</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">{Math.round(total)}</span>
                <span className="me-sous">{t('seanceKcalTotal')}</span>
              </div>
              <div className="tuile-serie">
                <span className="serie-nombre">
                  {activites.length ? Math.round(total / activites.length) : 0}
                </span>
                <span className="me-sous">{t('seanceKcalMoyenne')}</span>
              </div>
            </div>
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('seancePrecedentes')}</h2>
            <ul className="liste-nue">
              {activites.slice(1, 13).map((l) => (
                <li key={l.id} className="ligne-champ" style={{ justifyContent: 'space-between' }}>
                  <span>{l.name || t('seanceSansNom')}</span>
                  <span className="me-sous">{Math.round(Number(l.calories) || 0)} kcal</span>
                </li>
              ))}
            </ul>
            {activites.length === 1 ? <p className="me-sous">{t('seanceUneSeule')}</p> : null}
          </section>
        </>
      )}
    </div>
  );
}

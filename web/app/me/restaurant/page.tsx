'use client';
// Mode resto — photographier un menu, savoir quoi commander.
// ---------------------------------------------------------------------------
// L'écran se pratique évidemment au téléphone, à table. Cette page sert
// l'usage inverse, qui existe aussi : regarder la carte en ligne d'un
// restaurant avant d'y aller, et décider tranquillement.
//
// La recommandation tient compte des calories DÉJÀ consommées aujourd'hui,
// comme sur mobile : conseiller un plat à 900 kcal à quelqu'un qui en a déjà
// mangé 1 800 sur un objectif de 2 000 serait un mauvais conseil présenté avec
// assurance.
import { useCallback, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useJournal, totaux, jourLocal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import AnalysePhoto from '../AnalysePhoto';

const OBJECTIFS: Record<string, string> = {
  lose: 'perte de poids',
  gain: 'prise de masse',
  maintain: 'maintien du poids',
};

export default function PageRestaurant() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const { lignes } = useJournal(uid, jourLocal());
  const tot = useMemo(() => totaux(lignes), [lignes]);

  const objectifKcal = Number((profil as any)?.dailyCalories) || 2000;
  const restantes = Math.max(0, objectifKcal - tot.kcal);
  const but = OBJECTIFS[String((profil as any)?.goal || '')] || OBJECTIFS.maintain;

  // La consigne est recalculée quand les calories restantes changent : sans
  // `useMemo` sur ces valeurs, une photo choisie après un repas ajouté partirait
  // avec l'ancien budget.
  const consigne = useMemo(
    () =>
      `Voici la photo d'un menu de restaurant. Mon objectif : ${but}. ` +
      `Il me reste ${restantes} kcal pour la journée. ` +
      `Recommande les 2-3 MEILLEURS plats du menu pour cet objectif (nom exact tel ` +
      `qu'écrit sur le menu, pourquoi en une phrase, et une estimation de calories). ` +
      `Puis cite 1 plat à éviter et pourquoi. Réponds en français, concis. ` +
      `Si l'image n'est pas un menu, dis-le au lieu d'inventer des plats.`,
    [but, restantes],
  );

  const [aVu, setAVu] = useState(false);
  const surReponse = useCallback(() => setAVu(true), []);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('restoTitre')}</h1>
        <p className="me-sous">{t('restoSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="grille-series">
          <div className="tuile-serie">
            <span className="serie-nombre">{tot.kcal}</span>
            <span className="me-sous">{t('restoDejaMange')}</span>
          </div>
          <div className="tuile-serie">
            <span className="serie-nombre">{restantes}</span>
            <span className="me-sous">{t('restoRestantes')}</span>
          </div>
        </div>
        {restantes === 0 ? (
          <p className="me-erreur">{t('restoLimiteAtteinte')}</p>
        ) : (
          <p className="me-note">{t('restoTientCompte')}</p>
        )}
      </section>

      <AnalysePhoto
        consigne={consigne}
        onReponse={surReponse}
        rendu={(reponse) => (
          <section className="carte-amis">
            <h2 className="me-h2">{t('restoPourToi')}</h2>
            <p className="texte-ia">{reponse}</p>
            <p className="me-note">{t('restoNoteIA')}</p>
          </section>
        )}
        libelles={{
          choisir: t('restoChoisir'), analyse: t('restoAnalyse'), apercu: t('restoApercu'),
          notePhoto: t('restoNotePhoto'), indispo: t('restoIndispo'), erreur: t('restoErreur'),
          pasDeBackend: t('restoPasDeBackend'),
        }}
      />

      {aVu ? null : <section className="carte-amis"><p className="me-note">{t('restoAstuce')}</p></section>}
    </div>
  );
}

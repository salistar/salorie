'use client';
// Frigo — une photo de ce qu'on a, des recettes en retour.
// ---------------------------------------------------------------------------
// Le mobile ouvre la galerie via `expo-image-picker`. Un navigateur fait la
// même chose avec un `<input type="file">` : c'est le même geste, choisir une
// image existante, et non une capture live — d'où le fait que cet écran soit
// portable là où `scan-camera` ne l'est pas.
//
// Toute la mécanique (annulation, aperçu, base64, backend absent) vit dans
// `AnalysePhoto`, partagé avec l'étiquette, le ticket et l'équipement. Cette
// page n'a plus que sa consigne et sa façon d'afficher la réponse.
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import AnalysePhoto from '../AnalysePhoto';

const CONSIGNE =
  'Voici une photo du contenu d’un réfrigérateur. Liste d’abord les aliments que tu ' +
  'reconnais, puis propose 3 recettes simples réalisables avec eux. Pour chaque ' +
  'recette : le nom, les ingrédients utilisés parmi ceux vus, et les étapes en 3 ' +
  'lignes maximum. Réponds en français. Si la photo ne montre pas de nourriture, ' +
  'dis-le simplement au lieu d’inventer des recettes.';

export default function PageFrigo() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('frigoTitre')}</h1>
        <p className="me-sous">{t('frigoSous')}</p>
      </header>

      <AnalysePhoto
        consigne={CONSIGNE}
        rendu={(reponse) => (
          <section className="carte-amis">
            <h2 className="me-h2">{t('frigoRecettes')}</h2>
            <p className="texte-ia">{reponse}</p>
            <p className="me-note">{t('frigoNoteIA')}</p>
          </section>
        )}
        libelles={{
          choisir: t('frigoChoisir'), analyse: t('frigoAnalyse'), apercu: t('frigoApercu'),
          notePhoto: t('frigoNotePhoto'), indispo: t('frigoIndispo'), erreur: t('frigoErreur'),
          pasDeBackend: t('frigoPasDeBackend'), sessionExpiree: t('iaSessionExpiree'),
        }}
      />
    </div>
  );
}

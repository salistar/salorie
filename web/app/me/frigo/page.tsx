'use client';
// Frigo — une photo de ce qu'on a, des recettes en retour.
// ---------------------------------------------------------------------------
// Le mobile ouvre la galerie via `expo-image-picker`. Un navigateur fait la
// même chose avec un `<input type="file">` : c'est le même geste, choisir une
// image existante, et non une capture live — d'où le fait que cet écran soit
// portable là où `scan-camera` ne l'est pas.
//
// L'image est redimensionnée puis envoyée au backend, jamais stockée : cette
// page ne conserve rien. Une photo de l'intérieur d'un frigo en dit long sur un
// foyer, et rien ici n'exige de la garder.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { analyserImage, fichierVersBase64, iaConfiguree, IaIndisponible } from '../../../lib/ia';

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

  const [apercu, setApercu] = useState<string>('');
  const [reponse, setReponse] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  // L'aperçu est un blob local : sans révocation, chaque photo choisie laisse
  // sa copie en mémoire jusqu'au rechargement de la page.
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu); }, [apercu]);

  const analyser = useCallback(async (file: File) => {
    if (!file || occupe) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setOccupe(true);
    setReponse('');
    setErreur('');
    setApercu((ancien) => { if (ancien) URL.revokeObjectURL(ancien); return URL.createObjectURL(file); });
    try {
      const { base64, mimeType } = await fichierVersBase64(file);
      const txt = await analyserImage(CONSIGNE, base64, mimeType, ctrl.signal);
      setReponse(txt);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErreur(e instanceof IaIndisponible ? t('frigoIndispo') : t('frigoErreur'));
    } finally {
      if (!ctrl.signal.aborted) setOccupe(false);
    }
  }, [occupe, t]);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('frigoTitre')}</h1>
        <p className="me-sous">{t('frigoSous')}</p>
      </header>

      {!iaConfiguree() ? (
        <section className="carte-amis"><p className="me-erreur">{t('frigoPasDeBackend')}</p></section>
      ) : null}

      <section className="carte-amis">
        <input
          ref={champ} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) analyser(f); e.target.value = ''; }}
        />
        <div className="ligne-champ">
          <button className="btn btn-primary" onClick={() => champ.current?.click()} disabled={occupe}>
            {occupe ? t('frigoAnalyse') : t('frigoChoisir')}
          </button>
        </div>
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apercu} alt={t('frigoApercu')} className="frigo-apercu" />
        ) : null}
        <p className="me-note">{t('frigoNotePhoto')}</p>
      </section>

      {erreur ? <section className="carte-amis"><p className="me-erreur">{erreur}</p></section> : null}

      {reponse ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('frigoRecettes')}</h2>
          <p className="texte-ia">{reponse}</p>
          <p className="me-note">{t('frigoNoteIA')}</p>
        </section>
      ) : null}
    </div>
  );
}

'use client';
// Choisir une photo, l'envoyer à l'IA, afficher ce qui revient.
// ---------------------------------------------------------------------------
// Quatre écrans font exactement ce geste : frigo, étiquette, ticket de caisse,
// équipement de salle. Ils ne diffèrent que par la consigne envoyée et par la
// façon de présenter la réponse — pas par la mécanique.
//
// Cette mécanique porte quatre pièges déjà refermés une fois chacun, et qu'on
// ne veut pas re-refermer quatre fois :
//   - annuler la requête en vol au démontage, sinon la réponse arrive dans un
//     composant démonté ;
//   - révoquer l'URL de l'aperçu, sinon chaque photo choisie reste en mémoire ;
//   - retirer le préfixe `data:` du base64, sinon le décodage serveur échoue ;
//   - dire que le backend manque, plutôt qu'un bouton qui échoue en silence.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { analyserImage, fichierVersBase64, iaConfiguree, IaIndisponible, IaNonAutorise } from '../../lib/ia';

interface Props {
  /** Consigne envoyée au modèle avec l'image. */
  consigne: string;
  /** Libellés, résolus par la page appelante (elle seule connaît sa langue). */
  libelles: {
    choisir: string;
    analyse: string;
    apercu: string;
    notePhoto: string;
    indispo: string;
    erreur: string;
    pasDeBackend: string;
    /** Session expiree (401) : distinct d'une panne — se reconnecter suffit. */
    sessionExpiree?: string;
  };
  /** Rendu de la réponse. Par défaut, du texte brut. */
  rendu?: (reponse: string) => ReactNode;
  /** Appelé à chaque réponse reçue, pour les pages qui en tirent des valeurs. */
  onReponse?: (reponse: string) => void;
}

export default function AnalysePhoto({ consigne, libelles, rendu, onReponse }: Props) {
  const [apercu, setApercu] = useState('');
  const [reponse, setReponse] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const champ = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
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
      const txt = await analyserImage(consigne, base64, mimeType, ctrl.signal);
      setReponse(txt);
      onReponse?.(txt);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErreur(
        e instanceof IaNonAutorise ? (libelles.sessionExpiree || libelles.erreur)
        : e instanceof IaIndisponible ? libelles.indispo
        : libelles.erreur,
      );
    } finally {
      if (!ctrl.signal.aborted) setOccupe(false);
    }
  }, [consigne, occupe, libelles.indispo, libelles.erreur, onReponse]);

  return (
    <>
      {!iaConfiguree() ? (
        <section className="carte-amis"><p className="me-erreur">{libelles.pasDeBackend}</p></section>
      ) : null}

      <section className="carte-amis">
        <input
          ref={champ} type="file" accept="image/*" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) analyser(f); e.target.value = ''; }}
        />
        <div className="ligne-champ">
          <button className="btn btn-primary" onClick={() => champ.current?.click()} disabled={occupe}>
            {occupe ? libelles.analyse : libelles.choisir}
          </button>
        </div>
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apercu} alt={libelles.apercu} className="frigo-apercu" />
        ) : null}
        <p className="me-note">{libelles.notePhoto}</p>
      </section>

      {erreur ? <section className="carte-amis"><p className="me-erreur">{erreur}</p></section> : null}

      {reponse ? (rendu ? rendu(reponse) : (
        <section className="carte-amis"><p className="texte-ia">{reponse}</p></section>
      )) : null}
    </>
  );
}

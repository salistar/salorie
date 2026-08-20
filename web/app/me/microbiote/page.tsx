'use client';
// Microbiote — cinq questions, des recommandations en retour.
// ---------------------------------------------------------------------------
// Un questionnaire à cinq entrées : sur un téléphone, c'est cinq écrans de
// sélection successifs ; ici tout tient en une vue, et on peut revenir sur une
// réponse sans perdre les autres.
//
// La consigne envoyée reprend celle du mobile, y compris son garde-fou : « pas
// de diagnostic médical ». Ce n'est pas une formalité — la question porte sur
// le transit et les ballonnements, et quelqu'un pourrait prendre une réponse
// générée pour un avis clinique.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { genererTexte, iaConfiguree, IaIndisponible, IaNonAutorise } from '../../../lib/ia';

/** Mêmes questions et mêmes options que l'écran mobile. */
const QUESTIONS = [
  { cle: 'transit', nb: 4 },
  { cle: 'bloat', nb: 3 },
  { cle: 'ferment', nb: 3 },
  { cle: 'fiber', nb: 3 },
  { cle: 'stress', nb: 3 },
] as const;

const LANGUE_IA: Record<string, string> = { fr: 'French', en: 'English', ar: 'Arabic' };

export default function PageMicrobiote() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [rep, setRep] = useState<Record<string, string>>({});
  const [reco, setReco] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const repondues = useMemo(() => QUESTIONS.filter((q) => rep[q.cle]).length, [rep]);

  const analyser = useCallback(async () => {
    if (occupe) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setOccupe(true);
    setReco('');
    setErreur('');
    try {
      // « NR » pour une question sans réponse, comme sur mobile : le modèle doit
      // savoir qu'elle est SANS RÉPONSE plutôt que de la croire absente du
      // questionnaire et de raisonner sur un profil tronqué.
      const profil2 = QUESTIONS
        .map((q) => `${t(`mbio_q_${q.cle}`)}: ${rep[q.cle] ? t(`mbio_${q.cle}_${rep[q.cle]}`) : 'NR'}`)
        .join(' · ');
      const txt = await genererTexte(
        `User's gut profile: ${profil2}. Give personalized recommendations to improve their ` +
        `microbiome (foods to favor, habits, prebiotics/probiotics). Stay cautious (no medical ` +
        `diagnosis). Answer in ${LANGUE_IA[langue] || 'English'}, concise, list format.`,
        ctrl.signal,
      );
      setReco(txt);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setErreur(e instanceof IaNonAutorise ? t('iaSessionExpiree') : e instanceof IaIndisponible ? t('mbioIndispo') : t('mbioErreur'));
    } finally {
      if (!ctrl.signal.aborted) setOccupe(false);
    }
  }, [occupe, rep, langue, t]);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('mbioTitre')}</h1>
        <p className="me-sous">{t('mbioSous')}</p>
      </header>

      {!iaConfiguree() ? (
        <section className="carte-amis"><p className="me-erreur">{t('mbioPasDeBackend')}</p></section>
      ) : null}

      <section className="carte-amis">
        {QUESTIONS.map((q) => (
          <div key={q.cle} className="micro-question">
            <span className="me-sous">{t(`mbio_q_${q.cle}`)}</span>
            <div className="ligne-champ" style={{ flexWrap: 'wrap' }}>
              {Array.from({ length: q.nb }, (_, i) => String(i)).map((i) => (
                <button
                  key={i}
                  className={`btn ${rep[q.cle] === i ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setRep((r) => ({ ...r, [q.cle]: r[q.cle] === i ? '' : i }))}
                >
                  {t(`mbio_${q.cle}_${i}`)}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="ligne-champ" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={analyser} disabled={repondues === 0 || occupe}>
            {occupe ? t('mbioAnalyse') : t('mbioAnalyser')}
          </button>
          <span className="me-note">{repondues}/{QUESTIONS.length} {t('mbioRepondues')}</span>
        </div>
      </section>

      {erreur ? <section className="carte-amis"><p className="me-erreur">{erreur}</p></section> : null}

      {reco ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('mbioReco')}</h2>
          <p className="texte-ia">{reco}</p>
          <p className="me-note">{t('mbioAvertissement')}</p>
        </section>
      ) : null}
    </div>
  );
}

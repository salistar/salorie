'use client';
// Dictée — dire ce qu'on a mangé, l'IA transcrit et estime.
// ---------------------------------------------------------------------------
// Second écran que j'avais classé « bloqué par le matériel » à tort. Un
// navigateur enregistre de l'audio depuis quinze ans (`MediaRecorder`), et
// l'endpoint `/ai/transcribe` du backend ne demande rien d'autre qu'un son en
// base64 — exactement ce que le mobile lui envoie.
//
// Le micro exige une permission explicite, et il n'est ouvert QUE pendant
// l'enregistrement : la piste est coupée dès l'arrêt, pour que le voyant du
// navigateur s'éteigne au lieu de rester allumé sur une page ouverte.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { genererTexte, extraireObjet, iaConfiguree, IaIndisponible } from '../../../lib/ia';
import { ajouterLog, type Creneau } from '../../../lib/ecrireLog';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/$/, '');
const CRENEAUX: Creneau[] = ['breakfast', 'lunch', 'snack', 'dinner'];
/** Au-delà, ce n'est plus une phrase mais un enregistrement oublié. */
const DUREE_MAX_MS = 60_000;

type Estimation = { nom?: string; kcal?: number; prot?: number; gluc?: number; lip?: number };

export default function PageDicter() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [etat, setEtat] = useState<'repos' | 'enregistre' | 'traite'>('repos');
  const [texte, setTexte] = useState('');
  const [estim, setEstim] = useState<Estimation | null>(null);
  const [erreur, setErreur] = useState('');
  const [creneau, setCreneau] = useState<Creneau>('lunch');
  const [message, setMessage] = useState('');

  const recorder = useRef<MediaRecorder | null>(null);
  const morceaux = useRef<Blob[]>([]);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Coupe le micro pour de bon : sans `stop()` sur chaque piste, le voyant du
   *  navigateur reste allumé même après la fin de l'enregistrement. */
  const couperMicro = useCallback(() => {
    recorder.current?.stream.getTracks().forEach((p) => p.stop());
    recorder.current = null;
    if (minuteur.current) { clearTimeout(minuteur.current); minuteur.current = null; }
  }, []);

  useEffect(() => couperMicro, [couperMicro]);

  const transcrire = useCallback(async (blob: Blob) => {
    setEtat('traite');
    setErreur('');
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result).split(',')[1] || '');
        fr.onerror = () => rej(new Error('lecture'));
        fr.readAsDataURL(blob);
      });

      const rep = await fetch(`${API_URL}/ai/transcribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mimeType: blob.type || 'audio/webm', language: langue }),
      });
      if (!rep.ok) throw new IaIndisponible(`transcribe ${rep.status}`);
      const dit = String((await rep.json())?.text || '').trim();
      if (!dit) { setErreur(t('dicteRienCompris')); setEtat('repos'); return; }
      setTexte(dit);

      // Deuxième passe : transformer la phrase en chiffres. Le mobile fait
      // pareil — transcrire ne donne qu'un texte, pas un repas.
      const brut = await genererTexte(
        `Voici ce qu'une personne dit avoir mangé : "${dit}". Renvoie UNIQUEMENT un objet ` +
        `JSON, sans texte autour : {"nom": string, "kcal": number, "prot": number, ` +
        `"gluc": number, "lip": number}. Estime pour la quantité décrite, ou une portion ` +
        `habituelle si aucune quantité n'est donnée. Si ce n'est pas de la nourriture, ` +
        `renvoie {"nom": ""}.`,
      );
      const o = extraireObjet(brut) as Estimation | null;
      setEstim(o && String(o.nom || '').trim() ? o : null);
      if (!o || !String(o.nom || '').trim()) setErreur(t('dictePasUnRepas'));
    } catch (e: any) {
      setErreur(e instanceof IaIndisponible ? t('dicteIndispo') : t('dicteErreur'));
    } finally {
      setEtat('repos');
    }
  }, [langue, t]);

  const demarrer = useCallback(async () => {
    setErreur('');
    setTexte('');
    setEstim(null);
    setMessage('');
    try {
      const flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(flux);
      morceaux.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) morceaux.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(morceaux.current, { type: mr.mimeType || 'audio/webm' });
        couperMicro();
        if (blob.size > 0) transcrire(blob);
        else setEtat('repos');
      };
      recorder.current = mr;
      mr.start();
      setEtat('enregistre');
      // Arrêt automatique : un enregistrement oublié partirait en entier vers
      // le serveur, et coûterait pour rien.
      minuteur.current = setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, DUREE_MAX_MS);
    } catch {
      setErreur(t('dicteMicroRefuse'));
      setEtat('repos');
    }
  }, [couperMicro, transcrire, t]);

  const arreter = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
  }, []);

  const journaliser = async () => {
    if (!uid || !estim) return;
    try {
      await ajouterLog(uid, {
        type: 'meal',
        name: String(estim.nom),
        calories: Number(estim.kcal) || 0,
        protein: Number(estim.prot) || 0,
        carbs: Number(estim.gluc) || 0,
        fat: Number(estim.lip) || 0,
        slot: creneau,
      });
      setMessage(t('dicteJournalise'));
    } catch {
      setMessage(t('dicteErreurJournal'));
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('dicteTitre')}</h1>
        <p className="me-sous">{t('dicteSous')}</p>
      </header>

      {!iaConfiguree() ? (
        <section className="carte-amis"><p className="me-erreur">{t('dictePasDeBackend')}</p></section>
      ) : null}

      <section className="carte-amis">
        <div className="ligne-champ">
          {etat === 'enregistre' ? (
            <button className="btn btn-primary" onClick={arreter}>{t('dicteArreter')}</button>
          ) : (
            <button className="btn btn-primary" onClick={demarrer} disabled={etat === 'traite'}>
              {etat === 'traite' ? t('dicteTraitement') : t('dicteParler')}
            </button>
          )}
          {etat === 'enregistre' ? <span className="dicte-point" aria-hidden /> : null}
          {etat === 'enregistre' ? <span className="me-note">{t('dicteEnCours')}</span> : null}
        </div>
        <p className="me-note">{t('dicteNoteMicro')}</p>
      </section>

      {erreur ? <section className="carte-amis"><p className="me-erreur">{erreur}</p></section> : null}

      {texte ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('dicteEntendu')}</h2>
          <p className="texte-ia">{texte}</p>
        </section>
      ) : null}

      {estim ? (
        <section className="carte-amis">
          <h2 className="me-h2">{estim.nom}</h2>
          <div className="grille-series">
            <div className="tuile-serie"><span className="serie-nombre">{Math.round(Number(estim.kcal) || 0)}</span><span className="me-sous">kcal</span></div>
            <div className="tuile-serie"><span className="serie-nombre">{Math.round(Number(estim.prot) || 0)}</span><span className="me-sous">{t('cbProt')}</span></div>
            <div className="tuile-serie"><span className="serie-nombre">{Math.round(Number(estim.gluc) || 0)}</span><span className="me-sous">{t('cbGluc')}</span></div>
            <div className="tuile-serie"><span className="serie-nombre">{Math.round(Number(estim.lip) || 0)}</span><span className="me-sous">{t('cbLip')}</span></div>
          </div>
          <div className="ligne-champ" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {CRENEAUX.map((c) => (
              <button key={c} className={`btn ${creneau === c ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCreneau(c)}>
                {t(`saisieCreneau_${c}`)}
              </button>
            ))}
          </div>
          <div className="ligne-champ" style={{ marginTop: 8 }}>
            <button className="btn btn-primary" onClick={journaliser} disabled={!uid}>
              {t('dicteAjouterJournal')}
            </button>
            {message ? <span className="me-note">{message}</span> : null}
          </div>
          <p className="me-note">{t('dicteNoteEstimation')}</p>
        </section>
      ) : null}
    </div>
  );
}

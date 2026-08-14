'use client';
// Scan d'un repas depuis le navigateur : photo -> reconnaissance -> journal.
// Le meme prompt et le meme point d'entree que le telephone, donc le meme resultat
// pour la meme assiette. La photo est compressee AVANT d'etre envoyee et n'est
// stockee nulle part : seul le resultat chiffre rejoint le journal.
import { useCallback, useRef, useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { firestore } from '../../../lib/firebaseClient';
import { useProfil, jourLocal } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { compresser, analyser, type ResultatScan } from '../../../lib/visionWeb';

const MOMENTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
const CLES_MOMENT: Record<string, string> = {
  breakfast: 'petitDej',
  lunch: 'dejeuner',
  snack: 'collation',
  dinner: 'diner',
};

/** Creneau probable d'apres l'heure — le meme reflexe que le mobile. */
function momentParDefaut(): string {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 18) return 'snack';
  return 'dinner';
}

export default function PageScan() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language || 'fr') as Langue;
  const t = traducteur(langue);
  const dir = sensLecture(langue);

  const [apercu, setApercu] = useState<string>('');
  const [analyse, setAnalyse] = useState(false);
  const [resultat, setResultat] = useState<ResultatScan | null>(null);
  const [erreur, setErreur] = useState('');
  const [ajoute, setAjoute] = useState(false);
  const [moment, setMoment] = useState<string>(momentParDefaut());
  const [survol, setSurvol] = useState(false);
  const champ = useRef<HTMLInputElement>(null);

  const traiter = useCallback(
    async (fichier: File) => {
      if (!fichier.type.startsWith('image/')) {
        setErreur(t('scanPasImage'));
        return;
      }
      setErreur('');
      setResultat(null);
      setAjoute(false);
      setAnalyse(true);
      try {
        const b64 = await compresser(fichier);
        setApercu(`data:image/jpeg;base64,${b64}`);
        setResultat(await analyser(b64, langue));
      } catch (e: any) {
        // On distingue les deux pannes qui n'appellent pas la meme reaction : un
        // quota atteint se reessaie plus tard, une image illisible se rephotographie.
        const msg = String(e?.message || '');
        setErreur(msg.includes('429') ? t('scanQuota') : t('scanEchec'));
      } finally {
        setAnalyse(false);
      }
    },
    [langue, t],
  );

  const ajouterAuJournal = async () => {
    if (!resultat) return;
    await addDoc(collection(firestore(), 'users', uid, 'logs'), {
      userId: uid,
      type: 'meal',
      name: resultat.name,
      description: resultat.description || '',
      calories: resultat.calories,
      protein: resultat.protein,
      carbs: resultat.carbs,
      fat: resultat.fat,
      serving: resultat.serving || '',
      date: jourLocal(),
      slot: moment,
      timestamp: serverTimestamp(),
    });
    setAjoute(true);
  };

  return (
    <div className="me-page" dir={dir}>
      <header className="me-entete">
        <h1>{t('scanTitre')}</h1>
        <p className="me-sous">{t('scanSous')}</p>
      </header>

      <div
        className={`depot${survol ? ' survol' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSurvol(false);
          const f = e.dataTransfer.files?.[0];
          if (f) traiter(f);
        }}
        onClick={() => champ.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') champ.current?.click();
        }}
      >
        <input
          ref={champ}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) traiter(f);
          }}
        />
        {apercu ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apercu} alt="" className="depot-apercu" />
        ) : (
          <>
            <div className="depot-ico" aria-hidden>
              📷
            </div>
            <div className="depot-txt">{t('scanDepose')}</div>
            <div className="depot-aide">{t('scanAide')}</div>
          </>
        )}
      </div>

      {analyse ? (
        <div className="me-centre" style={{ minHeight: 'auto', padding: '24px 0' }}>
          <div className="me-spinner" aria-hidden />
          <p className="me-centre-txt">{t('scanEnCours')}</p>
        </div>
      ) : null}

      {erreur ? <div className="me-erreur" style={{ marginTop: 16 }}>{erreur}</div> : null}

      {resultat ? (
        <section className="carte-resultat">
          <div className="resultat-tete">
            <h2>{resultat.name}</h2>
            {resultat.serving ? <span className="resultat-portion">{resultat.serving}</span> : null}
          </div>

          {resultat.description ? <p className="resultat-desc">{resultat.description}</p> : null}

          <div className="resultat-macros">
            <div className="macro accent">
              <b>{resultat.calories}</b>
              <span>kcal</span>
            </div>
            <div className="macro">
              <b>{Math.round(resultat.protein)} g</b>
              <span>{t('proteines')}</span>
            </div>
            <div className="macro">
              <b>{Math.round(resultat.carbs)} g</b>
              <span>{t('glucides')}</span>
            </div>
            <div className="macro">
              <b>{Math.round(resultat.fat)} g</b>
              <span>{t('lipides')}</span>
            </div>
          </div>

          {resultat.qualities?.length || resultat.risks?.length ? (
            <div className="resultat-notes">
              {resultat.qualities?.map((q) => (
                <span key={q} className="note-bonne">
                  ✓ {q}
                </span>
              ))}
              {resultat.risks?.map((r) => (
                <span key={r} className="note-risque">
                  ! {r}
                </span>
              ))}
            </div>
          ) : null}

          {resultat.portionBasis ? (
            <p className="resultat-base">
              {t('scanBasePortion')} : {resultat.portionBasis}
              {resultat.portionConfidence ? ` (${resultat.portionConfidence})` : ''}
            </p>
          ) : null}

          <div className="resultat-actions">
            <label className="resultat-moment">
              <span>{t('moment')}</span>
              <select className="input" value={moment} onChange={(e) => setMoment(e.target.value)}>
                {MOMENTS.map((m) => (
                  <option key={m} value={m}>
                    {t(CLES_MOMENT[m])}
                  </option>
                ))}
              </select>
            </label>
            {ajoute ? (
              <a className="btn btn-primary" href="/me/diary">
                {t('scanAjouteVoir')}
              </a>
            ) : (
              <button className="btn btn-primary" onClick={ajouterAuJournal}>
                {t('ajouterRepas')}
              </button>
            )}
          </div>
        </section>
      ) : null}

      <p className="me-note">{t('scanNotePhoto')}</p>
    </div>
  );
}

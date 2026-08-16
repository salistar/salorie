'use client';
// Importer son historique alimentaire — l'ecran le plus web-natif de l'app.
// ---------------------------------------------------------------------------
// L'export CSV de MyFitnessPal, Yazio ou Cronometer arrive PAR E-MAIL, sur un
// ordinateur. L'importer depuis le telephone oblige a le transferer d'abord :
// ce n'etait pas un inconfort, c'etait un parcours absurde.
//
// Le parseur est CELUI DU MOBILE, importe tel quel. Sa detection de separateur et
// sa correspondance floue de colonnes sont subtiles ; deux copies auraient
// diverge, et l'une serait devenue silencieusement moins bonne que l'autre.
import { useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { parseFoodExport, type ImportedLog } from '../../../../lib/importParsers';

type Etat = 'attente' | 'lecture' | 'pret' | 'import' | 'fini' | 'erreur';

export default function PageImport() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [etat, setEtat] = useState<Etat>('attente');
  const [logs, setLogs] = useState<ImportedLog[]>([]);
  const [ignores, setIgnores] = useState(0);
  const [faits, setFaits] = useState(0);
  const [erreur, setErreur] = useState('');

  const choisir = async (fichier: File | undefined) => {
    if (!fichier) return;
    setEtat('lecture');
    setErreur('');
    try {
      const texte = await fichier.text();
      const r = parseFoodExport(texte);
      if (!r.logs.length) {
        setErreur(t('importVide'));
        setEtat('erreur');
        return;
      }
      setLogs(r.logs);
      setIgnores(r.skipped);
      setEtat('pret');
    } catch {
      setErreur(t('importErreur'));
      setEtat('erreur');
    }
  };

  const importer = async () => {
    if (!uid || !logs.length) return;
    setEtat('import');
    let n = 0;
    for (const l of logs) {
      try {
        // Meme collection que le mobile : l'import apparait dans le journal du
        // telephone sans aucune synchronisation a ecrire.
        await addDoc(collection(firestore(), 'users', uid, 'nutrition_logs'), {
          name: l.name,
          calories: l.calories,
          protein: l.protein,
          carbs: l.carbs,
          fat: l.fat,
          date: l.date,
          type: l.slot || 'meal',
          createdAt: serverTimestamp(),
        });
        n += 1;
        // On met a jour a chaque ligne : sur un export d'un an, un compteur fige
        // se lit comme un blocage.
        setFaits(n);
      } catch {
        // Une ligne qui echoue n'annule pas les autres. Un import partiel vaut
        // mieux qu'un import perdu.
      }
    }
    setEtat('fini');
  };

  const recommencer = () => {
    setEtat('attente');
    setLogs([]);
    setIgnores(0);
    setFaits(0);
    setErreur('');
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('importTitre')}</h1>
        <p className="me-sous">{t('importSous')}</p>
      </header>

      <section className="carte-amis">
        {etat === 'attente' || etat === 'erreur' ? (
          <>
            <label className="depot">
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => choisir(e.target.files?.[0])}
                aria-label={t('importChoisir')}
              />
              <span className="depot-titre">{t('importChoisir')}</span>
              <span className="me-sous">{t('importFormats')}</span>
            </label>
            {erreur ? <p className="me-erreur">{erreur}</p> : null}
          </>
        ) : null}

        {etat === 'lecture' ? <p className="me-sous">{t('importLecture')}</p> : null}

        {etat === 'pret' ? (
          <>
            <p className="resume-import">
              <strong>{logs.length}</strong> {t('importTrouves')}
            </p>
            {ignores > 0 ? (
              // Dire ce qui est IGNORE evite de croire a un import complet quand il
              // ne l'est pas — et la raison est toujours la meme : date, nom ou
              // calories manquants.
              <p className="me-note">{ignores} {t('importIgnores')}</p>
            ) : null}
            <ul className="apercu-import">
              {logs.slice(0, 8).map((l, i) => (
                <li key={i}>
                  <span className="apercu-date">{l.date}</span>
                  <span className="apercu-nom">{l.name}</span>
                  <span className="apercu-kcal">{Math.round(l.calories)} kcal</span>
                </li>
              ))}
            </ul>
            {logs.length > 8 ? <p className="me-sous">+ {logs.length - 8}…</p> : null}
            <div className="ligne-champ" style={{ marginTop: 14 }}>
              <button className="btn btn-primary" onClick={importer}>
                {t('importLancer')} ({logs.length})
              </button>
              <button className="btn btn-ghost" onClick={recommencer}>
                {t('importAutre')}
              </button>
            </div>
          </>
        ) : null}

        {etat === 'import' ? (
          <p className="resume-import">
            {t('importEnCours')} <strong>{faits}</strong> / {logs.length}
          </p>
        ) : null}

        {etat === 'fini' ? (
          <>
            <p className="resume-import">
              <strong>{faits}</strong> {t('importFini')}
            </p>
            <div className="ligne-champ" style={{ marginTop: 12 }}>
              <a className="btn btn-primary" href="/me/diary">{t('importVoirJournal')}</a>
              <button className="btn btn-ghost" onClick={recommencer}>{t('importAutre')}</button>
            </div>
          </>
        ) : null}
      </section>

      <p className="me-note">{t('importNote')}</p>
    </div>
  );
}

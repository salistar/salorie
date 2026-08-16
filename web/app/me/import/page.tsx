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
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { parseFoodExport, type ImportedLog } from '../../../../lib/importParsers';

type Etat = 'attente' | 'lecture' | 'pret' | 'import' | 'fini' | 'erreur';

/**
 * Un identifiant DERIVE du contenu de la ligne, et non tire au hasard.
 *
 * C'est ce qui rend un import rejouable. Avec un identifiant aleatoire, relancer
 * le meme fichier apres un import partiel aurait duplique tout ce qui avait deja
 * reussi — et relancer est precisement le seul recours de l'utilisateur.
 *
 * Un hachage simple suffit : on ne cherche pas a resister a une attaque, juste a
 * ce que la meme ligne donne toujours le meme identifiant. Le prefixe rend ces
 * documents reconnaissables dans la console Firestore.
 */
function idImport(cle: string, rang: number): string {
  let h = 0;
  const brut = `${cle}#${rang}`;
  for (let i = 0; i < brut.length; i++) h = (h * 31 + brut.charCodeAt(i)) | 0;
  return `imp_${Math.abs(h).toString(36)}_${brut.length.toString(36)}`;
}

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
  const [echecs, setEchecs] = useState(0);
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
    let rates = 0;

    // Combien de fois cette ligne EXACTE est deja apparue dans le fichier. Deux
    // bananes le meme jour sont deux vrais repas, pas un doublon : le compteur
    // les distingue, tout en gardant l'identifiant stable d'un import a l'autre.
    const vus: Record<string, number> = {};

    for (const l of logs) {
      const cle = `${l.date}|${l.name}|${Math.round(l.calories)}|${l.slot || ''}`;
      const rang = (vus[cle] = (vus[cle] ?? -1) + 1);
      try {
        await setDoc(doc(firestore(), 'users', uid, 'logs', idImport(cle, rang)), {
          name: l.name,
          calories: l.calories,
          protein: l.protein,
          carbs: l.carbs,
          fat: l.fat,
          date: l.date,
          type: l.slot || 'meal',
          importe: true,
          createdAt: serverTimestamp(),
        });
        n += 1;
        // On met a jour a chaque ligne : sur un export d'un an, un compteur fige
        // se lit comme un blocage.
        setFaits(n);
      } catch {
        // Une ligne qui echoue n'annule pas les autres — mais ce n'est defendable
        // QUE parce que rejouer le fichier est sans danger : l'identifiant est
        // derive du contenu, donc une seconde passe ECRASE au lieu de dupliquer.
        // Avec un identifiant aleatoire, le seul recours de l'utilisateur aurait
        // double tout ce qui avait deja reussi.
        rates += 1;
      }
    }
    setEchecs(rates);
    setEtat('fini');
  };

  const recommencer = () => {
    setEtat('attente');
    setLogs([]);
    setIgnores(0);
    setFaits(0);
    setEchecs(0);
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
            {echecs > 0 ? (
              <p className="me-erreur">
                {echecs} {t('importEchecs')}
              </p>
            ) : null}
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

'use client';
// Micronutriments — pas la journee, les TRENTE DERNIERS JOURS.
// ---------------------------------------------------------------------------
// Le telephone montre le bilan du jour, et c'est a peu pres inutile : personne
// ne couvre ses apports en fer sur une seule journee, et une journee basse ne
// veut rien dire. Ce qui compte, c'est ce qui manque TOUS LES JOURS — et ca ne
// se voit qu'en empilant un mois.
//
// Aucune generation ici : la page relit les bilans DEJA calcules par le
// telephone, dans `users/{uid}/micros/{date}_{langue}`. Les regenerer ferait
// deux estimations differentes pour la meme journee, et sur un ecran de
// nutrition ca revient a ne plus savoir laquelle croire. Le web agrege, il
// n'invente pas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, getDocs } from 'firebase/firestore';

const JOURS = 30;

type Micro = { name: string; amount: string; pct: number };
type Bilan = { date: string; micros: Micro[] };

function jourLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function PageMicronutriments() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [bilans, setBilans] = useState<Bilan[]>([]);
  const [charge, setCharge] = useState(false);
  const [debut, setDebut] = useState('');

  useEffect(() => {
    setDebut(jourLocal(new Date(Date.now() - JOURS * 86400000)));
  }, []);

  const charger = useCallback(async () => {
    if (!uid || !debut) return;
    try {
      const snap = await getDocs(collection(firestore(), 'users', uid, 'micros'));
      const l: Bilan[] = [];
      for (const d of snap.docs) {
        // L'identifiant vaut `AAAA-MM-JJ_langue` : on ne garde que la date, et on
        // accepte TOUTES les langues. Quelqu'un qui a change de langue en cours
        // de mois perdrait sinon la moitie de son historique.
        const date = d.id.split('_')[0];
        if (!date || date < debut) continue;
        const r = (d.data() as any)?.report;
        const micros = Array.isArray(r?.micros) ? r.micros : [];
        if (!micros.length) continue;
        l.push({
          date,
          micros: micros.map((m: any) => ({
            name: String(m?.name || '').trim(),
            amount: String(m?.amount || ''),
            pct: Number(m?.pct) || 0,
          })).filter((m: Micro) => m.name),
        });
      }
      l.sort((a, b) => a.date.localeCompare(b.date));
      setBilans(l);
    } catch {
      setBilans([]);
    } finally {
      setCharge(true);
    }
  }, [uid, debut]);

  useEffect(() => {
    charger();
  }, [charger]);

  /** Un nutriment par ligne, avec sa moyenne et le nombre de jours sous 70 %. */
  const lignes = useMemo(() => {
    const par: Record<string, { pcts: number[]; amount: string }> = {};
    for (const b of bilans) {
      for (const m of b.micros) {
        // Les noms viennent d'un modele et arrivent parfois avec une casse
        // differente d'un jour a l'autre : sans normalisation, « Fer » et « fer »
        // feraient deux lignes qui se partagent l'historique.
        const cle = m.name.toLowerCase();
        (par[cle] ||= { pcts: [], amount: m.amount }).pcts.push(m.pct);
      }
    }
    return Object.entries(par)
      .map(([cle, v]) => {
        const moy = Math.round(v.pcts.reduce((a, b) => a + b, 0) / v.pcts.length);
        const bas = v.pcts.filter((p) => p < 70).length;
        return { nom: cle, moy, bas, jours: v.pcts.length, amount: v.amount };
      })
      // Le plus manquant EN PREMIER : c'est la seule ligne sur laquelle on va
      // agir, et elle serait noyee au milieu d'un tableau alphabetique.
      .sort((a, b) => a.moy - b.moy);
  }, [bilans]);

  const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('microTitre')}</h1>
        <p className="me-sous">{t('microSous').replace('{n}', String(JOURS))}</p>
      </header>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : lignes.length === 0 ? (
        <section className="carte-amis">
          <p className="me-sous">{t('microAucun')}</p>
        </section>
      ) : (
        <>
          <section className="carte-amis">
            <div className="grille-series">
              <div className="tuile-serie"><span className="serie-nombre">{bilans.length}</span><span className="me-sous">{t('microJours')}</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{lignes.length}</span><span className="me-sous">{t('microNutriments')}</span></div>
              <div className="tuile-serie">
                <span className="serie-nombre">{lignes.filter((l) => l.moy < 70).length}</span>
                <span className="me-sous">{t('microSousSeuil')}</span>
              </div>
            </div>
          </section>

          <section className="carte-amis">
            <div className="tableau-micro" role="table">
              <div className="micro-ligne micro-entete" role="row">
                <span role="columnheader">{t('microNutriment')}</span>
                <span role="columnheader">{t('microMoyenne')}</span>
                <span role="columnheader">{t('microJoursBas')}</span>
              </div>
              {lignes.map((l) => (
                <div key={l.nom} className="micro-ligne" role="row">
                  <span role="cell">{majuscule(l.nom)}</span>
                  <span role="cell" className="micro-barre-cell">
                    {/* La barre est plafonnee a 100 % d'affichage mais le CHIFFRE
                        garde sa vraie valeur : depasser 140 % de l'apport
                        conseille est une information, pas un bonus a masquer. */}
                    <span className="micro-piste">
                      <span
                        className={`micro-remplissage ${l.moy < 70 ? 'micro-bas' : l.moy > 140 ? 'micro-haut' : 'micro-ok'}`}
                        style={{ width: `${Math.min(100, l.moy)}%` }}
                      />
                    </span>
                    <strong>{l.moy} %</strong>
                  </span>
                  <span role="cell">{l.bas} / {l.jours}</span>
                </div>
              ))}
            </div>
            <p className="me-note">{t('microLegende')}</p>
          </section>
        </>
      )}

      {/* Une estimation par modele, sur des aliments eux-memes estimes. Le dire
          franchement vaut mieux qu'un tableau qui a l'air d'une analyse de sang. */}
      <p className="me-note">{t('microAvertissement')}</p>
    </div>
  );
}

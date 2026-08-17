'use client';
// Modeles de repas — la bibliotheque des plats qu'on remange sans arret.
// ---------------------------------------------------------------------------
// Un modele evite de resaisir quatre nombres a chaque petit-dejeuner identique.
// Le CREER demande justement de taper ces quatre nombres, plus un nom : c'est de
// la saisie de formulaire, exactement ce que le clavier fait mieux que le pouce.
// Et une bibliotheque se RANGE d'un coup d'oeil, pas en faisant defiler.
//
// Ecran a part plutot que section de « Plans » : gerer une bibliotheque et
// planifier une semaine sont deux gestes differents, faits a des moments
// differents. Les empiler aurait rallonge une page deja dense.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';

type Modele = { id: string; name?: string; calories?: number; protein?: number; carbs?: number; fat?: number };

const CRENEAUX = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

function jourLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageModeles() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [modeles, setModeles] = useState<Modele[]>([]);
  const [charge, setCharge] = useState(false);
  const [nom, setNom] = useState('');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [gluc, setGluc] = useState('');
  const [lip, setLip] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [creneau, setCreneau] = useState<string>('lunch');
  const [journalise, setJournalise] = useState('');

  const charger = useCallback(async () => {
    if (!uid) return;
    try {
      const snap = await getDocs(collection(firestore(), 'users', uid, 'meal_templates'));
      setModeles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    } catch {
      setModeles([]);
    } finally {
      setCharge(true);
    }
  }, [uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const nombre = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  const creer = async () => {
    const n = nom.trim();
    if (!n || !uid || occupe) return;
    setOccupe(true);
    try {
      await addDoc(collection(firestore(), 'users', uid, 'meal_templates'), {
        name: n.slice(0, 80),
        calories: nombre(kcal),
        protein: nombre(prot),
        carbs: nombre(gluc),
        fat: nombre(lip),
        // Memes champs que `logEntry` cote mobile : les deux clients doivent
        // ecrire des documents interchangeables.
        date: jourLocal(),
        timestamp: serverTimestamp(),
      });
      setNom(''); setKcal(''); setProt(''); setGluc(''); setLip('');
      await charger();
    } finally {
      setOccupe(false);
    }
  };

  const journaliser = async (m: Modele) => {
    if (!uid) return;
    try {
      // Ecriture dans `logs` — la MEME collection que le mobile et que le
      // journal web. Ecrire ailleurs donnerait un repas invisible partout.
      await addDoc(collection(firestore(), 'users', uid, 'logs'), {
        userId: uid,
        type: 'meal',
        slot: creneau,
        name: m.name || '',
        calories: Number(m.calories) || 0,
        protein: Number(m.protein) || 0,
        carbs: Number(m.carbs) || 0,
        // Le mobile ecrit `fat`, pas `fats` : garder le meme nom, sinon les
        // lipides du repas seraient comptes a zero dans le journal.
        fat: Number(m.fat) || 0,
        date: jourLocal(),
        timestamp: serverTimestamp(),
      });
      setJournalise(m.id);
      // Le message s'efface : un accuse permanent finit par etre pris pour un
      // etat, et on ne sait plus si le dernier clic a marche.
      setTimeout(() => setJournalise((x) => (x === m.id ? '' : x)), 4000);
    } catch {
      setJournalise('');
    }
  };

  const supprimer = async (id: string) => {
    if (!uid) return;
    await deleteDoc(doc(firestore(), 'users', uid, 'meal_templates', id));
    setModeles((l) => l.filter((m) => m.id !== id));
  };

  const tries = useMemo(
    () => [...modeles].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [modeles],
  );

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('modelesTitre')}</h1>
        <p className="me-sous">{t('modelesSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('modelesCreer')}</h2>
        <div className="ligne-champ">
          <input className="champ-amis" style={{ flex: '1 1 220px' }} value={nom}
            onChange={(e) => setNom(e.target.value.slice(0, 80))}
            placeholder={t('modelesNom')} aria-label={t('modelesNom')} />
          <input className="champ-amis" style={{ flex: '0 1 120px' }} inputMode="numeric" value={kcal}
            onChange={(e) => setKcal(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('modelesKcal')} aria-label={t('modelesKcal')} />
          <input className="champ-amis" style={{ flex: '0 1 110px' }} inputMode="numeric" value={prot}
            onChange={(e) => setProt(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('modelesProt')} aria-label={t('modelesProt')} />
          <input className="champ-amis" style={{ flex: '0 1 110px' }} inputMode="numeric" value={gluc}
            onChange={(e) => setGluc(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('modelesGluc')} aria-label={t('modelesGluc')} />
          <input className="champ-amis" style={{ flex: '0 1 110px' }} inputMode="numeric" value={lip}
            onChange={(e) => setLip(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('modelesLip')} aria-label={t('modelesLip')} />
          <button className="btn btn-primary" onClick={creer} disabled={!nom.trim() || occupe}>
            {t('modelesAjouter')}
          </button>
        </div>
      </section>

      <section className="carte-amis">
        <div className="ligne-champ">
          <span className="me-sous">{t('modelesCreneau')}</span>
          {CRENEAUX.map((c) => (
            <button key={c} className={`btn ${creneau === c ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCreneau(c)} aria-pressed={creneau === c}>
              {t(`modelesCreneau_${c}`) || c}
            </button>
          ))}
        </div>
        <p className="me-note">{t('modelesCreneauNote')}</p>
      </section>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : tries.length === 0 ? (
        <p className="me-sous">{t('modelesVide')}</p>
      ) : (
        <ul className="grille-modeles">
          {tries.map((m) => (
            <li key={m.id} className="carte-modele">
              <strong>{m.name}</strong>
              <div className="recette-macros">
                <span>{m.calories || 0} kcal</span>
                <span>P {m.protein || 0}g</span>
                <span>G {m.carbs || 0}g</span>
                <span>L {m.fat || 0}g</span>
              </div>
              <div className="ligne-champ" style={{ marginTop: 10 }}>
                <button className="btn btn-primary" onClick={() => journaliser(m)}>
                  {t('modelesJournaliser')}
                </button>
                <button className="btn btn-ghost" onClick={() => supprimer(m.id)}>
                  {t('modelesSupprimer')}
                </button>
                {journalise === m.id ? <span className="me-note">{t('modelesAjoute')}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

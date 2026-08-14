'use client';
// Profil et preferences — la derniere piece de la parite avec le telephone.
// ---------------------------------------------------------------------------
// Attention aux champs INTOUCHABLES : les regles Firestore interdisent au client
// d'ecrire premiumOverride, subscription, premiumTrialUntil, referredBy et
// referralCount (sans quoi on s'offrirait un abonnement en une requete). On
// n'envoie donc QUE les champs edites, jamais l'objet entier.
import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useMe } from '../MeProvider';
import { firestore } from '../../../lib/firebaseClient';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

const OBJECTIFS = [
  { valeur: 'lose', cle: 'objPerdre' },
  { valeur: 'maintain', cle: 'objMaintenir' },
  { valeur: 'gain', cle: 'objPrendre' },
  { valeur: 'muscle', cle: 'objMuscle' },
];

const LANGUES: { valeur: Langue; label: string }[] = [
  { valeur: 'fr', label: 'Français' },
  { valeur: 'en', label: 'English' },
  { valeur: 'ar', label: 'العربية' },
];

export default function PageProfil() {
  const { uid, email } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language || 'fr') as Langue;
  const t = traducteur(langue);
  const dir = sensLecture(langue);

  const [objectif, setObjectif] = useState('');
  const [poids, setPoids] = useState('');
  const [cible, setCible] = useState('');
  const [etat, setEtat] = useState<'' | 'envoi' | 'ok' | 'erreur'>('');

  // Le formulaire se cale sur le document a son arrivee, puis n'est plus ecrase :
  // sinon une modification en cours de frappe serait effacee par le prochain
  // instantane temps reel du document.
  useEffect(() => {
    if (!profil) return;
    setObjectif((o) => o || profil.goal || '');
    setPoids((p) => p || (profil.weight != null ? String(profil.weight) : ''));
    setCible((c) => c || String(profil.nutritionalPlan?.dailyCalories || ''));
  }, [profil]);

  const enregistrer = async (champs: Record<string, unknown>) => {
    setEtat('envoi');
    try {
      await updateDoc(doc(firestore(), 'users', uid), champs);
      setEtat('ok');
      setTimeout(() => setEtat(''), 2200);
    } catch {
      setEtat('erreur');
    }
  };

  const enregistrerProfil = (e: React.FormEvent) => {
    e.preventDefault();
    const champs: Record<string, unknown> = {};
    if (objectif) champs.goal = objectif;
    if (poids) champs.weight = Number(poids);
    if (cible) {
      // On fusionne dans nutritionalPlan par notation pointee : ecrire l'objet
      // entier effacerait les macros calculees a l'onboarding.
      champs['nutritionalPlan.dailyCalories'] = Number(cible);
    }
    enregistrer(champs);
  };

  return (
    <div className="me-page" dir={dir}>
      <header className="me-entete">
        <h1>{t('profilTitre')}</h1>
        <p className="me-sous">{email}</p>
      </header>

      <form className="carte-ajout" onSubmit={enregistrerProfil}>
        <div className="ajout-grille">
          <label className="ajout-nom">
            <span>{t('profilObjectif')}</span>
            <select className="input" value={objectif} onChange={(e) => setObjectif(e.target.value)}>
              <option value="">—</option>
              {OBJECTIFS.map((o) => (
                <option key={o.valeur} value={o.valeur}>
                  {t(o.cle)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('profilPoids')} (kg)</span>
            <input
              className="input"
              type="number"
              step="0.1"
              min="20"
              max="400"
              value={poids}
              onChange={(e) => setPoids(e.target.value)}
            />
          </label>
          <label>
            <span>{t('profilCible')} (kcal)</span>
            <input
              className="input"
              type="number"
              min="800"
              max="8000"
              value={cible}
              onChange={(e) => setCible(e.target.value)}
            />
          </label>
        </div>
        <div className="resultat-actions">
          <button className="btn btn-primary" type="submit" disabled={etat === 'envoi'}>
            {etat === 'envoi' ? t('enregistrement') : t('profilEnregistrer')}
          </button>
          {etat === 'ok' ? <span className="note-bonne">✓ {t('profilEnregistre')}</span> : null}
          {etat === 'erreur' ? <span className="note-risque">{t('erreurEcriture')}</span> : null}
        </div>
      </form>

      <h2 className="me-h2">{t('profilLangue')}</h2>
      <div className="onglets">
        {LANGUES.map((l) => (
          <button
            key={l.valeur}
            className={`onglet${langue === l.valeur ? ' actif' : ''}`}
            onClick={() => enregistrer({ language: l.valeur })}
          >
            {l.label}
          </button>
        ))}
      </div>
      <p className="me-note">{t('profilLangueNote')}</p>
    </div>
  );
}

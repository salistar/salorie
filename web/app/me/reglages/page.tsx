'use client';
// Mes informations et mes objectifs — la saisie longue, au clavier.
// ---------------------------------------------------------------------------
// Rien ici n'est nouveau : ce sont les memes champs que l'onboarding mobile. Ce
// qui change, c'est qu'on peut tout revoir d'un coup au lieu d'un ecran par
// question. Corriger sa taille demande six taps sur telephone ; ici c'est un
// champ.
//
// GARDE-FOU : le plancher de 1200 kcal est le meme que `lib/objectifDuJour.ts`.
// Un objectif calorique sous ce seuil n'est pas une preference, c'est un
// regime dangereux — et une app de sante qui laisse taper 600 s'en rend
// complice. Le web ne doit pas etre la porte derobee du garde-fou mobile.
import { useEffect, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { doc, setDoc } from 'firebase/firestore';

const PLANCHER_KCAL = 1200;
const PLAFOND_KCAL = 6000;
const GENRES = ['male', 'female', 'other'];
const OBJECTIFS = ['lose', 'maintain', 'gain'];
const LANGUES: Langue[] = ['fr', 'en', 'ar'];

/** Bornes explicites : un champ libre finit toujours par recevoir une faute de
 *  frappe, et 1750 kg de poids corporel produirait des besoins absurdes. */
function borne(v: string, min: number, max: number): number | undefined {
  const n = Number(v);
  if (!v.trim() || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
}

export default function PageReglages() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [genre, setGenre] = useState('');
  const [objectif, setObjectif] = useState('');
  const [poids, setPoids] = useState('');
  const [pieds, setPieds] = useState('');
  const [pouces, setPouces] = useState('');
  const [lang, setLang] = useState<Langue>('fr');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [gluc, setGluc] = useState('');
  const [lip, setLip] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<'' | 'ok' | 'erreur' | 'plancher'>('');

  // On remplit le formulaire une fois le profil arrive. Sans ce garde, un champ
  // deja modifie par la personne serait ecrase par une lecture tardive.
  const [amorce, setAmorce] = useState(false);
  useEffect(() => {
    if (!profil || amorce) return;
    setPrenom(profil.firstName || '');
    setNom(profil.lastName || '');
    setGenre(profil.gender || '');
    setObjectif(profil.goal || '');
    setPoids(profil.weight ? String(profil.weight) : '');
    setPieds(profil.height?.feet ? String(profil.height.feet) : '');
    setPouces(profil.height?.inches != null ? String(profil.height.inches) : '');
    setLang((profil.language as Langue) || 'fr');
    const p = profil.nutritionalPlan || {};
    setKcal(p.dailyCalories ? String(p.dailyCalories) : '');
    setProt(p.protein ? String(p.protein) : '');
    setGluc(p.carbs ? String(p.carbs) : '');
    setLip(p.fats ? String(p.fats) : '');
    setAmorce(true);
  }, [profil, amorce]);

  const enregistrer = async () => {
    if (!uid || occupe) return;
    const objKcal = borne(kcal, PLANCHER_KCAL, PLAFOND_KCAL);
    // On PREVIENT quand la valeur a ete relevee, on ne corrige pas en silence :
    // quelqu'un qui tape 900 et voit 1200 sans explication croit a un bug.
    if (kcal.trim() && objKcal !== undefined && Number(kcal) < PLANCHER_KCAL) {
      setKcal(String(PLANCHER_KCAL));
      setEtat('plancher');
      return;
    }
    setOccupe(true);
    setEtat('');
    try {
      const plan: Record<string, number> = {};
      if (objKcal !== undefined) plan.dailyCalories = Math.round(objKcal);
      const pr = borne(prot, 0, 400); if (pr !== undefined) plan.protein = Math.round(pr);
      const gl = borne(gluc, 0, 900); if (gl !== undefined) plan.carbs = Math.round(gl);
      const li = borne(lip, 0, 300); if (li !== undefined) plan.fats = Math.round(li);

      const patch: Record<string, unknown> = {
        firstName: prenom.trim().slice(0, 60),
        lastName: nom.trim().slice(0, 60),
        language: lang,
      };
      if (genre) patch.gender = genre;
      if (objectif) patch.goal = objectif;
      const po = borne(poids, 25, 400); if (po !== undefined) patch.weight = po;
      const pi = borne(pieds, 3, 8);
      const pu = borne(pouces, 0, 11);
      if (pi !== undefined) patch.height = { feet: Math.round(pi), inches: Math.round(pu ?? 0) };
      if (Object.keys(plan).length) patch.nutritionalPlan = { ...(profil?.nutritionalPlan || {}), ...plan };

      // `merge: true` : on ecrit les champs touches, pas le document entier. Le
      // mobile stocke bien d'autres choses dans `users/{uid}` — un remplacement
      // complet les effacerait.
      await setDoc(doc(firestore(), 'users', uid), patch, { merge: true });
      setEtat('ok');
    } catch {
      setEtat('erreur');
    } finally {
      setOccupe(false);
    }
  };

  const champ = (
    etiquette: string, valeur: string, poser: (v: string) => void,
    opts?: { numerique?: boolean; largeur?: string; max?: number },
  ) => (
    <label className="champ-bloc" style={{ flex: opts?.largeur || '1 1 200px' }}>
      <span className="me-sous">{etiquette}</span>
      <input
        className="champ-amis"
        style={{ width: '100%' }}
        inputMode={opts?.numerique ? 'decimal' : undefined}
        value={valeur}
        onChange={(e) => poser(opts?.numerique ? e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.') : e.target.value.slice(0, opts?.max ?? 60))}
        aria-label={etiquette}
      />
    </label>
  );

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('reglagesTitre')}</h1>
        <p className="me-sous">{t('reglagesSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('reglagesIdentite')}</h2>
        <div className="ligne-champ">
          {champ(t('reglagesPrenom'), prenom, setPrenom)}
          {champ(t('reglagesNom'), nom, setNom)}
        </div>
        <div className="ligne-champ" style={{ marginTop: 10 }}>
          <label className="champ-bloc" style={{ flex: '1 1 180px' }}>
            <span className="me-sous">{t('reglagesGenre')}</span>
            <select className="champ-amis" style={{ width: '100%' }} value={genre} onChange={(e) => setGenre(e.target.value)}>
              <option value="">—</option>
              {GENRES.map((g) => <option key={g} value={g}>{t(`reglagesGenre_${g}`) || g}</option>)}
            </select>
          </label>
          <label className="champ-bloc" style={{ flex: '1 1 180px' }}>
            <span className="me-sous">{t('reglagesObjectif')}</span>
            <select className="champ-amis" style={{ width: '100%' }} value={objectif} onChange={(e) => setObjectif(e.target.value)}>
              <option value="">—</option>
              {OBJECTIFS.map((g) => <option key={g} value={g}>{t(`reglagesObjectif_${g}`) || g}</option>)}
            </select>
          </label>
          <label className="champ-bloc" style={{ flex: '1 1 160px' }}>
            <span className="me-sous">{t('reglagesLangue')}</span>
            <select className="champ-amis" style={{ width: '100%' }} value={lang} onChange={(e) => setLang(e.target.value as Langue)}>
              {LANGUES.map((l) => <option key={l} value={l}>{t(`reglagesLangue_${l}`) || l}</option>)}
            </select>
          </label>
        </div>
        <p className="me-note">{t('reglagesLangueNote')}</p>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('reglagesMesures')}</h2>
        <div className="ligne-champ">
          {champ(t('reglagesPoids'), poids, setPoids, { numerique: true, largeur: '0 1 160px' })}
          {champ(t('reglagesPieds'), pieds, setPieds, { numerique: true, largeur: '0 1 130px' })}
          {champ(t('reglagesPouces'), pouces, setPouces, { numerique: true, largeur: '0 1 130px' })}
        </div>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('reglagesObjectifs')}</h2>
        <div className="ligne-champ">
          {champ(t('reglagesKcal'), kcal, setKcal, { numerique: true, largeur: '0 1 160px' })}
          {champ(t('reglagesProt'), prot, setProt, { numerique: true, largeur: '0 1 140px' })}
          {champ(t('reglagesGluc'), gluc, setGluc, { numerique: true, largeur: '0 1 140px' })}
          {champ(t('reglagesLip'), lip, setLip, { numerique: true, largeur: '0 1 140px' })}
        </div>
        <p className="me-note">{t('reglagesPlancherNote').replace('{n}', String(PLANCHER_KCAL))}</p>
      </section>

      <div className="ligne-champ">
        <button className="btn btn-primary" onClick={enregistrer} disabled={occupe}>
          {occupe ? t('reglagesEnvoi') : t('reglagesEnregistrer')}
        </button>
        {etat === 'ok' ? <span className="me-note">{t('reglagesEnregistre')}</span> : null}
        {etat === 'erreur' ? <span className="me-erreur">{t('reglagesErreur')}</span> : null}
        {etat === 'plancher' ? <span className="me-erreur">{t('reglagesPlancherAlerte').replace('{n}', String(PLANCHER_KCAL))}</span> : null}
      </div>
    </div>
  );
}

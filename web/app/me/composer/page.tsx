'use client';
// Composer un repas — plusieurs aliments, des quantites, un total qui suit.
// ---------------------------------------------------------------------------
// Sur telephone, assembler un plat c'est : chercher, choisir, taper une
// quantite, revenir, rechercher, recommencer — en perdant a chaque aller-retour
// le total qu'on essayait justement de surveiller. Ici la recherche, la
// composition et le total tiennent dans le meme ecran, et le total se met a jour
// pendant qu'on ajuste les grammes.
//
// Un repas compose peut finir en une SEULE ligne de journal (le plat entier) ou
// devenir un modele reutilisable. Les deux sorties comptent : l'une pour
// aujourd'hui, l'autre pour les vingt fois suivantes.
import { useCallback, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { chercherAliments, pourQuantite, type Aliment } from '../../../lib/rechercheAliments';
import { firestore } from '../../../lib/firebaseClient';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

type Ligne = { cle: string; aliment: Aliment; grammes: number };

const CRENEAUX = ['breakfast', 'lunch', 'snack', 'dinner'] as const;

function jourLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageComposer() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [terme, setTerme] = useState('');
  const [resultats, setResultats] = useState<Aliment[]>([]);
  const [cherche, setCherche] = useState(false);
  const [erreur, setErreur] = useState('');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [nom, setNom] = useState('');
  const [creneau, setCreneau] = useState<string>('lunch');
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<'' | 'journal' | 'modele' | 'erreur'>('');

  const chercher = useCallback(async () => {
    const q = terme.trim();
    if (q.length < 2) return;
    setCherche(true);
    setErreur('');
    try {
      const l = await chercherAliments(q, 16);
      setResultats(l);
      if (!l.length) setErreur(t('alimentsAucun'));
    } catch {
      setErreur(t('alimentsErreur'));
    } finally {
      setCherche(false);
    }
  }, [terme, t]);

  const ajouter = (a: Aliment) => {
    // Une CLE propre par ligne, pas le code du produit : on peut vouloir deux
    // portions du meme aliment (un yaourt au petit-dejeuner et un le soir), et
    // une cle par produit les fusionnerait silencieusement.
    setLignes((l) => [...l, { cle: `${a.code}-${l.length}-${a.nom.slice(0, 8)}`, aliment: a, grammes: 100 }]);
    if (!nom.trim() && lignes.length === 0) setNom(a.nom);
  };

  const poser = (cle: string, g: number) =>
    setLignes((l) => l.map((x) => (x.cle === cle ? { ...x, grammes: Math.max(0, Math.min(5000, g)) } : x)));

  const retirer = (cle: string) => setLignes((l) => l.filter((x) => x.cle !== cle));

  const total = useMemo(
    () =>
      lignes.reduce(
        (a, x) => {
          const v = pourQuantite(x.aliment, x.grammes);
          return { kcal: a.kcal + v.kcal, prot: a.prot + v.prot, gluc: a.gluc + v.gluc, lip: a.lip + v.lip };
        },
        { kcal: 0, prot: 0, gluc: 0, lip: 0 },
      ),
    [lignes],
  );

  const titre = () => nom.trim().slice(0, 80) || t('composerSansNom');

  const versJournal = async () => {
    if (!uid || !lignes.length || occupe) return;
    setOccupe(true);
    setEtat('');
    try {
      // UNE seule ligne pour le plat entier, pas une par ingredient : le journal
      // sert a relire sa journee, et « poulet, riz, huile, oignon » a la place de
      // « poulet au riz » le rend illisible. Le detail est deja dans le modele.
      await addDoc(collection(firestore(), 'users', uid, 'logs'), {
        userId: uid,
        type: 'meal',
        slot: creneau,
        name: titre(),
        calories: total.kcal,
        protein: total.prot,
        carbs: total.gluc,
        // `fat`, pas `fats` — le nom qu'ecrit le mobile.
        fat: total.lip,
        date: jourLocal(),
        timestamp: serverTimestamp(),
      });
      setEtat('journal');
    } catch {
      setEtat('erreur');
    } finally {
      setOccupe(false);
    }
  };

  const versModele = async () => {
    if (!uid || !lignes.length || occupe) return;
    setOccupe(true);
    setEtat('');
    try {
      await addDoc(collection(firestore(), 'users', uid, 'meal_templates'), {
        name: titre(),
        calories: total.kcal,
        protein: total.prot,
        carbs: total.gluc,
        fat: total.lip,
        date: jourLocal(),
        timestamp: serverTimestamp(),
      });
      setEtat('modele');
    } catch {
      setEtat('erreur');
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('composerTitre')}</h1>
        <p className="me-sous">{t('composerSous')}</p>
      </header>

      <div className="composer-deux">
        <section className="carte-amis">
          <h2 className="me-h2">{t('composerChercher')}</h2>
          <div className="ligne-champ">
            <input
              className="champ-amis" style={{ flex: '1 1 200px' }}
              value={terme}
              onChange={(e) => setTerme(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && chercher()}
              placeholder={t('alimentsChamp')} aria-label={t('alimentsChamp')}
            />
            <button className="btn btn-primary" onClick={chercher} disabled={terme.trim().length < 2 || cherche}>
              {cherche ? t('communChargement') : t('composerChercherBouton')}
            </button>
          </div>
          {erreur ? <p className="me-erreur">{erreur}</p> : null}
          <ul className="composer-resultats">
            {resultats.map((a) => (
              <li key={a.code}>
                <button className="composer-res" onClick={() => ajouter(a)}>
                  <span className="composer-res-nom">
                    <strong>{a.nom}</strong>
                    {a.marque ? <span className="me-sous"> · {a.marque}</span> : null}
                  </span>
                  <span className="me-sous">{a.kcal} kcal / 100 g</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="carte-amis">
          <h2 className="me-h2">{t('composerRepas')}</h2>
          <input
            className="champ-amis" style={{ width: '100%' }}
            value={nom} onChange={(e) => setNom(e.target.value.slice(0, 80))}
            placeholder={t('composerNom')} aria-label={t('composerNom')}
          />

          {lignes.length === 0 ? (
            <p className="me-sous" style={{ marginTop: 12 }}>{t('composerVide')}</p>
          ) : (
            <ul className="composer-lignes">
              {lignes.map((x) => {
                const v = pourQuantite(x.aliment, x.grammes);
                return (
                  <li key={x.cle}>
                    <span className="composer-nom">{x.aliment.nom}</span>
                    <input
                      className="champ-amis composer-qte" inputMode="numeric"
                      value={String(x.grammes)}
                      onChange={(e) => poser(x.cle, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                      aria-label={`${x.aliment.nom} — ${t('composerGrammes')}`}
                    />
                    <span className="me-sous">g</span>
                    <span className="composer-kcal">{v.kcal} kcal</span>
                    <button className="btn btn-ghost" onClick={() => retirer(x.cle)} aria-label={t('composerRetirer')}>×</button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Le total est COLLE en bas de la carte : c'est le chiffre qu'on
              surveille pendant qu'on ajuste les grammes, il ne doit jamais sortir
              du champ de vision. */}
          <div className="composer-total">
            <div className="grille-series" style={{ margin: 0 }}>
              <div className="tuile-serie"><span className="serie-nombre">{total.kcal}</span><span className="me-sous">kcal</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{total.prot}</span><span className="me-sous">{t('modelesProt')}</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{total.gluc}</span><span className="me-sous">{t('modelesGluc')}</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{total.lip}</span><span className="me-sous">{t('modelesLip')}</span></div>
            </div>

            <div className="ligne-champ" style={{ marginTop: 12 }}>
              {CRENEAUX.map((c) => (
                <button key={c} className={`btn ${creneau === c ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setCreneau(c)} aria-pressed={creneau === c}>
                  {t(`modelesCreneau_${c}`) || c}
                </button>
              ))}
            </div>

            <div className="ligne-champ" style={{ marginTop: 10 }}>
              <button className="btn btn-primary" onClick={versJournal} disabled={!lignes.length || occupe}>
                {t('composerVersJournal')}
              </button>
              <button className="btn btn-ghost" onClick={versModele} disabled={!lignes.length || occupe}>
                {t('composerVersModele')}
              </button>
            </div>
            {etat === 'journal' ? <p className="me-note">{t('composerAjouteJournal')}</p> : null}
            {etat === 'modele' ? <p className="me-note">{t('composerAjouteModele')}</p> : null}
            {etat === 'erreur' ? <p className="me-erreur">{t('composerErreur')}</p> : null}
          </div>
        </section>
      </div>

      <p className="me-note">{t('composerNote')}</p>
    </div>
  );
}

'use client';
// Ligue de la semaine — le classement ENTIER, pas trois lignes autour de la mienne.
// ---------------------------------------------------------------------------
// Sur telephone un classement se lit par fragments : on voit sa place et deux
// voisins. C'est justement ce qui manque pour decider si on peut encore monter —
// il faut voir le 5e (le dernier promu) et l'ecart qui reste.
//
// La page ne CALCULE rien de neuf : elle lit `leagues/{semaine}/members`, la meme
// collection que le mobile. Deux classements differents pour la meme semaine
// seraient pires que pas de classement du tout.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, getDocs } from 'firebase/firestore';

type Membre = { uid: string; name: string; xp: number; tier: string };

const TIERS = ['bronze', 'silver', 'gold', 'diamond'] as const;
const COULEUR: Record<string, string> = {
  bronze: '#a2571c', silver: '#8a8f98', gold: '#c9a227', diamond: '#3fa9c9',
};
// Duolingo-like, identique au mobile : 5 montent, 5 descendent.
const PROMUS = 5;
const RELEGUES = 5;

/** weekId ISO — copie exacte de `lib/leagues.ts`. Un decalage d'une semaine ici
 *  afficherait un classement vide en silence, ce qui ressemble a « personne ne
 *  joue » alors que c'est juste la mauvaise cle. */
function isoWeekId(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Millisecondes avant lundi 00:00 UTC — la cloture de la semaine. */
function msAvantCloture(): number {
  const n = new Date();
  const fin = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  const jour = fin.getUTCDay() || 7;
  fin.setUTCDate(fin.getUTCDate() + (8 - jour));
  return Math.max(0, fin.getTime() - n.getTime());
}

export default function PageLigues() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  // La date est calculee APRES le montage, jamais pendant le rendu : cette page
  // est pre-rendue au build, et une heure figee dans le HTML ne serait plus la
  // bonne au chargement. React signalerait la difference, et surtout la semaine
  // affichee serait celle du build.
  const [semaine, setSemaine] = useState('');
  const [msReste, setMsReste] = useState(0);
  const [membres, setMembres] = useState<Membre[]>([]);
  const [charge, setCharge] = useState(false);
  const [tierVu, setTierVu] = useState<string>('');

  useEffect(() => {
    setSemaine(isoWeekId());
    setMsReste(msAvantCloture());
  }, []);

  const charger = useCallback(async () => {
    if (!semaine) return;
    try {
      const snap = await getDocs(collection(firestore(), 'leagues', semaine, 'members'));
      const l = snap.docs.map((d) => {
        const x = d.data() as any;
        return { uid: d.id, name: String(x.name || d.id), xp: Number(x.xp) || 0, tier: String(x.tier || 'bronze') };
      });
      setMembres(l);
      const moi = l.find((m) => m.uid === uid);
      setTierVu(moi?.tier || 'bronze');
    } catch {
      setMembres([]);
    } finally {
      setCharge(true);
    }
  }, [semaine, uid]);

  useEffect(() => {
    charger();
  }, [charger]);

  const classement = useMemo(() => {
    return membres
      .filter((m) => m.tier === (tierVu || 'bronze'))
      .sort((a, b) => b.xp - a.xp)
      .map((m, i) => ({ ...m, rang: i + 1 }));
  }, [membres, tierVu]);

  const moi = classement.find((m) => m.uid === uid);
  const total = classement.length;
  const heures = Math.floor(msReste / 3600000);
  const jours = Math.floor(heures / 24);

  // L'ecart qui interesse vraiment : combien d'XP pour atteindre la 5e place.
  const seuilPromo = classement[PROMUS - 1]?.xp ?? 0;
  const manque = moi && moi.rang > PROMUS ? Math.max(0, seuilPromo - moi.xp + 1) : 0;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('liguesTitre')}</h1>
        <p className="me-sous">{t('liguesSous').replace('{s}', semaine)}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          {TIERS.map((ti) => (
            <button
              key={ti}
              className={`btn ${tierVu === ti ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setTierVu(ti)}
              aria-pressed={tierVu === ti}
              style={tierVu === ti ? { background: COULEUR[ti], borderColor: COULEUR[ti] } : undefined}
            >
              {t(`liguesTier_${ti}`) || ti}
            </button>
          ))}
        </div>
        <p className="me-note">
          {jours >= 1
            ? t('liguesResteJours').replace('{n}', String(jours))
            : t('liguesResteHeures').replace('{n}', String(heures))}
        </p>
      </section>

      {moi ? (
        <section className="carte-amis">
          <div className="grille-series">
            <div className="tuile-serie"><span className="serie-nombre">{moi.rang}</span><span className="me-sous">{t('liguesMaPlace')} / {total}</span></div>
            <div className="tuile-serie"><span className="serie-nombre">{moi.xp}</span><span className="me-sous">XP</span></div>
            <div className="tuile-serie">
              <span className="serie-nombre">{manque > 0 ? `+${manque}` : '✓'}</span>
              <span className="me-sous">{manque > 0 ? t('liguesPourMonter') : t('liguesZonePromo')}</span>
            </div>
          </div>
        </section>
      ) : null}

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : classement.length === 0 ? (
        <p className="me-sous">{t('liguesVide')}</p>
      ) : (
        <section className="carte-amis">
          <ol className="liste-classement">
            {classement.map((m) => {
              // Les deux frontieres qui comptent : la ligne de promotion et celle
              // de relegation. Un classement sans elles ne dit pas ou on en est.
              const promo = m.rang <= PROMUS;
              const relegue = total > RELEGUES && m.rang > total - RELEGUES;
              return (
                <li
                  key={m.uid}
                  className={`rang-ligne${m.uid === uid ? ' rang-moi' : ''}${promo ? ' rang-promo' : ''}${relegue ? ' rang-relegue' : ''}`}
                >
                  <span className="rang-num">{m.rang}</span>
                  <span className="rang-nom">{m.name}</span>
                  <span className="rang-xp">{m.xp} XP</span>
                </li>
              );
            })}
          </ol>
          <p className="me-note">{t('liguesLegende').replace('{p}', String(PROMUS)).replace('{r}', String(RELEGUES))}</p>
        </section>
      )}
    </div>
  );
}

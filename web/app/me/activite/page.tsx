'use client';
// Mon activite — douze semaines d'un coup.
// ---------------------------------------------------------------------------
// Le telephone COMPTE les pas ; il ne sait pas les raconter. Savoir si on bouge
// vraiment plus qu'il y a deux mois demande de voir douze semaines cote a cote,
// et douze barres ne tiennent pas sur six pouces sans devenir illisibles.
//
// Aucune saisie ici : marcher se mesure avec le telephone dans la poche. Cette
// page LIT, et c'est deliberé.
import { useMemo } from 'react';
import { useMe } from '../MeProvider';
import { useProfil, useLogsDepuis } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';

const SEMAINES = 12;

function ilYA(jours: number): string {
  const d = new Date(Date.now() - jours * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lundi de la semaine d'une date `AAAA-MM-JJ`, en cle `AAAA-MM-JJ`. */
function lundiDe(date: string): string {
  const [a, m, j] = date.split('-').map(Number);
  if (!a || !m || !j) return date;
  const d = new Date(a, m - 1, j);
  const decalage = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - decalage);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageActivite() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);
  const locale = langue === 'ar' ? 'ar-MA' : langue === 'en' ? 'en-GB' : 'fr-FR';

  const depuis = useMemo(() => ilYA(SEMAINES * 7), []);
  const { lignes, charge } = useLogsDepuis(uid, depuis);

  const semaines = useMemo(() => {
    const activites = (lignes || []).filter((l) => l.type === 'activity' && l.date);
    const parSemaine: Record<string, { seances: number; kcal: number; jours: Set<string> }> = {};
    for (const a of activites) {
      const k = lundiDe(String(a.date));
      const e = (parSemaine[k] ||= { seances: 0, kcal: 0, jours: new Set() });
      e.seances += 1;
      // Les calories d'une activite sont stockees en positif ; c'est une depense.
      e.kcal += Math.abs(Number(a.calories) || 0);
      e.jours.add(String(a.date));
    }
    // On construit les 12 semaines MEME vides : une semaine sans rien est une
    // information — c'est justement le trou qu'on cherche a voir.
    const out: { cle: string; seances: number; kcal: number; jours: number }[] = [];
    // Date locale, jamais `toISOString` : au Maroc (UTC+1), a 00 h 30 la date UTC
    // est encore celle de la veille, et toute la grille glisserait d'une semaine.
    const n = new Date();
    const base = lundiDe(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`);
    const [ba, bm, bj] = base.split('-').map(Number);
    for (let i = SEMAINES - 1; i >= 0; i--) {
      const d = new Date(ba, bm - 1, bj - i * 7);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const e = parSemaine[k];
      out.push({ cle: k, seances: e?.seances || 0, kcal: Math.round(e?.kcal || 0), jours: e?.jours.size || 0 });
    }
    return out;
  }, [lignes]);

  const maxKcal = Math.max(1, ...semaines.map((s) => s.kcal));
  const total = semaines.reduce((a, s) => a + s.kcal, 0);
  const totalSeances = semaines.reduce((a, s) => a + s.seances, 0);
  const semainesActives = semaines.filter((s) => s.seances > 0).length;

  // Les quatre dernieres semaines contre les quatre precedentes : la seule
  // comparaison qui dit « je progresse » sans se laisser tromper par un pic.
  const recentes = semaines.slice(-4).reduce((a, s) => a + s.kcal, 0);
  const avant = semaines.slice(-8, -4).reduce((a, s) => a + s.kcal, 0);
  const evolution = avant > 0 ? Math.round(((recentes - avant) / avant) * 100) : null;

  const jourCourt = (k: string) => {
    const [a, m, j] = k.split('-').map(Number);
    return new Date(a, m - 1, j).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('activiteTitre')}</h1>
        <p className="me-sous">{t('activiteSous').replace('{n}', String(SEMAINES))}</p>
      </header>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : (
        <>
          <section className="carte-amis">
            <div className="grille-series">
              <div className="tuile-serie"><span className="serie-nombre">{totalSeances}</span><span className="me-sous">{t('activiteSeances')}</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{total}</span><span className="me-sous">{t('activiteKcal')}</span></div>
              <div className="tuile-serie"><span className="serie-nombre">{semainesActives}<span className="serie-sur"> / {SEMAINES}</span></span><span className="me-sous">{t('activiteSemainesActives')}</span></div>
              {evolution !== null ? (
                <div className="tuile-serie">
                  <span className="serie-nombre">{evolution > 0 ? `+${evolution}` : evolution}%</span>
                  <span className="me-sous">{t('activiteEvolution')}</span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="carte-amis">
            <h2 className="me-h2">{t('activiteParSemaine')}</h2>
            <div className="barres-semaines">
              {semaines.map((s) => (
                <div key={s.cle} className="barre-colonne">
                  {/* Une hauteur minimale de 2 px pour les semaines vides : une
                      barre de hauteur nulle disparait, et on ne distingue plus
                      « rien fait » de « pas de donnees ». */}
                  <div
                    className={`barre${s.seances === 0 ? ' barre-vide' : ''}`}
                    style={{ height: `${Math.max(2, (s.kcal / maxKcal) * 130)}px` }}
                    title={`${s.kcal} kcal · ${s.seances}`}
                  />
                  <span className="barre-val">{s.kcal || ''}</span>
                  <span className="barre-lab">{jourCourt(s.cle)}</span>
                </div>
              ))}
            </div>
          </section>

          {totalSeances === 0 ? <p className="me-sous">{t('activiteVide')}</p> : null}
        </>
      )}

      <p className="me-note">{t('activiteNoteTelephone')}</p>
    </div>
  );
}

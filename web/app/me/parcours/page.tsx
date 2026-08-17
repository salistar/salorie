'use client';
// Parcours de la communaute — lire un itineraire avant d'aller le courir.
// ---------------------------------------------------------------------------
// Choisir un parcours, c'est comparer : celui-la fait 8 km et passe par la
// corniche, celui-ci 12 km et monte. Sur telephone on ouvre une fiche, on
// revient, on en ouvre une autre — et on a deja oublie la premiere. Ici les
// etapes de chaque parcours se deplient dans la liste, sans quitter la page.
//
// PROPOSER un parcours se fait aussi mieux ici : c'est une description a ecrire,
// et des etapes a nommer une par une.
//
// COURIR reste au telephone : c'est lui qui a le GPS. Cette page prepare.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, query, where, limit as fsLimit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

type Etape = { name: string; lat: number; lng: number; atKm: number };
type Parcours = {
  id: string;
  authorName: string;
  name: string;
  description: string;
  totalKm: number;
  waypoints: Etape[];
};

export default function PageParcours() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [parcours, setParcours] = useState<Parcours[]>([]);
  const [charge, setCharge] = useState(false);
  const [ouvert, setOuvert] = useState('');
  const [tri, setTri] = useState<'nom' | 'km'>('km');

  const [nom, setNom] = useState('');
  const [desc, setDesc] = useState('');
  const [km, setKm] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<'' | 'ok' | 'erreur'>('');

  const charger = useCallback(async () => {
    try {
      // Uniquement les parcours VALIDES : un itineraire est suivi par de vraies
      // personnes dehors, et une etape fausse les envoie au mauvais endroit.
      const snap = await getDocs(
        query(collection(firestore(), 'community_routes'), where('status', '==', 'approved'), fsLimit(100)),
      );
      setParcours(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: d.id,
            authorName: String(x.authorName || ''),
            name: String(x.name || ''),
            description: String(x.description || ''),
            totalKm: Number(x.totalKm) || 0,
            waypoints: Array.isArray(x.waypoints)
              ? x.waypoints.map((w: any) => ({
                  name: String(w?.name || ''),
                  lat: Number(w?.lat) || 0,
                  lng: Number(w?.lng) || 0,
                  atKm: Number(w?.atKm) || 0,
                }))
              : [],
          } as Parcours;
        }),
      );
    } catch {
      setParcours([]);
    } finally {
      setCharge(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const proposer = async () => {
    const n = nom.trim();
    if (!n || !uid || occupe) return;
    setOccupe(true);
    setEtat('');
    try {
      await addDoc(collection(firestore(), 'community_routes'), {
        authorId: uid,
        authorName: `${profil?.firstName || ''} ${profil?.lastName || ''}`.trim() || uid,
        name: n.slice(0, 120),
        description: desc.trim().slice(0, 1200),
        totalKm: Math.max(0, Number(String(km).replace(',', '.')) || 0),
        // Les etapes se posent depuis le telephone, sur la carte, la ou on a les
        // coordonnees. Proposer un parcours sans etapes reste utile : le nom, la
        // distance et la description suffisent a le faire exister.
        waypoints: [],
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      setNom('');
      setDesc('');
      setKm('');
      setEtat('ok');
    } catch {
      setEtat('erreur');
    } finally {
      setOccupe(false);
    }
  };

  const liste = useMemo(() => {
    const l = [...parcours];
    l.sort((a, b) => (tri === 'km' ? a.totalKm - b.totalKm : a.name.localeCompare(b.name)));
    return l;
  }, [parcours, tri]);

  /** Lien vers une carte externe. On ne charge PAS de carte dans la page : ca
   *  ferait partir des requetes vers un tiers a chaque visite, et une liste de
   *  parcours n'a pas besoin d'une carte pour etre comparee. */
  const lienCarte = (e: Etape) =>
    `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lng}#map=16/${e.lat}/${e.lng}`;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('parcoursTitre')}</h1>
        <p className="me-sous">{t('parcoursSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('parcoursProposer')}</h2>
        <div className="ligne-champ">
          <input className="champ-amis" style={{ flex: '1 1 200px' }} value={nom}
            onChange={(e) => setNom(e.target.value.slice(0, 120))}
            placeholder={t('parcoursNom')} aria-label={t('parcoursNom')} />
          <input className="champ-amis" style={{ flex: '0 1 130px' }} inputMode="decimal" value={km}
            onChange={(e) => setKm(e.target.value.replace(/[^0-9.,]/g, ''))}
            placeholder={t('parcoursKm')} aria-label={t('parcoursKm')} />
        </div>
        <textarea className="champ-mur" style={{ marginTop: 10 }} value={desc}
          onChange={(e) => setDesc(e.target.value.slice(0, 1200))}
          placeholder={t('parcoursDesc')} aria-label={t('parcoursDesc')} />
        <div className="ligne-champ" style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={proposer} disabled={!nom.trim() || occupe}>
            {t('parcoursEnvoyer')}
          </button>
          {etat === 'ok' ? <span className="me-note">{t('parcoursEnAttente')}</span> : null}
          {etat === 'erreur' ? <span className="me-erreur">{t('parcoursErreur')}</span> : null}
        </div>
        <p className="me-note">{t('parcoursNoteEtapes')}</p>
      </section>

      <section className="carte-amis">
        <div className="ligne-champ">
          <button className={`btn ${tri === 'km' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTri('km')}>
            {t('parcoursTriKm')}
          </button>
          <button className={`btn ${tri === 'nom' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTri('nom')}>
            {t('parcoursTriNom')}
          </button>
          <span className="me-sous">{liste.length}</span>
        </div>
      </section>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : liste.length === 0 ? (
        <p className="me-sous">{t('parcoursAucun')}</p>
      ) : (
        <ul className="grille-recettes">
          {liste.map((p) => {
            const dep = ouvert === p.id;
            return (
              <li key={p.id} className="carte-recette">
                <button className="exo-tete" onClick={() => setOuvert(dep ? '' : p.id)} aria-expanded={dep}>
                  <strong>{p.name}</strong>
                  <span className="puce-role">{p.totalKm} km</span>
                </button>
                <span className="me-sous">{p.authorName}{p.waypoints.length ? ` · ${p.waypoints.length} ${t('parcoursEtapes')}` : ''}</span>
                {dep ? (
                  <div className="exo-corps">
                    {p.description ? <p className="journal-corps">{p.description}</p> : null}
                    {p.waypoints.length ? (
                      <ol className="recette-liste">
                        {[...p.waypoints]
                          .sort((a, b) => a.atKm - b.atKm)
                          .map((e, i) => (
                            <li key={i}>
                              <strong>{e.atKm} km</strong> — {e.name || t('parcoursEtapeSansNom')}{' '}
                              {e.lat && e.lng ? (
                                <a href={lienCarte(e)} target="_blank" rel="noopener noreferrer">{t('parcoursVoirCarte')}</a>
                              ) : null}
                            </li>
                          ))}
                      </ol>
                    ) : (
                      <p className="me-sous">{t('parcoursSansEtapes')}</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="me-note">{t('parcoursNoteGps')}</p>
    </div>
  );
}

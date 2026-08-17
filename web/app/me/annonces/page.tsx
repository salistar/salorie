'use client';
// Place de marche — parcourir, et surtout REDIGER.
// ---------------------------------------------------------------------------
// Rediger une annonce, c'est ecrire un texte et choisir une photo. Les deux se
// font mieux au clavier, et la photo est souvent deja sur l'ordinateur.
//
// Toute annonce passe par une VALIDATION avant d'etre publique : c'est du
// contenu utilisateur visible par d'autres, ce que Play encadre strictement. La
// page le dit plutot que de laisser croire a une publication immediate.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';

type Annonce = {
  id: string;
  ownerUid: string;
  title: string;
  description: string;
  category: string;
  price: number;
  placeName?: string;
  imageUrl?: string;
  createdTs?: number;
};

const CATEGORIES = ['meal', 'coaching', 'gear', 'produce', 'service', 'other'];

export default function PageAnnonces() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [charge, setCharge] = useState(false);
  const [filtre, setFiltre] = useState('');

  // Formulaire
  const [titre, setTitre] = useState('');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('meal');
  const [prix, setPrix] = useState('');
  const [lieu, setLieu] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<'' | 'ok' | 'erreur'>('');

  const charger = useCallback(async () => {
    try {
      // Seules les annonces VALIDEES et actives : une annonce en attente n'a rien
      // a faire dans un catalogue public, meme la sienne.
      const snap = await getDocs(
        query(
          collection(firestore(), 'marketplace_listings'),
          where('approved', '==', true),
          where('status', '==', 'active'),
          orderBy('createdTs', 'desc'),
          limit(60),
        ),
      );
      setAnnonces(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Annonce[]);
    } catch {
      setAnnonces([]);
    } finally {
      setCharge(true);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const publier = async () => {
    const ti = titre.trim();
    const de = desc.trim();
    if (!ti || !de || !uid || occupe) return;
    setOccupe(true);
    setEtat('');
    try {
      await addDoc(collection(firestore(), 'marketplace_listings'), {
        ownerUid: uid,
        title: ti.slice(0, 90),
        description: de.slice(0, 1200),
        category: cat,
        price: Math.max(0, Number(prix) || 0),
        placeName: lieu.trim().slice(0, 60),
        // `approved: false` : rien n'est public avant relecture. Le contraire
        // exposerait tout le monde a ce qu'un seul compte decide de publier.
        approved: false,
        status: 'active',
        createdTs: Date.now(),
        createdAt: serverTimestamp(),
      });
      setTitre(''); setDesc(''); setPrix(''); setLieu('');
      setEtat('ok');
    } catch {
      setEtat('erreur');
    } finally {
      setOccupe(false);
    }
  };

  const visibles = filtre ? annonces.filter((a) => a.category === filtre) : annonces;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('annoncesTitre')}</h1>
        <p className="me-sous">{t('annoncesSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('annoncesPublier')}</h2>
        <input
          className="champ-amis" style={{ width: '100%' }}
          value={titre} onChange={(e) => setTitre(e.target.value.slice(0, 90))}
          placeholder={t('annoncesTitreChamp')} aria-label={t('annoncesTitreChamp')}
        />
        <textarea
          className="champ-mur" style={{ marginTop: 10 }}
          value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 1200))}
          placeholder={t('annoncesDescChamp')} aria-label={t('annoncesDescChamp')}
        />
        <div className="ligne-champ" style={{ marginTop: 10 }}>
          <select className="champ-amis" style={{ flex: '0 1 170px' }} value={cat}
            onChange={(e) => setCat(e.target.value)} aria-label={t('annoncesCategorie')}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`annoncesCat_${c}`) || c}</option>)}
          </select>
          <input className="champ-amis" style={{ flex: '0 1 130px' }} inputMode="numeric"
            value={prix} onChange={(e) => setPrix(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder={t('annoncesPrix')} aria-label={t('annoncesPrix')} />
          <input className="champ-amis" style={{ flex: '1 1 160px' }}
            value={lieu} onChange={(e) => setLieu(e.target.value.slice(0, 60))}
            placeholder={t('annoncesLieu')} aria-label={t('annoncesLieu')} />
          <button className="btn btn-primary" onClick={publier} disabled={!titre.trim() || !desc.trim() || occupe}>
            {t('annoncesEnvoyer')}
          </button>
        </div>
        {etat === 'ok' ? <p className="me-note">{t('annoncesEnAttente')}</p> : null}
        {etat === 'erreur' ? <p className="me-erreur">{t('annoncesErreur')}</p> : null}
      </section>

      <section className="carte-amis">
        <div className="ligne-champ">
          <select className="champ-amis" style={{ flex: '0 1 200px' }} value={filtre}
            onChange={(e) => setFiltre(e.target.value)} aria-label={t('annoncesCategorie')}>
            <option value="">{t('annoncesToutes')}</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t(`annoncesCat_${c}`) || c}</option>)}
          </select>
          <span className="me-sous">{visibles.length}</span>
        </div>
      </section>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : visibles.length === 0 ? (
        <p className="me-sous">{t('annoncesAucune')}</p>
      ) : (
        <ul className="grille-annonces">
          {visibles.map((a) => (
            <li key={a.id} className="carte-annonce">
              {a.imageUrl ? <img src={a.imageUrl} alt="" className="annonce-img" /> : null}
              <div className="annonce-corps">
                <strong>{a.title}</strong>
                <span className="me-sous">{t(`annoncesCat_${a.category}`) || a.category}{a.placeName ? ` · ${a.placeName}` : ''}</span>
                <p className="annonce-desc">{a.description}</p>
                {a.price > 0 ? <span className="annonce-prix">{a.price} MAD</span> : null}
                {/* Un LIEN, pas un onClick : une annonce se partage, donc son
                    adresse doit pouvoir se copier, s'ouvrir dans un onglet et
                    s'envoyer a quelqu'un. */}
                <Link href={`/me/annonces/${a.id}`} className="annonce-lien">
                  {t('annoncesVoirDetail')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

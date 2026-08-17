'use client';
// Importer une recette depuis un lien.
// ---------------------------------------------------------------------------
// L'ecran le plus evidemment web de tous ceux qui restaient : quand on tombe sur
// une recette, on est DEJA dans un navigateur, et l'URL est deja dans la barre
// d'adresse. Sur telephone il faut la copier, ouvrir Salorie, coller. Ici c'est
// un coller et rien d'autre.
//
// La page est allee chercher PAR LE SERVEUR, jamais par ce navigateur : un site
// tiers refuse la lecture directe (CORS), et surtout le serveur controle
// l'adresse avant de la demander. Une URL fournie par l'utilisateur qui part
// telle quelle depuis un serveur, c'est une SSRF — le detail des garde-fous est
// dans `backend/src/ai/lecture-page.ts`, avec ses tests.
import { useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { appelApi } from '../../../lib/apiSalorie';
import { firestore } from '../../../lib/firebaseClient';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

/** Les motifs que le serveur renvoie tels quels, traduits ici. Tout le reste
 *  tombe sur un message generique : un code inconnu affiche brut n'apprend rien
 *  et inquiete. */
const MOTIFS = ['url-invalide', 'adresse-refusee', 'pas-une-page', 'trop-de-redirections', 'page-vide', 'page-illisible'];

function jourLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PageRecetteUrl() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [url, setUrl] = useState('');
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [garde, setGarde] = useState<'' | 'ok' | 'erreur'>('');

  const importer = async () => {
    const u = url.trim();
    if (!u || occupe) return;
    setOccupe(true);
    setErreur('');
    setTexte('');
    setGarde('');
    try {
      const r = await appelApi<{ text?: string }>('/ai/recipe-from-url', {
        methode: 'POST',
        corps: { url: u, lang: langue },
      });
      const sortie = String(r?.text || '').trim();
      if (!sortie) setErreur(t('recetteUrlVide'));
      setTexte(sortie);
    } catch (e: any) {
      // `appelApi` leve « /chemin 400 ». On recupere le motif du corps quand il
      // y en a un, sinon on distingue au moins le debit depasse du reste.
      const m = String(e?.message || '');
      if (m.includes('429')) setErreur(t('recetteUrlTropVite'));
      else {
        const motif = MOTIFS.find((x) => m.includes(x));
        // Le serveur renvoie « url-invalide » ; les cles de traduction ne
        // supportent pas le tiret, d'ou la conversion. Sans elle, chaque motif
        // retombait en silence sur le message generique.
        const cle = motif ? `recetteUrlErr_${motif.replace(/-/g, '_')}` : '';
        // `traducteur` rend la CLE quand elle manque, jamais une chaine vide :
        // un simple `|| generique` n'aurait donc jamais repli et aurait affiche
        // « recetteUrlErr_page_vide » a l'ecran. On compare explicitement.
        const traduit = cle ? t(cle) : '';
        setErreur(traduit && traduit !== cle ? traduit : t('recetteUrlErreur'));
      }
    } finally {
      setOccupe(false);
    }
  };

  const garder = async () => {
    if (!uid || !texte.trim()) return;
    try {
      // On garde le TEXTE tel quel, sans essayer d'en extraire des chiffres :
      // l'estimation nutritionnelle vient d'un modele, et la transformer en
      // champs numeriques lui donnerait une autorite qu'elle n'a pas. Une
      // note se relit ; un total de calories se croit.
      await addDoc(collection(firestore(), 'users', uid, 'imported_recipes'), {
        source: url.trim().slice(0, 2000),
        text: texte.slice(0, 8000),
        lang: langue,
        date: jourLocal(),
        createdAt: serverTimestamp(),
      });
      setGarde('ok');
    } catch {
      setGarde('erreur');
    }
  };

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('recetteUrlTitre')}</h1>
        <p className="me-sous">{t('recetteUrlSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <input
            className="champ-amis" style={{ flex: '1 1 320px' }}
            type="url" inputMode="url" dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => e.key === 'Enter' && importer()}
            placeholder="https://…"
            aria-label={t('recetteUrlChamp')}
          />
          <button className="btn btn-primary" onClick={importer} disabled={!url.trim() || occupe}>
            {occupe ? t('recetteUrlEnCours') : t('recetteUrlImporter')}
          </button>
        </div>
        {erreur ? <p className="me-erreur">{erreur}</p> : null}
        <p className="me-note">{t('recetteUrlNoteServeur')}</p>
      </section>

      {texte ? (
        <section className="carte-amis">
          <h2 className="me-h2">{t('recetteUrlResultat')}</h2>
          {/* Le texte du modele est affiche TEL QUEL, jamais interprete comme du
              HTML : il vient indirectement d'une page tierce, donc d'une source
              qu'on ne controle pas. */}
          <p className="journal-corps">{texte}</p>
          <div className="ligne-champ" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={garder}>{t('recetteUrlGarder')}</button>
            {garde === 'ok' ? <span className="me-note">{t('recetteUrlGardee')}</span> : null}
            {garde === 'erreur' ? <span className="me-erreur">{t('recetteUrlErreur')}</span> : null}
          </div>
          <p className="me-note">{t('recetteUrlAvertissement')}</p>
        </section>
      ) : null}
    </div>
  );
}

'use client';
// Liste de courses — la préparer ici, la suivre au magasin.
// ---------------------------------------------------------------------------
// C'était le cas d'usage web le plus évident de toute l'app, et le seul qui
// restait bloqué : la liste ne vivait qu'en local sur le téléphone. Elle est
// maintenant synchronisée — on la prépare devant un clavier, la lecture se fait
// dans le rayon.
//
// La page écrit dans `users/{uid}/shopping_list`, UN DOCUMENT PAR ARTICLE. Un
// document unique contenant un tableau perdrait des articles : le téléphone
// ajoute « lait » et le web « pain » dans la même seconde, et le second
// écraserait le premier.
//
// Une suppression pose une PIERRE TOMBALE au lieu d'effacer. Un téléphone
// hors ligne qui a encore l'article le renverrait sinon indéfiniment.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import { firestore } from '../../../lib/firebaseClient';
import { collection, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';

type Article = { id: string; name: string; done: boolean; updatedAt: number; supprime?: boolean };

/** Identifiant : horodatage ET part aléatoire. Deux articles ajoutés dans la
 *  même milliseconde depuis deux appareils partageraient sinon le même id, et
 *  l'un écraserait l'autre. */
const nouvelId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export default function PageCourses() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);

  const [articles, setArticles] = useState<Article[]>([]);
  const [charge, setCharge] = useState(false);
  const [texte, setTexte] = useState('');
  const [erreur, setErreur] = useState('');

  // Écoute temps réel : cocher un article dans le magasin doit se voir ici sans
  // recharger, et l'inverse aussi.
  useEffect(() => {
    if (!uid) return;
    const stop = onSnapshot(
      collection(firestore(), 'users', uid, 'shopping_list'),
      (snap) => {
        setArticles(
          snap.docs
            .map((d) => {
              const x = d.data() as any;
              return {
                id: d.id,
                name: String(x?.name || '').trim(),
                done: !!x?.done,
                updatedAt: Number(x?.updatedAt) || 0,
                supprime: !!x?.supprime,
              } as Article;
            })
            .filter((a) => a.name),
        );
        setCharge(true);
      },
      () => {
        setErreur(t('listeCErreur'));
        setCharge(true);
      },
    );
    return () => stop();
  }, [uid, t]);

  const ecrire = useCallback(
    async (a: Article) => {
      if (!uid) return;
      try {
        await setDoc(doc(firestore(), 'users', uid, 'shopping_list', a.id), {
          name: a.name,
          done: a.done,
          updatedAt: a.updatedAt,
          supprime: !!a.supprime,
        });
      } catch {
        setErreur(t('listeCErreur'));
      }
    },
    [uid, t],
  );

  const ajouter = async () => {
    const n = texte.trim();
    if (!n || !uid) return;
    setTexte('');
    setErreur('');
    await ecrire({ id: nouvelId(), name: n.slice(0, 120), done: false, updatedAt: Date.now() });
  };

  /** Coller plusieurs lignes d'un coup — une recette, un message. C'est
   *  strictement impossible au pouce, et c'est la raison d'être de cette page. */
  const collerPlusieurs = async (brut: string) => {
    if (!uid) return;
    const lignes = brut
      .split(/[\n;]+/)
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter((l) => l.length > 0 && l.length <= 120);
    if (lignes.length < 2) return false;
    try {
      const lot = writeBatch(firestore());
      const maintenant = Date.now();
      // Un décalage d'une milliseconde par ligne garde l'ordre du texte collé :
      // sans lui, toutes partagent la même date et l'affichage les mélange.
      lignes.slice(0, 100).forEach((l, i) => {
        lot.set(doc(firestore(), 'users', uid, 'shopping_list', nouvelId()), {
          name: l,
          done: false,
          updatedAt: maintenant + i,
          supprime: false,
        });
      });
      await lot.commit();
      return true;
    } catch {
      setErreur(t('listeCErreur'));
      return false;
    }
  };

  const basculer = (a: Article) => ecrire({ ...a, done: !a.done, updatedAt: Date.now() });
  const retirer = (a: Article) => ecrire({ ...a, supprime: true, updatedAt: Date.now() });

  const viderCoches = async () => {
    if (!uid) return;
    const cibles = articles.filter((a) => !a.supprime && a.done);
    if (!cibles.length) return;
    try {
      const lot = writeBatch(firestore());
      for (const a of cibles) {
        lot.set(doc(firestore(), 'users', uid, 'shopping_list', a.id), {
          name: a.name, done: a.done, updatedAt: Date.now(), supprime: true,
        });
      }
      await lot.commit();
    } catch {
      setErreur(t('listeCErreur'));
    }
  };

  const visibles = useMemo(
    () => articles.filter((a) => !a.supprime).sort((a, b) => b.updatedAt - a.updatedAt),
    [articles],
  );
  const restants = visibles.filter((a) => !a.done).length;

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{t('listeCTitre')}</h1>
        <p className="me-sous">{t('listeCSous')}</p>
      </header>

      <section className="carte-amis">
        <div className="ligne-champ">
          <input
            className="champ-amis" style={{ flex: '1 1 260px' }}
            value={texte}
            onChange={(e) => setTexte(e.target.value.slice(0, 120))}
            onKeyDown={(e) => e.key === 'Enter' && ajouter()}
            onPaste={async (e) => {
              const colle = e.clipboardData.getData('text');
              if (colle.includes('\n') || colle.includes(';')) {
                // Plusieurs lignes : on les crée toutes et on empêche le collage
                // par défaut, qui aurait entassé le tout dans un seul article.
                e.preventDefault();
                await collerPlusieurs(colle);
              }
            }}
            placeholder={t('listeCChamp')}
            aria-label={t('listeCChamp')}
          />
          <button className="btn btn-primary" onClick={ajouter} disabled={!texte.trim()}>
            {t('listeCAjouter')}
          </button>
        </div>
        <p className="me-note">{t('listeCColler')}</p>
        {erreur ? <p className="me-erreur">{erreur}</p> : null}
      </section>

      {!charge ? (
        <p className="me-sous">{t('communChargement')}</p>
      ) : visibles.length === 0 ? (
        <p className="me-sous">{t('listeCVide')}</p>
      ) : (
        <section className="carte-amis">
          <div className="ligne-champ" style={{ justifyContent: 'space-between' }}>
            <strong>{restants} {t('listeCRestants')}</strong>
            {visibles.some((a) => a.done) ? (
              <button className="btn btn-ghost" onClick={viderCoches}>{t('listeCViderCoches')}</button>
            ) : null}
          </div>
          <ul className="liste-courses">
            {visibles.map((a) => (
              <li key={a.id} className={a.done ? 'course-faite' : ''}>
                {/* Une vraie case a cocher, pas un bouton stylise : elle est
                    annoncee comme telle par un lecteur d'ecran et se coche au
                    clavier sans rien ajouter. */}
                <label className="course-case">
                  <input type="checkbox" checked={a.done} onChange={() => basculer(a)} />
                  <span>{a.name}</span>
                </label>
                <button className="btn btn-ghost course-retirer" onClick={() => retirer(a)}
                  aria-label={`${t('listeCRetirer')} : ${a.name}`}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="me-note">{t('listeCNoteTelephone')}</p>
    </div>
  );
}

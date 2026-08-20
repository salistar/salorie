'use client';
// Bienvenue — ce que l'espace web sait faire, et ce qu'il ne sait pas.
// ---------------------------------------------------------------------------
// Ce n'est PAS le `welcome` du mobile. Là-bas, c'est un onboarding avant
// création de compte ; ici on arrive déjà connecté via Clerk, donc le reprendre
// aurait donné une page qui demande de s'inscrire à quelqu'un d'inscrit.
//
// Le vrai problème du web est ailleurs : soixante routes dans une barre
// latérale, et rien qui dise par où commencer ni ce qui n'existe que sur le
// téléphone. Cette page répond à ces deux questions-là.
import Link from 'next/link';
import { useMe } from '../MeProvider';
import { useProfil } from '../../../lib/useFirestoreMe';
import { traducteur, sensLecture, type Langue } from '../../../lib/i18nMe';
import {
  UtensilsCrossed, PenLine, Camera, NotebookPen, ShoppingCart, ChartColumn,
  type LucideIcon,
} from 'lucide-react';

/** Les portes d'entrée, dans l'ordre où elles servent réellement. */
const DEPARTS: { href: string; cle: string; icone: LucideIcon }[] = [
  { href: '/me/diary', cle: 'diary', icone: UtensilsCrossed },
  { href: '/me/saisie', cle: 'saisie', icone: PenLine },
  { href: '/me/scan', cle: 'scan', icone: Camera },
  { href: '/me/plan-ia', cle: 'plan', icone: NotebookPen },
  { href: '/me/courses', cle: 'courses', icone: ShoppingCart },
  { href: '/me/analytics', cle: 'analyses', icone: ChartColumn },
];

/** Ce que le clavier et la largeur changent vraiment. */
const FORCES = ['clavier', 'largeur', 'coller'] as const;

/** Ce qui reste sur le téléphone, et pourquoi. */
const MOBILE_SEUL = ['gps', 'camera', 'capteurs', 'horaires'] as const;

export default function PageBienvenue() {
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  const langue = (profil?.language as Langue) || 'fr';
  const t = traducteur(langue);
  const sens = sensLecture(langue);
  const prenom = String((profil as any)?.name || '').trim().split(' ')[0];

  return (
    <div className="me-page" dir={sens}>
      <header className="me-entete">
        <h1>{prenom ? `${t('bvBonjour')} ${prenom}` : t('bvTitre')}</h1>
        <p className="me-sous">{t('bvSous')}</p>
      </header>

      <section className="carte-amis">
        <h2 className="me-h2">{t('bvParOuCommencer')}</h2>
        <div className="grille-departs">
          {DEPARTS.map((d) => (
            <Link key={d.href} href={d.href} className="carte-depart">
              <span aria-hidden className="depart-icone"><d.icone size={22} strokeWidth={1.9} /></span>
              <strong>{t(`bv_${d.cle}_t`)}</strong>
              <span className="me-sous">{t(`bv_${d.cle}_c`)}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('bvCeQueLeWebApporte')}</h2>
        <ul className="liste-nue">
          {FORCES.map((f) => (
            <li key={f}>
              <strong>{t(`bv_f_${f}_t`)}</strong>
              <p className="me-sous" style={{ margin: '2px 0 0' }}>{t(`bv_f_${f}_c`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="carte-amis">
        <h2 className="me-h2">{t('bvResteSurTelephone')}</h2>
        {/* Le dire ICI evite de chercher pendant dix minutes une fonction qui
            n'existe pas sur cet ecran — et qui n'y existera pas. */}
        <ul className="liste-nue">
          {MOBILE_SEUL.map((m) => (
            <li key={m}>
              <strong>{t(`bv_m_${m}_t`)}</strong>
              <p className="me-sous" style={{ margin: '2px 0 0' }}>{t(`bv_m_${m}_c`)}</p>
            </li>
          ))}
        </ul>
        <p className="me-note">{t('bvMemeCompte')}</p>
      </section>
    </div>
  );
}

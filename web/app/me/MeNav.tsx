'use client';
// Navigation de l'espace personnel — barre latérale GROUPÉE, trilingue.
// ---------------------------------------------------------------------------
// Les groupes disent OÙ chercher (les mêmes familles que les onglets du
// mobile), et le contenu récupère toute la largeur. Sur mobile, la barre
// devient un tiroir : un bouton l'ouvre, un voile la referme.
//
// Trilingue depuis le 20/08/2026 : les PAGES parlaient trois langues mais la
// barre restait en français figé — un utilisateur arabophone naviguait dans
// une langue étrangère. Les libellés vivent ici en {fr, en, ar} plutôt que
// dans i18nMe : ils n'existent que pour cette barre, les colocaliser évite
// 200 lignes de dictionnaire et garde chaque entrée lisible d'un coup d'œil.
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/clerk-react';
import { useMe } from './MeProvider';
import { useProfil } from '../../lib/useFirestoreMe';
import { sensLecture, type Langue } from '../../lib/i18nMe';

type Tri = { fr: string; en: string; ar: string };
type Lien = { href: string; label: Tri; icone: string };
type Groupe = { titre: Tri | null; liens: Lien[] };

/** Les 67 routes, inchangées — seuls les libellés sont devenus trilingues. */
const GROUPES: Groupe[] = [
  {
    titre: null,
    liens: [
      { href: '/me', label: { fr: 'Accueil', en: 'Home', ar: 'الرئيسية' }, icone: '🏠' },
      { href: '/me/bienvenue', label: { fr: 'Bienvenue', en: 'Welcome', ar: 'مرحباً' }, icone: '👋' },
    ],
  },
  {
    titre: { fr: 'Nutrition', en: 'Nutrition', ar: 'التغذية' },
    liens: [
      { href: '/me/diary', label: { fr: 'Repas du jour', en: "Today's meals", ar: 'وجبات اليوم' }, icone: '🍽️' },
      { href: '/me/saisie', label: { fr: 'Saisie manuelle', en: 'Manual entry', ar: 'إدخال يدوي' }, icone: '✍️' },
      { href: '/me/scan', label: { fr: 'Scanner', en: 'Scan a meal', ar: 'مسح وجبة' }, icone: '📷' },
      { href: '/me/code-barres', label: { fr: 'Code-barres', en: 'Barcode', ar: 'الباركود' }, icone: '📊' },
      { href: '/me/dicter', label: { fr: 'Dictée', en: 'Dictation', ar: 'الإملاء' }, icone: '🎤' },
      { href: '/me/etiquette', label: { fr: 'Étiquette', en: 'Label', ar: 'الملصق' }, icone: '🏷️' },
      { href: '/me/ticket', label: { fr: 'Ticket de caisse', en: 'Receipt', ar: 'الإيصال' }, icone: '🧾' },
      { href: '/me/eau', label: { fr: 'Eau', en: 'Water', ar: 'الماء' }, icone: '💧' },
      { href: '/me/nutri-score', label: { fr: 'Nutri-Score', en: 'Nutri-Score', ar: 'نوتري سكور' }, icone: '🔤' },
      { href: '/me/substitutions', label: { fr: 'Substitutions', en: 'Substitutions', ar: 'البدائل' }, icone: '🔁' },
      { href: '/me/frigo', label: { fr: 'Frigo', en: 'Fridge', ar: 'الثلاجة' }, icone: '🧊' },
      { href: '/me/aliments', label: { fr: 'Aliments', en: 'Foods', ar: 'الأطعمة' }, icone: '🥗' },
      { href: '/me/composer', label: { fr: 'Composer', en: 'Meal builder', ar: 'تركيب وجبة' }, icone: '🥣' },
      { href: '/me/recettes', label: { fr: 'Recettes', en: 'Recipes', ar: 'الوصفات' }, icone: '🍲' },
      { href: '/me/recette-url', label: { fr: 'Import recette', en: 'Import recipe', ar: 'استيراد وصفة' }, icone: '🔗' },
      { href: '/me/plans', label: { fr: 'Plans', en: 'Plans', ar: 'الخطط' }, icone: '🗓️' },
      { href: '/me/plan-ia', label: { fr: 'Plan de repas', en: 'Meal plan', ar: 'خطة الوجبات' }, icone: '📝' },
      { href: '/me/modeles', label: { fr: 'Modèles', en: 'Templates', ar: 'القوالب' }, icone: '🔖' },
      { href: '/me/jeune', label: { fr: 'Jeûne', en: 'Fasting', ar: 'الصيام' }, icone: '⏳' },
      { href: '/me/ramadan', label: { fr: 'Ramadan', en: 'Ramadan', ar: 'رمضان' }, icone: '🌙' },
      { href: '/me/restaurant', label: { fr: 'Mode resto', en: 'Restaurant', ar: 'المطعم' }, icone: '🍴' },
    ],
  },
  {
    titre: { fr: 'Courses & marché', en: 'Shopping & market', ar: 'التسوّق والسوق' },
    liens: [
      { href: '/me/courses', label: { fr: 'Liste de courses', en: 'Shopping list', ar: 'قائمة التسوّق' }, icone: '🛒' },
      { href: '/me/panier', label: { fr: 'Panier du souk', en: 'Souk basket', ar: 'سلّة السوق' }, icone: '🧺' },
      { href: '/me/annonces', label: { fr: 'Annonces', en: 'Listings', ar: 'الإعلانات' }, icone: '📦' },
    ],
  },
  {
    titre: { fr: 'Sport', en: 'Sport', ar: 'الرياضة' },
    liens: [
      { href: '/me/activite', label: { fr: 'Activité', en: 'Activity', ar: 'النشاط' }, icone: '🚶' },
      { href: '/me/seance', label: { fr: 'Dernière séance', en: 'Last session', ar: 'آخر حصة' }, icone: '🏃' },
      { href: '/me/exercices', label: { fr: 'Exercices', en: 'Exercises', ar: 'التمارين' }, icone: '💪' },
      { href: '/me/equipement', label: { fr: 'Équipement', en: 'Equipment', ar: 'المعدّات' }, icone: '🏋️' },
      { href: '/me/agenda', label: { fr: 'Agenda', en: 'Agenda', ar: 'المفكرة الرياضية' }, icone: '📅' },
      { href: '/me/matchs', label: { fr: 'Matchs', en: 'Matches', ar: 'المباريات' }, icone: '⚽' },
      { href: '/me/terrains', label: { fr: 'Terrains', en: 'Fields', ar: 'الملاعب' }, icone: '📍' },
      { href: '/me/races', label: { fr: 'Courses', en: 'Races', ar: 'السباقات' }, icone: '🏁' },
      { href: '/me/ligues', label: { fr: 'Ligue', en: 'League', ar: 'الدوري' }, icone: '🏆' },
      { href: '/me/duel', label: { fr: 'Duel', en: 'Duel', ar: 'المبارزة' }, icone: '🤜' },
      { href: '/me/villes', label: { fr: 'Villes', en: 'Cities', ar: 'المدن' }, icone: '🏙️' },
      { href: '/me/parcours', label: { fr: 'Parcours', en: 'Routes', ar: 'المسارات' }, icone: '🗺️' },
      { href: '/me/medailles', label: { fr: 'Médailles', en: 'Medals', ar: 'الميداليات' }, icone: '🏅' },
      { href: '/me/progression', label: { fr: 'Progression', en: 'Progress', ar: 'التقدّم' }, icone: '⭐' },
      { href: '/me/sadaqa', label: { fr: 'Sadaqa', en: 'Sadaqa', ar: 'صدقة جارية' }, icone: '🌱' },
    ],
  },
  {
    titre: { fr: 'Santé', en: 'Health', ar: 'الصحة' },
    liens: [
      { href: '/me/analytics', label: { fr: 'Analyses', en: 'Analytics', ar: 'التحليلات' }, icone: '📈' },
      { href: '/me/metabolisme', label: { fr: 'Métabolisme', en: 'Metabolism', ar: 'الأيض' }, icone: '🔥' },
      { href: '/me/projection', label: { fr: 'Projection', en: 'Projection', ar: 'التوقّع' }, icone: '📉' },
      { href: '/me/poids', label: { fr: 'Poids', en: 'Weight', ar: 'الوزن' }, icone: '⚖️' },
      { href: '/me/forme', label: { fr: 'Forme du jour', en: 'Readiness', ar: 'جاهزية اليوم' }, icone: '🔋' },
      { href: '/me/composition', label: { fr: 'Composition', en: 'Body composition', ar: 'تركيب الجسم' }, icone: '🧬' },
      { href: '/me/microbiote', label: { fr: 'Microbiote', en: 'Microbiome', ar: 'الميكروبيوم' }, icone: '🦠' },
      { href: '/me/photos', label: { fr: 'Photos de progression', en: 'Progress photos', ar: 'صور التقدّم' }, icone: '📸' },
      { href: '/me/rapport', label: { fr: 'Rapport', en: 'Health report', ar: 'التقرير الصحي' }, icone: '🩺' },
      { href: '/me/constantes', label: { fr: 'Constantes', en: 'Vitals', ar: 'المؤشّرات الحيوية' }, icone: '❤️' },
      { href: '/me/mesures', label: { fr: 'Mensurations', en: 'Measurements', ar: 'القياسات' }, icone: '📏' },
      { href: '/me/micronutriments', label: { fr: 'Micronutriments', en: 'Micronutrients', ar: 'المغذّيات الدقيقة' }, icone: '💊' },
    ],
  },
  {
    titre: { fr: 'Social', en: 'Social', ar: 'الاجتماعي' },
    liens: [
      { href: '/me/mur', label: { fr: 'Mur', en: 'Wall', ar: 'الحائط' }, icone: '📝' },
      { href: '/me/amis', label: { fr: 'Amis', en: 'Friends', ar: 'الأصدقاء' }, icone: '👥' },
      { href: '/me/famille', label: { fr: 'Famille', en: 'Family', ar: 'العائلة' }, icone: '🏡' },
      { href: '/me/journal', label: { fr: 'Journal', en: 'Feed', ar: 'الأخبار' }, icone: '📰' },
      { href: '/me/coach', label: { fr: 'Coach', en: 'Coach', ar: 'المدرّب' }, icone: '💬' },
      { href: '/me/parrainage', label: { fr: 'Parrainage', en: 'Referral', ar: 'الإحالة' }, icone: '🎁' },
    ],
  },
  {
    titre: { fr: 'Compte', en: 'Account', ar: 'الحساب' },
    liens: [
      { href: '/me/import', label: { fr: 'Import', en: 'Import', ar: 'الاستيراد' }, icone: '📥' },
      { href: '/me/notifications', label: { fr: 'Notifications', en: 'Notifications', ar: 'الإشعارات' }, icone: '🔔' },
      { href: '/me/abonnement', label: { fr: 'Abonnement', en: 'Subscription', ar: 'الاشتراك' }, icone: '💫' },
      { href: '/me/reglages', label: { fr: 'Mes infos', en: 'My info', ar: 'معلوماتي' }, icone: '📋' },
      { href: '/me/profile', label: { fr: 'Profil', en: 'Profile', ar: 'الملف الشخصي' }, icone: '⚙️' },
      { href: '/me/confidentialite', label: { fr: 'Confidentialité', en: 'Privacy', ar: 'الخصوصية' }, icone: '🔒' },
      { href: '/me/conditions', label: { fr: 'Conditions', en: 'Terms', ar: 'الشروط' }, icone: '📄' },
      { href: '/me/contact', label: { fr: 'Contact', en: 'Contact', ar: 'اتصل بنا' }, icone: '✉️' },
    ],
  },
];

const MENU: Tri = { fr: 'Menu', en: 'Menu', ar: 'القائمة' };
const MON_COMPTE: Tri = { fr: 'Mon compte', en: 'My account', ar: 'حسابي' };

export default function MeNav() {
  const chemin = usePathname() || '/me';
  const [ouvert, setOuvert] = useState(false);
  const { uid } = useMe();
  const { profil } = useProfil(uid);
  // La langue de la barre est celle du PROFIL — le même réglage que le
  // téléphone et que les pages. Français tant que le profil n'est pas chargé.
  const langue: Langue = (profil?.language as Langue) || 'fr';
  const sens = sensLecture(langue);
  const l = (t: Tri) => t[langue] || t.fr;
  const actif = (href: string) => (href === '/me' ? chemin === '/me' : chemin.startsWith(href));

  return (
    <>
      {/* Mobile : le bouton qui ouvre le tiroir. Invisible au-dela de 980px. */}
      <button
        className="nav-bouton"
        aria-label={l(MENU)}
        aria-expanded={ouvert}
        onClick={() => setOuvert((v) => !v)}
      >
        <span aria-hidden>{ouvert ? '✕' : '☰'}</span>
      </button>
      {ouvert ? <div className="nav-voile" onClick={() => setOuvert(false)} aria-hidden /> : null}

      <aside className={`me-nav${ouvert ? ' nav-ouverte' : ''}`} dir={sens}>
        <a className="me-nav-marque" href="/me">
          {/* Le VRAI logo — l'exact fichier de l'app mobile, la marque doit etre
              la meme des deux cotes. */}
          <img className="me-nav-logo" src="/me/logo.png" alt="" width={28} height={28} />
          <span>Salorie</span>
        </a>

        <nav className="me-nav-liens">
          {GROUPES.map((g, gi) => (
            <div key={gi} className="nav-groupe">
              {g.titre ? <div className="nav-groupe-titre">{l(g.titre)}</div> : null}
              {g.liens.map((li) => (
                <a
                  key={li.href}
                  href={li.href}
                  className={`me-nav-lien${actif(li.href) ? ' actif' : ''}`}
                  onClick={() => setOuvert(false)}
                >
                  <span className="nav-icone" aria-hidden>{li.icone}</span>
                  {l(li.label)}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="me-nav-compte">
          <UserButton afterSignOutUrl="/me" />
          <span className="me-nav-compte-note">{l(MON_COMPTE)}</span>
        </div>
      </aside>
    </>
  );
}

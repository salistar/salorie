"""Generate the Salorie technical report PDF."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    ListFlowable, ListItem,
)
import os

OUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_RAPPORT_TECHNIQUE.pdf"

styles = getSampleStyleSheet()
PRIMARY = colors.HexColor("#298f50")
DARK = colors.HexColor("#1f2937")
GRAY = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f3f4f6")

title_style = ParagraphStyle("TitleCover", parent=styles["Title"], fontSize=32, leading=38,
    textColor=PRIMARY, alignment=TA_CENTER, spaceAfter=18)
subtitle_style = ParagraphStyle("SubTitle", parent=styles["Normal"], fontSize=14, leading=18,
    textColor=GRAY, alignment=TA_CENTER, spaceAfter=10)
h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=20, leading=24,
    textColor=PRIMARY, spaceBefore=18, spaceAfter=12)
h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=15, leading=19,
    textColor=DARK, spaceBefore=14, spaceAfter=8)
h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=12, leading=16,
    textColor=PRIMARY, spaceBefore=10, spaceAfter=6)
body = ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14,
    textColor=DARK, alignment=TA_JUSTIFY, spaceAfter=6)
code = ParagraphStyle("Code", parent=styles["Code"], fontSize=8.5, leading=11,
    textColor=DARK, backColor=LIGHT, borderPadding=6, spaceAfter=8)
meta = ParagraphStyle("Meta", parent=styles["Normal"], fontSize=9, leading=12,
    textColor=GRAY, alignment=TA_CENTER)


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GRAY)
    canvas.drawString(2 * cm, 1 * cm, "Salorie — Rapport Technique")
    canvas.drawRightString(A4[0] - 2 * cm, 1 * cm, f"Page {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#e5e7eb"))
    canvas.line(2 * cm, 1.3 * cm, A4[0] - 2 * cm, 1.3 * cm)
    canvas.restoreState()


def p(txt, style=body):
    return Paragraph(txt, style)


def bullets(items, style=body):
    return ListFlowable(
        [ListItem(Paragraph(i, style), leftIndent=10) for i in items],
        bulletType="bullet", start="•", leftIndent=16,
    )


def table(data, col_widths=None, header=True):
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    s = [
        ("FONT", (0, 0), (-1, -1), "Helvetica", 8.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        s += [
            ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ]
    t.setStyle(TableStyle(s))
    return t


def test_table(rows):
    data = [["ID", "Titre", "Préconditions", "Étapes → Résultat attendu"]] + rows
    widths = [1.7 * cm, 4.2 * cm, 3.5 * cm, 6 * cm]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 7.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d1d5db")),
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return t


story = []

# ═══ COVER ═════════════════════════════════════════════════════════════════
story.append(Spacer(1, 5 * cm))
story.append(p("SALORIE", title_style))
story.append(p("Rapport Technique Complet", subtitle_style))
story.append(Spacer(1, 0.6 * cm))
story.append(p("Application mobile de nutrition & fitness propulsée par l'IA", subtitle_style))
story.append(Spacer(1, 3 * cm))
story.append(p(
    "<b>Stack :</b> React Native 0.76 · Expo SDK 52 · Expo Router v4<br/>"
    "<b>Auth :</b> Clerk (email/password + Google SSO)<br/>"
    "<b>Backend :</b> Firebase Firestore · Cloud Storage<br/>"
    "<b>IA :</b> Google Gemini 2.5-flash (vision, insights, traduction)<br/>"
    "<b>APIs tierces :</b> FatSecret v2 (OAuth2), RevenueCat, Expo Notifications<br/>"
    "<b>i18n :</b> Français · Anglais · العربية (RTL)",
    ParagraphStyle("coverbox", parent=body, alignment=TA_CENTER, fontSize=11, leading=18),
))
story.append(Spacer(1, 4 * cm))
story.append(p("Date : 20 avril 2026 — Version 1.0", meta))
story.append(p("Projet : C:\\Users\\21266\\Desktop\\sdk52\\salorie\\salorie", meta))
story.append(PageBreak())

# ═══ TABLE DES MATIÈRES ═══════════════════════════════════════════════════
story.append(p("Table des matières", h1))
toc = [["§", "Section", "Page"],
    ["1.", "Résumé exécutif", "3"],
    ["2.", "Architecture globale", "4"],
    ["3.", "Inventaire des fichiers", "7"],
    ["4.", "Routes Expo Router", "13"],
    ["5.", "Modèles de données Firestore", "15"],
    ["6.", "Features fonctionnelles", "18"],
    ["7.", "Scénarios de tests", "22"],
    ["8.", "Annexes", "32"]]
story.append(table(toc, col_widths=[1.2 * cm, 12 * cm, 2 * cm]))
story.append(PageBreak())

# ═══ 1. RÉSUMÉ EXÉCUTIF ════════════════════════════════════════════════════
story.append(p("1. Résumé exécutif", h1))
story.append(p(
    "Salorie est une application mobile de suivi nutritionnel et de fitness développée en "
    "React Native / Expo SDK 52, ciblant Android et iOS. Le produit combine journalisation "
    "de repas par plusieurs canaux (scan photo via IA, base de données FatSecret, saisie "
    "manuelle), suivi d'activités physiques, tracking d'hydratation, et un moteur "
    "d'analytics propulsé par Gemini 2.5-flash qui génère en une seule requête des insights "
    "santé en trois langues (EN/FR/AR).", body))
story.append(p(
    "L'architecture repose sur une stratégie <b>cache-first</b> via AsyncStorage avec "
    "miroir Firestore, un TTL de 7 jours pour les insights IA, et un drapeau de "
    "péremption (<i>stale</i>) déclenché à chaque nouveau log. L'authentification est "
    "gérée par Clerk (email/password + Google OAuth) et le document utilisateur est indexé "
    "par email (plutôt que par Clerk ID) pour résister aux ré-inscriptions.", body))

story.append(p("Points forts techniques", h3))
story.append(bullets([
    "<b>Cache-first analytics</b> : lecture instantanée depuis AsyncStorage, puis refresh serveur en arrière-plan.",
    "<b>Insights IA multilingues dans un seul document</b> : changement de langue instantané sans appel Gemini.",
    "<b>Provenance des données</b> : tag <code>source: 'ai' | 'computed'</code> pour distinguer sortie Gemini et fallback offline.",
    "<b>Validation champ par champ</b> : si Gemini retourne un champ vide, seul ce champ est régénéré.",
    "<b>Compilateur React</b> activé (beta v19) pour mémoïsation automatique.",
    "<b>Typed routes</b> Expo Router pour la sécurité de navigation au build-time.",
]))

story.append(p("Métriques du codebase", h3))
story.append(table([
    ["Indicateur", "Valeur"],
    ["Screens Expo Router", "30 fichiers"],
    ["Composants réutilisables", "12 fichiers"],
    ["Services (lib/)", "11 fichiers"],
    ["Hooks personnalisés", "2 fichiers"],
    ["Langues supportées", "3 (EN / FR / AR avec RTL)"],
    ["Fichier le plus volumineux", "lib/firebase.ts (504 lignes)"],
    ["Collections Firestore", "users, logs, ai_insights, weight_history, notifications, translations_cache"],
    ["Modèle Gemini utilisé", "gemini-2.5-flash (vision + texte)"],
], col_widths=[6 * cm, 9.5 * cm]))
story.append(PageBreak())

# ═══ 2. ARCHITECTURE ═══════════════════════════════════════════════════════
story.append(p("2. Architecture globale", h1))
story.append(p("2.1 Stack technologique", h2))
story.append(table([
    ["Couche", "Technologie", "Version / Détails"],
    ["Framework", "React Native", "0.76.0 (New Architecture)"],
    ["SDK", "Expo", "52.0.0"],
    ["Routage", "Expo Router", "4.0.0 (typed routes)"],
    ["Langage", "TypeScript", "strict mode"],
    ["Auth", "Clerk", "@clerk/clerk-expo 2.19.31"],
    ["Backend", "Firebase", "firebase 12.12.0 (Firestore + Storage)"],
    ["IA", "Google Generative AI", "@google/generative-ai 0.24.1 (gemini-2.5-flash)"],
    ["Base alimentaire", "FatSecret REST v2", "OAuth2 client credentials"],
    ["Paiements", "RevenueCat", "react-native-purchases 10.0.0"],
    ["Notifications", "Expo Notifications", "~0.29.0"],
    ["Stockage local", "AsyncStorage + SecureStore", "2.1.0 / 14.0.0"],
    ["UI / Icônes", "Lucide React Native", "latest"],
    ["Animations", "Reanimated", "~3.16.0"],
    ["Graphiques", "react-native-chart-kit", "6.12.0"],
    ["Compilateur", "React Compiler (beta)", "19.0.0-beta"],
], col_widths=[3.5 * cm, 5 * cm, 7 * cm]))

story.append(p("2.2 Structure des dossiers", h2))
story.append(Paragraph("""<pre>
salorie/
├── app/                    Routes Expo Router (screens &amp; layouts)
│   ├── (tabs)/             Tabs principaux : Home, Analytics, Profile
│   ├── (auth)/             Flows d'auth : sign-in, sign-up
│   ├── (onboarding)/       Wizard 5 étapes + plan IA
│   └── [modals]            Écrans de logging, settings, légal
├── components/             12 composants UI réutilisables
├── lib/                    11 services : Firebase, IA, i18n, cache, notifs
├── hooks/                  2 hooks custom
├── constants/              config.ts (env) &amp; Colors.ts (thèmes)
├── scripts/                seed-data.ts (démo/tests)
├── assets/                 Images, icônes, illustrations
├── android/ &amp; ios/         Artefacts natifs
├── app.json                Config Expo (package, plugins)
├── package.json            Dépendances &amp; scripts npm
└── tsconfig.json           Config TypeScript strict
</pre>""", code))

story.append(p("2.3 Diagramme de flux de données", h2))
story.append(Paragraph("""<pre>
┌─────────────────────────────────────────────────────────┐
│           Expo Router (navigation typée)                 │
│  (Tabs)  (Auth)  (Onboarding)  [Modals de logging]       │
└──────────────────┬──────────────────────────────────────┘
                   │
   ┌───────────────┼───────────────┬──────────────┐
   │               │               │              │
 ┌───────┐   ┌─────────────┐   ┌─────┐       ┌───────┐
 │ Clerk │   │  Firestore  │   │ i18n│       │ Theme │
 │ (Auth)│   │ (email-key) │   │(3L) │       │(dark) │
 └───────┘   └──────┬──────┘   └─────┘       └───────┘
                   │
        ┌──────────┼──────────┬─────────────┐
        │          │          │             │
 ┌───────────┐ ┌────────┐ ┌──────────┐ ┌────────────┐
 │  Gemini   │ │FatSecret│ │RevenueCat│ │   Expo     │
 │ 2.5-flash │ │ REST v2 │ │ Paywall  │ │Notifications│
 └───────────┘ └────────┘ └──────────┘ └────────────┘
</pre>""", code))

story.append(p("2.4 Flux critiques", h2))
story.append(p("a) Scan d'un repas (photo → IA → Firestore)", h3))
story.append(bullets([
    "Utilisateur ouvre l'ActionMenu depuis Home → tape « Scan Food ».",
    "ImagePicker capture l'image, base64 stockée dans <code>LoggingContext</code>.",
    "Navigation vers <code>/scan-analysis</code> qui appelle Gemini Vision.",
    "Gemini renvoie un JSON <code>{name, calories, protein, carbs, fat}</code>.",
    "Validation field-by-field → utilisateur confirme ou ajuste la portion.",
    "<code>addNutritionLog()</code> écrit dans <code>users/{email}/logs</code>.",
    "<code>markInsightsStale(email)</code> flippe le flag sur week + month.",
]))
story.append(p("b) Ouverture des Analytics (cache-first)", h3))
story.append(bullets([
    "<code>useAnalyticsData()</code> hydrate les logs de la semaine.",
    "<code>getInsights()</code> tente AsyncStorage → paint immédiat via <code>onCacheHit</code>.",
    "Si TTL &lt; 7j ET cache non-stale ET <code>isEmpty === false</code> → return cache.",
    "Sinon lecture <code>users/{email}/ai_insights/{periodKey}</code> → maj si serveur plus récent.",
    "Si insuffisant → appel Gemini 3-langues, write-back cache + Firestore.",
]))
story.append(p("c) Changement de langue (sans re-appel IA)", h3))
story.append(bullets([
    "Un document <code>ai_insights</code> stocke <code>en</code>, <code>fr</code>, <code>ar</code>.",
    "<code>pickLang(stored, lang)</code> retourne le sous-objet localisé.",
    "Aucun appel Gemini requis : UX instantanée.",
    "Fallback : si langue vide, retour sur <code>en</code>.",
]))
story.append(PageBreak())

# ═══ 3. INVENTAIRE FICHIERS ════════════════════════════════════════════════
story.append(p("3. Inventaire des fichiers", h1))

story.append(p("3.1 app/ — Screens Expo Router (30 fichiers)", h2))
story.append(table([
    ["Fichier", "Rôle"],
    ["_layout.tsx", "Root layout : providers Clerk/i18n/Theme/Logging ; routage auth ; init services"],
    ["index.tsx", "Splash redirect : route vers auth ou tabs selon la session"],
    ["welcome.tsx", "Landing avec animations Reanimated, CTA Get Started / Sign In"],
    ["+not-found.tsx", "Fallback 404"],
    ["(auth)/_layout.tsx", "Stack layout pour les écrans d'auth"],
    ["(auth)/sign-in.tsx", "Email/password + Google SSO Clerk, language switcher"],
    ["(auth)/sign-up.tsx", "Inscription Clerk, Google OAuth, confirmation email"],
    ["(onboarding)/_layout.tsx", "Stack layout du wizard"],
    ["(onboarding)/index.tsx", "Wizard 5 étapes : gender → goal → workout → birthdate → metrics"],
    ["(onboarding)/results.tsx", "Génération plan nutritionnel Gemini + fallback offline"],
    ["(tabs)/_layout.tsx", "Bottom tab nav (Home / Analytics / Profile) + FAB"],
    ["(tabs)/index.tsx", "Home/Dashboard : calories, eau, logs récents, date picker"],
    ["(tabs)/analytics.tsx", "Insights IA Bento (3 langues) + charts + streak"],
    ["(tabs)/profile.tsx", "Account, premium, settings, seed demo, notifications"],
    ["add-water.tsx", "Glass picker, incréments 125 ml, max 1000 ml"],
    ["log-exercise.tsx", "Sélecteur type exercice (Run / Lifting / Manuel)"],
    ["log-manual.tsx", "Saisie libre de calories d'activité"],
    ["food-database.tsx", "Recherche FatSecret debouncée + parsing nutritionnel"],
    ["log-food-details.tsx", "Ajustement quantité/unité (macros proportionnels)"],
    ["scan-analysis.tsx", "Pipeline image → Gemini Vision → JSON"],
    ["workout-details.tsx", "Paramètres workout (durée, intensité)"],
    ["workout-result.tsx", "Résumé post-workout"],
    ["update-weight.tsx", "Logging du poids corporel (kg)"],
    ["personal-details.tsx", "Édition des goals nutritionnels"],
    ["preferences.tsx", "Thème / Langue / Notifications toggle"],
    ["notifications.tsx", "Historique des notifications reçues"],
    ["feature-requests.tsx", "Formulaire de feedback"],
    ["terms.tsx", "Conditions d'utilisation"],
    ["privacy.tsx", "Politique de confidentialité"],
    ["oauth-callback.tsx", "Handler callback OAuth Clerk (Google)"],
], col_widths=[5.5 * cm, 10 * cm]))

story.append(p("3.2 components/ — UI réutilisable (12 fichiers)", h2))
story.append(table([
    ["Fichier", "Rôle"],
    ["LogModal.tsx", "Modal rapide pour meal/activity/water"],
    ["ActionMenu.tsx", "Bottom sheet : Scan, Food DB, Exercise, Water + picker caméra/galerie"],
    ["HomeHeader.tsx", "Salutation + avatar + date picker"],
    ["CaloriesCard.tsx", "Anneau progression calories + macros"],
    ["RemainingCaloriesCard.tsx", "kcal restantes, over/under goal, couleur dynamique"],
    ["WaterIntakeCard.tsx", "Anneau progression hydratation"],
    ["WeekCalendar.tsx", "Sélecteur calendrier semaine (lun-dim)"],
    ["ActivityList.tsx", "FlatList logs du jour avec delete swipe"],
    ["HalfProgress.tsx", "Indicateur circulaire générique"],
    ["ScreenTopBar.tsx", "Header : branding, langue, thème, notifs"],
    ["ScreenBackground.tsx", "Wrapper fond coloré/gradient"],
    ["AppBrand.tsx", "Logo + wordmark « Salorie »"],
], col_widths=[5.5 * cm, 10 * cm]))
story.append(PageBreak())

story.append(p("3.3 lib/ — Services métier (11 fichiers)", h2))
story.append(table([
    ["Fichier", "Rôle"],
    ["firebase.ts (504 l.)", "Client Firestore + CRUD : users, logs, ai_insights, notifications, poids, migration email-keyed"],
    ["AiModel.ts", "Intégration Gemini : plan (Mifflin-St Jeor), insights Bento multilingues (1 appel pour 3 langues)"],
    ["InsightsService.ts", "Cache-first AI analytics : TTL 7j, flag stale, buildPeriodKey, validation isEmpty"],
    ["LoggingContext.tsx", "State global : selectedDate, modals, refresh counter, image base64"],
    ["ThemeContext.tsx", "Mode thème (light/dark/system) + sync couleurs système"],
    ["i18n.tsx", "Provider i18n 3 langues, 500+ clés, support RTL"],
    ["translator.ts", "Traduction runtime : dict local → AsyncStorage → Firestore → Gemini"],
    ["LocalDataStore.ts", "Miroir AsyncStorage de Firestore : syncAllUserData, updateLocalCollection"],
    ["NotificationService.ts", "Expo Notifications : canal Android, push token, rappels (8h/13h/19h)"],
    ["PurchasesService.ts", "Wrapper RevenueCat : initialize, isPremium, showPaywall"],
    ["fatsecret.ts", "OAuth2 + REST v2 : token fetch/cache, recherche, parsing JSON"],
], col_widths=[4 * cm, 11.5 * cm]))

story.append(p("3.4 hooks/ — Hooks personnalisés", h2))
story.append(table([
    ["Fichier", "Rôle"],
    ["useNutritionData.ts", "Fetch profile + logs du jour → compute consumed/goals, loading + timeout sécurité"],
    ["useAnalyticsData.ts", "Dates de la semaine, process logs par jour, consumed/burned/water, cache+serveur"],
], col_widths=[4.5 * cm, 11 * cm]))

story.append(p("3.5 constants/ — Configuration", h2))
story.append(table([
    ["Fichier", "Rôle"],
    ["config.ts", "ENV vars : clés Clerk, Gemini, Firebase (6), RevenueCat Android/iOS"],
    ["Colors.ts", "Palettes light/dark : primary #298f50/#4ade80, 9 gris, error/success"],
], col_widths=[3.5 * cm, 12 * cm]))

story.append(p("3.6 scripts/", h2))
story.append(table([
    ["Fichier", "Rôle"],
    ["seed-data.ts", "Générateur démo : 11 jours (aujourd'hui + 10 passés) meals/activities/water + insights IA tagués source:'ai'"],
], col_widths=[3.5 * cm, 12 * cm]))
story.append(PageBreak())

# ═══ 4. ROUTES ═════════════════════════════════════════════════════════════
story.append(p("4. Routes Expo Router", h1))
story.append(p(
    "Expo Router v4 avec typed routes (<code>experiments.typedRoutes: true</code>). "
    "Trois groupes logiques : <code>(tabs)</code>, <code>(auth)</code>, <code>(onboarding)</code>. "
    "Les autres écrans sont des modales empilables.", body))

story.append(p("4.1 Tabs principaux", h2))
story.append(table([
    ["URL", "Écran", "Description"],
    ["/(tabs)", "Stack racine", "Tab bar persistante avec FAB central"],
    ["/(tabs)/index", "Home", "Dashboard quotidien : calories, eau, logs, quick actions"],
    ["/(tabs)/analytics", "Analytics", "Insights IA week/month/all + charts + streak"],
    ["/(tabs)/profile", "Profile", "Compte, préférences, premium, seed, déconnexion"],
], col_widths=[4 * cm, 2.5 * cm, 9 * cm]))

story.append(p("4.2 Authentification", h2))
story.append(table([
    ["URL", "Écran", "Description"],
    ["/(auth)/sign-in", "Connexion", "Email/password + Google SSO"],
    ["/(auth)/sign-up", "Inscription", "Création compte + confirmation email"],
    ["/oauth-callback", "Callback OAuth", "Handler retour Google"],
], col_widths=[4 * cm, 3 * cm, 8.5 * cm]))

story.append(p("4.3 Onboarding", h2))
story.append(table([
    ["URL", "Écran", "Description"],
    ["/(onboarding)/index", "Wizard 5 étapes", "Gender → goal → workout → birthdate → height/weight"],
    ["/(onboarding)/results", "Résultats IA", "Plan nutritionnel Gemini + summary"],
], col_widths=[4.5 * cm, 3.5 * cm, 7.5 * cm]))

story.append(p("4.4 Modales & écrans détaillés", h2))
story.append(table([
    ["URL", "Description"],
    ["/welcome", "Landing / splash redirect"],
    ["/add-water", "Logger d'hydratation (125 ml increments)"],
    ["/log-exercise", "Choix type d'activité"],
    ["/log-manual", "Saisie manuelle d'activité"],
    ["/food-database", "Recherche FatSecret"],
    ["/log-food-details", "Ajustement portion avant sauvegarde"],
    ["/scan-analysis", "Pipeline photo → Gemini Vision"],
    ["/workout-details", "Paramètres workout"],
    ["/workout-result", "Résumé post-workout"],
    ["/update-weight", "Saisie du poids corporel"],
    ["/personal-details", "Édition des goals nutritionnels"],
    ["/preferences", "Thème / Langue / Notifications"],
    ["/notifications", "Historique notifications"],
    ["/feature-requests", "Formulaire feedback"],
    ["/terms", "CGU"],
    ["/privacy", "Politique de confidentialité"],
], col_widths=[4.5 * cm, 11 * cm]))
story.append(PageBreak())

# ═══ 5. FIRESTORE ═══════════════════════════════════════════════════════════
story.append(p("5. Modèles de données Firestore", h1))
story.append(p(
    "L'indexation se fait par <b>email sanitisé</b> (<code>emailToDocId()</code>) pour "
    "garantir la stabilité en cas de ré-inscription Clerk. Les sous-collections suivent "
    "<code>users/{docId}/...</code>.", body))

story.append(p("5.1 Collection users/{docId}", h2))
story.append(Paragraph("""<pre>
users/{emailDocId}
  ├─ email:          string
  ├─ firstName?:     string
  ├─ lastName?:      string
  ├─ imageUrl?:      string          (avatar Clerk)
  ├─ onboarded?:     boolean
  ├─ gender?:        'male' | 'female'
  ├─ goal?:          'lose' | 'gain' | 'maintain'
  ├─ workoutFrequency?: string
  ├─ birthdate?:     string          (YYYY-MM-DD)
  ├─ height?:        { feet, inches }
  ├─ weight?:        number          (kg)
  ├─ nutritionalPlan?: {
  │    dailyCalories, proteins, carbs, fats,
  │    waterIntake, advice: string[]
  │  }
  ├─ language?:      'en' | 'fr' | 'ar'
  ├─ pushToken?:     string          (Expo Notifications)
  ├─ preferences?:   { theme, notificationsEnabled, ... }
  ├─ createdAt:      Timestamp
  └─ updatedAt:      Timestamp
</pre>""", code))

story.append(p("5.2 users/{docId}/logs", h2))
story.append(Paragraph("""<pre>
logs/{autoId}
  ├─ email:      string
  ├─ type:       'meal' | 'activity' | 'water'
  ├─ name:       string
  ├─ calories:   number     (ml pour water)
  ├─ protein?:   number     (g, meal)
  ├─ carbs?:     number     (g, meal)
  ├─ fat?:       number     (g, meal)
  ├─ serving?:   string
  ├─ intensity?: 'low' | 'medium' | 'high'
  ├─ duration?:  number     (minutes)
  ├─ date:       string     (YYYY-MM-DD, fuseau local)
  └─ timestamp:  serverTimestamp
</pre>""", code))

story.append(p("5.3 users/{docId}/ai_insights", h2))
story.append(Paragraph("""<pre>
ai_insights/{periodKey}       # week_2026-W17, month_2026-04, all_time
  ├─ scope:        'week' | 'month' | 'all'
  ├─ periodKey:    string
  ├─ healthScore:  number (0-100)
  ├─ en: { summary, topFood, hydrationStatus,
  │        recommendation, exerciseAnalysis }
  ├─ fr: { … mêmes champs … }
  ├─ ar: { … نصوص مترجمة … }
  ├─ updatedAt:    number (ms)
  ├─ generatedAt:  number (ms)
  ├─ stale?:       boolean     # flippé par markInsightsStale
  └─ source?:      'ai' | 'computed'
</pre>""", code))
story.append(p(
    "<b>Design</b> : stocker 3 langues dans un même document permet un changement de "
    "langue sans appel Gemini. Le tag <code>source</code> détecte les docs hardcodés "
    "legacy pour les forcer à régénérer.", body))

story.append(p("5.4 users/{docId}/weight_history", h2))
story.append(Paragraph("""<pre>
weight_history/{autoId}
  ├─ date:      string (YYYY-MM-DD)
  ├─ value:     number (kg)
  └─ timestamp: Timestamp
</pre>""", code))

story.append(p("5.5 users/{docId}/notifications", h2))
story.append(Paragraph("""<pre>
notifications/{autoId}
  ├─ title:     string
  ├─ body:      string
  ├─ timestamp: Timestamp
  └─ read?:     boolean
</pre>""", code))

story.append(p("5.6 translations_cache (global)", h2))
story.append(Paragraph("""<pre>
translations_cache/{hash}     # djb2 hash(targetLang + source text)
  ├─ source:    string        (texte d'origine EN)
  ├─ en?:       string
  ├─ fr?:       string
  ├─ ar?:       string
  └─ updatedAt: number (ms)
</pre>""", code))

story.append(p("5.7 Règles de sécurité recommandées", h2))
story.append(bullets([
    "<code>users/{docId}/**</code> : lecture/écriture si <code>request.auth.token.email == resource.data.email</code>.",
    "<code>translations_cache/**</code> : lecture publique, écriture authentifiée.",
    "<code>ai_insights</code> : héritent des règles du parent user.",
    "Validation des champs obligatoires (email, type, date) via Firestore Rules.",
]))
story.append(PageBreak())

# ═══ 6. FEATURES ═══════════════════════════════════════════════════════════
story.append(p("6. Features fonctionnelles", h1))
features = [
    ("6.1 Authentification & Onboarding", [
        "Clerk email/password + Google OAuth avec warm browser.",
        "Landing multilingue (EN/FR/AR) avec détection locale device.",
        "Wizard 5 étapes : genre, objectif, fréquence sport, naissance, métriques.",
        "Génération d'un plan nutritionnel Gemini (Mifflin-St Jeor).",
        "Fallback offline déterministe si Gemini échoue."]),
    ("6.2 Logging de repas (4 méthodes)", [
        "<b>Scan photo</b> : camera/galerie → base64 → Gemini Vision → JSON macros.",
        "<b>Recherche FatSecret</b> : debounce 500 ms, OAuth2, token cache.",
        "<b>Saisie manuelle</b> : name + calories + macros optionnels.",
        "<b>Ajustement de portion</b> : serving scaler avec recalcul proportionnel.",
        "Delete swipe, édition inline, affectation à une date passée."]),
    ("6.3 Logging d'activités", [
        "Presets : Running, Weight Lifting, Walking, Cycling, HIIT, Yoga.",
        "Intensité low/medium/high impacte l'estimation calorique.",
        "Saisie manuelle libre (name + kcal brûlées).",
        "Les activités soustraient du bilan calorique net."]),
    ("6.4 Tracking d'hydratation", [
        "UI glass picker avec incréments de 125 ml.",
        "Maximum 1000 ml par session (4 verres).",
        "Anneau de progression vs goal (par défaut 2000 ml)."]),
    ("6.5 Analytics & Insights IA", [
        "Trois scopes : week (ISO), month (YYYY-MM), all-time.",
        "Bento cards : healthScore, summary, topFood, hydrationStatus, recommendation, exerciseAnalysis.",
        "Un seul appel Gemini génère EN + FR + AR.",
        "Cache-first : paint immédiat, revalidation background.",
        "TTL 7 jours + flag stale flippé à chaque nouveau log.",
        "Validation field-by-field : seul le champ vide est régénéré.",
        "Charts : BarChart hebdo, LineChart poids, streak consécutif."]),
    ("6.6 Multilingue EN / FR / AR", [
        "Dictionnaire statique i18n (500+ clés).",
        "Traduction runtime : local → AsyncStorage → Firestore → Gemini.",
        "Support RTL complet pour l'arabe.",
        "Language picker dans top bar et préférences."]),
    ("6.7 Profile & Settings", [
        "Infos compte Clerk + métriques éditables Firestore.",
        "Thème light/dark/system (suivi OS).",
        "Notifications toggle + historique.",
        "Upgrade Premium via RevenueCat paywall.",
        "Bouton Seed Demo Data pour les tests.",
        "Pages légales (CGU, confidentialité)."]),
    ("6.8 Notifications", [
        "Enregistrement Expo push token → Firestore.",
        "Rappels programmés : Breakfast 8h, Lunch 13h, Dinner 19h, encouragement 11h.",
        "Canal Android dédié priorité HIGH.",
        "Historique consultable dans l'app."]),
    ("6.9 Mode offline & synchronisation", [
        "Miroir AsyncStorage de toutes les collections user.",
        "Lecture instantanée à froid depuis le cache.",
        "Queue de logs locaux → sync au retour online.",
        "Résolution : last-write-wins via updatedAt monotone."]),
    ("6.10 Paiements (Premium)", [
        "RevenueCat SDK (Android + iOS).",
        "Paywall natif store, entitlement Premium.",
        "Vérification périodique getCustomerInfo()."]),
]
for title, items in features:
    story.append(p(title, h2))
    story.append(bullets(items))
story.append(PageBreak())

# ═══ 7. TESTS ══════════════════════════════════════════════════════════════
story.append(p("7. Scénarios de tests", h1))
story.append(p(
    "Ce catalogue couvre 145 cas de tests fonctionnels, d'intégration et de cas limites, "
    "répartis en 14 catégories. Chaque scénario est identifié par un code "
    "<code>CAT-NNN</code>.", body))

story.append(p("7.1 Authentification (12 cas)", h2))
story.append(test_table([
    ["AUTH-001", "Connexion email/password valide", "Compte existant", "Saisir email + mdp → Sign In → home/onboarding"],
    ["AUTH-002", "Email malformé", "Sign-in ouvert", "Email sans @ → erreur, bloqué"],
    ["AUTH-003", "Mauvais mot de passe", "Compte existant", "Mdp incorrect → alerte invalid credentials"],
    ["AUTH-004", "Compte inexistant", "—", "Email non enregistré → erreur"],
    ["AUTH-005", "Inscription valide", "Sign-up ouvert", "Email + mdp + terms → compte créé"],
    ["AUTH-006", "Mismatch mdp/confirm", "Sign-up", "Mdp ≠ confirm → erreur"],
    ["AUTH-007", "Email déjà utilisé", "Compte existe", "Submit → Email already in use"],
    ["AUTH-008", "Google SSO succès", "Compte Google lié", "Tap Google → flow OAuth → ok"],
    ["AUTH-009", "Google SSO annulé", "Sign-in", "Annulation browser → retour sign-in"],
    ["AUTH-010", "Logout vide cache", "Connecté", "Logout → welcome, cache local purgé"],
    ["AUTH-011", "Session Clerk expirée", "Token > 7j idle", "API → 401 → re-login"],
    ["AUTH-012", "Persistance session", "Connecté", "Close/reopen → toujours connecté"],
]))

story.append(p("7.2 Onboarding (14 cas)", h2))
story.append(test_table([
    ["OB-001", "Étape 1 : genre", "Compte frais", "Sélection → next → étape 2"],
    ["OB-002", "Étape 2 : goal", "Étape 1 ok", "lose/gain/maintain → next"],
    ["OB-003", "Étape 3 : fréquence", "Étape 2 ok", "Sédentaire/léger/modéré/intense"],
    ["OB-004", "Étape 4 : naissance", "Étape 3 ok", "Jour/mois/année valide → next"],
    ["OB-005", "Naissance future", "Étape 4", "Année future → erreur, blocage"],
    ["OB-006", "Étape 5 : métriques", "Étape 4 ok", "Taille + poids → save + Gemini"],
    ["OB-007", "Back navigation", "Étape > 1", "Retour → données conservées"],
    ["OB-008", "Back étape 1", "Étape 1", "Reste sur étape 1 ou welcome"],
    ["OB-009", "Plan IA succès", "Toutes étapes", "Gemini OK → nutritionalPlan sauvé"],
    ["OB-010", "Plan IA timeout", "Gemini > 30s", "Timeout → fallback offline"],
    ["OB-011", "Plan IA JSON invalide", "Gemini malformé", "Parse fail → fallback appliqué"],
    ["OB-012", "Poids vide", "Étape 5", "Champ vide → Weight required"],
    ["OB-013", "Onboarding FR/AR", "Langue FR/AR", "Textes traduits, RTL pour AR"],
    ["OB-014", "Flag onboarded true", "Wizard complété", "Re-login → skip onboarding"],
]))
story.append(PageBreak())

story.append(p("7.3 Dashboard Home (13 cas)", h2))
story.append(test_table([
    ["HOME-001", "Date passée", "Home", "Date picker → jour précédent → logs"],
    ["HOME-002", "Date future bloquée", "Aujourd'hui max", "Tenter demain → bloqué"],
    ["HOME-003", "Retour aujourd'hui", "Date passée vue", "Tap Today → données du jour"],
    ["HOME-004", "État vide", "Nouveau compte", "Prompt Start logging + CTA"],
    ["HOME-005", "Anneau eau 0/50/100 %", "Goals OK", "0/1000/2000 ml → anneau se remplit"],
    ["HOME-006", "Dépassement > 100 %", "2500/2000 ml", "Cap ou exceeded affiché"],
    ["HOME-007", "Anneau calories", "1500/2000/2500", "Vert/jaune/rouge selon seuil"],
    ["HOME-008", "Boutons quick log", "Home", "Meal/Activity/Water → écran dédié"],
    ["HOME-009", "Liste activités 3+", "5 logs", "Scroll, 3-4 visibles, swipe delete"],
    ["HOME-010", "Macros bars", "Repas 50/100/30 g", "P/C/F vs goal, couleur état"],
    ["HOME-011", "Image cover", "Home render", "dashboard_cover.jpg s'affiche"],
    ["HOME-012", "Week calendar", "Home", "7 jours sélectionnables"],
    ["HOME-013", "Refresh après log", "500/2000 kcal", "+300 → remaining 1200 instantané"],
]))

story.append(p("7.4 Logging repas — 4 méthodes (24 cas)", h2))
story.append(test_table([
    ["MS-001", "Scan image valide", "Caméra OK", "Capture → envoi Gemini → JSON"],
    ["MS-002", "Gemini reconnaît plat", "Image claire", "Pizza → 250 kcal, 12p, 30c, 8f"],
    ["MS-003", "Image non reconnue", "Floue", "Erreur + suggestion manuelle"],
    ["MS-004", "Gemini timeout", "API lente", "> 30s → erreur + retry"],
    ["MS-005", "Ajustement portion", "1x", "1.5x → kcal × 1.5, macros idem"],
    ["MS-006", "Log du scan", "Validé", "Log Meal → Firestore + refresh"],
    ["MS-007", "Perm caméra deny", "Deny", "Prompt activation settings"],
    ["MS-008", "Scan hors ligne", "No net", "Erreur + fallback manuel"],
    ["MDB-001", "Recherche OK", "Food DB", "chicken → résultats"],
    ["MDB-002", "Debounce 500 ms", "Rapide", "Un seul appel après 500 ms"],
    ["MDB-003", "< 3 char", "'ch'", "Pas d'appel API"],
    ["MDB-004", "Refresh 401", "Token expiré", "Refresh → retry transparent"],
    ["MDB-005", "API down", "Erreur", "Search unavailable"],
    ["MDB-006", "Sélection aliment", "Liste", "Tap → détails préremplis"],
    ["MDB-007", "Ajust 100→200 g", "Détails", "Macros doublés"],
    ["MDB-008", "Log depuis DB", "Détails OK", "Persisté avec timestamp"],
    ["MM-001", "Saisie nom", "log-manual", "Name + kcal → sauvé"],
    ["MM-002", "Avec macros", "log-manual", "Tous champs tels quels"],
    ["MM-003", "Nom vide", "log-manual", "Erreur Meal name required"],
    ["MM-004", "Kcal non numérique", "'abc'", "Erreur ou parsé 0"],
    ["MM-005", "Kcal ≤ 0", "-50 ou 0", "Warning ou rejet"],
    ["MM-006", "Date passée", "Picker Apr 15", "Timestamp Apr 15"],
    ["MQ-001", "Portion 0.5x", "200 kcal", "→ 100 kcal, macros ÷ 2"],
    ["MQ-002", "Portion 2x", "150 kcal", "→ 300 kcal, macros × 2"],
]))
story.append(PageBreak())

story.append(p("7.5 Logging activités (12 cas)", h2))
story.append(test_table([
    ["ACT-001", "Running preset", "log-exercise", "Running → 30 min → kcal estimé"],
    ["ACT-002", "Weight lifting", "log-exercise", "Lifting → 45 min → sauvé"],
    ["ACT-003", "Activité custom", "log-manual", "Swimming 300 kcal → sauvé"],
    ["ACT-004", "Act. = soustraction", "100 kcal", "Bilan net − 100"],
    ["ACT-005", "Multi/jour", "Run + Lift", "Loggés, 600 kcal cumul"],
    ["ACT-006", "Intensité", "Log", "Low/medium/high impact estim."],
    ["ACT-007", "Nom vide manuel", "log-manual", "Erreur Activity name required"],
    ["ACT-008", "Zéro kcal", "0", "Erreur ou warning"],
    ["ACT-009", "Édition post-log", "30 min run", "40 min → recalc ok"],
    ["ACT-010", "Delete swipe", "Liste", "Confirm → retiré, totaux maj"],
    ["ACT-011", "Résumé workout", "Post-log", "Nom, durée, kcal, motivation"],
    ["ACT-012", "Date passée", "Picker", "Timestamp = date sélectionnée"],
]))

story.append(p("7.6 Hydratation (8 cas)", h2))
story.append(test_table([
    ["H2O-001", "+4 × 125 ml", "ml=0", "Tap + 4x → 500 ml"],
    ["H2O-002", "−2 × 125 ml", "ml=500", "− 2x → 250 ml"],
    ["H2O-003", "Max 1000 ml", "ml=875", "+ → 1000, bouton + off"],
    ["H2O-004", "Min 0 ml", "ml=125", "− → 0, bouton − off"],
    ["H2O-005", "Log total jour", "250 ml", "Log → anneau home maj"],
    ["H2O-006", "Accum multi-logs", "0", "3 logs → 1000 ml"],
    ["H2O-007", "Reset quotidien", "Apr 20→21", "Nouveau jour = 0"],
    ["H2O-008", "Date passée", "Picker Apr 15", "500 ml → ajouté Apr 15"],
]))

story.append(p("7.7 Analytics (16 cas)", h2))
story.append(test_table([
    ["AN-001", "Week cache hit", "Cache présent", "Affiché instantanément"],
    ["AN-002", "Month cache miss", "Pas de cache", "Spinner → fetch → Gemini"],
    ["AN-003", "All-time scope", "Pas de cache", "Spinner → Gemini tous logs"],
    ["AN-004", "Serveur plus récent", "100/200", "Cache maj"],
    ["AN-005", "Cache plus récent", "300/100", "Cache conservé"],
    ["AN-006", "Stale true", "Post log", "Cache + regen background"],
    ["AN-007", "TTL ≥ 7j", "Ancien", "Force regen 3 scopes"],
    ["AN-008", "Chart 7 bars", "Data week", "BarChart 7 jours"],
    ["AN-009", "Labels FR", "FR", "Lun, Mar, Mer…"],
    ["AN-010", "Streak", "5 jours", "5-day streak 🔥"],
    ["AN-011", "Modal streak", "Tap", "Détails dates + activités"],
    ["AN-012", "Trend poids", "Multi entries", "LineChart trend"],
    ["AN-013", "Bento OK", "Gemini ok", "Summary + score 78"],
    ["AN-014", "Fallback timeout", "API down", "Insight computed affiché"],
    ["AN-015", "Switch langue", "Doc 3-langs", "FR/AR/EN instantané"],
    ["AN-016", "JSON invalide", "Malformed", "Fallback silencieux"],
]))

story.append(p("7.8 Multilingue (12 cas)", h2))
story.append(test_table([
    ["LANG-001", "Switch FR", "Picker", "UI français : Accueil, Connexion"],
    ["LANG-002", "Switch AR", "Picker", "RTL activé, texte arabe"],
    ["LANG-003", "Switch EN", "Picker", "UI anglais, LTR"],
    ["LANG-004", "Layout RTL home", "AR", "Anneau droite, bars RTL"],
    ["LANG-005", "Back arrow RTL", "AR", "Flèche retour à droite"],
    ["LANG-006", "Noms aliments DB", "FR", "UI FR, noms EN source DB"],
    ["LANG-007", "Onboarding traduit", "FR", "Prompts en français"],
    ["LANG-008", "Notifs i18n", "Push reçu", "Texte langue user"],
    ["LANG-009", "Cache traductions", "EN→FR→EN", "Switches instantanés"],
    ["LANG-010", "Insights 3 langues", "Analytics", "Chaque switch = lecture locale"],
    ["LANG-011", "Clé i18n manquante", "typo.key", "Affiche la clé fallback"],
    ["LANG-012", "Formats numériques", "EN/FR", "Séparateur locale"],
]))
story.append(PageBreak())

story.append(p("7.9 Profile & Settings (14 cas)", h2))
story.append(test_table([
    ["PR-001", "Voir profil", "Connecté", "Nom, email, avatar"],
    ["PR-002", "Éditer kcal/j", "Profile", "Goal 2500 → home maj"],
    ["PR-003", "Éditer macros", "Profile", "P/C/F persistés"],
    ["PR-004", "Toggle thème", "Préfs", "Light ↔ Dark persisté"],
    ["PR-005", "Thème système", "System", "Suit l'OS"],
    ["PR-006", "Seed demo data", "Dev", "10 jours + analytics peuplés"],
    ["PR-007", "Perm notifs", "Prompt OS", "Allow → token, Deny → off"],
    ["PR-008", "Test notifications", "Notifs on", "4 notifs test s'affichent"],
    ["PR-009", "Paywall Premium", "Upgrade", "RevenueCat paywall"],
    ["PR-010", "Statut premium", "Post-achat", "entitlements.Premium = true"],
    ["PR-011", "Reset mdp", "Profile", "Lien Clerk par email"],
    ["PR-012", "Sync profil", "Login", "saveUserToFirestore merge email"],
    ["PR-013", "Migration legacy", "Doc Clerk-id", "Migré email-keyed"],
    ["PR-014", "Logout purge", "Connecté", "Cache vidé, welcome"],
]))

story.append(p("7.10 Notifications (10 cas)", h2))
story.append(test_table([
    ["NT-001", "Perm granted", "Prompt OS", "Token → Firestore"],
    ["NT-002", "Perm denied", "Prompt OS", "Status denied, pas de token"],
    ["NT-003", "Breakfast 8h", "Notifs on", "Quotidien 8h"],
    ["NT-004", "Lunch 13h", "Notifs on", "Quotidien 13h"],
    ["NT-005", "Dinner 19h", "Notifs on", "Quotidien 19h"],
    ["NT-006", "Encouragement 11h", "Notifs on", "Stay Active ⚡ quotidien"],
    ["NT-007", "Historique", "Notif reçue", "saveNotificationToHistory"],
    ["NT-008", "Voir historique", "Screen", "Titre/body/date"],
    ["NT-009", "Config admin", "Firestore", "Next push texte custom"],
    ["NT-010", "Device physique", "Expo Go sim", "Skip + log"],
]))

story.append(p("7.11 Mode offline (12 cas)", h2))
story.append(test_table([
    ["OFF-001", "Scan sans réseau", "Offline", "Erreur + suggère manuel"],
    ["OFF-002", "Log manuel offline", "Offline", "AsyncStorage, queue sync"],
    ["OFF-003", "Scan bloqué", "Offline", "Erreur claire"],
    ["OFF-004", "FatSecret bloqué", "Offline", "Pas de résultats"],
    ["OFF-005", "Home lit cache", "Offline", "AsyncStorage render"],
    ["OFF-006", "Reconnect sync", "Back online", "Queue → Firestore"],
    ["OFF-007", "Gemini indispo", "Offline", "Cache shown sans loader"],
    ["OFF-008", "Cache 7j", "Offline", "Insights instantanés"],
    ["OFF-009", "Conflit", "Offline edit", "Last-write-wins"],
    ["OFF-010", "Thème/langue", "Offline", "AR/dark persistés reboot"],
    ["OFF-011", "Profile", "Offline", "Infos cache"],
    ["OFF-012", "Refresh post-sync", "Back online", "markStale → regen IA"],
]))
story.append(PageBreak())

story.append(p("7.12 Cas limites (14 cas)", h2))
story.append(test_table([
    ["EDG-001", "Bascule minuit", "23:59→00:00", "selectedDate update"],
    ["EDG-002", "Timezone UTC+12", "Auckland", "Timestamp ISO correct"],
    ["EDG-003", "Seed vide", "No logs", "Charts 0, insight No data"],
    ["EDG-004", "Cache corrompu", "JSON malformé", "Catch → clear + refetch"],
    ["EDG-005", "Perm denied", "A lit B", "Rules reject, [] retourné"],
    ["EDG-006", "1000+ logs", "3 ans", "Gemini ≤ 10s, UI responsive"],
    ["EDG-007", "Cold start", "Install frais", "Welcome→SignIn→Home"],
    ["EDG-008", "Background IA", "Home button", "Call complète background"],
    ["EDG-009", "Switch langue rapide", "×3", "Pas de race condition"],
    ["EDG-010", "Double-tap log", "Tap ×2", "Bouton off, 1 entrée"],
    ["EDG-011", "Repas 10000 kcal", "Manual", "Accepté, flag warning"],
    ["EDG-012", "Poids négatif", "−70 kg", "Weight must be positive"],
    ["EDG-013", "Naissance 2100", "Onboard", "Too far in future"],
    ["EDG-014", "Emoji nom repas", "🍓", "Préservé et affiché"],
]))

story.append(p("7.13 Sécurité (10 cas)", h2))
story.append(test_table([
    ["SEC-001", "Firebase invalide", "apiKey bad", "Init fail gracieux"],
    ["SEC-002", "Clerk expirée serveur", "Token > 7j", "401 → re-login"],
    ["SEC-003", "Refresh FatSecret", "Token exp.", "Refresh → retry transparent"],
    ["SEC-004", "Clé Gemini non loggée", "Dev", "Pas de log full-key"],
    ["SEC-005", "Rules user-scoped", "A query B", "Rejet Firestore"],
    ["SEC-006", "Pas de creds local", "Inspection", "Aucun mdp stocké"],
    ["SEC-007", "Pas d'email URL", "Deep links", "State, pas query"],
    ["SEC-008", "Logout push token", "Logout", "Retiré state, DB compat"],
    ["SEC-009", "Prompt injection", "Malicieuse", "Validation structurée"],
    ["SEC-010", "Verif email Clerk", "Unverified", "Clerk enforce"],
]))

story.append(p("7.14 Performance (10 cas)", h2))
story.append(test_table([
    ["PERF-001", "500+ logs", "Historique", "Render < 3s, FlatList virtual."],
    ["PERF-002", "Cold start", "Install frais", "TTI home < 5s"],
    ["PERF-003", "Gemini gros dataset", "1000 logs", "Insights < 30s"],
    ["PERF-004", "Cache miss storm", "3 scopes", "Appels parallèles"],
    ["PERF-005", "Leak langue", "×100 switches", "Pas de croissance mémoire"],
    ["PERF-006", "triggerRefresh", "Post-log", "Refetch < 1s"],
    ["PERF-007", "FlatList 1000", "Scroll", "60 FPS virtualisation"],
    ["PERF-008", "Compression photo", "5 MB", "< 1 MB, upload < 2s"],
    ["PERF-009", "Re-render chart", "week→month", "Transition < 500 ms"],
    ["PERF-010", "Index Firestore", "(email, date)", "Hit < 500 ms"],
]))
story.append(PageBreak())

# ═══ 8. ANNEXES ════════════════════════════════════════════════════════════
story.append(p("8. Annexes", h1))

story.append(p("8.1 Variables d'environnement requises", h2))
story.append(table([
    ["Clé", "Description"],
    ["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", "Clé publique Clerk (auth)"],
    ["EXPO_PUBLIC_GEMINI_API_KEY", "Clé API Google Generative AI"],
    ["EXPO_PUBLIC_FIREBASE_API_KEY", "Firebase Web API Key"],
    ["EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "Domaine auth Firebase"],
    ["EXPO_PUBLIC_FIREBASE_PROJECT_ID", "Project ID Firestore"],
    ["EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "Bucket Cloud Storage"],
    ["EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "FCM sender ID"],
    ["EXPO_PUBLIC_FIREBASE_APP_ID", "App ID Firebase"],
    ["EXPO_PUBLIC_REVENUE_CAT_API_KEY_ANDROID", "RevenueCat Android"],
    ["EXPO_PUBLIC_REVENUE_CAT_API_KEY_IOS", "RevenueCat iOS"],
    ["EXPO_PUBLIC_FATSECRET_CLIENT_ID", "OAuth2 FatSecret"],
    ["EXPO_PUBLIC_FATSECRET_CLIENT_SECRET", "OAuth2 FatSecret"],
], col_widths=[8 * cm, 7.5 * cm]))

story.append(p("8.2 Commandes npm principales", h2))
story.append(table([
    ["Commande", "Description"],
    ["npm run start", "Serveur dev Expo"],
    ["npm run android", "Lance sur émulateur/device Android"],
    ["npm run ios", "Lance sur simulateur/device iOS"],
    ["npm run web", "Build web preview"],
    ["npm run lint", "ESLint sur sources"],
    ["npm run reset-project", "Clean node_modules + caches"],
    ["eas build --platform android", "Build APK/AAB via EAS"],
    ["eas submit", "Soumission Play/App Store"],
], col_widths=[6 * cm, 9.5 * cm]))

story.append(p("8.3 Checklist de déploiement", h2))
story.append(bullets([
    "Variables d'env configurées dans EAS Secrets.",
    "Règles Firestore publiées (lecture restreinte au owner).",
    "Clerk configuré avec redirect URI OAuth correct.",
    "Paywalls RevenueCat publiés, entitlements mappés.",
    "Assets icônes adaptive Android + splash iOS.",
    "versionCode/buildNumber incrémentés avant build.",
    "Tests des 14 catégories exécutés sur device physique.",
    "Notifications testées device réel (pas Expo Go).",
]))

story.append(p("8.4 Glossaire", h2))
story.append(table([
    ["Terme", "Définition"],
    ["Bento cards", "Cartes analytics en grille avec health score + 5 insights"],
    ["periodKey", "Identifiant déterministe du document d'insight (ex: week_2026-W17)"],
    ["stale flag", "Drapeau booléen qui force la régénération au prochain accès"],
    ["source tag", "Provenance 'ai' (Gemini) ou 'computed' (fallback offline)"],
    ["emailToDocId", "Normalisation email → identifiant Firestore (minuscules, sanitisation)"],
    ["Mifflin-St Jeor", "Formule de calcul du BMR utilisée par le plan nutritionnel"],
    ["TTL", "Time-to-live : 7 jours pour les insights IA"],
    ["djb2 hash", "Hash 32 bits rapide pour clé de cache traductions"],
], col_widths=[4 * cm, 11.5 * cm]))

story.append(Spacer(1, 1 * cm))
story.append(p("— Fin du rapport technique Salorie —", meta))

# ═══ BUILD ═════════════════════════════════════════════════════════════════
doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=2 * cm, rightMargin=2 * cm,
    topMargin=2 * cm, bottomMargin=2 * cm,
    title="Salorie — Rapport Technique",
    author="Documentation Technique",
)
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f"OK  ->  {OUT}")
print(f"Size: {os.path.getsize(OUT)/1024:.1f} KB")

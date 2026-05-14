"""
Génère le rapport technique complet de Salorie :
- Architecture
- Fichiers
- Routes
- Modèles Firestore
- Features
- Scénarios de test
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    KeepTogether,
)
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT, TA_CENTER

OUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_RAPPORT_TECHNIQUE.pdf"

# ───── Styles ─────
styles = getSampleStyleSheet()
PRIMARY = colors.HexColor("#FF5C5C")
DARK = colors.HexColor("#111827")
GRAY = colors.HexColor("#4B5563")
LIGHT = colors.HexColor("#F3F4F6")

title_style = ParagraphStyle("T", parent=styles["Title"], fontSize=28, textColor=PRIMARY,
                             spaceAfter=16, alignment=TA_CENTER, fontName="Helvetica-Bold")
subtitle_style = ParagraphStyle("ST", parent=styles["Normal"], fontSize=13, textColor=GRAY,
                                alignment=TA_CENTER, spaceAfter=30)
h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=20, textColor=PRIMARY,
                    spaceBefore=18, spaceAfter=12, fontName="Helvetica-Bold")
h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=15, textColor=DARK,
                    spaceBefore=12, spaceAfter=8, fontName="Helvetica-Bold")
h3 = ParagraphStyle("H3", parent=styles["Heading3"], fontSize=12, textColor=DARK,
                    spaceBefore=8, spaceAfter=4, fontName="Helvetica-Bold")
body = ParagraphStyle("B", parent=styles["Normal"], fontSize=10, textColor=DARK,
                      alignment=TA_JUSTIFY, spaceAfter=6, leading=14)
bullet = ParagraphStyle("Bu", parent=body, leftIndent=14, bulletIndent=2, spaceAfter=3)
code = ParagraphStyle("Co", parent=styles["Code"], fontSize=8, textColor=DARK,
                      backColor=LIGHT, leftIndent=6, rightIndent=6, spaceAfter=6,
                      leading=11, fontName="Courier")

story = []

def P(txt, s=body):
    story.append(Paragraph(txt, s))

def B(items):
    for it in items:
        story.append(Paragraph(f"• {it}", bullet))

def SP(h=0.3):
    story.append(Spacer(1, h * cm))

def TBL(data, col_widths=None):
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    SP()

# ═════════════════════════ COVER ═════════════════════════
story.append(Spacer(1, 6 * cm))
P("SALORIE", title_style)
P("Rapport Technique Complet", subtitle_style)
P("Application mobile de suivi nutritionnel et calorique<br/>"
  "React Native · Expo SDK 52 · Firebase · Clerk · Gemini Vision", subtitle_style)
SP(2)
P("Version 1.0.0 &nbsp;·&nbsp; Avril 2026", subtitle_style)
story.append(PageBreak())

# ═════════════════════════ TABLE OF CONTENTS ═════════════════════════
P("Table des matières", h1)
toc = [
    "1. Vue d'ensemble & Stack technique",
    "2. Architecture globale",
    "3. Structure des dossiers",
    "4. Explication détaillée de chaque fichier",
    "5. Routes et navigation Expo Router",
    "6. Modèles de base de données Firestore",
    "7. Features fonctionnelles",
    "8. Systèmes transverses (i18n, thème, logs, cache)",
    "9. Intégrations externes (Clerk, Gemini, RevenueCat, FatSecret)",
    "10. Scénarios de test (fonctionnels, unitaires, edge cases)",
    "11. Limitations connues & perspectives",
]
for item in toc:
    P(item, bullet)
story.append(PageBreak())

# ═════════════════════════ 1. OVERVIEW ═════════════════════════
P("1. Vue d'ensemble & Stack technique", h1)
P("Salorie est une application mobile de suivi nutritionnel permettant à l'utilisateur de "
  "logger ses repas, ses exercices, sa consommation d'eau et son poids, et d'obtenir des "
  "insights nutritionnels personnalisés via IA. Le scan photo de plats est disponible via "
  "Gemini Vision. Les données sont synchronisées entre le cache local (AsyncStorage) et "
  "Firestore pour un fonctionnement robuste offline-first.")
SP()
P("Stack technique", h2)
TBL([
    ["Domaine", "Technologie", "Version"],
    ["Runtime mobile", "React Native", "0.76.0"],
    ["Framework", "Expo SDK", "52.0.0"],
    ["Language", "TypeScript", "~5.3"],
    ["Routing", "expo-router (file-based)", "~4.0"],
    ["Authentification", "Clerk (@clerk/clerk-expo)", "^2.19"],
    ["Base de données", "Firebase Firestore", "^12.12"],
    ["IA Vision", "Google Gemini Vision API", "0.24.1"],
    ["Paiement", "RevenueCat (react-native-purchases)", "10.0.0"],
    ["Base alimentaire", "FatSecret Platform API", "REST"],
    ["Cache local", "AsyncStorage", "2.1.0"],
    ["Animations", "Reanimated, Gesture Handler", "~3.16"],
    ["UI Icons", "lucide-react-native, hugeicons", "^1.8"],
    ["Charts", "react-native-chart-kit", "^6.12"],
    ["Notifications", "expo-notifications", "~0.29"],
], col_widths=[4 * cm, 8 * cm, 4 * cm])

story.append(PageBreak())

# ═════════════════════════ 2. ARCHITECTURE ═════════════════════════
P("2. Architecture globale", h1)

P("2.1 Vue en couches", h2)
P("L'architecture suit un modèle en couches avec séparation stricte des responsabilités :")
B([
    "<b>UI Layer (app/, components/)</b> : écrans (routes) et composants réutilisables.",
    "<b>State Layer (lib/LoggingContext, lib/ThemeContext, hooks/)</b> : contextes globaux et hooks de données.",
    "<b>Data Layer (lib/LocalDataStore)</b> : cache local AsyncStorage, coalescing des syncs, helpers.",
    "<b>Network Layer (lib/firebase, lib/AiModel, lib/fatsecret)</b> : accès Firestore, Gemini, FatSecret.",
    "<b>Services (lib/NotificationService, lib/InsightsService, lib/PurchasesService)</b> : services isolés.",
])
SP()

P("2.2 Flux de données principal", h2)
P("1. L'utilisateur s'authentifie via Clerk (email/password ou OAuth Google).<br/>"
  "2. Au premier login, <b>syncAllUserData()</b> détecte un cache vide et télécharge tout depuis Firestore "
  "(profil, logs, poids, notifications, insights en 3 langues).<br/>"
  "3. Les actions locales (log repas, eau, exercice) sont écrites simultanément dans AsyncStorage "
  "et dans Firestore.<br/>"
  "4. Le hook <b>useNutritionData(selectedDate)</b> agrège les logs du jour sélectionné et calcule "
  "les totaux calorie/macros/eau.<br/>"
  "5. <b>useAnalyticsData()</b> fournit les séries temporelles sur 7/30/90 jours pour l'écran Analytics.")

SP()
P("2.3 Offline-first & Resume-after-kill", h2)
P("L'application est conçue pour survivre à un arrêt brutal (ex. Android tue l'activité "
  "RN pendant que la caméra est ouverte en Expo Go) :")
B([
    "Chaque écriture va d'abord en AsyncStorage puis en Firestore (ordre important).",
    "La clé <code>pending_scan_v1</code> persiste l'URI d'une photo prise avant le crash pour relancer "
    "automatiquement <code>scan-analysis</code> au prochain démarrage.",
    "Un Set en mémoire <code>_homeSyncedUserIds</code> évite les re-syncs en boucle quand l'écran Home "
    "se remonte après navigation.",
    "Un Map <code>_syncInFlight</code> coalesce les appels concurrents à syncAllUserData.",
])
story.append(PageBreak())

# ═════════════════════════ 3. FOLDER STRUCTURE ═════════════════════════
P("3. Structure des dossiers", h1)
tree = """salorie/
├── app/                          # Routes Expo Router (file-based)
│   ├── _layout.tsx              # Root layout (Clerk, ThemeProvider, LoggingProvider)
│   ├── index.tsx                # Redirect initial (auth gate)
│   ├── welcome.tsx              # Écran d'accueil (non-logged)
│   ├── (auth)/                  # Groupe auth
│   │   ├── _layout.tsx
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── (onboarding)/            # Groupe onboarding (post-signup)
│   │   ├── _layout.tsx
│   │   ├── index.tsx           # Questionnaire (âge, sexe, poids, objectif...)
│   │   └── results.tsx         # Calcul plan nutritionnel personnalisé
│   ├── (tabs)/                  # Groupe tabs principal
│   │   ├── _layout.tsx
│   │   ├── index.tsx           # Home (calories, macros, eau)
│   │   ├── analytics.tsx       # Graphiques & stats
│   │   └── profile.tsx         # Profil + paramètres
│   ├── scan-analysis.tsx        # Analyse IA d'une photo de plat
│   ├── log-food-details.tsx     # Édition d'un repas détecté
│   ├── log-manual.tsx           # Log manuel calories/macros
│   ├── log-exercise.tsx         # Log exercice (sport + durée)
│   ├── workout-details.tsx      # Détails d'une séance
│   ├── workout-result.tsx       # Résultat calories brûlées
│   ├── add-water.tsx            # Ajout verre d'eau
│   ├── food-database.tsx        # Recherche FatSecret
│   ├── update-weight.tsx        # Mise à jour poids
│   ├── personal-details.tsx     # Modification profil
│   ├── preferences.tsx          # Langue + thème
│   ├── notifications.tsx        # Liste notifications
│   ├── feature-requests.tsx     # Formulaire suggestions
│   ├── terms.tsx                # CGU
│   ├── privacy.tsx              # Politique de confidentialité
│   ├── oauth-callback.tsx       # Retour OAuth Clerk
│   └── +not-found.tsx
│
├── components/                   # Composants UI réutilisables
│   ├── ActionMenu.tsx           # Menu FAB (scan, water, exercise, database)
│   ├── ActivityList.tsx         # Liste des logs du jour
│   ├── AppBrand.tsx
│   ├── CaloriesCard.tsx
│   ├── HalfProgress.tsx         # Demi-cercle de progression
│   ├── HomeHeader.tsx
│   ├── LogModal.tsx             # Modal Quick Log (food/exercise)
│   ├── RemainingCaloriesCard.tsx
│   ├── ScreenBackground.tsx     # Gradient adaptatif dark/light
│   ├── ScreenTopBar.tsx
│   ├── WaterIntakeCard.tsx
│   └── WeekCalendar.tsx         # Strip jour par jour
│
├── lib/                         # Logique métier
│   ├── firebase.ts              # Init Firestore + CRUD utilisateur/logs
│   ├── LocalDataStore.ts        # Cache AsyncStorage + sync + logs colorés
│   ├── LoggingContext.tsx       # Context global (selectedDate, modals, refresh)
│   ├── ThemeContext.tsx         # Dark/Light + persistance
│   ├── AiModel.ts               # Gemini Vision wrapper
│   ├── InsightsService.ts       # Génération insights IA multilingues
│   ├── NotificationService.ts   # Push expo-notifications
│   ├── PurchasesService.ts      # RevenueCat entitlements
│   ├── fatsecret.ts             # Proxy API FatSecret
│   ├── i18n.tsx                 # Traductions (fr, en, es)
│   └── translator.ts            # Helper de traduction dynamique
│
├── hooks/
│   ├── useNutritionData.ts      # Agrège logs du jour → calories/macros
│   └── useAnalyticsData.ts      # Séries temporelles pour graphiques
│
├── constants/
│   ├── Colors.ts                # Palette centrale
│   └── config.ts                # Clés API publiques
│
├── assets/                      # Images, fonts, illustrations
├── android/                     # Projet natif (généré par Expo prebuild)
├── app.json                     # Config Expo
├── eas.json                     # Config EAS Build
└── package.json
"""
story.append(Paragraph(f"<pre>{tree}</pre>", code))
story.append(PageBreak())

# ═════════════════════════ 4. FILES DETAIL ═════════════════════════
P("4. Explication détaillée de chaque fichier", h1)

P("4.1 Fichiers racines (app/)", h2)

files_root = [
    ("app/_layout.tsx",
     "Layout racine. Initialise ClerkProvider avec la clé publishable, ThemeProvider, "
     "LoggingProvider, charge les polices, masque le splash screen quand prêt. Appelle "
     "<code>printLogLegend()</code> au module-level pour afficher la légende des couleurs "
     "ANSI dans la console. Contient la logique de <code>pending_scan_v1</code> pour "
     "reprendre un scan interrompu."),
    ("app/index.tsx",
     "Page d'entrée. Redirect vers <code>/welcome</code>, <code>/(auth)/sign-in</code> "
     "ou <code>/(tabs)</code> selon l'état de l'utilisateur Clerk."),
    ("app/welcome.tsx",
     "Écran d'accueil pour un utilisateur non authentifié. Boutons 'Sign In' et 'Sign Up' "
     "ainsi que présentation visuelle de l'app."),
    ("app/scan-analysis.tsx",
     "Écran clé du scan IA. Reçoit un paramètre <code>imageUri</code>, lit le base64 via "
     "FileSystem, envoie à Gemini Vision (<code>gemini-1.5-flash</code>), parse la "
     "réponse JSON (nom du plat, calories, macros, quantité estimée), puis redirige vers "
     "<code>log-food-details</code> pour édition/validation. Contient un heartbeat et "
     "une bannière de debug visible à l'écran."),
    ("app/log-food-details.tsx",
     "Écran d'édition d'un repas. Permet de modifier quantité, calories, macros, "
     "type de repas (breakfast/lunch/dinner/snack), puis enregistre dans Firestore + "
     "AsyncStorage."),
    ("app/log-manual.tsx",
     "Saisie manuelle d'un repas sans photo ni scan."),
    ("app/log-exercise.tsx",
     "Log exercice : choix de sport (course, vélo, musculation…), durée en minutes, "
     "intensité. Calcule calories brûlées via MET × poids × temps."),
    ("app/workout-details.tsx / workout-result.tsx",
     "Écrans de détails et résultat post-enregistrement d'une séance."),
    ("app/add-water.tsx",
     "Interface +/- pour ajouter de l'eau (250ml par défaut). Mise à jour "
     "instantanée de WaterIntakeCard."),
    ("app/food-database.tsx",
     "Recherche d'aliments via FatSecret API. Retourne calories/macros par 100g ou "
     "portion standard."),
    ("app/update-weight.tsx",
     "Ruler-picker pour nouveau poids. Ajoute une entrée dans <code>weightHistory</code>."),
    ("app/personal-details.tsx",
     "Édition profil : nom, date de naissance, sexe, taille, objectif."),
    ("app/preferences.tsx",
     "Sélection langue (fr/en/es) et thème (light/dark/auto). Persisté en AsyncStorage."),
    ("app/notifications.tsx",
     "Liste chronologique des notifications reçues."),
    ("app/feature-requests.tsx",
     "Formulaire envoyé à Firestore <code>feature_requests</code>."),
    ("app/oauth-callback.tsx",
     "Callback redirect après OAuth Google (Clerk)."),
    ("app/terms.tsx / privacy.tsx",
     "Documents légaux statiques."),
]
for name, desc in files_root:
    P(f"<b>{name}</b>", h3)
    P(desc)

P("4.2 Groupes de routes", h2)
grp = [
    ("app/(auth)/_layout.tsx", "Stack navigator dédié auth. Masque header."),
    ("app/(auth)/sign-in.tsx", "Formulaire connexion Clerk (email + password + OAuth Google)."),
    ("app/(auth)/sign-up.tsx", "Formulaire inscription avec vérification par code email."),
    ("app/(onboarding)/_layout.tsx", "Stack onboarding."),
    ("app/(onboarding)/index.tsx", "Questionnaire multi-étapes : âge, sexe, poids, taille, activité, objectif."),
    ("app/(onboarding)/results.tsx", "Calcul BMR (Mifflin-St Jeor) × activité, ajuste selon objectif "
                                     "(perte/maintien/prise), affiche le plan."),
    ("app/(tabs)/_layout.tsx", "Bottom tab navigator : Home, Analytics, Profile. FAB central qui "
                                "ouvre ActionMenu."),
    ("app/(tabs)/index.tsx", "Dashboard principal : header, week calendar, remaining calories, "
                              "water card, activity list. Déclenche sync initial."),
    ("app/(tabs)/analytics.tsx", "Graphiques calories/poids/macros sur 7/30/90j via chart-kit."),
    ("app/(tabs)/profile.tsx", "Paramètres utilisateur, boutons : update weight, preferences, "
                                "notifications, feature requests, legal, clear cache, logout."),
]
TBL([["Fichier", "Rôle"]] + [[n, d] for n, d in grp], col_widths=[6 * cm, 10 * cm])
story.append(PageBreak())

P("4.3 Composants réutilisables", h2)
comps = [
    ("ActionMenu.tsx", "Modal FAB. 4 cartes : Log Exercise, Add Water, Food Database, Scan Food "
                       "(premium crown). Scan Food propose Take Photo ou Gallery (stable en Expo Go)."),
    ("ActivityList.tsx", "Liste verticale des logs du jour (repas + exercices). Bouton + pour "
                         "ouvrir LogModal."),
    ("HomeHeader.tsx", "Header top : avatar Clerk, badge premium, toggle langue, toggle thème, "
                       "cloche notifications."),
    ("WeekCalendar.tsx", "Strip 7 jours centrés sur aujourd'hui. Tap = setSelectedDate dans "
                         "LoggingContext."),
    ("RemainingCaloriesCard.tsx", "Carte centrale : calories restantes dans la journée + anneau "
                                   "HalfProgress + 3 macros (P/C/F). Tap sur anneau = édition objectifs."),
    ("CaloriesCard.tsx", "Variante compacte."),
    ("WaterIntakeCard.tsx", "Verres d'eau dessinés + chiffre ml/objectif."),
    ("HalfProgress.tsx", "SVG demi-cercle animé pour afficher un %."),
    ("LogModal.tsx", "Modal Quick Log : propose scan, manuel, database, exercice."),
    ("ScreenBackground.tsx", "Gradient radial rose/blanc ou noir selon thème."),
    ("ScreenTopBar.tsx", "Barre header commune (back + titre + action optionnelle)."),
    ("AppBrand.tsx", "Logo + nom de l'app."),
]
TBL([["Composant", "Description"]] + [[n, d] for n, d in comps], col_widths=[5 * cm, 11 * cm])

P("4.4 Couche lib/", h2)
libs = [
    ("firebase.ts",
     "Initialise Firestore avec la config (constants/config.ts). Exporte : "
     "<code>saveUserToFirestore(user)</code>, <code>getUserFromFirestore(email)</code>, "
     "<code>addLogToFirestore(email, log)</code>, <code>getLogsForDate(email, date)</code>, "
     "<code>updateWeightHistory(email, entry)</code>, <code>getWeightHistory(email)</code>, "
     "<code>saveNotification</code>, <code>getNotifications</code>, "
     "<code>saveFeatureRequest</code>, <code>saveInsightsCache(email, lang, data)</code>."),
    ("LocalDataStore.ts",
     "Cache AsyncStorage centralisé. Clés : <code>user_{email}</code>, "
     "<code>logs_{email}_{date}</code>, <code>weight_{email}</code>, "
     "<code>notifications_{email}</code>, <code>insights_{email}_{lang}</code>, "
     "<code>synced_{docId}</code>, <code>pending_scan_v1</code>, "
     "<code>theme_preference</code>, <code>lang_preference</code>. "
     "Fonctions clés : <code>syncAllUserData(email)</code> (coalescé via _syncInFlight Map), "
     "<code>isCacheEmpty(email)</code>, <code>clearAllLocalData(email)</code>, "
     "<code>colorLog(color, label, body)</code>, <code>explain(msg)</code>, "
     "<code>printLogLegend()</code>."),
    ("LoggingContext.tsx",
     "Context React global : <code>selectedDate</code>, <code>refreshCount</code> (bump pour "
     "forcer rerender), <code>isActionMenuVisible</code>, <code>isLogModalVisible</code>, "
     "<code>scanImageBase64</code>. Fournit showLogModal, hideLogModal, showActionMenu, etc."),
    ("ThemeContext.tsx",
     "Dark/Light/Auto. Détecte Appearance.getColorScheme(), persiste le choix dans "
     "AsyncStorage, expose <code>resolved</code> (light|dark) et <code>setTheme</code>."),
    ("AiModel.ts",
     "Wrapper @google/generative-ai. <code>generateContent(base64, prompt)</code> appelle "
     "Gemini Vision et parse le JSON retourné. Gestion timeout + retry léger."),
    ("InsightsService.ts",
     "Génère des insights (ex : 'tu as mangé +20% de glucides cette semaine') via Gemini "
     "texte en 3 langues. Met en cache dans Firestore <code>insights/{email}/{lang}</code>."),
    ("NotificationService.ts",
     "Wrapper expo-notifications. Schedule daily reminders (petit-déj, déj, dîner), "
     "hydration reminders. Gère permissions."),
    ("PurchasesService.ts",
     "Wrapper RevenueCat. <code>configure(apiKey, userId)</code>, "
     "<code>getOfferings()</code>, <code>purchase(pkg)</code>, "
     "<code>hasActiveEntitlement('premium')</code>."),
    ("fatsecret.ts",
     "Proxy vers FatSecret Platform. OAuth2 client_credentials, search foods, get food "
     "details (calories/macros par portion)."),
    ("i18n.tsx",
     "Provider + hook useTranslation(). Charge les JSON fr/en/es. Clés imbriquées "
     "(<code>home.today</code>, <code>days.long.mon</code>, etc.)."),
    ("translator.ts",
     "Helper de traduction runtime (ex. noms de plats détectés par Gemini à traduire "
     "dans la langue courante)."),
]
for name, desc in libs:
    P(f"<b>{name}</b>", h3)
    P(desc)

P("4.5 Hooks", h2)
P("<b>hooks/useNutritionData.ts</b>", h3)
P("Prend une date (YYYY-MM-DD), lit les logs du cache local + Firestore, agrège calories, "
  "protéines, glucides, lipides, eau. Retourne <code>{loading, goals, consumed, logs, refresh}</code>.")
P("<b>hooks/useAnalyticsData.ts</b>", h3)
P("Prend une période (7/30/90j), construit les séries temporelles : calories consommées vs "
  "objectif, évolution poids, répartition macros. Alimente les graphiques de l'écran Analytics.")

P("4.6 Constants", h2)
P("<b>Colors.ts</b> : palette avec <code>Colors.light.primary (#FF5C5C)</code>, "
  "<code>Colors.light.gray[50..900]</code>, <code>Colors.light.white</code>, shadow colors.<br/>"
  "<b>config.ts</b> : <code>FIREBASE_CONFIG</code>, <code>CLERK_PUBLISHABLE_KEY</code>, "
  "<code>GEMINI_API_KEY</code> (via EXPO_PUBLIC_...), <code>REVENUECAT_API_KEY</code>, "
  "<code>FATSECRET_KEY/SECRET</code>.")
story.append(PageBreak())

# ═════════════════════════ 5. ROUTES ═════════════════════════
P("5. Routes et navigation Expo Router", h1)
P("Expo Router utilise le système file-based : chaque fichier dans <code>app/</code> devient "
  "une route. Les dossiers entre parenthèses (ex. <code>(tabs)</code>) sont des groupes qui "
  "n'apparaissent pas dans l'URL.")

routes = [
    ("/", "app/index.tsx", "Redirect selon auth"),
    ("/welcome", "app/welcome.tsx", "Landing non-authentifié"),
    ("/sign-in", "app/(auth)/sign-in.tsx", "Connexion Clerk"),
    ("/sign-up", "app/(auth)/sign-up.tsx", "Inscription Clerk + vérif email"),
    ("/oauth-callback", "app/oauth-callback.tsx", "Retour OAuth Google"),
    ("/", "app/(onboarding)/index.tsx", "Onboarding questionnaire"),
    ("/results", "app/(onboarding)/results.tsx", "Plan nutritionnel calculé"),
    ("/ (tab Home)", "app/(tabs)/index.tsx", "Dashboard principal"),
    ("/analytics", "app/(tabs)/analytics.tsx", "Statistiques / graphiques"),
    ("/profile", "app/(tabs)/profile.tsx", "Paramètres utilisateur"),
    ("/scan-analysis", "app/scan-analysis.tsx", "Analyse Gemini d'une photo"),
    ("/log-food-details", "app/log-food-details.tsx", "Édition repas scanné"),
    ("/log-manual", "app/log-manual.tsx", "Saisie manuelle"),
    ("/log-exercise", "app/log-exercise.tsx", "Log sport"),
    ("/workout-details", "app/workout-details.tsx", "Détails séance"),
    ("/workout-result", "app/workout-result.tsx", "Résultat calories brûlées"),
    ("/add-water", "app/add-water.tsx", "Ajout hydratation"),
    ("/food-database", "app/food-database.tsx", "Recherche FatSecret"),
    ("/update-weight", "app/update-weight.tsx", "Pesée"),
    ("/personal-details", "app/personal-details.tsx", "Édition profil"),
    ("/preferences", "app/preferences.tsx", "Langue + thème"),
    ("/notifications", "app/notifications.tsx", "Liste notifications"),
    ("/feature-requests", "app/feature-requests.tsx", "Formulaire suggestions"),
    ("/terms", "app/terms.tsx", "CGU"),
    ("/privacy", "app/privacy.tsx", "Politique confidentialité"),
]
TBL([["URL", "Fichier", "Rôle"]] + [[u, f, r] for u, f, r in routes],
    col_widths=[4.5 * cm, 6 * cm, 5.5 * cm])

P("Params usuels : <code>router.push({ pathname: '/scan-analysis', params: { imageUri } })</code>.")
story.append(PageBreak())

# ═════════════════════════ 6. FIRESTORE MODELS ═════════════════════════
P("6. Modèles de base de données Firestore", h1)
P("Firestore est structuré en collections racines. La clé primaire des documents utilisateur "
  "est l'email (normalisé en minuscules). Certaines entités utilisent des sous-collections "
  "par date pour éviter les documents trop volumineux.")

P("6.1 Collection <code>users</code>", h2)
P("Document ID = email utilisateur.")
TBL([
    ["Champ", "Type", "Description"],
    ["id", "string", "Clerk user ID"],
    ["email", "string", "Email (= document ID)"],
    ["name", "string", "Prénom affiché"],
    ["photoUrl", "string?", "Avatar Clerk"],
    ["birthDate", "string (ISO)", "Date de naissance"],
    ["gender", "'male'|'female'|'other'", "Sexe"],
    ["heightCm", "number", "Taille"],
    ["currentWeightKg", "number", "Poids actuel"],
    ["targetWeightKg", "number", "Poids cible"],
    ["activityLevel", "'sedentary'..'very_active'", "Niveau activité"],
    ["goal", "'lose'|'maintain'|'gain'", "Objectif"],
    ["nutritionalPlan", "object", "{ dailyCalories, proteins, carbs, fats, water }"],
    ["language", "'fr'|'en'|'es'", "Langue préférée"],
    ["premium", "boolean", "Entitlement RevenueCat"],
    ["createdAt", "Timestamp", "Création"],
    ["updatedAt", "Timestamp", "MAJ"],
], col_widths=[4 * cm, 4 * cm, 8 * cm])

P("6.2 Collection <code>logs</code>", h2)
P("Sous-collection par utilisateur et par date. Chemin : "
  "<code>logs/{email}/days/{YYYY-MM-DD}/entries/{logId}</code>.")
TBL([
    ["Champ", "Type", "Description"],
    ["id", "string (uuid)", "Clé unique"],
    ["type", "'food'|'exercise'|'water'", "Type de log"],
    ["name", "string", "Nom du repas ou sport"],
    ["mealType", "'breakfast'|'lunch'|'dinner'|'snack'?", "Pour food"],
    ["calories", "number", "kcal (positif repas, négatif exercice)"],
    ["protein", "number?", "g"],
    ["carbs", "number?", "g"],
    ["fat", "number?", "g"],
    ["waterMl", "number?", "ml (si type=water)"],
    ["durationMin", "number?", "minutes (si exercise)"],
    ["imageUri", "string?", "URI locale ou URL Firebase Storage"],
    ["source", "'scan'|'manual'|'database'|'quick'", "Provenance"],
    ["createdAt", "Timestamp", ""],
], col_widths=[4 * cm, 5 * cm, 7 * cm])

P("6.3 Collection <code>weight</code>", h2)
P("Chemin : <code>weight/{email}/entries/{entryId}</code>.")
TBL([
    ["Champ", "Type", "Description"],
    ["weightKg", "number", "Poids mesuré"],
    ["date", "string (YYYY-MM-DD)", "Jour de la pesée"],
    ["createdAt", "Timestamp", ""],
], col_widths=[4 * cm, 4 * cm, 8 * cm])

P("6.4 Collection <code>notifications</code>", h2)
P("Chemin : <code>notifications/{email}/items/{id}</code>.")
TBL([
    ["Champ", "Type", "Description"],
    ["title", "string", "Titre"],
    ["body", "string", "Contenu"],
    ["type", "'reminder'|'insight'|'system'", ""],
    ["read", "boolean", "Lu / non lu"],
    ["createdAt", "Timestamp", ""],
], col_widths=[4 * cm, 4 * cm, 8 * cm])

P("6.5 Collection <code>insights</code>", h2)
P("Chemin : <code>insights/{email}/lang/{fr|en|es}</code>. Document unique par langue, "
  "généré par InsightsService toutes les 24h environ.")
TBL([
    ["Champ", "Type", "Description"],
    ["summary", "string", "Résumé hebdo généré par Gemini"],
    ["tips", "string[]", "Conseils personnalisés"],
    ["generatedAt", "Timestamp", ""],
    ["basedOnDays", "number", "Nb de jours analysés"],
], col_widths=[4 * cm, 4 * cm, 8 * cm])

P("6.6 Collection <code>feature_requests</code>", h2)
TBL([
    ["Champ", "Type", "Description"],
    ["email", "string", "Auteur"],
    ["message", "string", "Contenu"],
    ["status", "'new'|'reviewed'|'done'", ""],
    ["createdAt", "Timestamp", ""],
], col_widths=[4 * cm, 4 * cm, 8 * cm])

P("6.7 Indexation & règles de sécurité", h2)
P("Règles Firestore : un utilisateur ne peut lire/écrire que les documents dont l'email "
  "correspond à son <code>request.auth.token.email</code> (après intégration Firebase Auth ↔ "
  "Clerk via custom token). Les <code>feature_requests</code> sont write-only.")
P("Indexes composites : <code>logs/{email}/days/{date}/entries</code> sur "
  "<code>(type ASC, createdAt DESC)</code> pour la liste du jour.")
story.append(PageBreak())

# ═════════════════════════ 7. FEATURES ═════════════════════════
P("7. Features fonctionnelles", h1)

features = [
    ("Authentification",
     "Email + password via Clerk, OAuth Google, vérification email par code. Session "
     "persistée via expo-secure-store."),
    ("Onboarding personnalisé",
     "Questionnaire 6 étapes (sexe, âge, taille, poids, activité, objectif). Calcul BMR "
     "Mifflin-St Jeor, TDEE selon activité, ajustement ±500 kcal selon objectif, "
     "répartition macros (30% P / 40% C / 30% F par défaut)."),
    ("Dashboard Home",
     "Week calendar sélectionnable, carte calories restantes avec anneau, 3 macros, "
     "hydratation, liste d'activités du jour, FAB central pour actions rapides."),
    ("Scan Food IA",
     "Photo ou galerie → Gemini Vision 1.5 Flash → JSON {name, quantity, calories, "
     "macros} → écran édition → log en base. Gère URI-only (pas de base64 en mémoire) "
     "pour éviter crash Expo Go. Bannière debug visible à l'écran."),
    ("Log manuel",
     "Saisie libre calories/macros avec nom custom et type de repas."),
    ("Base alimentaire FatSecret",
     "Recherche d'aliments, affichage valeurs par 100g et par portion."),
    ("Log exercice",
     "Choix parmi ~20 sports, durée, intensité. Calcul calories via formule "
     "MET × poids × heures."),
    ("Hydratation",
     "Incrément/décrément par verres de 250 ml (configurable). Visualisation verres remplis."),
    ("Suivi du poids",
     "Ruler picker, historique graphique, comparaison avec objectif."),
    ("Analytics",
     "Graphiques 7/30/90 jours : calories vs objectif, évolution poids, répartition macros."),
    ("Insights IA",
     "Résumés hebdomadaires personnalisés générés par Gemini en français, anglais, espagnol. "
     "Mise en cache Firestore pour économiser les tokens."),
    ("Notifications",
     "Rappels repas (8h, 12h, 19h), hydratation (toutes les 2h entre 9h-21h), insights "
     "hebdo. Liste in-app avec statut lu/non lu."),
    ("Internationalisation",
     "3 langues supportées (fr, en, es). Bouton globe dans HomeHeader. Toutes les chaînes "
     "passent par useTranslation()."),
    ("Thème dark/light/auto",
     "Toggle dans HomeHeader + écran Preferences. Auto suit Appearance du système."),
    ("Premium (RevenueCat)",
     "Entitlement 'premium' débloque le scan IA illimité. Badge crown sur les cartes "
     "premium. Paywall via RevenueCat UI."),
    ("Offline-first + Resume",
     "Cache AsyncStorage, coalescing des syncs concurrents, persist pending_scan_v1 pour "
     "survivre à un kill Android pendant la caméra."),
    ("Clear Cache (debug)",
     "Bouton dans profil qui purge les 9 clés AsyncStorage liées à l'utilisateur courant."),
    ("Logs colorés + meta-explanations",
     "Système ANSI : YELLOW (narration), GREEN (API request sortante), BLUE (API response "
     "entrante), RED (écriture cache/Firestore), MAGENTA (méta-explication ↳). "
     "<code>printLogLegend()</code> affiche la légende au démarrage."),
]
for title, desc in features:
    P(f"<b>{title}</b>", h3)
    P(desc)
story.append(PageBreak())

# ═════════════════════════ 8. SYSTÈMES TRANSVERSES ═════════════════════════
P("8. Systèmes transverses", h1)

P("8.1 Système de logs coloré", h2)
P("Dans <code>lib/LocalDataStore.ts</code>, <code>colorLog(color, label, body?)</code> "
  "encadre chaque événement système avec un code ANSI. Convention :")
TBL([
    ["Couleur ANSI", "Sens", "Exemple"],
    ["\\x1b[33m YELLOW", "Narration / étape métier", "[HomeScreen] sync termine"],
    ["\\x1b[32m GREEN", "Requête sortante (API→)", "[API→Firestore] getDoc REQUEST"],
    ["\\x1b[34m BLUE", "Réponse entrante (API←)", "[API←Firestore] getDoc RESPONSE"],
    ["\\x1b[31m RED", "Écriture locale ou distante", "[API→AsyncStorage] pending_scan SAVE"],
    ["\\x1b[35m MAGENTA", "Méta-explication ↳", "↳ [pourquoi] on persiste l'URI..."],
], col_widths=[4 * cm, 5 * cm, 7 * cm])

P("8.2 Cache AsyncStorage", h2)
P("Clés préfixées par email pour isolation multi-compte. Format JSON. "
  "<code>synced_{email}_{docType}</code> est un flag booléen indiquant qu'un sync initial a eu lieu.")

P("8.3 Coalescing des syncs", h2)
P("<code>_syncInFlight: Map&lt;email, Promise&gt;</code>. Si deux appels "
  "concurrents à <code>syncAllUserData(email)</code>, le deuxième récupère la Promise en "
  "cours au lieu de déclencher un second round-trip Firestore. Libération dans finally.")

P("8.4 Thème", h2)
P("ThemeContext expose <code>theme: 'light'|'dark'|'auto'</code> et <code>resolved: 'light'|'dark'</code>. "
  "Chaque écran lit <code>resolved</code> pour adapter ses couleurs.")

P("8.5 i18n", h2)
P("Clés imbriquées (<code>home.today</code>, <code>profile.logout</code>), fonction <code>t(key)</code> "
  "qui fait un lookup. Fallback vers la clé elle-même si manquante. Langue persistée dans AsyncStorage "
  "et synchronisée avec le profil Firestore.")
story.append(PageBreak())

# ═════════════════════════ 9. INTÉGRATIONS ═════════════════════════
P("9. Intégrations externes", h1)

integrations = [
    ("Clerk",
     "@clerk/clerk-expo. Gère auth email/password, OAuth Google, vérification par code. "
     "Hooks <code>useUser()</code>, <code>useAuth()</code>. Token stocké dans expo-secure-store. "
     "Redirect URI configuré dans app.json (scheme)."),
    ("Firebase Firestore",
     "firebase@12. Init dans <code>lib/firebase.ts</code>. Utilisation modulaire "
     "(<code>doc</code>, <code>setDoc</code>, <code>getDoc</code>, <code>collection</code>, "
     "<code>query</code>, <code>where</code>). Persistance offline désactivée (on gère via AsyncStorage)."),
    ("Google Gemini Vision",
     "@google/generative-ai. Modèle <code>gemini-1.5-flash</code> (env "
     "<code>EXPO_PUBLIC_GEMINI_VISION_MODEL</code>). Prompt structuré demandant un JSON "
     "strict. Timeout ~20s avec heartbeat visible."),
    ("RevenueCat",
     "react-native-purchases@10. API key iOS + Android. Configure avec Clerk user.id comme "
     "appUserID. Entitlement 'premium'. Paywall natif via react-native-purchases-ui."),
    ("FatSecret Platform",
     "OAuth2 client_credentials pour obtenir un bearer token (~24h). Endpoints "
     "<code>foods.search</code> et <code>food.get.v4</code>."),
    ("Expo Notifications",
     "Permissions runtime. Channels Android configurés. Schedule via "
     "<code>scheduleNotificationAsync({ trigger: { hour, minute, repeats: true } })</code>."),
]
for name, desc in integrations:
    P(f"<b>{name}</b>", h3)
    P(desc)
story.append(PageBreak())

# ═════════════════════════ 10. TEST SCENARIOS ═════════════════════════
P("10. Scénarios de test", h1)

P("10.1 Tests fonctionnels (end-to-end)", h2)

tf = [
    ("TF-01", "Inscription nouveau compte email",
     "Sign-up → code email → onboarding complet → dashboard vide → premier login synchronise "
     "le profil en Firestore."),
    ("TF-02", "Connexion existante",
     "Sign-in valide → redirect /(tabs) → syncAllUserData détecte cache présent → compare "
     "avec Firestore → UI peuplée."),
    ("TF-03", "OAuth Google",
     "Bouton 'Continue with Google' → navigateur externe → consent → oauth-callback → "
     "redirect /(tabs)."),
    ("TF-04", "Onboarding complet",
     "Les 6 étapes (sexe, âge, taille, poids, activité, objectif) → calcul "
     "BMR/TDEE/macros → persistance en Firestore."),
    ("TF-05", "Sélection d'un jour passé",
     "Tap sur lundi dans WeekCalendar → selectedDate mis à jour → useNutritionData recharge "
     "les logs de ce jour → RemainingCaloriesCard affiche les valeurs historiques."),
    ("TF-06", "Scan Food (Gallery)",
     "FAB → Scan Food → Gallery → sélection image → scan-analysis → heartbeat → JSON reçu → "
     "log-food-details avec champs pré-remplis → Save → log apparaît dans ActivityList."),
    ("TF-07", "Scan Food (Camera) avec kill Android",
     "FAB → Take Photo → caméra ouverte → app killée par OS → redémarrage → HomeScreen "
     "détecte pending_scan_v1 → redirect automatique vers scan-analysis."),
    ("TF-08", "Log manuel",
     "LogModal → Manual → saisie 'Pomme / 80 kcal / 0.5 P / 21 C / 0.3 F' → Save."),
    ("TF-09", "Food Database",
     "Recherche 'banana' → liste FatSecret → tap → valeurs par 100g affichées → Save."),
    ("TF-10", "Log exercice",
     "FAB → Exercise → 'Running' / 30 min / moderate → calcul ~300 kcal brûlées → apparaît "
     "dans ActivityList avec calories négatives."),
    ("TF-11", "Add Water",
     "+ ×4 → 1000ml → WaterIntakeCard se remplit visuellement → persistance."),
    ("TF-12", "Update Weight",
     "Ruler picker 72.5 kg → Save → weight/{email}/entries enrichie → graphique Analytics "
     "se met à jour."),
    ("TF-13", "Analytics 7j",
     "Onglet Analytics → toggle 7j → graphiques cohérents avec logs récents."),
    ("TF-14", "Changement de langue",
     "Preferences → Spanish → toute l'UI bascule → redémarrage → langue conservée."),
    ("TF-15", "Changement de thème",
     "Preferences → Dark → fond noir → toggle Auto → suit système."),
    ("TF-16", "Achat Premium",
     "Profile → Get Premium → paywall RevenueCat → achat test → entitlement actif → scan "
     "sans limite."),
    ("TF-17", "Notifications permissions",
     "Premier scheduling → dialog OS → accept → rappel déjeuner arrive à 12h."),
    ("TF-18", "Feature request",
     "/feature-requests → message envoyé → doc créé dans feature_requests."),
    ("TF-19", "Clear Cache",
     "Profile → Clear Cache → toutes les clés AsyncStorage de l'utilisateur purgées → UI "
     "vide jusqu'au prochain sync."),
    ("TF-20", "Logout",
     "Profile → Logout → Clerk signOut → redirect /welcome → cache reste (pour reconnexion rapide)."),
]
TBL([["ID", "Scénario", "Déroulé"]] + [[i, n, d] for i, n, d in tf],
    col_widths=[1.6 * cm, 4.4 * cm, 10 * cm])

P("10.2 Tests unitaires (lib/)", h2)
tu = [
    ("TU-01", "colorLog préfixe bien l'ANSI correspondant."),
    ("TU-02", "explain() préfixe '↳ [pourquoi]' en magenta."),
    ("TU-03", "isCacheEmpty renvoie true si aucune clé synced_{email}."),
    ("TU-04", "clearAllLocalData supprime exactement les 9 clés listées."),
    ("TU-05", "syncAllUserData appelé 3× en parallèle ne fait qu'une seule requête Firestore."),
    ("TU-06", "useNutritionData agrège correctement : 2 repas + 1 exercice = calories nettes."),
    ("TU-07", "useAnalyticsData sur 7j avec 3 jours manquants remplit les trous par 0."),
    ("TU-08", "Onboarding formula : Mifflin-St Jeor homme 30 ans 80kg 180cm = 1780 BMR ± 5."),
    ("TU-09", "Calorie exercise = MET × weight × hours, Running MET=9.8, 30min, 75kg ≈ 367 kcal."),
    ("TU-10", "i18n.t('home.today') retourne 'Aujourd\\'hui' en fr, 'Today' en en, 'Hoy' en es."),
    ("TU-11", "ThemeContext.resolved === 'dark' quand system prefersDarkColorScheme et theme='auto'."),
    ("TU-12", "FatSecret response parser extrait calories/macros même si 'per_100g' manquant."),
]
TBL([["ID", "Test"]] + [[i, t] for i, t in tu], col_widths=[1.6 * cm, 14.4 * cm])

P("10.3 Tests d'intégration Firestore", h2)
ti = [
    ("TI-01", "saveUserToFirestore écrit bien dans users/{email}."),
    ("TI-02", "addLogToFirestore crée un doc dans logs/{email}/days/{date}/entries/{id}."),
    ("TI-03", "getLogsForDate ne retourne que les logs du jour demandé."),
    ("TI-04", "updateWeightHistory n'écrase pas les entrées précédentes."),
    ("TI-05", "saveInsightsCache/{lang} stocke par langue, 3 langues cohabitent."),
    ("TI-06", "Règles Firestore bloquent l'accès cross-user (Unauthorized pour autre email)."),
]
TBL([["ID", "Test"]] + [[i, t] for i, t in ti], col_widths=[1.6 * cm, 14.4 * cm])

P("10.4 Tests de scénarios d'erreur / edge cases", h2)
te = [
    ("TE-01", "Pas de réseau au scan : Gemini timeout → écran affiche erreur → retour Home possible."),
    ("TE-02", "Clé API Gemini invalide : erreur 403 → message 'Service indisponible' → pas de crash."),
    ("TE-03", "JSON Gemini malformé : parser tolère et affiche 'Analyse impossible, réessayer'."),
    ("TE-04", "Photo corrompue (URI invalide) : FileSystem.readAsStringAsync erreur gérée."),
    ("TE-05", "Android kill pendant camera → pending_scan_v1 persisté → relance auto."),
    ("TE-06", "Pending_scan > 5 minutes → considéré abandonné → suppression automatique."),
    ("TE-07", "Firestore offline : fallback sur cache AsyncStorage, pas d'écran blanc."),
    ("TE-08", "Token Clerk expiré : useAuth renvoie signedOut → redirect /welcome."),
    ("TE-09", "FatSecret token expiré (24h) : refresh OAuth2 automatique."),
    ("TE-10", "RevenueCat offline : getOfferings cache → paywall affiche dernière offre connue."),
    ("TE-11", "Notifications refusées : app continue, badge prévient dans Preferences."),
    ("TE-12", "Double tap FAB : ActionMenu ne s'ouvre qu'une fois (state isActionMenuVisible)."),
    ("TE-13", "Changement de date pendant sync : useNutritionData annule proprement."),
    ("TE-14", "Grosse image (>5MB) : quality 0.3 garantit <500KB, sinon alerte."),
    ("TE-15", "Clear Cache puis offline : UI vide jusqu'à retour réseau (attendu)."),
    ("TE-16", "Multi-comptes sur même device : clés AsyncStorage préfixées par email, pas de fuite."),
    ("TE-17", "Dark mode + SafeArea : pas de bande blanche en haut/bas."),
    ("TE-18", "OAuth callback échoué : redirect /sign-in avec message."),
    ("TE-19", "Ruler weight hors bornes (<30 ou >250 kg) : clamp + warning."),
    ("TE-20", "Onboarding abandonné : au retour sign-in, reprise à l'étape sauvée."),
]
TBL([["ID", "Edge case"]] + [[i, t] for i, t in te], col_widths=[1.6 * cm, 14.4 * cm])

P("10.5 Tests de performance", h2)
tp = [
    ("TP-01", "Sync initial < 3s en 4G pour un utilisateur avec 30 jours de logs."),
    ("TP-02", "Rendering Analytics 90j < 200ms (FlashList virtualisée)."),
    ("TP-03", "Gemini scan médiane < 8s avec quality 0.3."),
    ("TP-04", "Mémoire app < 250MB au repos sur Android mid-range."),
    ("TP-05", "Démarrage froid < 3.5s (hors splash)."),
    ("TP-06", "Changement de date fluide (< 100ms) grâce au cache local."),
]
TBL([["ID", "Métrique"]] + [[i, t] for i, t in tp], col_widths=[1.6 * cm, 14.4 * cm])

story.append(PageBreak())

# ═════════════════════════ 11. LIMITATIONS ═════════════════════════
P("11. Limitations connues & perspectives", h1)

P("11.1 Limitations actuelles", h2)
B([
    "<b>Expo Go Android</b> : la caméra tue souvent l'activité RN (limite mémoire). "
    "Solution : dev-build via <code>npx expo run:android</code>. Atténuation : quality 0.3, "
    "pas de base64 inline, persistance pending_scan_v1.",
    "<b>Désynchronisation des versions</b> : react-native 0.76.0 installé vs 0.76.9 attendu, "
    "expo 52.0.0 vs ~52.0.49, expo-modules-autolinking 2.1.15 vs ~2.0.0. Cela bloque le "
    "dev-build (ReactHostWrapper.kt : Unresolved reference ReactNativeFeatureFlags).",
    "<b>Gemini cost</b> : chaque scan = ~1 requête, peu coûteux mais non mis en cache.",
    "<b>FatSecret</b> : quota OAuth 10000 req/jour en tier gratuit.",
    "<b>Firestore rules</b> : actuellement permissives en dev, à renforcer avant prod.",
    "<b>Photos</b> : stockées en URI locale, pas uploadées vers Firebase Storage (perdues à la "
    "désinstallation).",
])

P("11.2 Perspectives d'évolution", h2)
B([
    "Passer au dev-build stable : aligner les versions, rebuilder android/.",
    "Upload des photos scannées vers Firebase Storage pour historique cross-device.",
    "Mode 'famille' (plusieurs utilisateurs partageant un plan).",
    "Intégration wearables (HealthKit, Google Fit) pour import automatique de l'activité.",
    "Génération de recettes personnalisées via Gemini texte.",
    "Migration progressive vers React Native New Architecture (Fabric + TurboModules) "
    "déjà activée en 0.76.",
    "A/B tests des paywalls via RevenueCat Experiments.",
    "Pipeline CI EAS Build + tests Detox.",
])

P("", body)
story.append(Spacer(1, 1 * cm))
P("— Fin du rapport —", subtitle_style)

# ═════════════════════════ BUILD ═════════════════════════
doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=2 * cm, rightMargin=2 * cm,
    topMargin=2 * cm, bottomMargin=2 * cm,
    title="Salorie — Rapport Technique",
    author="Salorie Team",
)

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GRAY)
    canvas.drawString(2 * cm, 1 * cm, "Salorie — Rapport Technique Complet")
    canvas.drawRightString(A4[0] - 2 * cm, 1 * cm, f"Page {doc.page}")
    canvas.restoreState()

doc.build(story, onFirstPage=footer, onLaterPages=footer)
print(f"OK: {OUT}")

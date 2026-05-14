"""Génère SALORIE_PROMPTS_DEV.pdf — storytelling du développement sous forme de prompts."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
    ListFlowable, ListItem, KeepTogether,
)
import os

OUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_PROMPTS_DEV.pdf"

styles = getSampleStyleSheet()
PRIMARY = colors.HexColor("#298f50")
DARK = colors.HexColor("#1f2937")
GRAY = colors.HexColor("#6b7280")
LIGHT = colors.HexColor("#f3f4f6")
ACCENT = colors.HexColor("#f59e0b")
BOX_BG = colors.HexColor("#ecfdf5")
BOX_BORDER = colors.HexColor("#10b981")

title_style = ParagraphStyle("T", parent=styles["Title"], fontSize=30, leading=36,
    textColor=PRIMARY, alignment=TA_CENTER, spaceAfter=18)
sub = ParagraphStyle("S", parent=styles["Normal"], fontSize=14, leading=18,
    textColor=GRAY, alignment=TA_CENTER, spaceAfter=10)
h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=20, leading=24,
    textColor=PRIMARY, spaceBefore=14, spaceAfter=10)
h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=14, leading=18,
    textColor=DARK, spaceBefore=12, spaceAfter=6)
body = ParagraphStyle("B", parent=styles["Normal"], fontSize=10, leading=14,
    textColor=DARK, alignment=TA_JUSTIFY, spaceAfter=6)
meta = ParagraphStyle("M", parent=styles["Normal"], fontSize=9, leading=12,
    textColor=GRAY, alignment=TA_CENTER)
prompt_title = ParagraphStyle("PT", parent=styles["Heading3"], fontSize=12, leading=16,
    textColor=PRIMARY, spaceBefore=8, spaceAfter=4)
prompt_body = ParagraphStyle("PB", parent=styles["Normal"], fontSize=9.5, leading=13.5,
    textColor=DARK, alignment=TA_JUSTIFY, leftIndent=8, rightIndent=8,
    backColor=BOX_BG, borderColor=BOX_BORDER, borderWidth=0.6,
    borderPadding=8, spaceAfter=10)
tag = ParagraphStyle("TG", parent=styles["Normal"], fontSize=8.5, leading=11,
    textColor=ACCENT, alignment=TA_LEFT, spaceAfter=2)


def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GRAY)
    canvas.drawString(2 * cm, 1 * cm, "Salorie — Catalogue de Prompts de Développement")
    canvas.drawRightString(A4[0] - 2 * cm, 1 * cm, f"Page {doc.page}")
    canvas.setStrokeColor(colors.HexColor("#e5e7eb"))
    canvas.line(2 * cm, 1.3 * cm, A4[0] - 2 * cm, 1.3 * cm)
    canvas.restoreState()


def p(t, s=body): return Paragraph(t, s)


def prompt(num, category, title, text):
    """Affiche un prompt formaté avec numéro, catégorie, titre et corps encadré."""
    header = f"<b>Prompt {num:02d} — {category}</b> : {title}"
    return [
        p(header, prompt_title),
        p(text, prompt_body),
    ]


story = []

# ═══ COVER ═════════════════════════════════════════════════════════════════
story.append(Spacer(1, 5 * cm))
story.append(p("SALORIE", title_style))
story.append(p("Catalogue de Prompts de Développement", sub))
story.append(Spacer(1, 0.5 * cm))
story.append(p("Storytelling complet du développement de A à Z", sub))
story.append(p("+ 20 prompts futurs (améliorations & nouvelles features)", sub))
story.append(Spacer(1, 3 * cm))
story.append(p(
    "<b>Ce document contient :</b><br/>"
    "• Prompts de setup initial (projet, navigation, thème)<br/>"
    "• Prompts backend (Firebase, Clerk, Firestore)<br/>"
    "• Prompts par feature (scan IA, analytics, i18n, etc.)<br/>"
    "• Prompts d'intégrations tierces (Gemini, FatSecret, RevenueCat)<br/>"
    "• 1 prompt d'améliorations du projet actuel<br/>"
    "• 19 prompts de nouvelles features futures",
    ParagraphStyle("cov", parent=body, alignment=TA_CENTER, fontSize=11, leading=18),
))
story.append(Spacer(1, 3 * cm))
story.append(p("Date : 20 avril 2026 — Version 1.0", meta))
story.append(p("Chaque prompt fait minimum 5 lignes et est directement exploitable.", meta))
story.append(PageBreak())

# ═══ INTRO ═════════════════════════════════════════════════════════════════
story.append(p("Introduction", h1))
story.append(p(
    "Ce document reconstitue l'intégralité du développement de l'application Salorie sous "
    "forme de <b>prompts réutilisables</b>. Chaque prompt est formulé comme une demande "
    "autonome et complète qu'un développeur (ou un agent IA) peut exécuter sans contexte "
    "préalable. L'ensemble est organisé chronologiquement : setup du projet → backend → "
    "authentification → features métier → intégrations tierces → optimisations.", body))
story.append(p(
    "Le catalogue se termine par <b>20 prompts prospectifs</b> : un premier prompt "
    "regroupe toutes les améliorations à apporter au projet actuel (refactor, bugs, dette "
    "technique), suivi de 19 prompts décrivant chacun une nouvelle feature potentielle "
    "pour la roadmap produit.", body))

story.append(p("Structure du document", h2))
toc = [
    ["Partie", "Contenu", "Prompts"],
    ["I", "Setup initial & architecture", "01 → 06"],
    ["II", "Backend & persistance", "07 → 11"],
    ["III", "Authentification & onboarding", "12 → 15"],
    ["IV", "Features métier (nutrition, IA)", "16 → 28"],
    ["V", "Analytics & insights IA", "29 → 32"],
    ["VI", "i18n, thème & UX transversale", "33 → 36"],
    ["VII", "Intégrations tierces & monétisation", "37 → 40"],
    ["VIII", "Testing, packaging & déploiement", "41 → 43"],
    ["IX", "Améliorations du projet actuel", "44"],
    ["X", "19 nouvelles features futures", "45 → 63"],
]
t = Table(toc, colWidths=[1.5 * cm, 10.5 * cm, 3.5 * cm], repeatRows=1)
t.setStyle(TableStyle([
    ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
    ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10),
    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#d1d5db")),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story.append(t)
story.append(PageBreak())

# ═══ PARTIE I : SETUP ══════════════════════════════════════════════════════
story.append(p("Partie I — Setup initial & architecture", h1))

story.extend(prompt(1, "Setup", "Initialisation du projet Expo SDK 52",
    "Initialise un nouveau projet React Native avec Expo SDK 52 nommé <b>salorie</b> "
    "en TypeScript strict mode. Configure le <code>package.json</code> avec le script "
    "<code>npm run start</code>, active la New Architecture via <code>newArchEnabled: true</code> "
    "dans <code>app.json</code>, ajoute le bundle identifier Android <code>com.idriss.kriouile.salorie</code>, "
    "et active les experiments <code>typedRoutes: true</code> et <code>reactCompiler: true</code> "
    "pour bénéficier de la mémoïsation automatique de React Compiler 19 beta. Installe Expo Router "
    "v4 comme moteur de navigation principal avec un <code>app/_layout.tsx</code> racine."))

story.extend(prompt(2, "Setup", "Configuration TypeScript strict & ESLint",
    "Configure un <code>tsconfig.json</code> strict avec <code>strict: true</code>, "
    "<code>noImplicitAny</code>, <code>strictNullChecks</code> et <code>exactOptionalPropertyTypes</code>. "
    "Ajoute les types Expo et React Native, puis crée un fichier ESLint v9 avec la config flat "
    "<code>eslint.config.js</code> héritant de <code>expo/eslint-config</code>. Définis des règles "
    "custom pour interdire les <code>any</code> implicites, forcer l'import typé avec "
    "<code>type</code> quand possible, et signaler les dépendances manquantes dans "
    "<code>useEffect</code>. Ajoute un script <code>npm run lint</code>."))

story.extend(prompt(3, "Architecture", "Structure de dossiers modulaire",
    "Crée la structure de dossiers suivante : <code>app/</code> pour les routes Expo Router "
    "(avec sous-groupes <code>(tabs)</code>, <code>(auth)</code>, <code>(onboarding)</code>), "
    "<code>components/</code> pour les composants UI réutilisables, <code>lib/</code> pour les "
    "services métier (Firebase, IA, i18n, contexts), <code>hooks/</code> pour les hooks "
    "personnalisés, <code>constants/</code> pour la configuration et les couleurs, "
    "<code>scripts/</code> pour les utilitaires dev (seed), et <code>assets/</code> pour les "
    "images et icônes. Documente chaque dossier avec un commentaire d'en-tête expliquant sa "
    "responsabilité."))

story.extend(prompt(4, "Navigation", "Expo Router avec typed routes et bottom tabs",
    "Configure Expo Router v4 avec trois groupes logiques. Crée <code>app/(tabs)/_layout.tsx</code> "
    "qui définit un <code>Tabs</code> avec trois onglets : <code>index</code> (Home), "
    "<code>analytics</code> (Analytics) et <code>profile</code> (Profile), accompagnés d'icônes "
    "Lucide React Native (Home, BarChart3, User). Ajoute un Floating Action Button (FAB) central "
    "qui ouvre un bottom sheet <code>ActionMenu</code>. Configure le <code>app/_layout.tsx</code> "
    "racine pour brancher les providers (Clerk, Theme, i18n, Logging) dans le bon ordre et "
    "gérer la redirection entre auth / onboarding / tabs selon l'état de session."),)

story.extend(prompt(5, "Design System", "Palette de couleurs & système de thème",
    "Crée <code>constants/Colors.ts</code> exportant deux palettes (light et dark) avec : "
    "primary (vert #298f50 light / #4ade80 dark), secondary (ambre #f59e0b / #fbbf24), "
    "9 nuances de gris, états success/warning/error, et un background principal. Implémente "
    "<code>lib/ThemeContext.tsx</code> qui expose <code>{theme, setTheme, colors}</code> avec "
    "trois modes : 'light', 'dark', 'system' (suit l'OS via <code>useColorScheme()</code>). "
    "Persiste le choix en AsyncStorage sous la clé <code>app_theme</code> et synchronise le "
    "<code>StatusBar</code> et la <code>NavigationBar</code> Android aux couleurs du thème actif."))

story.extend(prompt(6, "Design System", "Composants UI de base réutilisables",
    "Crée les composants réutilisables suivants dans <code>components/</code> : "
    "<code>ScreenBackground</code> (wrapper avec gradient ou couleur pleine), "
    "<code>ScreenTopBar</code> (header avec branding, sélecteur de langue, toggle thème, cloche "
    "notifications), <code>AppBrand</code> (logo Salorie + wordmark), <code>HalfProgress</code> "
    "(anneau circulaire animé générique prenant <code>{value, max, color, size}</code>). "
    "Tous les composants doivent consommer <code>useTheme()</code> et <code>useI18n()</code> "
    "pour la cohérence visuelle et linguistique, et supporter le RTL pour l'arabe."))

story.append(PageBreak())

# ═══ PARTIE II : BACKEND ═══════════════════════════════════════════════════
story.append(p("Partie II — Backend & persistance", h1))

story.extend(prompt(7, "Backend", "Initialisation Firebase Firestore",
    "Crée <code>lib/firebase.ts</code> qui initialise le SDK Firebase v12 avec la configuration "
    "issue de <code>constants/config.ts</code> (apiKey, authDomain, projectId, storageBucket, "
    "messagingSenderId, appId). Exporte les instances <code>db</code> (Firestore) et "
    "<code>storage</code> (Cloud Storage). Implémente une fonction <code>emailToDocId(email)</code> "
    "qui normalise un email (trim, lowercase, remplacement de caractères spéciaux par '_') "
    "pour générer un identifiant de document stable. Cette stratégie d'email-keying permet de "
    "résister aux ré-inscriptions Clerk et de garder une seule source de vérité par utilisateur."))

story.extend(prompt(8, "Backend", "CRUD utilisateur & journalisation nutritionnelle",
    "Étends <code>lib/firebase.ts</code> avec les fonctions suivantes : "
    "<code>saveUserToFirestore(email, clerkId, profileData)</code> qui crée ou merge un document "
    "<code>users/{emailDocId}</code> ; <code>getUserProfile(email)</code> qui retourne "
    "<code>UserProfile | null</code> ; <code>addNutritionLog(email, log)</code> qui écrit dans "
    "la sous-collection <code>users/{docId}/logs</code> avec un <code>serverTimestamp</code> ; "
    "<code>getNutritionLogs(email, date)</code> qui query par date locale YYYY-MM-DD ; "
    "<code>deleteNutritionLog(email, logId)</code> ; et <code>updateWeight(email, kg)</code> qui "
    "écrit dans <code>weight_history</code>. Chaque fonction inclut un try/catch et log les erreurs."))

story.extend(prompt(9, "Backend", "Interfaces TypeScript du modèle de données",
    "Déclare dans <code>lib/firebase.ts</code> les interfaces TypeScript suivantes avec tous "
    "leurs champs optionnels bien typés. <code>UserProfile</code> : email, firstName, lastName, "
    "imageUrl, onboarded, gender, goal, workoutFrequency, birthdate, height {feet, inches}, "
    "weight, nutritionalPlan {dailyCalories, proteins, carbs, fats, waterIntake, advice: string[]}, "
    "language ('en'|'fr'|'ar'), pushToken, preferences, createdAt, updatedAt. "
    "<code>NutritionLog</code> : id, email, type ('meal'|'activity'|'water'), name, calories, "
    "protein, carbs, fat, serving, intensity, duration, date, timestamp. Exporte toutes les "
    "interfaces pour réutilisation à travers l'app."))

story.extend(prompt(10, "Backend", "Règles de sécurité Firestore",
    "Rédige le fichier <code>firestore.rules</code> qui sécurise l'accès aux collections. "
    "<code>users/{docId}/**</code> : lecture et écriture autorisées uniquement si "
    "<code>request.auth.token.email == resource.data.email</code>, avec une exception pour la "
    "création initiale (<code>create</code>) où <code>request.auth.token.email == "
    "request.resource.data.email</code>. <code>translations_cache/**</code> : lecture publique "
    "pour partage entre utilisateurs, écriture réservée aux utilisateurs authentifiés. "
    "Ajoute la validation des champs obligatoires (email, type, date pour les logs) et teste "
    "avec l'émulateur Firestore avant déploiement."))

story.extend(prompt(11, "Cache", "Miroir AsyncStorage pour mode offline",
    "Crée <code>lib/LocalDataStore.ts</code> qui maintient un miroir AsyncStorage de toutes les "
    "collections Firestore de l'utilisateur. Implémente <code>syncAllUserData(email)</code> qui "
    "télécharge profile, logs (30 derniers jours), weight_history, notifications et insights "
    "puis les persiste sous les clés <code>profile_{docId}</code>, <code>logs_{docId}</code>, "
    "etc. Ajoute <code>updateLocalCollection(docId, key, data)</code> pour les mises à jour "
    "partielles et <code>readLocalCollection(docId, key)</code> pour la lecture à froid. "
    "Implémente une queue de mutations offline qui se rejoue automatiquement à la reconnexion."))

story.append(PageBreak())

# ═══ PARTIE III : AUTH ═════════════════════════════════════════════════════
story.append(p("Partie III — Authentification & onboarding", h1))

story.extend(prompt(12, "Auth", "Intégration Clerk (email/password + Google OAuth)",
    "Installe <code>@clerk/clerk-expo</code> v2.19+ et configure le <code>ClerkProvider</code> "
    "dans <code>app/_layout.tsx</code> avec <code>tokenCache</code> basé sur Expo SecureStore. "
    "Crée les écrans <code>app/(auth)/sign-in.tsx</code> et <code>app/(auth)/sign-up.tsx</code> "
    "avec formulaires email/password validés côté client, plus un bouton Google SSO qui "
    "déclenche <code>useOAuth({ strategy: 'oauth_google' })</code>. Configure le warm browser "
    "pour une UX fluide et gère le callback via <code>app/oauth-callback.tsx</code>. "
    "À la connexion réussie, appelle <code>saveUserToFirestore</code> pour créer le document user."))

story.extend(prompt(13, "Auth", "Routing conditionnel selon l'état de session",
    "Dans <code>app/_layout.tsx</code>, implémente une state machine de routing qui réagit à "
    "<code>useAuth()</code> de Clerk. Si <code>!isLoaded</code>, affiche un splash screen. Si "
    "<code>!isSignedIn</code>, redirige vers <code>/welcome</code>. Si signé mais "
    "<code>!profile.onboarded</code>, redirige vers <code>/(onboarding)</code>. Sinon vers "
    "<code>/(tabs)</code>. Utilise un flag optimiste <code>onboarded_{userId}</code> en "
    "AsyncStorage pour accélérer le splash bypass au cold start (éviter le flicker). "
    "Gère proprement le deep-linking OAuth et les cas d'erreur réseau pendant le chargement."))

story.extend(prompt(14, "Onboarding", "Wizard 5 étapes personnalisation utilisateur",
    "Crée <code>app/(onboarding)/index.tsx</code>, un wizard en 5 étapes avec barre de "
    "progression animée (Reanimated). Étape 1 : genre (male/female) avec grandes cartes "
    "visuelles. Étape 2 : goal (lose/gain/maintain weight) avec icônes explicites. Étape 3 : "
    "fréquence d'entraînement (sedentary/light/moderate/vigorous). Étape 4 : date de naissance "
    "avec trois pickers (jour, mois, année) et validation (âge minimum 13, pas de date future). "
    "Étape 5 : taille (feet/inches) et poids (kg) avec sliders ergonomiques. Chaque étape "
    "sauvegarde localement et permet la navigation arrière sans perte de données."))

story.extend(prompt(15, "Onboarding", "Génération du plan nutritionnel par IA Gemini",
    "Crée <code>app/(onboarding)/results.tsx</code> qui, à l'arrivée de l'étape 5, envoie le "
    "profil complet à Gemini 2.5-flash via <code>generateNutritionalPlan(profile)</code> dans "
    "<code>lib/AiModel.ts</code>. Le prompt Gemini calcule le BMR avec la formule Mifflin-St Jeor, "
    "applique le facteur d'activité, ajuste selon le goal, et renvoie un JSON "
    "<code>{dailyCalories, proteins, carbs, fats, waterIntake, advice[]}</code>. Implémente un "
    "fallback offline déterministe qui calcule les mêmes valeurs localement si Gemini échoue "
    "(quota, timeout, JSON malformé). Affiche une animation de chargement et un résumé du plan "
    "avant de marquer <code>onboarded: true</code> et rediriger vers le home."))

story.append(PageBreak())

# ═══ PARTIE IV : FEATURES MÉTIER ═══════════════════════════════════════════
story.append(p("Partie IV — Features métier (nutrition & IA)", h1))

story.extend(prompt(16, "Feature", "Dashboard Home avec anneaux de progression",
    "Crée <code>app/(tabs)/index.tsx</code>, le dashboard principal. Il consomme "
    "<code>useNutritionData(selectedDate)</code> qui retourne <code>{profile, logs, consumed, "
    "burned, water, loading}</code>. Affiche : <code>HomeHeader</code> (salutation + avatar + "
    "date picker), <code>CaloriesCard</code> (anneau circulaire des calories consommées vs "
    "goal), <code>WaterIntakeCard</code> (anneau d'hydratation), <code>RemainingCaloriesCard</code> "
    "(kcal restantes avec couleur dynamique vert/jaune/rouge selon seuil), et "
    "<code>ActivityList</code> (FlatList des logs du jour avec swipe-to-delete). Intègre un "
    "<code>WeekCalendar</code> horizontal permettant de naviguer sur les 7 derniers jours."))

story.extend(prompt(17, "Feature", "LoggingContext pour state management global",
    "Crée <code>lib/LoggingContext.tsx</code>, un Context React qui expose <code>{selectedDate, "
    "setSelectedDate, logModalOpen, actionMenuOpen, refreshCount, triggerRefresh, "
    "capturedImageBase64, setCapturedImage}</code>. Il sert de bus entre les écrans modaux "
    "(scan, recherche food, add water) et le dashboard. Le <code>refreshCount</code> est "
    "incrémenté à chaque mutation réussie pour invalider les caches des hooks qui l'observent. "
    "L'image base64 capturée est stockée ici plutôt qu'en URL params pour éviter la sérialisation "
    "et supporter les gros payloads. Wrap l'app dans ce provider au niveau root."))

story.extend(prompt(18, "Feature", "ActionMenu bottom sheet avec 4 méthodes de logging",
    "Crée <code>components/ActionMenu.tsx</code>, un bottom sheet modal ouvert via le FAB. "
    "Il présente 4 grandes actions : <b>Scan Food</b> (ouvre un sélecteur caméra/galerie via "
    "<code>expo-image-picker</code>, demande les permissions, compresse l'image, stocke le "
    "base64 dans <code>LoggingContext</code>, navigue vers <code>/scan-analysis</code>) ; "
    "<b>Food Database</b> (navigue vers <code>/food-database</code>) ; <b>Exercise</b> (navigue "
    "vers <code>/log-exercise</code>) ; <b>Water</b> (navigue vers <code>/add-water</code>). "
    "Le sheet utilise Reanimated pour l'animation d'entrée/sortie et ferme sur tap backdrop."))

story.extend(prompt(19, "Feature", "Scan alimentaire par Gemini Vision",
    "Crée <code>app/scan-analysis.tsx</code> qui récupère <code>capturedImageBase64</code> du "
    "<code>LoggingContext</code> et l'envoie à Gemini Vision via un prompt structuré demandant "
    "d'identifier le plat, d'estimer la taille de portion, et de retourner un JSON strict "
    "<code>{name, calories, protein, carbs, fat, serving}</code>. Affiche un stepper de "
    "progression pendant l'appel (Uploading → Analyzing → Parsing). Valide la réponse "
    "field-by-field et permet à l'utilisateur d'ajuster la portion via un slider avant de "
    "confirmer. Au tap sur « Log Meal », appelle <code>addNutritionLog</code> puis "
    "<code>markInsightsStale</code> pour invalider les analytics, et ferme l'écran."))

story.extend(prompt(20, "Feature", "Recherche FatSecret avec OAuth2 & debounce",
    "Crée <code>lib/fatsecret.ts</code> qui gère l'OAuth2 client-credentials avec FatSecret API "
    "v2 : <code>getAccessToken()</code> récupère un token, le cache en AsyncStorage avec son "
    "expiration, et le refresh automatiquement. <code>searchFoods(query)</code> appelle l'endpoint "
    "<code>/foods/search/v3</code> et retourne un tableau normalisé. Crée ensuite "
    "<code>app/food-database.tsx</code> avec un TextInput debouncé à 500 ms, un état loading, "
    "et une FlatList de résultats. Au tap, navigue vers <code>/log-food-details</code> en "
    "passant l'aliment sélectionné en paramètre sérialisé."))

story.extend(prompt(21, "Feature", "Ajustement de portion avec recalcul proportionnel",
    "Crée <code>app/log-food-details.tsx</code> qui reçoit un aliment (nom, calories, macros, "
    "serving de base) et permet à l'utilisateur d'ajuster la quantité. Affiche un input "
    "numérique et/ou un stepper +/- pour multiplier la portion (0.5x, 1x, 1.5x, 2x, custom). "
    "Recalcule en temps réel les calories et les 3 macros (protein, carbs, fat) "
    "proportionnellement. Affiche un résumé visuel avant confirmation. Au tap sur "
    "« Log Meal », écrit le log via <code>addNutritionLog</code>, déclenche "
    "<code>triggerRefresh()</code> du context, et retourne au home. Gère les cas d'erreur "
    "(input non numérique, quantité négative, valeurs extrêmes)."))

story.extend(prompt(22, "Feature", "Logging manuel de repas & d'activités",
    "Crée <code>components/LogModal.tsx</code>, un modal léger accessible depuis le home pour "
    "le logging rapide sans quitter le dashboard. Il propose un toggle entre trois modes : "
    "meal, activity, water. En mode meal : champs name, calories, protein, carbs, fat "
    "(tous optionnels sauf name et calories). En mode activity : name, calories burned, "
    "intensity (low/medium/high), duration. En mode water : sélecteur ml (125/250/500/750/1000). "
    "Validation côté client des champs obligatoires, prévention du double-tap sur submit, "
    "et feedback haptique (expo-haptics) à la confirmation pour l'UX."))

story.extend(prompt(23, "Feature", "Écran dédié d'exercice avec presets",
    "Crée <code>app/log-exercise.tsx</code> qui présente une liste de presets d'activités "
    "(Running, Weight Lifting, Walking, Cycling, HIIT, Yoga) avec icônes Lucide. Au tap sur un "
    "preset, navigue vers <code>/workout-details</code> qui permet de paramétrer durée "
    "(minutes) et intensité. La formule d'estimation de calories brûlées prend en compte le "
    "poids de l'utilisateur (issu du profile), le MET de l'activité, et la durée. Après "
    "validation, navigue vers <code>/workout-result</code> qui affiche un résumé motivant "
    "(« Great job! You burned X calories ») avant de retourner au home avec log persisté."))

story.extend(prompt(24, "Feature", "Tracking d'hydratation avec UI glass picker",
    "Crée <code>app/add-water.tsx</code> avec une UI de type « glass picker » : un grand verre "
    "animé qui se remplit visuellement selon le volume sélectionné (images empty/half/full). "
    "Boutons + et − pour incrémenter/décrémenter de 125 ml (half-glass). Limite maximale de "
    "1000 ml par session (4 verres pleins), bouton + désactivé à la limite. Limite minimale "
    "de 0 ml, bouton − désactivé à 0. À la confirmation, appelle <code>addNutritionLog</code> "
    "avec <code>type: 'water'</code> et <code>calories: waterMl</code> (convention : le champ "
    "calories stocke les ml pour les logs de type water)."))

story.extend(prompt(25, "Feature", "Édition des goals nutritionnels",
    "Crée <code>app/personal-details.tsx</code> accessible depuis le profile. Il affiche le "
    "<code>nutritionalPlan</code> courant (dailyCalories, proteins, carbs, fats, waterIntake) "
    "sous forme de champs numériques éditables. Permet à l'utilisateur de remplacer les "
    "valeurs générées par Gemini par des goals personnels. À la sauvegarde, merge dans le "
    "document users via <code>updateUserProfile</code> et propage via <code>triggerRefresh()</code> "
    "pour que le home affiche immédiatement les nouveaux seuils. Ajoute un bouton « Reset to "
    "AI-generated » qui restaure le plan initial. Gère la validation : valeurs positives, "
    "somme des macros cohérente avec le total calorique."))

story.extend(prompt(26, "Feature", "Tracking du poids corporel",
    "Crée <code>app/update-weight.tsx</code> qui permet de logger le poids courant (kg). "
    "L'écran affiche le dernier poids enregistré, un input avec stepper 0.1 kg, et un bouton "
    "« Save ». À la confirmation, écrit dans <code>users/{docId}/weight_history</code> avec "
    "la date du jour et le timestamp, et met à jour le champ <code>weight</code> sur le "
    "document user principal (dernière valeur connue). Expose également "
    "<code>getWeightHistory(email, days)</code> dans <code>lib/firebase.ts</code> pour "
    "alimenter un LineChart de tendance dans l'écran Analytics."))

story.extend(prompt(27, "Feature", "Swipe-to-delete & édition inline des logs",
    "Étends <code>components/ActivityList.tsx</code> pour supporter le swipe horizontal "
    "(react-native-gesture-handler) qui révèle un bouton « Delete » rouge. Au tap delete, "
    "confirmation via Alert natif, puis <code>deleteNutritionLog(email, logId)</code> et "
    "<code>triggerRefresh()</code>. Ajoute aussi le tap court sur un log qui ouvre un modal "
    "d'édition avec les champs pré-remplis. À la sauvegarde, appelle <code>updateDoc</code> "
    "sur le log et flippe le flag stale des insights via <code>markInsightsStale</code>. "
    "Gère proprement les états d'erreur (permission denied, réseau coupé) avec toast UI."))

story.extend(prompt(28, "Feature", "Navigation entre dates & retour à aujourd'hui",
    "Étends <code>HomeHeader</code> pour inclure un <code>DateTimePicker</code> natif iOS/Android "
    "qui permet de naviguer vers n'importe quelle date passée (blocage futur). Ajoute un bouton "
    "flottant « Today » qui apparaît dès que <code>selectedDate</code> n'est pas aujourd'hui et "
    "remet la sélection sur today au tap. Synchronise <code>selectedDate</code> avec "
    "<code>LoggingContext</code> pour que tous les écrans (add-water, log-exercise, etc.) "
    "loggent automatiquement sur la date sélectionnée. Gère le changement minuit (passage "
    "23:59 → 00:00) en détectant le rollover et en resetant sur le nouveau jour."))

story.append(PageBreak())

# ═══ PARTIE V : ANALYTICS ═══════════════════════════════════════════════════
story.append(p("Partie V — Analytics & insights IA", h1))

story.extend(prompt(29, "Analytics", "Hook useAnalyticsData avec cache-first",
    "Crée <code>hooks/useAnalyticsData.ts</code> qui, pour un email et un scope ('week'|'month'|"
    "'all'), calcule les bornes de dates, query <code>users/{docId}/logs</code> et agrège par "
    "jour : consumed (somme kcal des meals), burned (somme kcal des activities), water (somme "
    "ml). Retourne <code>{dates[], consumed[], burned[], water[], loading, error}</code>. "
    "Implémente une stratégie cache-first : lecture instantanée depuis AsyncStorage sous la "
    "clé <code>analytics_{docId}_{scope}</code>, puis re-fetch en background et diff pour "
    "détecter les changements. Invalide le cache quand <code>refreshCount</code> change."))

story.extend(prompt(30, "Analytics", "InsightsService avec TTL 7 jours & stale flag",
    "Crée <code>lib/InsightsService.ts</code> qui orchestre les insights IA scopés par période. "
    "Implémente <code>buildPeriodKey(scope)</code> pour générer des clés déterministes "
    "(week_YYYY-Www via ISO week, month_YYYY-MM, all_time). Expose <code>getInsights({email, "
    "scope, profile, logs, force, onCacheHit})</code> qui lit d'abord AsyncStorage (paint "
    "immédiat via onCacheHit), puis compare avec Firestore, puis régénère via Gemini si "
    "nécessaire. Implémente <code>markInsightsStale(email)</code> qui flippe <code>stale: true</code> "
    "sur week + month + all_time docs lors de chaque nouveau log. TTL dur à 7 jours via "
    "<code>insights_synced_{docId}</code>."))

story.extend(prompt(31, "Analytics", "Génération Gemini multilingue en un seul appel",
    "Dans <code>lib/AiModel.ts</code>, crée <code>generateMultilangBentoInsights(profile, logs, "
    "periodLabel)</code> qui construit un prompt Gemini 2.5-flash demandant de retourner un JSON "
    "unique contenant les 3 langues simultanément : <code>{healthScore, en: {summary, topFood, "
    "hydrationStatus, recommendation, exerciseAnalysis}, fr: {...}, ar: {...}}</code>. Cette "
    "approche divise par 3 le nombre d'appels IA et garantit la cohérence des chiffres entre "
    "langues. Ajoute une validation field-by-field : si un champ est vide dans une langue, "
    "patche-le depuis <code>buildOfflineMultilangInsight</code> qui calcule les mêmes valeurs "
    "à partir des logs réels. Tag <code>source: 'ai'</code> ou <code>'computed'</code>."))

story.extend(prompt(32, "Analytics", "Écran Analytics avec Bento cards & charts",
    "Crée <code>app/(tabs)/analytics.tsx</code> avec un toggle en haut (Week / Month / All Time). "
    "Affiche un BarChart hebdo (react-native-chart-kit) avec deux séries : consumed (barres "
    "vertes) et burned (barres oranges), plus une ligne horizontale pour le goal calorique. "
    "En dessous, une grille Bento 2×3 présentant le healthScore (grand), summary, topFood, "
    "hydrationStatus, recommendation, exerciseAnalysis. Chaque card consomme "
    "<code>pickLang(storedInsight, currentLang)</code> pour afficher le texte localisé sans "
    "appel Gemini supplémentaire au changement de langue. Ajoute un compteur de streak animé "
    "et un LineChart de tendance de poids si l'historique existe."))

story.append(PageBreak())

# ═══ PARTIE VI : i18n & THÈME ══════════════════════════════════════════════
story.append(p("Partie VI — i18n, thème & UX transversale", h1))

story.extend(prompt(33, "i18n", "Provider i18n avec dictionnaire EN/FR/AR",
    "Crée <code>lib/i18n.tsx</code>, un Context React qui expose <code>{lang, setLang, t, isRTL, "
    "dictionary}</code>. Le dictionnaire statique contient 500+ clés organisées en namespaces "
    "(common, auth, onboarding, home, meal, activity, water, analytics, profile, notifications, "
    "errors). Chaque clé a sa valeur en EN, FR, AR. La fonction <code>t(key, params?)</code> "
    "récupère la traduction et supporte les placeholders <code>{{name}}</code>. Persiste le "
    "choix en AsyncStorage et synchronise <code>I18nManager.forceRTL(isRTL)</code> pour l'arabe. "
    "Ajoute un hook utilitaire <code>useI18n()</code> qui retourne le context."))

story.extend(prompt(34, "i18n", "Traduction runtime à 4 couches de cache",
    "Crée <code>lib/translator.ts</code> qui expose <code>translate(text, targetLang, "
    "localLookup?)</code>. Stratégie en 4 couches (cheap → expensive) : "
    "(1) dictionnaire local i18n via <code>localLookup</code> si fourni ; "
    "(2) AsyncStorage cache sous <code>tx_{djb2Hash(lang:text)}</code> ; "
    "(3) Firestore cache partagé <code>translations_cache/{hash}</code> (write-through) ; "
    "(4) fallback Gemini 2.5-flash avec prompt « Translate … return ONLY the translation ». "
    "À chaque hit distant, write-through les couches supérieures. Utilisé pour traduire "
    "dynamiquement les noms d'aliments FatSecret et les résumés Gemini en cas de fallback."))

story.extend(prompt(35, "UX", "Sélecteur de langue dans la top bar & préférences",
    "Étends <code>ScreenTopBar</code> avec un IconButton « Globe » qui ouvre un petit popover "
    "listant les 3 langues disponibles (🇬🇧 English, 🇫🇷 Français, 🇸🇦 العربية) avec un "
    "checkmark sur la langue active. Au tap, appelle <code>setLang</code> et recharge "
    "l'application via <code>Updates.reloadAsync()</code> si un toggle RTL est nécessaire "
    "(EN/FR → AR ou inverse). Duplique l'option dans <code>app/preferences.tsx</code> pour les "
    "utilisateurs qui ne pensent pas à chercher dans la top bar. Persiste également la langue "
    "sur le document user Firestore pour la retrouver au login sur un nouvel appareil."))

story.extend(prompt(36, "UX", "Gestion complète du RTL pour l'arabe",
    "Audite toute l'application pour le support RTL. Remplace tous les "
    "<code>marginLeft/marginRight</code> par <code>marginStart/marginEnd</code>, "
    "<code>paddingLeft/paddingRight</code> par <code>paddingStart/paddingEnd</code>, et "
    "<code>textAlign: 'left'</code> par <code>'auto'</code>. Inverse automatiquement les icônes "
    "directionnelles (ChevronLeft/Right, back arrows) via <code>{ transform: [{ scaleX: isRTL "
    "? -1 : 1 }] }</code>. Teste les FlatList horizontales (week calendar), les bottom sheets "
    "(ActionMenu), les charts (labels d'axe), et les formulaires (onboarding). Ajoute un test "
    "manuel QA dédié RTL dans la checklist de release."))

story.append(PageBreak())

# ═══ PARTIE VII : INTÉGRATIONS TIERCES ═════════════════════════════════════
story.append(p("Partie VII — Intégrations tierces & monétisation", h1))

story.extend(prompt(37, "Intégration", "Expo Notifications & rappels programmés",
    "Crée <code>lib/NotificationService.ts</code>. Implémente <code>registerForPushNotifications()</code> "
    "qui demande les permissions, récupère l'<code>expoPushToken</code> via "
    "<code>Notifications.getExpoPushTokenAsync</code> (skip sur Expo Go / simulateur), et le "
    "persiste sur le document user Firestore. Configure un canal Android <code>'default'</code> "
    "avec priorité HIGH et vibration. Crée <code>scheduleMealReminders()</code> qui programme 4 "
    "rappels quotidiens : Breakfast 8h, Lunch 13h, Dinner 19h, Encouragement 11h. "
    "Les messages sont traduits dans la langue de l'utilisateur via <code>translate()</code> et "
    "peuvent être personnalisés via un document admin Firestore."))

story.extend(prompt(38, "Intégration", "Historique des notifications & écran dédié",
    "Étends <code>NotificationService</code> avec un listener "
    "<code>Notifications.addNotificationReceivedListener</code> qui appelle "
    "<code>saveNotificationToHistory(email, {title, body, timestamp})</code>. Cette fonction "
    "écrit dans <code>users/{docId}/notifications</code> et dans AsyncStorage pour consultation "
    "offline. Crée <code>app/notifications.tsx</code> qui liste l'historique en FlatList "
    "virtualisée (50 plus récentes), avec un indicateur « read/unread » et un pull-to-refresh. "
    "Ajoute un toggle dans <code>app/preferences.tsx</code> pour activer/désactiver globalement "
    "les notifications, qui appelle <code>Notifications.cancelAllScheduledNotificationsAsync</code>."))

story.extend(prompt(39, "Monétisation", "Intégration RevenueCat pour le Premium",
    "Crée <code>lib/PurchasesService.ts</code> qui initialise le SDK "
    "<code>react-native-purchases</code> au mount de l'app avec les clés Android/iOS issues de "
    "<code>CONFIG</code>. Expose <code>isPremium()</code> qui appelle "
    "<code>Purchases.getCustomerInfo()</code> et teste "
    "<code>entitlements.active['Premium']</code>. Expose <code>showPaywall()</code> qui ouvre le "
    "paywall natif RevenueCat (configuré via le dashboard). Dans <code>app/(tabs)/profile.tsx</code>, "
    "affiche conditionnellement un bouton « Upgrade to Premium » qui appelle showPaywall. "
    "Après achat, rafraîchis le statut et débloquer les features premium (analytics all-time "
    "illimité, export CSV, coach IA étendu)."))

story.extend(prompt(40, "Intégration", "Seed data pour tests & démo investisseurs",
    "Crée <code>scripts/seed-data.ts</code> qui expose <code>seedDemoData(email)</code>. La "
    "fonction nettoie d'abord les logs du jour pour éviter les doublons, puis génère pour les "
    "11 derniers jours (aujourd'hui + 10 passés) un volume variable de meals (2 à 5), 1-2 "
    "activités, et un apport eau aléatoire. Les presets couvrent 12 meals (oatmeal, salad, "
    "pasta, smoothie…) et 6 exercices (run, lifting, yoga…). À la fin, écrit 3 documents "
    "<code>ai_insights</code> (week, month, all_time) avec du contenu riche EN/FR/AR tagué "
    "<code>source: 'ai'</code> pour que l'écran analytics soit immédiatement peuplé. "
    "Accessible depuis le bouton « Seed Demo Data » du profile."))

story.append(PageBreak())

# ═══ PARTIE VIII : TESTING & PACKAGING ═════════════════════════════════════
story.append(p("Partie VIII — Testing, packaging & déploiement", h1))

story.extend(prompt(41, "QA", "Plan de tests manuels par catégorie",
    "Rédige une checklist QA couvrant 145 scénarios de tests regroupés en 14 catégories : "
    "authentification (12), onboarding (14), dashboard (13), logging de repas 4 méthodes (24), "
    "activités (12), hydratation (8), analytics (16), multilingue (12), profile & settings (14), "
    "notifications (10), mode offline (12), cas limites (14), sécurité (10), performance (10). "
    "Chaque scénario comprend un ID, un titre, des préconditions, des étapes numérotées et un "
    "résultat attendu. La checklist doit être exécutée manuellement sur un device physique "
    "Android et iOS avant chaque release majeure, avec un focus particulier sur le RTL arabe "
    "et les flux hors-ligne."))

story.extend(prompt(42, "Build", "Configuration EAS Build pour Android & iOS",
    "Configure <code>eas.json</code> avec trois profils : <code>development</code> (APK "
    "development client), <code>preview</code> (APK distribution interne), <code>production</code> "
    "(AAB signé pour Play Store, IPA pour App Store). Configure les EAS Secrets pour toutes "
    "les variables <code>EXPO_PUBLIC_*</code> (Clerk, Gemini, Firebase ×6, RevenueCat ×2, "
    "FatSecret ×2). Ajoute le fichier <code>google-services.json</code> et "
    "<code>GoogleService-Info.plist</code> via EAS Secrets files. Définis le "
    "<code>versionCode</code> Android et le <code>buildNumber</code> iOS auto-incrémentés. "
    "Ajoute <code>eas build --profile production --platform all</code> au CI."))

story.extend(prompt(43, "Déploiement", "Checklist de release & rollout progressif",
    "Rédige une checklist de release couvrant : (1) toutes les variables d'env configurées en "
    "EAS Secrets ; (2) règles Firestore publiées et testées avec l'émulateur ; (3) Clerk "
    "configuré avec le bon redirect URI OAuth pour l'app scheme production ; (4) paywalls "
    "RevenueCat publiés sur le dashboard avec les bons entitlements ; (5) icônes adaptive "
    "Android et splash iOS configurés ; (6) versionCode/buildNumber incrémentés ; (7) les 14 "
    "catégories de tests QA exécutées sur device physique ; (8) notifications testées sur "
    "device réel (pas Expo Go) ; (9) release notes rédigées en EN/FR/AR ; (10) rollout "
    "progressif Play Store (5 % → 25 % → 100 %) avec monitoring Crashlytics."))

story.append(PageBreak())

# ═══ PARTIE IX : AMÉLIORATIONS ════════════════════════════════════════════
story.append(p("Partie IX — Améliorations du projet actuel", h1))

story.extend(prompt(44, "Refactor", "Pack d'améliorations du codebase existant",
    "Audit et refactor du codebase Salorie actuel selon les priorités suivantes. "
    "<b>(1) Dette technique</b> : découper <code>lib/firebase.ts</code> (504 lignes) en modules "
    "thématiques (<code>firebase/client.ts</code>, <code>firebase/users.ts</code>, "
    "<code>firebase/logs.ts</code>, <code>firebase/insights.ts</code>) ; extraire les types "
    "vers <code>lib/types.ts</code> pour éviter les imports circulaires. "
    "<b>(2) Invalidation cache</b> : corriger le bug connu où <code>seed-data.ts</code> écrit "
    "les insights sur Firestore sans invalider l'AsyncStorage local, ce qui cache le contenu "
    "fraîchement seedé derrière le cache précédent — ajouter "
    "<code>AsyncStorage.removeItem(cacheKey(docId, periodKey))</code> pour les 3 scopes après "
    "le seed. "
    "<b>(3) Tests automatisés</b> : introduire Jest + React Native Testing Library, viser 60 % "
    "de couverture sur <code>lib/</code> avec des tests unitaires (buildPeriodKey, "
    "emailToDocId, isEmpty, pickLang) et snapshot sur les cards principales. "
    "<b>(4) Performance</b> : mémoïser les composants lourds (<code>CaloriesCard</code>, "
    "<code>ActivityList</code>) avec <code>React.memo</code> ; remplacer les ScrollView par "
    "FlatList pour les listes &gt; 20 items. "
    "<b>(5) Accessibilité</b> : ajouter <code>accessibilityLabel</code>, "
    "<code>accessibilityRole</code> et <code>accessibilityHint</code> sur tous les boutons ; "
    "vérifier les contrastes avec une cible WCAG AA. "
    "<b>(6) i18n</b> : extraire les strings en dur restants (notifications, erreurs Gemini, "
    "toast UI) dans le dictionnaire i18n ; auditer les clés non utilisées. "
    "<b>(7) Observabilité</b> : intégrer Sentry pour le crash reporting avec sourcemaps "
    "uploadés au CI, et logger les métriques clés (durée appel Gemini, taille cache, taux de "
    "cache hit) via un wrapper <code>track(event, props)</code>. "
    "<b>(8) Sécurité</b> : ajouter des Firestore Rules de validation stricte (types, plages "
    "numériques, longueurs de string) ; rotate les clés API dans EAS Secrets. "
    "<b>(9) UX</b> : ajouter des skeletons de chargement cohérents sur home/analytics ; "
    "pull-to-refresh partout ; gestion explicite des états vides avec illustrations. "
    "<b>(10) CI/CD</b> : mettre en place GitHub Actions qui lint + typecheck + test à chaque "
    "PR, et déclenche un EAS build preview automatique sur merge vers <code>main</code>. "
    "Livrer le refactor en 10 PRs atomiques pour faciliter la review."))

story.append(PageBreak())

# ═══ PARTIE X : 19 NOUVELLES FEATURES ══════════════════════════════════════
story.append(p("Partie X — 19 nouvelles features futures", h1))
story.append(p(
    "Les 19 prompts suivants décrivent des features candidates pour la roadmap 2026-2027. "
    "Chacun est formulé comme une demande autonome prête à être priorisée en sprint planning.", body))

story.extend(prompt(45, "Feature", "Coach IA conversationnel (chatbot santé)",
    "Implémente un onglet « Coach » qui ouvre un chatbot conversationnel propulsé par Gemini "
    "2.5-flash en mode streaming. Le coach a accès aux 30 derniers jours de logs, au profile, "
    "au nutritionalPlan et à l'historique de poids pour répondre contextuellement (« Pourquoi "
    "j'ai pas perdu de poids cette semaine ? », « Que manger après mon workout ? »). "
    "Implémente un system prompt strict qui limite les sujets à la nutrition/fitness et refuse "
    "les demandes médicales (redirection vers professionnel). Stocke les conversations dans "
    "<code>users/{docId}/conversations/{convId}/messages</code> avec pagination, support du "
    "multilingue, et un disclaimer visible en permanence."))

story.extend(prompt(46, "Feature", "Scan de code-barres alimentaire",
    "Ajoute un bouton « Scan Barcode » dans l'ActionMenu qui ouvre <code>expo-camera</code> en "
    "mode scan EAN-13/UPC-A. Au scan réussi, interroge l'API Open Food Facts (gratuit, 3M+ "
    "produits) avec le code-barres pour récupérer nom, macros, image, ingrédients, Nutri-Score. "
    "En fallback, interroge FatSecret par code-barres. Pré-remplit l'écran "
    "<code>log-food-details</code> avec les données récupérées. Cache localement les 500 "
    "produits les plus récents dans AsyncStorage pour lookup offline. Ajoute une UX de "
    "feedback haptique et visuel au scan, et un cadre de guidage pour aligner le code-barres."))

story.extend(prompt(47, "Feature", "Journal d'humeur & corrélations bien-être",
    "Introduis un logging quotidien d'humeur sur une échelle de 5 (très mauvais → excellent) "
    "avec des tags contextuels (stressé, énergique, fatigué, motivé…). L'entrée se fait via un "
    "mini-modal déclenché à 20h par notification, ou manuellement depuis le home. Dans "
    "Analytics, ajoute une section « Wellness » qui corrèle via Gemini les patterns entre "
    "humeur et macros (ex. « Ton humeur est 30 % meilleure les jours où tu atteins ton goal "
    "protéines »). Respecte strictement la confidentialité : les données restent sur "
    "<code>users/{docId}/mood_logs</code> et ne sont jamais partagées ni utilisées pour "
    "l'entraînement d'un modèle tiers."))

story.extend(prompt(48, "Feature", "Plans de repas hebdomadaires générés par IA",
    "Crée une feature « Meal Plan » accessible depuis le profile. L'utilisateur configure ses "
    "préférences (végétarien, halal, sans gluten, nombre de repas/jour, budget, temps de "
    "préparation max). Gemini génère un plan sur 7 jours avec 3-5 repas/jour, chacun avec "
    "recette détaillée, liste d'ingrédients quantifiée, temps de prep, macros calculées. "
    "Sauvegarde le plan dans <code>users/{docId}/meal_plans/{planId}</code>. Ajoute un bouton "
    "« Log this meal » sur chaque recette qui pré-remplit un log nutritionnel. Export PDF du "
    "plan en 1 tap pour l'imprimer. Régénération possible si le plan ne plaît pas."))

story.extend(prompt(49, "Feature", "Liste de courses intelligente",
    "À partir d'un meal plan actif ou d'une sélection manuelle de recettes, génère "
    "automatiquement une liste de courses agrégée par catégorie (légumes, protéines, "
    "féculents, laitages, épicerie). Additionne les quantités quand un même ingrédient apparaît "
    "plusieurs fois dans la semaine. Permet de cocher les items achetés (persisté localement), "
    "d'ajouter manuellement des items libres, et de partager la liste par SMS/WhatsApp via "
    "<code>expo-sharing</code>. Bonus : intégration avec les APIs Carrefour/Instacart (selon "
    "marché) pour commander directement en ligne, avec lien deeplink vers les apps partenaires."))

story.extend(prompt(50, "Feature", "Challenges communautaires & leaderboard",
    "Introduis un système de challenges hebdomadaires/mensuels (« 30 jours sans sucre ajouté », "
    "« 10 000 pas/jour pendant 2 semaines », « 3 L d'eau/jour »). L'utilisateur s'inscrit à un "
    "challenge, ses logs alimentent automatiquement son score, et un leaderboard public (opt-in) "
    "affiche les top 100 participants avec pseudo et photo. Stockage dans "
    "<code>challenges/{challengeId}/participants/{userId}</code>. Ajoute un système de badges "
    "débloqués à la complétion. Respecte la confidentialité : l'opt-in leaderboard est "
    "explicite, les métriques individuelles ne sont jamais exposées."))

story.extend(prompt(51, "Feature", "Suivi d'objectifs SMART avec milestones",
    "Permet à l'utilisateur de définir un objectif long-terme SMART (ex. « Perdre 5 kg en 3 "
    "mois », « Tenir 150 g protéines/jour pendant 30 jours »). Le système calcule "
    "automatiquement des milestones intermédiaires et trace la trajectoire attendue vs réelle "
    "dans un LineChart. Notifications de célébration à chaque milestone atteint (25 %, 50 %, "
    "75 %, 100 %) avec animations Lottie. Gemini génère un plan d'action ajusté chaque semaine "
    "selon la progression réelle (« Tu es en retard sur ton poids, réduis de 150 kcal/jour »). "
    "Stockage dans <code>users/{docId}/goals/{goalId}</code>."))

story.extend(prompt(52, "Feature", "Export CSV/PDF & partage médical",
    "Ajoute une fonction export dans le profile : CSV de tous les logs (date, type, nom, kcal, "
    "macros), PDF de rapport mensuel avec graphiques, ou partage direct à un médecin/nutri par "
    "email avec un lien signé à expiration 7 jours. Le PDF inclut : résumé du mois, BarChart "
    "hebdomadaire, top 10 aliments, insights IA en français, historique de poids. "
    "Génération côté client via <code>expo-print</code> et partage via <code>expo-sharing</code>. "
    "Cette feature est particulièrement utile pour les utilisateurs en suivi médical (diabète, "
    "obésité) et justifie le tier Premium."))

story.extend(prompt(53, "Feature", "Intégration Apple Health & Google Fit",
    "Synchronise automatiquement les données depuis Apple HealthKit (iOS) et Google Fit "
    "(Android) via <code>react-native-health</code> et <code>react-native-google-fit</code>. "
    "Importe : pas quotidiens, distance, calories brûlées par activité, fréquence cardiaque, "
    "poids (si loggé dans ces apps), sommeil. Merge avec les logs manuels Salorie en évitant "
    "les doublons (détection par timestamp proche ± 5 min). Ajoute un toggle dans "
    "<code>preferences.tsx</code> pour activer/désactiver la sync. Respecte les permissions OS "
    "et affiche un écran de onboarding expliquant pourquoi chaque permission est demandée."))

story.extend(prompt(54, "Feature", "Mode Famille / Comptes enfants supervisés",
    "Permet à un compte parent de créer et superviser jusqu'à 4 sous-comptes enfants (goals "
    "adaptés par âge, interface simplifiée, pas d'accès au paywall). Le parent voit un "
    "dashboard consolidé de toute la famille et reçoit un rapport hebdomadaire "
    "(« Marie a bu 80 % de son goal eau cette semaine »). Stockage : "
    "<code>users/{parentDocId}/family/{childId}</code> avec règles Firestore dédiées. "
    "L'interface enfant désactive le scan caméra (privacy), les achats in-app, et les "
    "conversations IA, ne laissant que le logging manuel simplifié via grandes icônes tactiles."))

story.extend(prompt(55, "Feature", "Widget home screen iOS / Android",
    "Implémente un widget home screen qui affiche en temps réel : calories consommées / goal, "
    "anneau eau, 3 derniers repas loggés. Utilise <code>expo-widgets</code> (ou "
    "<code>react-native-widget-extension</code> pour iOS 17+) avec refresh toutes les 15 "
    "minutes. Deep link au tap pour ouvrir l'app directement sur l'action correspondante (tap "
    "sur anneau eau → /add-water). Le widget respecte le thème système (dark/light) et affiche "
    "les données de l'utilisateur actif sans requérir la session (lecture depuis AsyncStorage "
    "seulement, pas d'appel Firebase pour économiser la batterie)."))

story.extend(prompt(56, "Feature", "Reconnaissance vocale pour logging mains-libres",
    "Ajoute un bouton micro sur le home et dans l'ActionMenu qui active "
    "<code>expo-speech-recognition</code>. L'utilisateur dicte son repas (« J'ai mangé une "
    "pizza margherita et bu deux verres d'eau ») et Gemini 2.5-flash parse la transcription en "
    "logs structurés via un prompt few-shot. Affiche un écran de confirmation avec les logs "
    "détectés avant persistance. Utile en voiture, cuisine, gym. Supporte EN/FR/AR natifs des "
    "moteurs de reconnaissance. Indicateur visuel animé pendant l'écoute, feedback haptique à "
    "la fin, et fallback texte si la transcription échoue."))

story.extend(prompt(57, "Feature", "Rapports Apple Watch & wearOS",
    "Porte l'app sur Apple Watch (Swift/WatchKit via Expo extension) et Wear OS (Kotlin/"
    "Jetpack Compose). Fonctionnalités minimales : anneau de progression calories du jour, "
    "logging rapide d'eau par bouton physique, affichage des 3 derniers logs, notification de "
    "rappel. Synchronisation bidirectionnelle avec l'app mobile via WatchConnectivity / "
    "MessageClient. Les complications watchface affichent le % de goal calorique et le goal "
    "eau. Utile pour le logging rapide pendant l'entraînement sans sortir le téléphone, et "
    "donne un positionnement premium sur le marché des apps santé."))

story.extend(prompt(58, "Feature", "Mode Jeûne intermittent avec timer",
    "Implémente un mode « Fasting » dédié aux utilisateurs pratiquant le jeûne intermittent "
    "(16:8, 18:6, OMAD, 5:2). L'utilisateur choisit son protocole, le timer démarre au tap et "
    "affiche une grande UI en plein écran (heures restantes, phase métabolique avec "
    "explications vulgarisées : glycogène → cétose). Notifications à chaque phase clé. "
    "Pendant la fenêtre de jeûne, le logging de meal est bloqué (seul l'eau est autorisée). "
    "Historique des jeûnes dans <code>users/{docId}/fasts</code> avec analytics dédiées "
    "(durée moyenne, taux de complétion, corrélation avec poids). Respecte les disclaimers "
    "médicaux."))

story.extend(prompt(59, "Feature", "Gamification avec XP, niveaux & avatars",
    "Transforme l'engagement en expérience ludique. Chaque action logge donne des XP "
    "(meal = 10 XP, activity = 25 XP, water goal atteint = 50 XP, streak 7j = 200 XP). "
    "L'utilisateur monte en niveau (1-100) avec débloquage progressif d'avatars, skins "
    "d'anneaux, thèmes de carte exclusifs. Leaderboard amis optionnel. Stockage : "
    "<code>users/{docId}/gamification</code> avec <code>{xp, level, unlockedItems[], "
    "currentAvatar}</code>. Attention à ne pas encourager les comportements malsains "
    "(sur-logging pour XP) : cap quotidien d'XP, pas d'incitation à dépasser les goals "
    "caloriques. Side project : prévoir une modération des contenus communautaires."))

story.extend(prompt(60, "Feature", "Assistant shopping avec scan de ticket de caisse",
    "Ajoute une feature « Scan Receipt » qui capture un ticket de caisse (photo), l'envoie à "
    "Gemini Vision avec un prompt OCR spécialisé qui extrait la liste des produits alimentaires, "
    "puis matche chaque ligne avec Open Food Facts ou FatSecret pour récupérer les macros. "
    "Présente un écran d'édition où l'utilisateur peut corriger les erreurs OCR, ajuster les "
    "quantités, et sélectionner les items à pré-charger dans son inventaire "
    "(<code>users/{docId}/pantry</code>). Le pantry alimente ensuite les suggestions du meal "
    "planner (« Tu as déjà des lentilles, voici 3 recettes pour les utiliser »)."))

story.extend(prompt(61, "Feature", "Mode grossesse & allaitement personnalisé",
    "Ajoute un mode spécialisé activable dans le profile pour les utilisatrices enceintes ou "
    "allaitantes. Les goals caloriques sont recalculés (+340 kcal au T2, +452 kcal au T3, "
    "+500 kcal en allaitement) et les recommandations Gemini intègrent les besoins spécifiques "
    "(folates, fer, calcium, oméga-3, iode). Affiche des alertes sur les aliments à éviter "
    "(alcool, fromages au lait cru, poissons à haute teneur en mercure, charcuterie crue) avec "
    "explications pédagogiques. Respecte strictement les disclaimers : les recommandations ne "
    "remplacent jamais un suivi médical prénatal, affiché en bannière permanente."))

story.extend(prompt(62, "Feature", "Traduction IA des recettes utilisateur",
    "Permet à l'utilisateur de coller une URL de recette (blog, Marmiton, AllRecipes…) ou un "
    "texte libre, et l'app : (1) scrape / parse le contenu via Gemini, (2) le traduit dans les "
    "3 langues supportées, (3) calcule les macros à partir des ingrédients, (4) sauvegarde "
    "dans <code>users/{docId}/saved_recipes</code>. L'utilisateur peut ensuite logger la "
    "recette en 1 tap sur plusieurs jours. Cache les recettes les plus populaires dans une "
    "collection globale <code>public_recipes</code> pour accélérer les requêtes répétées "
    "d'autres utilisateurs (respect RGPD : pas de données personnelles partagées, seulement "
    "le contenu public de la recette)."))

story.extend(prompt(63, "Feature", "Mode Médical avec export vers dossier santé",
    "Introduis un mode « Medical » destiné aux utilisateurs en suivi clinique (diabète type 1/2, "
    "maladies rénales, troubles du comportement alimentaire encadrés). Il ajoute des champs de "
    "logging étendus : glycémie avant/après repas, tension artérielle, médicaments pris, "
    "symptômes digestifs. Génère un rapport PDF mensuel compatible IHE PCC "
    "(profil médical standardisé) exportable vers Apple Health Records et Google Health "
    "Connect. Chiffrement end-to-end des données médicales avec clé dérivée du PIN utilisateur "
    "(jamais stockée en clair côté serveur). Certification HIPAA/RGPD santé requise avant "
    "publication dans les stores sur ce mode."))

story.append(Spacer(1, 0.8 * cm))
story.append(p("— Fin du catalogue de prompts Salorie —", meta))
story.append(p("63 prompts au total : 43 de développement + 1 d'améliorations + 19 de nouvelles features", meta))

# ═══ BUILD ═════════════════════════════════════════════════════════════════
doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=2 * cm, rightMargin=2 * cm,
    topMargin=2 * cm, bottomMargin=2 * cm,
    title="Salorie — Catalogue de Prompts de Développement",
    author="Documentation Technique",
)
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
print(f"OK -> {OUT}")
print(f"Size: {os.path.getsize(OUT)/1024:.1f} KB")

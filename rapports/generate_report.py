"""Generate Salorie technical PDF report."""
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle,
)
from reportlab.lib.enums import TA_JUSTIFY

OUT = r"C:\Users\21266\Desktop\sdk52\salorie\salorie\rapports\SALORIE_RAPPORT_TECHNIQUE.pdf"

doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=2*cm, bottomMargin=2*cm,
    title="Salorie - Rapport Technique",
    author="Salorie Engineering",
)

styles = getSampleStyleSheet()
ST_TITLE = ParagraphStyle('T', parent=styles['Title'], fontSize=26, textColor=colors.HexColor('#1B5E20'), spaceAfter=18)
ST_H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=18, textColor=colors.HexColor('#1B5E20'), spaceBefore=14, spaceAfter=8)
ST_H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=14, textColor=colors.HexColor('#2E7D32'), spaceBefore=10, spaceAfter=6)
ST_H3 = ParagraphStyle('H3', parent=styles['Heading3'], fontSize=12, textColor=colors.HexColor('#388E3C'), spaceBefore=8, spaceAfter=4)
ST_P = ParagraphStyle('P', parent=styles['BodyText'], fontSize=10, leading=14, alignment=TA_JUSTIFY, spaceAfter=6)
ST_CODE = ParagraphStyle('C', parent=styles['Code'], fontSize=8, leading=10, backColor=colors.HexColor('#F5F5F5'), borderPadding=6, leftIndent=6, rightIndent=6, spaceAfter=6)
ST_LI = ParagraphStyle('LI', parent=ST_P, leftIndent=14, bulletIndent=4, spaceAfter=2)

story = []

def h1(t): story.append(Paragraph(t, ST_H1))
def h2(t): story.append(Paragraph(t, ST_H2))
def h3(t): story.append(Paragraph(t, ST_H3))
def p(t): story.append(Paragraph(t, ST_P))
def code(t):
    safe = t.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('\n','<br/>')
    story.append(Paragraph(safe, ST_CODE))
def li(items):
    for x in items:
        story.append(Paragraph(f"&bull; {x}", ST_LI))
def sp(h=6): story.append(Spacer(1, h))
def pb(): story.append(PageBreak())

# COVER
story.append(Spacer(1, 5*cm))
story.append(Paragraph("SALORIE", ST_TITLE))
story.append(Paragraph("Rapport Technique Complet", ParagraphStyle('s', parent=styles['Title'], fontSize=16, textColor=colors.HexColor('#555'))))
sp(24)
p("Application mobile de suivi nutritionnel et fitness")
p("React Native &middot; Expo SDK 52 &middot; Clerk &middot; Firebase &middot; Gemini AI &middot; FatSecret &middot; RevenueCat")
sp(30)
p("Date : 20 avril 2026<br/>Auteur : Equipe Salorie<br/>Contact : salistarcompany@gmail.com")
pb()

# TOC
h1("Table des matieres")
toc = [
    "1. Vue d'ensemble du projet",
    "2. Architecture generale",
    "3. Stack technique et dependances",
    "4. Structure du code (dossiers)",
    "5. Explication de chaque fichier",
    "6. Routes et navigation (Expo Router)",
    "7. Modeles de donnees Firestore",
    "8. Fonctionnalites detaillees",
    "9. Securite et authentification",
    "10. Internationalisation (i18n)",
    "11. Notifications et taches planifiees",
    "12. Intelligence artificielle (Gemini)",
    "13. Paiements et abonnements (RevenueCat)",
    "14. Scenarios de test",
    "15. Bugs connus et resolutions",
    "16. Roadmap et ameliorations futures",
]
li(toc)
pb()

# 1 OVERVIEW
h1("1. Vue d'ensemble du projet")
p("Salorie est une application mobile multi-plateforme (iOS, Android) concue pour accompagner l'utilisateur dans son parcours de sante : suivi des calories, hydratation, activites physiques, poids et generation d'insights personnalises par intelligence artificielle.")
p("L'application repose sur une architecture serverless : Clerk gere l'authentification, Firebase Firestore est la base de donnees principale, Google Gemini fournit l'IA (analyse d'image et recommandations), FatSecret fournit la base alimentaire, et RevenueCat gere les abonnements premium.")
h2("Objectifs")
li([
    "Permettre la saisie rapide des repas via photo (scan IA) ou recherche manuelle.",
    "Suivre l'eau bue, l'activite physique et le poids au jour le jour.",
    "Offrir un plan nutritionnel personnalise base sur le profil (poids, objectif, activite).",
    "Fournir des insights hebdomadaires et mensuels via Gemini.",
    "Supporter trois langues : anglais, francais, arabe.",
])

# 2 ARCH
h1("2. Architecture generale")
p("L'application suit une architecture <b>client-mobile</b> sans backend propre : toutes les interactions passent par des SDK tiers. Expo Router pilote la navigation via une structure file-based.")
h2("Couches techniques")
data = [
    ['Couche', 'Technologie', 'Role'],
    ['UI', 'React Native + Expo 52', 'Rendu des ecrans, composants'],
    ['Navigation', 'Expo Router 4', 'Routes basees sur le systeme de fichiers'],
    ['Etat local', 'React Context + AsyncStorage', 'LoggingContext, ThemeContext, i18n'],
    ['Auth', 'Clerk (@clerk/clerk-expo)', 'Sign-in email + Google SSO'],
    ['Base de donnees', 'Firebase Firestore', 'Documents utilisateurs, logs, historique'],
    ['IA', 'Google Gemini', 'Analyse photo repas, insights'],
    ['Base alimentaire', 'FatSecret Platform API', 'Recherche aliments et macros'],
    ['Paiements', 'RevenueCat', 'Abonnements premium'],
    ['Notifications', 'expo-notifications + Firestore', 'Push et historique'],
]
t = Table(data, colWidths=[3.5*cm, 5.5*cm, 8*cm])
t.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#2E7D32')),
    ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
    ('FONTSIZE',(0,0),(-1,-1),8),
    ('GRID',(0,0),(-1,-1),0.5,colors.grey),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, colors.HexColor('#F1F8E9')]),
]))
story.append(t)
sp(10)
h2("Flux de demarrage")
li([
    "L'utilisateur ouvre l'app, <code>app/index.tsx</code> affiche un splash de marque.",
    "<code>app/_layout.tsx</code> verifie le token Clerk via <code>useAuth</code>.",
    "Si token valide, lecture Firestore <code>users/{emailDocId}</code> pour verifier <code>onboarded</code>.",
    "Si onboarded, redirection vers <code>(tabs)/index</code> (dashboard).",
    "Sinon, redirection vers <code>(onboarding)/index</code>.",
    "Si pas de token, <code>welcome.tsx</code> puis <code>(auth)/sign-in</code>.",
])

# 3 STACK
h1("3. Stack technique et dependances")
deps = [
    ("@clerk/clerk-expo", "^2.19.31", "Authentification (email, Google SSO)"),
    ("firebase", "^12.12.0", "Firestore, config cloud"),
    ("@google/generative-ai", "^0.24.1", "SDK Gemini pour analyse IA"),
    ("expo", "52.0.0", "Framework mobile"),
    ("expo-router", "~4.0.0", "Navigation file-based"),
    ("expo-notifications", "~0.29.0", "Push locales et distantes"),
    ("expo-image-picker", "~16.0.0", "Prise de photo pour scan IA"),
    ("react-native-purchases", "10.0.0", "RevenueCat SDK"),
    ("react-native-chart-kit", "^6.12.0", "Graphiques analytics"),
    ("@react-native-async-storage/async-storage", "2.1.0", "Cache persistent local"),
    ("lucide-react-native", "^1.8.0", "Icones"),
    ("react-native-reanimated", "~3.16.0", "Animations performantes"),
]
data = [['Package','Version','Usage']] + list(deps)
t = Table(data, colWidths=[6*cm, 2.5*cm, 8.5*cm])
t.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#2E7D32')),
    ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTSIZE',(0,0),(-1,-1),8),
    ('GRID',(0,0),(-1,-1),0.3,colors.grey),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
]))
story.append(t)
pb()

# 4 STRUCTURE
h1("4. Structure du code")
code("""salorie/
|-- app/                         # Routes Expo Router (file-based)
|   |-- _layout.tsx              # Layout racine (auth guard, providers)
|   |-- index.tsx                # Splash de demarrage
|   |-- welcome.tsx              # Ecran d'accueil (non-connecte)
|   |-- (auth)/                  # Groupe routes authentification
|   |   |-- _layout.tsx
|   |   |-- sign-in.tsx
|   |   `-- sign-up.tsx
|   |-- (onboarding)/            # Groupe routes onboarding
|   |   |-- _layout.tsx
|   |   |-- index.tsx            # Questionnaire (genre, objectif...)
|   |   `-- results.tsx          # Plan calcule
|   |-- (tabs)/                  # Groupe tabs principal
|   |   |-- _layout.tsx
|   |   |-- index.tsx            # Dashboard (Home)
|   |   |-- analytics.tsx
|   |   `-- profile.tsx
|   |-- notifications.tsx
|   |-- personal-details.tsx
|   |-- preferences.tsx
|   |-- privacy.tsx / terms.tsx
|   |-- food-database.tsx
|   |-- log-food-details.tsx
|   |-- log-manual.tsx
|   |-- log-exercise.tsx
|   |-- add-water.tsx
|   |-- scan-analysis.tsx        # Scan photo repas
|   |-- update-weight.tsx
|   |-- workout-details.tsx
|   |-- workout-result.tsx
|   |-- feature-requests.tsx
|   `-- oauth-callback.tsx
|-- components/                  # Composants UI reutilisables
|-- lib/                         # Services et contextes
|-- constants/Colors.ts          # Palette design
|-- hooks/                       # Hooks custom
|-- assets/                      # Images, fonts
`-- scripts/                     # Scripts de build / reset""")

# 5 FILES
pb()
h1("5. Explication de chaque fichier")
files = [
    ("app/_layout.tsx", "Layout racine. Enveloppe l'application avec ClerkProvider, ThemeProvider, I18nProvider et LoggingProvider. Implemente un auth guard tri-etat (<code>AuthStatus = 'pending' | 'onboarded' | 'not-onboarded' | 'signed-out'</code>) pour eviter les flashs d'ecrans intermediaires lors de la connexion Google. Verifie Firestore pour determiner si l'utilisateur a complete l'onboarding, met en cache l'etat via AsyncStorage (<code>last_session_onboarded</code>) pour un demarrage optimiste."),
    ("app/index.tsx", "Route racine affichant le splash de marque (logo Salorie). Utilise comme point de passage pendant l'initialisation de l'auth avant redirection."),
    ("app/welcome.tsx", "Ecran d'accueil pour utilisateur non-connecte. Presente la marque et propose les boutons 'Se connecter' et 'S'inscrire'."),
    ("app/(auth)/sign-in.tsx", "Formulaire de connexion email + mot de passe via Clerk, plus bouton Google SSO via <code>useSSO</code>."),
    ("app/(auth)/sign-up.tsx", "Formulaire d'inscription email. Envoie un code de verification puis cree la session."),
    ("app/(onboarding)/index.tsx", "Questionnaire multi-etapes : genre, age, taille, poids, objectif (perte/maintien/prise), frequence d'activite. Calcule les besoins caloriques (BMR x facteur d'activite)."),
    ("app/(onboarding)/results.tsx", "Affiche le plan nutritionnel calcule (kcal/jour, macros) et l'enregistre dans Firestore avec <code>onboarded: true</code>."),
    ("app/(tabs)/index.tsx", "Dashboard principal : HomeHeader, WeekCalendar, CaloriesCard, WaterIntakeCard, ActivityList, RemainingCaloriesCard."),
    ("app/(tabs)/analytics.tsx", "Graphiques poids, calories consommees vs objectif, macros sur 7/30 jours via react-native-chart-kit."),
    ("app/(tabs)/profile.tsx", "Profil utilisateur : info, langue, theme, abonnement, parametres avances."),
    ("app/notifications.tsx", "Ecran affichant l'historique des notifications stocke dans Firestore <code>users/{docId}/notifications_history</code>. Permet le clic sur une carte pour voir les details (calories du jour, hydratation, analytics...) recuperes depuis le cache AsyncStorage."),
    ("app/personal-details.tsx", "Edition nom, email, photo, date de naissance, taille, poids."),
    ("app/preferences.tsx", "Langue (en/fr/ar), theme (light/dark/system), unites."),
    ("app/privacy.tsx et terms.tsx", "Pages legales statiques."),
    ("app/food-database.tsx", "Recherche FatSecret : liste filtree d'aliments avec macros."),
    ("app/log-food-details.tsx", "Detail aliment selectionne : portion, quantite, ajout au journal."),
    ("app/log-manual.tsx", "Saisie manuelle de repas avec macros personnalises."),
    ("app/log-exercise.tsx", "Log d'activite physique : type, duree, intensite, calories brulees."),
    ("app/add-water.tsx", "Ajout rapide d'eau (verres, bouteilles)."),
    ("app/scan-analysis.tsx", "Prise de photo via <code>expo-image-picker</code>, envoi a Gemini Vision qui renvoie une estimation nutritionnelle structuree."),
    ("app/update-weight.tsx", "Enregistre un nouveau poids dans <code>users/{docId}/weight_history</code>."),
    ("app/workout-details.tsx et workout-result.tsx", "Suivi d'un entrainement en temps reel et resultats."),
    ("app/feature-requests.tsx", "Page communautaire pour proposer et voter sur les features a venir."),
    ("app/oauth-callback.tsx", "Route de retour du flow OAuth Google."),
    ("components/HomeHeader.tsx", "Barre d'en-tete : avatar, salutation, badge de notifications non-lues (via <code>getNotificationsHistory</code>)."),
    ("components/WeekCalendar.tsx", "Calendrier hebdomadaire horizontal scrollable sur 52 semaines en arriere. Emet un evenement de changement de jour via LoggingContext."),
    ("components/CaloriesCard.tsx", "Carte ronde affichant les kcal consommees / objectif avec anneau de progression."),
    ("components/WaterIntakeCard.tsx", "Carte hydratation avec increments rapides."),
    ("components/ActivityList.tsx", "Liste des repas et activites du jour selectionne."),
    ("components/RemainingCaloriesCard.tsx", "Calories restantes selon objectif."),
    ("components/LogModal.tsx", "Bottom-sheet pour choisir le type de log (repas, eau, sport, poids)."),
    ("components/ActionMenu, ScreenBackground, ScreenTopBar, AppBrand, HalfProgress", "Composants UI utilitaires : menus, backgrounds, brand."),
    ("lib/firebase.ts", "Point central Firestore. Exporte <code>db</code>, les helpers CRUD (<code>saveUserToFirestore</code>, <code>getUserFromFirestore</code>, <code>addNutritionLog</code>, <code>addWeightLog</code>, <code>updatePushToken</code>, <code>updateUserLanguage</code>, <code>getNotificationsHistory</code>, <code>seedTestNotifications</code>, <code>saveAiInsights</code>, <code>getLatestAiInsights</code>) et les interfaces <code>UserProfile</code>, <code>NutritionLog</code>. Utilise l'email comme cle primaire via <code>emailToDocId</code>."),
    ("lib/AiModel.ts", "Wrapper Google Gemini : generation d'insights textuels, analyse d'image nutritionnelle."),
    ("lib/fatsecret.ts", "Client FatSecret : OAuth2 + recherche d'aliments."),
    ("lib/NotificationService.ts", "Initialisation expo-notifications, enregistrement du push token, handlers."),
    ("lib/PurchasesService.ts", "Initialisation RevenueCat, lecture des offres, achat et restauration."),
    ("lib/LoggingContext.tsx", "Contexte fournissant <code>selectedDate</code>, <code>logs</code>, <code>refreshLogs</code> aux ecrans du dashboard."),
    ("lib/ThemeContext.tsx", "Theme light/dark/system avec persistence AsyncStorage."),
    ("lib/i18n.tsx", "Internationalisation maison : dictionnaires en/fr/ar + <code>useTranslation</code>."),
    ("constants/Colors.ts", "Palette de couleurs design (primary, primaryLight, gray[50..900], success, error, white)."),
]
for name, desc in files:
    h3(name)
    p(desc)

# 6 ROUTES
pb()
h1("6. Routes et navigation")
p("Expo Router interprete l'arborescence de <code>app/</code> comme des routes. Les parentheses definissent des groupes logiques sans segment d'URL.")
route_data = [
    ['Route', 'Fichier', 'Description'],
    ['/', 'app/index.tsx', 'Splash branding'],
    ['/welcome', 'app/welcome.tsx', "Ecran d'accueil"],
    ['/(auth)/sign-in', 'app/(auth)/sign-in.tsx', 'Connexion'],
    ['/(auth)/sign-up', 'app/(auth)/sign-up.tsx', 'Inscription'],
    ['/(onboarding)', 'app/(onboarding)/index.tsx', 'Questionnaire'],
    ['/(onboarding)/results', 'app/(onboarding)/results.tsx', 'Plan nutritionnel calcule'],
    ['/(tabs)', 'app/(tabs)/index.tsx', 'Dashboard'],
    ['/(tabs)/analytics', 'app/(tabs)/analytics.tsx', 'Statistiques'],
    ['/(tabs)/profile', 'app/(tabs)/profile.tsx', 'Profil'],
    ['/notifications', 'app/notifications.tsx', 'Historique notifications'],
    ['/personal-details', 'app/personal-details.tsx', 'Edition profil'],
    ['/preferences', 'app/preferences.tsx', 'Preferences'],
    ['/food-database', 'app/food-database.tsx', 'Recherche aliments'],
    ['/log-food-details', 'app/log-food-details.tsx', 'Detail aliment'],
    ['/log-manual', 'app/log-manual.tsx', 'Repas manuel'],
    ['/log-exercise', 'app/log-exercise.tsx', 'Log sport'],
    ['/add-water', 'app/add-water.tsx', 'Ajout eau'],
    ['/scan-analysis', 'app/scan-analysis.tsx', 'Scan IA photo'],
    ['/update-weight', 'app/update-weight.tsx', 'Nouveau poids'],
    ['/workout-details', 'app/workout-details.tsx', 'Entrainement en cours'],
    ['/workout-result', 'app/workout-result.tsx', 'Resultats workout'],
    ['/feature-requests', 'app/feature-requests.tsx', 'Propositions communaute'],
    ['/oauth-callback', 'app/oauth-callback.tsx', 'Callback OAuth'],
    ['/privacy', 'app/privacy.tsx', 'Politique de confidentialite'],
    ['/terms', 'app/terms.tsx', "Conditions d'utilisation"],
]
t = Table(route_data, colWidths=[5*cm, 5.5*cm, 6.5*cm], repeatRows=1)
t.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#2E7D32')),
    ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTSIZE',(0,0),(-1,-1),8),
    ('GRID',(0,0),(-1,-1),0.3,colors.grey),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
    ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white, colors.HexColor('#F1F8E9')]),
]))
story.append(t)

# 7 FIRESTORE
pb()
h1("7. Modeles de donnees Firestore")
p("La base utilise <b>l'email comme cle primaire</b> des documents utilisateurs (converti via <code>emailToDocId</code> qui remplace les caracteres invalides). Cela simplifie la migration entre providers d'auth (Clerk ID -> email).")

h2("Collection: users/{emailDocId}")
code("""UserProfile {
  id: string              // Clerk user id (backward compat)
  email: string           // = document key (apres normalisation)
  firstName?: string
  lastName?: string
  imageUrl?: string
  onboarded?: boolean     // true une fois l'onboarding termine
  gender?: 'male' | 'female'
  goal?: 'lose' | 'maintain' | 'gain'
  workoutFrequency?: string
  birthdate?: string      // ISO date
  height?: { feet: number, inches: number }
  weight?: number         // kg
  nutritionalPlan?: {
    calories: number,
    protein: number, carbs: number, fat: number,
    water: number
  }
  language?: 'en' | 'fr' | 'ar'
  pushToken?: string      // Expo push token
  createdAt: Timestamp
  updatedAt: Timestamp
}""")

h2("Sous-collection: users/{docId}/logs")
code("""NutritionLog {
  id: string (auto)
  userId: string          // email (meme valeur que la cle du parent)
  type: 'meal' | 'activity' | 'water'
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  date: string            // YYYY-MM-DD (index)
  timestamp: Timestamp
  intensity?: string      // pour 'activity'
  duration?: number       // minutes
  serving?: string        // pour 'meal'
}""")

h2("Sous-collection: users/{docId}/weight_history")
code("""{
  weight: number,
  timestamp: Timestamp,
  date: string            // YYYY-MM-DD
}""")

h2("Sous-collection: users/{docId}/notifications_history")
code("""{
  id: string
  title: string
  body: string
  kind: 'calories' | 'water' | 'analytics' | 'profile' | 'custom'
  data?: object           // payload cliquable
  read: boolean
  createdAt: Timestamp
}""")

h2("Sous-collection: users/{docId}/ai_insights")
code("""{
  content: string         // markdown genere par Gemini
  period: 'weekly' | 'monthly'
  metrics: object         // metriques sources
  createdAt: Timestamp
}""")

h2("Collection: admin_config/notifications")
p("Document unique pilotant les notifications programmees envoyees a tous les utilisateurs (rappels repas, hydratation).")

h2("Collection: feature_requests/{id}")
code("""{
  title: string
  description: string
  userId: string          // email
  userName: string
  upvotes: string[]       // liste d'emails ayant vote
  status: 'open' | 'planned' | 'done'
  createdAt: Timestamp
}""")

# 8 FEATURES
pb()
h1("8. Fonctionnalites detaillees")
features = [
    ("Authentification", "Email/mot de passe + Google SSO via Clerk. Stockage securise du token via expo-secure-store. Auth guard tri-etat dans _layout.tsx empeche tout flash d'ecran intermediaire."),
    ("Onboarding adaptatif", "Questionnaire progressif calculant le BMR (Mifflin-St Jeor) x facteur d'activite, puis objectif calorique quotidien et repartition macro 40/30/30 adaptable selon l'objectif. Langue selectionnee des le debut et persistee."),
    ("Dashboard quotidien", "WeekCalendar horizontal scrollable jusqu'a 52 semaines en arriere, CaloriesCard avec anneau, WaterIntakeCard, liste d'activites filtree par jour selectionne (LoggingContext)."),
    ("Log de repas", "3 methodes : (1) photo via scan-analysis (Gemini Vision estime aliments + calories), (2) recherche FatSecret (food-database), (3) saisie manuelle (log-manual)."),
    ("Log d'activite", "log-exercise : selection type (course, velo, muscu...), duree, intensite, calcul kcal brulees via MET x poids x duree."),
    ("Suivi du poids", "update-weight enregistre dans weight_history, graphique dans analytics."),
    ("Analytics", "Graphiques poids, calories, macros sur 7/30/90 jours. Insights IA generes par Gemini sur tendances."),
    ("Notifications", "expo-notifications pour les push locales (rappels repas, eau, entrainement). Historique conserve dans Firestore, accessible depuis la cloche du HomeHeader. Badge temps reel des non-lues."),
    ("Internationalisation", "3 langues (en, fr, ar) via dictionnaire maison dans lib/i18n.tsx. Langue choisie a l'onboarding persistee sur Firestore (users.language) et AsyncStorage."),
    ("Theme", "Light / Dark / System via ThemeContext, persiste AsyncStorage."),
    ("Abonnements Premium", "RevenueCat : acces aux insights IA avances, scan illimite, export de donnees. Mur paywall via react-native-purchases-ui."),
    ("Feature Requests", "Page communautaire : les utilisateurs soumettent des idees, votent (upvote stocke comme email). Tri par popularite."),
    ("Mode hors-ligne partiel", "Cache AsyncStorage du dernier profil (<code>profile_{docId}</code>) et des dernieres notifications permettent l'affichage immediat avant hydratation Firestore."),
]
for t_, d in features:
    h3(t_); p(d)

# 9 SECURITY
pb()
h1("9. Securite et authentification")
li([
    "<b>Clerk</b> emet des JWT que l'app stocke via expo-secure-store (Keychain iOS / Keystore Android).",
    "<b>Regles Firestore</b> restreignent les lectures/ecritures : un utilisateur ne peut lire/ecrire que son propre document <code>users/{email}</code> via <code>request.auth.token.email == email</code>.",
    "<b>FatSecret</b> utilise OAuth2 client-credentials. La cle secrete ne devrait pas etre embarquee en prod (prevoir un proxy Cloud Function).",
    "<b>Gemini API key</b> meme remarque : a deplacer derriere une Cloud Function pour la prod.",
    "<b>RevenueCat</b> utilise uniquement la public API key cote client.",
    "<b>PII minimise</b> : stockage de l'email, nom, infos sante. Pas de numero de telephone ni adresse postale.",
])

# 10 I18N
h1("10. Internationalisation")
p("Mecanisme maison dans <code>lib/i18n.tsx</code>. Le contexte expose <code>t(key)</code> et <code>setLanguage(lang)</code>. Les cles suivent une convention plate par section (ex: <code>home.welcome_back</code>, <code>onboarding.gender.title</code>).")
p("A la premiere connexion, la langue detectee (Clerk locale ou selection manuelle) est persistee via <code>updateUserLanguage(email, lang)</code> dans Firestore. Aux connexions suivantes, <code>getUserFromFirestore</code> restaure automatiquement la langue.")

# 11 NOTIF
h1("11. Notifications et taches planifiees")
li([
    "<b>Push token</b> : recupere via expo-notifications au demarrage, envoye via <code>updatePushToken(email, token)</code> (setDoc merge pour eviter 'No document to update').",
    "<b>Notifications locales</b> : rappels repas/eau programmes selon les preferences de l'utilisateur.",
    "<b>Notifications distantes</b> : envoyees depuis une Cloud Function (a brancher) via l'API Expo Push.",
    "<b>Historique</b> : chaque notification recue est archivee dans <code>users/{docId}/notifications_history</code>.",
    "<b>Seed de test</b> : <code>seedTestNotifications(email)</code> injecte des notifications de demo pour l'utilisateur test <code>salistarcompany@gmail.com</code>.",
])

# 12 AI
h1("12. Intelligence artificielle (Gemini)")
p("Deux usages principaux via <code>@google/generative-ai</code> :")
li([
    "<b>Analyse photo</b> : <code>gemini-1.5-flash</code> avec vision recoit l'image + un prompt structure demandant une sortie JSON (nom plat, portions, kcal, macros).",
    "<b>Insights hebdomadaires</b> : agregation cote client des logs sur 7j, prompt textuel, resume en markdown stocke dans <code>ai_insights</code>.",
])

# 13 PAYMENTS
h1("13. Paiements et abonnements (RevenueCat)")
li([
    "Configuration via <code>Purchases.configure({ apiKey })</code> au boot.",
    "Identification de l'utilisateur avec l'email : <code>Purchases.logIn(email)</code>.",
    "Paywall affiche via <code>RevenueCatUI.presentPaywall()</code> depuis react-native-purchases-ui.",
    "Verification d'entitlement 'premium' avant d'acceder aux ecrans IA avances et au scan illimite.",
])

# 14 TESTS
pb()
h1("14. Scenarios de test")

h2("14.1 Authentification")
li([
    "T1 - Inscription email : ouvrir app, welcome, sign-up, saisir email/pwd, recevoir code, valider, onboarding.",
    "T2 - Connexion email existant onboarde : sign-in, dashboard <b>direct</b> (pas de flash gender-picker).",
    "T3 - Connexion email existant non-onboarde : sign-in, onboarding reprend a l'etape atteinte.",
    "T4 - Connexion Google utilisateur inconnu : OAuth, onboarding.",
    "T5 - Connexion Google utilisateur connu : OAuth, dashboard <b>direct</b>, aucun ecran intermediaire.",
    "T6 - Deconnexion : profile, sign out, welcome.",
    "T7 - Token expire : l'app redirige vers welcome au cold-start sans crash.",
    "T8 - Saisie mot de passe errone : message d'erreur Clerk affiche.",
])

h2("14.2 Onboarding")
li([
    "T9 - Completer toutes les etapes : genre, age, taille, poids, objectif, frequence, results affiche plan.",
    "T10 - Revenir en arriere a l'etape precedente conserve les valeurs.",
    "T11 - Quitter l'app en cours d'onboarding : a la reouverture on reprend a la meme etape.",
    "T12 - Langue : changer la langue au premier ecran propage a tous les suivants.",
])

h2("14.3 Dashboard et logs")
li([
    "T13 - Ouvrir dashboard : HomeHeader affiche nom + avatar + badge notifs non-lues.",
    "T14 - WeekCalendar : scroller vers le passe jusqu'a 52 semaines.",
    "T15 - Selectionner un jour passe : ActivityList et CaloriesCard se mettent a jour.",
    "T16 - Aucun log pour un jour : affichage 'No activities yet' ou equivalent.",
    "T17 - Jour futur : desactive (non cliquable), styles 'future' appliques.",
    "T18 - Tirer pour rafraichir, refresh depuis Firestore.",
])

h2("14.4 Log de repas")
li([
    "T19 - Scan photo : photo d'une pomme, Gemini retourne kcal ~95, sauvegarde log.",
    "T20 - Scan photo ambigu : fallback 'Unknown food', utilisateur peut editer.",
    "T21 - Pas de connexion : message 'Retry' sans crash.",
    "T22 - Recherche FatSecret 'apple' : resultats pagines, selection, detail portion, save.",
    "T23 - Saisie manuelle : valeurs negatives refusees, validation macros.",
    "T24 - Total calories dashboard se met a jour immediatement apres ajout.",
])

h2("14.5 Eau et activite")
li([
    "T25 - +250ml d'eau : WaterIntakeCard incremente.",
    "T26 - Depasser l'objectif d'eau : affichage bonus (200%).",
    "T27 - Log exercice 'run 30min', kcal calcules, ajout a ActivityList.",
    "T28 - Supprimer un log : swipe ou action menu, confirmation, disparait.",
])

h2("14.6 Poids et analytics")
li([
    "T29 - Update weight : rentrer 70kg, apparait dans weight_history.",
    "T30 - Analytics weight : graphique 30j affiche les points.",
    "T31 - Analytics calories : barres vs objectif.",
    "T32 - Changer la periode 7/30/90j : les charts se mettent a jour.",
])

h2("14.7 Notifications")
li([
    "T33 - Cloche HomeHeader : ouvrir /notifications, liste chargee depuis Firestore.",
    "T34 - Badge unread : affiche le nombre correct, cache si 0.",
    "T35 - Cliquer une carte 'calories' : modal affiche le detail du jour concerne (cache).",
    "T36 - Marquer comme lu : la notification disparait du compteur.",
    "T37 - Seed test notifications : salistarcompany@gmail.com voit des exemples au premier login.",
    "T38 - Push token : apres login, le champ pushToken est renseigne dans Firestore (setDoc merge reussit meme si le doc n'existait pas).",
])

h2("14.8 Profil et preferences")
li([
    "T39 - Changer la langue : toute l'UI bascule en temps reel, persistee en Firestore.",
    "T40 - Changer le theme : dark/light/system, persistee AsyncStorage.",
    "T41 - Edition nom/prenom/photo : propage dans Firestore + Clerk.",
    "T42 - Suppression du compte : purge Firestore + Clerk.",
])

h2("14.9 Paiements (RevenueCat)")
li([
    "T43 - Utilisateur gratuit essaie insights premium, paywall s'affiche.",
    "T44 - Achat sandbox reussit, entitlement actif immediatement.",
    "T45 - Restauration d'achat sur nouveau device.",
    "T46 - Expiration abonnement, retour au gratuit au renouvellement rate.",
])

h2("14.10 Edge cases et robustesse")
li([
    "T47 - Mode avion : ecrans avec cache s'affichent, les writes sont mis en file Firebase offline.",
    "T48 - Changement d'horloge systeme : les dates des logs restent coherentes (YYYY-MM-DD local).",
    "T49 - App tuee pendant scan IA : pas de fuite, retry propre.",
    "T50 - Rotation ecran : etats preserves.",
    "T51 - Taille police systeme grande : layouts responsive, pas de debordement.",
    "T52 - Lecteur d'ecran (TalkBack/VoiceOver) : elements principaux labellises.",
    "T53 - 1000+ logs dans un jour : scroll virtualise performe (60 FPS).",
    "T54 - Mauvais format d'email herite (ancienne version) : emailToDocId gere la migration.",
])

# 15 BUGS
pb()
h1("15. Bugs connus et resolutions")
bugs = [
    ("Flash gender-picker lors du sign-in Google utilisateur connu", "Resolu", "Introduction d'un type tri-etat AuthStatus = pending | onboarded | not-onboarded | signed-out. L'etat not-onboarded ne peut etre defini que par une confirmation Firestore explicite, jamais par une lecture d'etat obsolete."),
    ("Firestore 'No document to update' sur updatePushToken", "Resolu", "Remplacement de updateDoc par setDoc avec { merge: true } dans lib/firebase.ts, permettant la creation implicite du document si inexistant."),
    ("Calendrier ne remontait que 12 semaines", "Resolu", "pastWeeks passe de 12 a 52 dans components/WeekCalendar.tsx."),
    ("Langue non restauree a la reconnexion", "Resolu", "Ajout du champ language sur UserProfile et restauration via getUserFromFirestore au boot."),
    ("Type error sceneContainerStyle dans (tabs)/_layout.tsx", "Preexistant", "Incompatibilite mineure du type avec react-navigation/bottom-tabs v7, n'affecte pas le runtime."),
]
data = [['Bug', 'Statut', 'Resolution']] + [[b[0], b[1], b[2]] for b in bugs]
t = Table(data, colWidths=[5*cm, 2.5*cm, 9.5*cm])
t.setStyle(TableStyle([
    ('BACKGROUND',(0,0),(-1,0),colors.HexColor('#2E7D32')),
    ('TEXTCOLOR',(0,0),(-1,0),colors.white),
    ('FONTSIZE',(0,0),(-1,-1),8),
    ('GRID',(0,0),(-1,-1),0.3,colors.grey),
    ('VALIGN',(0,0),(-1,-1),'TOP'),
]))
story.append(t)

sp(12)
h1("16. Roadmap et ameliorations futures")
li([
    "Proxy Cloud Functions pour FatSecret et Gemini (protection des cles).",
    "Synchronisation Apple Health / Google Fit.",
    "Suivi du sommeil.",
    "Mode coaching IA temps reel (chat).",
    "Partage social / challenges communautaires.",
    "Export PDF des rapports de progression.",
    "Wear OS / watchOS companion apps.",
    "Detection automatique repas via camera en arriere-plan (consentement requis).",
])

sp(20)
p("<i>Fin du rapport - Salorie v1.0.0 - 2026</i>")

doc.build(story)
print("OK: " + OUT)

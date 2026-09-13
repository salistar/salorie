# Play Console — les deux formulaires, prêts à recopier

Écrit le 13/09/2026. **Chaque affirmation ci-dessous a été relevée dans le code**,
pas rédigée de mémoire : la commande qui la vérifie est donnée à chaque fois. Un
formulaire « Sécurité des données » qui ne correspond pas au binaire est un motif
de suspension, pas un détail de rédaction — et c'est le seul document de ce dépôt
qui engage juridiquement.

> ⚠️ **À RELIRE AVANT CHAQUE ENVOI.** Ces réponses décrivent le code au
> 13/09/2026. Toute nouvelle collecte — un champ de profil, un envoi vers un
> nouveau fournisseur — les périme. Le jour où vous ajoutez une donnée, revenez
> ici *avant* de publier.

---

## 1. Formulaire Health Connect (déclaration d'usage)

Google demande une déclaration séparée pour l'accès aux données de santé, avec
une vidéo ou une description du parcours utilisateur.

### Types demandés — et ils sont tous en LECTURE SEULE

| Permission | Ce qu'on en fait |
|---|---|
| `READ_STEPS` | Afficher les pas du jour et les créditer aux défis de marche. |
| `READ_ACTIVE_CALORIES_BURNED` | Déduire la dépense du bilan calorique quotidien. |
| `READ_TOTAL_CALORIES_BURNED` | Même usage, quand l'appareil ne fournit que le total. |
| `READ_WEIGHT` | Reprendre les pesées d'une balance connectée sans double saisie. |

**Aucune permission `WRITE_*` n'est demandée.** Salorie ne modifie jamais les
données de santé de l'appareil.

```bash
# Vérifier sur le binaire signé, pas sur le source :
aapt2 dump permissions salorie-prod.apk | grep health
```

### Texte de la déclaration (à coller)

> Salorie est une application de suivi nutritionnel et d'activité physique.
>
> Elle lit dans Health Connect quatre types de données, **en lecture seule** :
> les pas, les calories actives, les calories totales et le poids.
>
> **Pas et calories** servent à calculer le bilan calorique de la journée :
> l'application soustrait la dépense mesurée des apports que l'utilisateur a
> enregistrés, et affiche le solde. Sans ces données, l'utilisateur devrait
> saisir son activité à la main, ou renoncer à un bilan juste.
>
> **Le poids** est repris des pesées enregistrées par une balance connectée, afin
> que l'utilisateur ne les saisisse pas une seconde fois et que la courbe de
> progression soit continue.
>
> L'accès est demandé **au moment où l'utilisateur active le suivi d'activité**,
> après un écran qui explique quelles données sont lues et pourquoi. Refuser
> laisse l'application pleinement utilisable : l'activité se saisit alors à la
> main.
>
> Ces données **ne sont jamais revendues, ni partagées à des fins publicitaires**.
> Elles sont stockées dans le compte de l'utilisateur (Firestore) pour lui
> afficher son historique, et supprimées avec son compte.

### Parcours à montrer dans la vidéo

1. Ouvrir Salorie → onglet **Progrès**.
2. Toucher l'activation du suivi d'activité → l'écran d'explication s'affiche
   **avant** la boîte de dialogue Health Connect.
3. Accepter → les pas du jour apparaissent, et le bilan calorique se met à jour.
4. Montrer **Réglages → Confidentialité** : l'accès se révoque à tout moment.

---

## 2. Formulaire « Sécurité des données »

Il se remplit type de donnée par type de donnée. Voici ce que le code fait
réellement, relevé le 13/09/2026.

### Ce qui est collecté

| Type de donnée | Collectée | Partagée | Obligatoire | Pourquoi |
|---|---|---|---|---|
| **Adresse e-mail** | oui | non | oui | Identifiant du compte (Clerk), et clé des documents Firestore. |
| **Nom et prénom** | oui | non | non | Affichage dans l'application et dans les classements de défis. |
| **Photo de profil** | oui | non | non | Avatar, affiché aux amis et dans les défis. |
| **Date de naissance, sexe, taille, poids** | oui | non | non | Calcul du métabolisme de base et de l'objectif calorique. |
| **Informations de santé** (pas, calories, poids, **glycémie, tension**) | oui | non | non | Suivi affiché à l'utilisateur, et export « rapport médecin » qu'il déclenche lui-même. |
| **Photos** (repas, étiquettes, tickets) | oui | **oui** | non | Reconnaissance de l'aliment. Voir ci-dessous — c'est le point qui demande le plus de soin. |
| **Position précise** | oui | non | non | Mesure de la distance et du tracé pendant une course ou une marche. Lue **uniquement pendant la séance**. |
| **Enregistrements audio** | oui | **oui** | non | Journal vocal : l'audio est transcrit puis **jeté**, jamais conservé. |
| **Achats dans l'application** | oui | **oui** | non | Gestion de l'abonnement (RevenueCat). |
| **Journaux de plantage et diagnostics** | oui | **oui** | non | Sentry, pour corriger les pannes. |

### Les trois cases « partagée », en détail

C'est là que les formulaires se font refuser. Chacune correspond à un tiers
nommé, et à rien d'autre.

**Photos → fournisseurs d'IA de vision.** Une photo de repas part vers notre
serveur, qui la transmet à un modèle de vision pour l'identifier. Les
destinataires possibles sont **Cloudflare Workers AI**, **Groq**, un point de
terminaison compatible OpenAI, et un modèle **auto-hébergé sur notre serveur**
(Ollama), selon lequel répond en premier.

> ⚠️ **La photo n'est PAS conservée par nous** dans le parcours normal : elle est
> transmise, analysée, et rien n'est écrit. La **seule** exception est le
> programme d'amélioration de la reconnaissance, **désactivé par défaut** : si —
> et seulement si — l'utilisateur y consent explicitement après avoir corrigé un
> résultat, la photo corrigée est conservée sur notre serveur, avec un
> identifiant **pseudonymisé par HMAC**, jamais son adresse e-mail.
>
> ```bash
> # Le seul endroit du backend qui écrit une image sur disque :
> grep -n "writeFileSync" backend/src/ml/ml.service.ts
> # Le verrou de consentement, côté application :
> grep -n "getMLConsent" lib/mlFeedback.ts
> ```
>
> Répondre **« Oui »** à « les données sont-elles partagées » pour les photos, et
> cocher **« Traitement par un prestataire »**. Ne pas cocher « vendues ».

**Audio → transcription.** Le même chemin, pour la dictée d'un repas. L'audio
est transcrit puis jeté ; seul le texte obtenu est conservé, dans le repas que
l'utilisateur enregistre.

**Achats → RevenueCat ; plantages → Sentry.** Deux prestataires, deux usages
étroits. Sentry est configuré avec `sendDefaultPii: false` et un `beforeSend` qui
masque les valeurs connues avant l'envoi.

```bash
grep -n "sendDefaultPii\|beforeSend" app/_layout.tsx
npx jest __tests__/sentryMasquage.test.ts
```

### Les cases à cocher partout

- **Les données sont chiffrées en transit** : oui. Tout passe en HTTPS ; HSTS
  d'un an est posé sur les domaines web.
- **L'utilisateur peut demander la suppression de ses données** : oui —
  `https://salorie.com/delete-account`, et l'application propose aussi une purge
  locale.
- **Les données sont-elles vendues ?** : **non**, dans tous les cas.
- **Publicité ?** : **non**. Aucun SDK publicitaire n'est intégré.

### Ce qu'il NE faut PAS déclarer

Ces éléments existent dans le code mais **ne quittent pas l'appareil** :

- les préférences de régime (halal, végétarien, sans gluten…) et les conditions
  médicales déclarées — `AsyncStorage`, jamais synchronisées ;
- le cache local des repas et du profil (`LocalDataStore`) ;
- le quota gratuit quotidien.

```bash
grep -n "KEY" lib/dietPrefs.ts        # diet_prefs_v1 : local, et seulement local
```

---

## 3. Divulgation préalable — déjà faite dans l'application

Google exige que l'application explique **elle-même**, avant la boîte de dialogue
du système, ce qu'elle va lire. C'est en place depuis le 10/09/2026 :
`lib/divulgationPermission.ts` est la seule porte vers le micro et la position,
et `__tests__/divulgation.test.ts` refuse qu'un écran contourne.

Les textes affichés — en français, anglais et arabe — disent les trois choses
attendues : **ce qui est lu**, **pourquoi**, et **ce qu'on n'en fait pas**.

> **Micro** — « Salorie écoute ce que tu dictes pour transcrire ton repas ou ta
> question au coach. L'enregistrement part chiffré vers nos serveurs, sert
> uniquement à produire ce texte, et n'est jamais conservé ni partagé. »

> **Position** — « Salorie lit ta position pendant une course ou une marche, pour
> mesurer la distance, l'allure et le tracé du parcours. Elle n'est lue que
> pendant la séance, et jamais quand l'application est fermée. »

Fermer la boîte sans choisir vaut **refus** : Google exige une action positive, et
c'est testé.

---

## 4. Ce qui reste bloquant, et qui n'est pas dans ces formulaires

1. 🔴 **La clé RevenueCat de production.** Le workflow de release refuse de
   signer un binaire portant une clé de test — à raison, sinon le bouton
   « s'abonner » serait mort en silence. Tant qu'elle n'est pas posée, aucun
   nouveau binaire ne sort.
2. 🔴 **20 testeurs pendant 14 jours** en test fermé. Le compteur ne démarre
   qu'une fois un binaire déposé, donc après le point 1.

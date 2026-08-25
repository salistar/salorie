# Salorie — Pipeline IA & ajout de providers

## Qui répond, en vrai (mesuré le 25/08/2026)

**Cloudflare Workers AI**, `@cf/meta/llama-3.3-70b-instruct-fp8-fast` — le premier
palier de la cascade, et il est **gratuit**. 445 ms sur une question courte, 2,3 s
sur une demande de macros. L'app ne retombe donc pas en silence sur OpenAI ou
Anthropic, derniers de la liste et seuls à coûter à chaque appel.

Le service le journalise (`[AiService] texte servi par <moteur> (<ms>)`) mais
`/ai/generate` ne renvoie que `{ text }` : le nom du moteur est calculé puis jeté.
Pour le savoir depuis l'extérieur, il faut lire les journaux du conteneur.

### ⚠ Le piège de Cloudflare, et ce qu'il a coûté

`result.response` arrive **déjà analysé** quand le modèle émet du JSON : un objet,
pas une chaîne. Vérifié en interrogeant l'API directement — la même question posée
en prose rend `typeof === "string"`, posée en JSON rend `"object"`.

L'extraction faisait `String(text)`, ce qui vaut alors `[object Object]` : quinze
caractères, **non vides**, donc acceptés comme une réponse valide et journalisés
comme un succès. Toute fonctionnalité demandant du JSON — analyses hebdomadaires,
plans de repas — recevait ces quinze caractères, échouait à les analyser, et
retombait sans un mot sur son contenu hors-ligne. Depuis le 14/08/2026, date où la
cascade est passée sur Cloudflare en tête.

Corrigé par `texteDeLaReponse()` (`ai.service.ts`), fonction pure et testée : un
objet est **sérialisé** au lieu d'être stringifié. Le test
`backend/src/ai/reponse.spec.ts` garde la porte — s'il redevient rouge, les
analyses cessent de fonctionner sans qu'aucune erreur n'apparaisse nulle part.

Note : les réponses cassées restent en cache Redis 6 h. Après un correctif de ce
genre, purger `ai:*` — sinon on teste l'ancien.


## Ordre du pipeline (du moins cher/plus rapide au plus coûteux)
1. **On-device (offline, gratuit)** : reconnaissance d'aliment (TFLite MobileNet), OCR étiquette/ticket (MLKit), comptage de reps (accéléromètre), code-barres (MLKit + Open Food Facts + base locale 502 aliments).
2. **Backend self-host (peu cher)** : faster-whisper (vocal→texte), cache Redis des générations.
3. **Providers cloud (cascade de 12, gratuits d'abord)** : Cloudflare et Groq en tête, puis du moins cher au plus cher, Gemini en dernier — via `backend/src/ai/ai.service.ts` (`/ai/generate`, `/ai/vision`, `/ai/transcribe`). Rate-limité 30 req/min/user.

L'app n'appelle JAMAIS un provider en direct : elle passe par le backend `/ai/*` (clé serveur, token Firebase requis) → la clé ne fuit pas dans le bundle.

## Ajouter un nouveau provider (backend)
Le service est centralisé dans `ai.service.ts`. Pour ajouter un provider (fallback ou A/B), 3 étapes :

1. **Clé en env** — ajoute la variable dans le `.env` serveur (`/home/deploy/apps/salorie-stack/.env`) PUIS dans `docker-compose.yml` (section `backend: environment:`), comme `GEMINI_API_KEY`. Jamais en dur dans le code.
2. **Client dans `ai.service.ts`** — instancie le SDK conditionnellement (`process.env.X_API_KEY ? new Client() : null`) et ajoute une branche dans `generate()`/`vision()`.
3. **Sélection** — choisis via une env `AI_PROVIDER` (ex. `gemini` | `openai` | …) ou un fallback en cascade (essaie A, sinon B).

### Providers recommandés à ajouter (par usage)
| Provider | Variable d'env | Forces | Quand l'utiliser |
|---|---|---|---|
| **OpenAI** (GPT-4o / 4o-mini) | `OPENAI_API_KEY` | vision + texte très fiables, JSON mode | fallback qualité repas composés |
| **Anthropic** (Claude) | `ANTHROPIC_API_KEY` | raisonnement, suivi d'instructions strictes | coach IA, plans repas |
| **Groq** (Llama 3.x) | `GROQ_API_KEY` | ultra rapide + très bon marché | texte simple (substitutions, parsing) |
| **OpenRouter** (multi-modèles) | `OPENROUTER_API_KEY` | 1 clé → 100+ modèles, bascule facile | A/B testing de modèles sans recâbler |
| **Mistral** (européen) | `MISTRAL_API_KEY` | RGPD/UE, FR natif | conformité données UE |
| **DeepSeek** | `DEEPSEEK_API_KEY` | très bon marché | volume élevé / texte |

### Exemple de cascade (pseudo dans ai.service.ts)
```ts
async generate(prompt, model?) {
  const order = (process.env.AI_PROVIDERS || 'gemini').split(',');
  for (const p of order) {
    try {
      if (p === 'gemini' && this.gemini) return await this.gemini(prompt, model);
      if (p === 'openai' && this.openai) return await this.openaiGen(prompt);
      if (p === 'groq' && this.groq)   return await this.groqGen(prompt);
    } catch (e) { /* provider suivant */ }
  }
  throw new Error('aucun provider IA disponible');
}
```
Comment obtenir les clés : créer un compte sur la console du provider (platform.openai.com, console.anthropic.com, console.groq.com, openrouter.ai/keys, console.mistral.ai) → générer une API key → la coller dans le `.env` serveur (jamais commitée). Redéployer le backend (`docker compose up -d --build backend`).

---

## 🆓 Providers GRATUITS (free tier — recommandés)
Ceux à privilégier pour ne rien payer. Le plus gratuit = **local/on-device** (aucun appel réseau), puis **self-host sur le serveur** (Ollama), puis **free tiers cloud**.

| Provider | Clé/env | Gratuit ? | Vision ? | Notes |
|---|---|---|---|---|
| **On-device TFLite / MLKit** | aucune | ✅ 100% gratuit, hors-ligne | ✅ (food_v1.tflite) | déjà en place — tier 1 du scan |
| **Ollama (self-host serveur 3)** | aucune (port local) | ✅ gratuit (ton CPU/GPU) | ✅ `llava`, `moondream`, `llama3.2-vision` | aligne avec « modèle local de l'ordinateur » ; tourne en conteneur Docker à côté de whisper |
| **Google Gemini (AI Studio)** | `GEMINI_API_KEY` | ✅ free tier généreux | ✅ flash / flash-lite | déjà utilisé ; quota gratuit RPM/RPD via aistudio.google.com |
| **Groq** | `GROQ_API_KEY` | ✅ free tier large | ✅ Llama-4 / Llama-3.2 vision | ultra rapide ; idéal texte + vision légère |
| **OpenRouter (modèles `:free`)** | `OPENROUTER_API_KEY` | ✅ modèles suffixés `:free` | ✅ certains (Llama vision free) | 1 clé → dizaines de modèles gratuits |
| **Cloudflare Workers AI** | `CF_API_TOKEN` + account id | ✅ ~10k neurones/jour gratuits | ✅ `llava` | pas de carte requise |
| **Mistral (La Plateforme)** | `MISTRAL_API_KEY` | ✅ tier expérimental gratuit | ✅ Pixtral | UE/RGPD, FR natif |
| **HuggingFace Inference** | `HF_TOKEN` | ✅ free (rate-limité) | ✅ beaucoup de modèles | bon pour tester |
| **GitHub Models** | token GitHub | ✅ gratuit (dev/test) | ✅ GPT-4o, Llama | quotas dev, pratique pour prototyper |
| **Cohere / Together** | `COHERE_API_KEY` / `TOGETHER_API_KEY` | ✅ trial/crédits offerts | ➖/✅ | texte/embeddings surtout |

**Conseil coût-zéro pour Salorie** : garde la cascade **local → Ollama (serveur) → Gemini free tier**. Tu ne paies que si tu dépasses le free tier Gemini, et seulement pour les cas que ni l'on-device ni Ollama ne couvrent.

---

## Cascade d'insights ANALYTICS (implémentée juin 2026)
L'écran Analytics suit désormais la cascade demandée **LOCAL → BACKEND → GEMINI** :
1. **LOCAL (on-device, gratuit, hors-ligne)** — `lib/localInsights.ts` : `localWeightForecast()` (régression linéaire JS sur l'historique de poids + détection de plateau) et `localMealReco()` (scoring macro d'une base d'aliments embarquée). Sert en PREMIER.
2. **BACKEND (`/ml`)** — `lib/mlApi.ts` (`mlWeightForecast`, `mlMealReco`) : utilisé seulement si le local manque de données (< 3 pesées).
3. **GEMINI** — narration IA (résumé/reco hebdo) des cartes Bento via `InsightsService` → `/ai`. Tier de secours payant.

`components/MlInsightsCard.tsx` orchestre la cascade et affiche un **badge de source** (Sur l'appareil / Serveur / IA) pour la transparence. Le tier local évite la plupart des appels payants.

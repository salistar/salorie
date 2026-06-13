# Salorie — Pipeline IA & ajout de providers

## Ordre du pipeline (du moins cher/plus rapide au plus coûteux)
1. **On-device (offline, gratuit)** : reconnaissance d'aliment (TFLite MobileNet), OCR étiquette/ticket (MLKit), comptage de reps (accéléromètre), code-barres (MLKit + Open Food Facts + base locale 502 aliments).
2. **Backend self-host (peu cher)** : faster-whisper (vocal→texte), cache Redis des générations.
3. **Providers cloud (payant, fallback)** : actuellement **Gemini** via `backend/src/ai/ai.service.ts` (`/ai/generate`, `/ai/vision`, `/ai/transcribe`). Rate-limité 30 req/min/user.

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

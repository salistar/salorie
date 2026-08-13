import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from './firebase.service';

/**
 * Pont entre l'admin web et le backend.
 *
 * L'ecran /ai-keys de l'admin enregistre les cles de providers dans Firestore
 * (`secrets/llm_keys`, cf. web/app/api/ai-keys/route.ts). Jusqu'au 13 aout 2026 le
 * backend n'allait JAMAIS les y chercher : il ne lisait que `process.env`. Saisir une
 * cle dans l'admin ne changeait donc rien au comportement de l'API — une promesse
 * d'interface sans effet, et le genre de decalage qu'on ne decouvre qu'en cherchant
 * pourquoi « la cle est pourtant bien enregistree ».
 *
 * Priorite : Firestore d'abord (c'est la source que l'utilisateur voit et modifie),
 * `process.env` en repli. Ainsi un secret CI existant continue de fonctionner tant que
 * rien n'est saisi dans l'admin, et une saisie dans l'admin prend le dessus sans
 * redeploiement.
 *
 * Le cache evite une lecture Firestore par appel de tier : la cascade de vision
 * interroge jusqu'a cinq cles pour UNE photo. 60 s est un compromis — une cle changee
 * dans l'admin est active en moins d'une minute, sans que Firestore soit sollicite a
 * chaque scan.
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger('Secrets');
  private cache: Record<string, string> = {};
  private fetchedAt = 0;
  private inflight: Promise<void> | null = null;
  private readonly TTL_MS = 60_000;

  constructor(private fb: FirebaseService) {}

  private async refresh(): Promise<void> {
    if (Date.now() - this.fetchedAt < this.TTL_MS) return;
    // Une seule lecture concurrente : sans ce garde, les cinq tiers de la cascade
    // declenchent cinq lectures Firestore simultanees au premier scan apres expiration.
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      try {
        const doc = await this.fb.db().collection('secrets').doc('llm_keys').get();
        const data = (doc.exists ? doc.data() : {}) || {};
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          const s = typeof v === 'string' ? v.trim() : '';
          if (s) next[k] = s;
        }
        this.cache = next;
        this.fetchedAt = Date.now();
      } catch (e: any) {
        // Firestore indisponible ne doit JAMAIS casser un scan : on garde le dernier
        // instantane connu et `get()` retombera sur process.env pour le reste.
        this.logger.warn(`lecture secrets/llm_keys KO, repli sur env: ${e?.message}`);
        this.fetchedAt = Date.now();
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Valeur de la cle : Firestore si renseignee, sinon process.env. */
  async get(name: string): Promise<string | undefined> {
    await this.refresh();
    const fromDb = this.cache[name];
    if (fromDb) return fromDb;
    const fromEnv = (process.env[name] || '').trim();
    return fromEnv || undefined;
  }

  /** Plusieurs cles en une seule verification de fraicheur. */
  async getMany(names: string[]): Promise<Record<string, string | undefined>> {
    await this.refresh();
    const out: Record<string, string | undefined> = {};
    for (const n of names) {
      const v = this.cache[n] || (process.env[n] || '').trim();
      out[n] = v || undefined;
    }
    return out;
  }

  /** D'ou vient chaque cle — pour diagnostiquer sans jamais exposer de valeur. */
  async provenance(names: string[]): Promise<Record<string, 'admin' | 'env' | 'absente'>> {
    await this.refresh();
    const out: Record<string, 'admin' | 'env' | 'absente'> = {};
    for (const n of names) {
      out[n] = this.cache[n] ? 'admin' : (process.env[n] || '').trim() ? 'env' : 'absente';
    }
    return out;
  }
}

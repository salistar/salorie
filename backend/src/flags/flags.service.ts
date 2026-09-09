import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';
import { RedisService } from '../redis.service';

/**
 * Les feature flags, servis par l'API plutôt que lus par chaque téléphone.
 * ---------------------------------------------------------------------------
 * POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST ARRIVÉ EN RETARD
 * `lib/featureFlags.ts` appelle `GET {API}/flags` depuis le 09/2026 et décrit
 * précisément ce qu'il attend : un cache Redis, un repli « dernier bon », et un
 * marqueur `source:'empty'` pour dire « je n'ai PAS pu lire ». Ce module
 * n'existait pas. L'audit du 09/09/2026 l'a constaté : zéro occurrence de
 * « flags » dans tout `backend/src`, et 404 en production.
 *
 * Rien ne cassait — le mobile retombait sur Firestore en direct puis sur son
 * cache local. Mais les deux bénéfices écrits dans son commentaire étaient
 * fictifs : l'économie de quota (N clients → 1 lecture) et la résilience quand
 * Firestore tombe. Un commentaire qui décrit un mécanisme absent est pire qu'un
 * commentaire absent : il fait renoncer à le construire.
 *
 * ⚠ LE CONTRAT EST DICTÉ PAR LE CLIENT DÉJÀ DÉPLOYÉ, PAS L'INVERSE.
 * Des APK en circulation appellent déjà cette route. Le corps de réponse doit
 * donc être exactement `{ flags, source }`, et `source:'empty'` doit rester le
 * signal « ne me crois pas » — le client l'utilise pour NE PAS écraser son
 * cache local avec du vide. Changer ce mot casserait les versions installées.
 */

/** Ce que vaut une lecture : d'où viennent les flags rendus. */
export type SourceFlags =
  | 'cache'      // Redis, moins de 60 s — le cas courant
  | 'firestore'  // lecture fraîche, remise en cache
  | 'lastgood'   // Firestore KO, on ressert la dernière lecture réussie
  | 'empty';     // rien du tout — le client doit IGNORER cette réponse

export interface ReponseFlags {
  flags: Record<string, unknown>;
  source: SourceFlags;
  /** Âge en secondes de la donnée servie, quand on le connaît (repli « dernier bon »). */
  age?: number;
}

const CLE_CACHE = 'flags:v1';
const CLE_LASTGOOD = 'flags:lastgood:v1';

// 60 s : la valeur annoncée par le commentaire du client. Assez court pour
// qu'un basculement admin soit visible dans la minute, assez long pour que
// 100 000 clients ne produisent qu'une lecture Firestore par minute.
const TTL_CACHE = 60;

// Le « dernier bon » doit survivre à une panne Firestore LONGUE — c'est tout son
// intérêt. Trente jours : au-delà, servir des flags d'un autre mois serait pire
// que de rendre `empty` et laisser le client garder son propre cache.
const TTL_LASTGOOD = 30 * 86400;

@Injectable()
export class FlagsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly redis: RedisService,
  ) {}

  async lire(): Promise<ReponseFlags> {
    // 1) Cache chaud. C'est le chemin de 99 % des appels.
    const cache = await this.redis.getJSON<Record<string, unknown>>(CLE_CACHE);
    if (cache) return { flags: cache, source: 'cache' };

    // 2) Firestore.
    try {
      const snap = await this.firebase.db().collection('config').doc('features').get();

      // ⚠ DOCUMENT ABSENT N'EST PAS UNE PANNE. Si personne n'a jamais écrit de
      // flag, `{}` est la bonne réponse : le client applique « défaut = activé »
      // et tout s'affiche. Le renvoyer en `empty` ferait exactement l'inverse de
      // ce que veut dire `empty` — « je n'ai pas pu lire » — et le client
      // garderait un vieux cache au lieu d'appliquer l'état réel, qui est vide.
      const flags = (snap.exists ? snap.data() : {}) as Record<string, unknown>;

      await this.redis.setJSON(CLE_CACHE, flags, TTL_CACHE);
      await this.redis.setJSON(CLE_LASTGOOD, { flags, ts: Date.now() }, TTL_LASTGOOD);
      return { flags, source: 'firestore' };
    } catch {
      // 3) Firestore est tombé (ou quota épuisé, ou credentials absents).
      // C'est LE cas pour lequel ce module existe.
      const bon = await this.redis.getJSON<{ flags: Record<string, unknown>; ts: number }>(CLE_LASTGOOD);
      if (bon?.flags) {
        return {
          flags: bon.flags,
          source: 'lastgood',
          age: Math.max(0, Math.round((Date.now() - (bon.ts || 0)) / 1000)),
        };
      }

      // 4) Ni Firestore, ni dernier bon. On le DIT, au lieu de rendre `{}` :
      // un `{}` silencieux serait interprété comme « aucun flag désactivé »,
      // et rallumerait des fonctionnalités que l'admin avait éteintes.
      return { flags: {}, source: 'empty' };
    }
  }

  /**
   * Vide le cache court pour que le prochain appel relise Firestore.
   * Sans ça, un basculement admin met jusqu'à 60 s à se voir — acceptable en
   * régime normal, pas quand on éteint une fonctionnalité qui pose problème.
   * Le « dernier bon » n'est PAS touché : c'est un filet, pas un cache.
   */
  async invalider(): Promise<void> {
    await this.redis.del(CLE_CACHE);
  }
}

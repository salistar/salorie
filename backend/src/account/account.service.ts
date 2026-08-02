import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';

/**
 * Suppression de compte (exigence Google Play + RGPD).
 *
 * POURQUOI CÔTÉ SERVEUR — deux raisons, chacune suffisante :
 *
 *  1. **Le SDK client ne sait pas lister les sous-collections.** L'ancienne version
 *     (`deleteAllUserData` dans lib/firebase.ts) devinait donc leurs noms dans un tableau
 *     écrit à la main. Le tableau avait DÉRIVÉ : `blocked`, `events`, `meal_plans`,
 *     `micros` et `notifications_history` existaient sans y figurer — jamais supprimées —
 *     tandis que `water`, `weights`, `exercises` et `notifications` y figuraient sans
 *     exister. L'app promettait « toutes les données associées » et en laissait cinq.
 *     `listCollections()` du SDK Admin énumère pour de vrai : plus rien à deviner, et
 *     une sous-collection ajoutée demain sera couverte sans qu'on y pense.
 *
 *  2. **Les données de l'utilisateur vivent aussi AILLEURS que sous son document** :
 *     annonces, kudos, parcours, réservations… Les règles Firestore interdisent (à raison)
 *     au client d'y toucher hors de son propre document.
 *
 * CHOIX ASSUMÉ — supprimer vs anonymiser :
 *   • Ce que l'utilisateur possède en propre (annonces, kudos, signalements, produits
 *     personnalisés, réclamations de parrainage) est SUPPRIMÉ.
 *   • Un parcours communautaire déjà validé est ANONYMISÉ, pas effacé : d'autres l'ont
 *     peut-être adopté, et une fois l'auteur retiré il ne reste aucune donnée personnelle.
 *     L'écran de confirmation le dit explicitement — on ne surprend pas l'utilisateur.
 */
@Injectable()
export class AccountService {
  constructor(private fb: FirebaseService) {}

  /** Supprime tous les documents d'une requête, par paquets (limite Firestore : 500/lot). */
  private async deleteQuery(q: FirebaseFirestore.Query): Promise<number> {
    const snap = await q.get();
    if (snap.empty) return 0;
    let n = 0;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = this.fb.db().batch();
      for (const d of snap.docs.slice(i, i + 400)) batch.delete(d.ref);
      await batch.commit();
      n += Math.min(400, snap.docs.length - i);
    }
    return n;
  }

  async deleteAccount(docId: string): Promise<{ ok: true; deleted: Record<string, number> }> {
    const id = String(docId || '').trim().toLowerCase();
    const db = this.fb.db();
    const out: Record<string, number> = {};

    // ── 1. Le document utilisateur ET TOUTES ses sous-collections ──────────────
    // `recursiveDelete` descend l'arbre entier : c'est ce qui rend la liste écrite à
    // la main inutile, et donc impossible à laisser dériver de nouveau.
    const userRef = db.collection('users').doc(id);
    try {
      const subs = await userRef.listCollections();
      out.subcollections = subs.length;
      await db.recursiveDelete(userRef);
      out.user_doc = 1;
    } catch {
      out.user_doc = 0;
    }

    try { await db.collection('public_profiles').doc(id).delete(); out.public_profile = 1; } catch {}

    // ── 2. Contenus possédés, répartis dans les collections transverses ────────
    // Chaque entrée : [collection, champ qui porte l'identité]. Les erreurs sont
    // avalées collection par collection — un index manquant ne doit pas faire échouer
    // TOUTE la suppression et laisser l'utilisateur avec un compte à moitié effacé.
    const owned: [string, string][] = [
      ['marketplace_listings', 'ownerUid'],
      ['kudos', 'fromId'],
      ['custom_products', 'ownerUid'],
      ['reports', 'reporterId'],
      ['sport_matches', 'ownerUid'],
      ['sport_reservations', 'ownerUid'],
      ['referrals_claims', 'ownerUid'],
    ];
    for (const [col, field] of owned) {
      try {
        out[col] = await this.deleteQuery(db.collection(col).where(field, '==', id));
      } catch { out[col] = -1; /* -1 = échec, visible dans la réponse */ }
    }

    // Le doc de parrainage est nommé d'après le code, pas d'après l'utilisateur :
    // on le retrouve par son champ propriétaire.
    try {
      out.referrals = await this.deleteQuery(db.collection('referrals').where('ownerUid', '==', id));
    } catch { out.referrals = -1; }

    // ── 3. Parcours communautaires : anonymisés, pas supprimés ─────────────────
    try {
      const snap = await db.collection('community_routes').where('email', '==', id).get();
      let n = 0;
      for (const d of snap.docs) {
        await d.ref.set({ email: '', authorName: '' }, { merge: true });
        n++;
      }
      out.community_routes_anonymized = n;
    } catch { out.community_routes_anonymized = -1; }

    // ── 4. Appartenances : on se retire des groupes sans détruire le groupe ─────
    try {
      const fams = await db.collection('families').where('members', 'array-contains', id).get();
      let n = 0;
      for (const d of fams.docs) {
        const members: string[] = (d.data() as any)?.members || [];
        await d.ref.set({ members: members.filter((m) => m !== id) }, { merge: true });
        n++;
      }
      out.families_left = n;
    } catch { out.families_left = -1; }

    return { ok: true, deleted: out };
  }
}

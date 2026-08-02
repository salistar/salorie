import { Injectable, BadRequestException } from '@nestjs/common';
import { FirebaseService } from '../firebase.service';

/**
 * Parrainage — l'OCTROI du Premium. Le reste (codes, réclamations, compteurs) existe
 * déjà côté app dans `lib/referral.ts` et n'est pas dupliqué ici.
 *
 * CE QUI MANQUAIT : les paliers annonçaient « 1 mois Premium », « 3 mois Premium »… mais
 * aucune ligne de code ne les accordait — `rewardForCount` ne renvoie qu'un libellé. La
 * promesse était affichée, jamais tenue.
 *
 * POURQUOI CÔTÉ SERVEUR : accorder le Premium revient à écrire `premiumTrialUntil` (cf.
 * lib/FlagsContext), et pour un parrainage il faut l'écrire sur le document d'un AUTRE
 * utilisateur. Les règles Firestore l'interdisent au client — c'était d'ailleurs une
 * faille ouverte : `premiumTrialUntil` n'était pas protégé, n'importe qui pouvait s'offrir
 * un abonnement à vie en une écriture. Les règles sont désormais durcies, et le SDK Admin
 * (qui les contourne légitimement) est le seul à pouvoir accorder.
 */

const DAY = 24 * 60 * 60 * 1000;
const CLAIM_BONUS_MS = 7 * DAY; // les deux parties, à la réclamation

// Doit rester ALIGNÉ sur REWARD_TIERS de lib/referral.ts, sinon l'app affiche un palier
// que le serveur n'accorde pas — exactement le bug qu'on corrige ici.
const TIERS: { min: number; ms: number }[] = [
  { min: 5, ms: 30 * DAY },
  { min: 10, ms: 90 * DAY },
];

// Alphabet et longueur IDENTIQUES à lib/referral.ts. Toute divergence rendrait les codes
// du serveur incompatibles avec ceux affichés dans l'app.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

@Injectable()
export class ReferralService {
  constructor(private fb: FirebaseService) {}

  /** Réimplémentation exacte de `codeForUid` (lib/referral.ts) — FNV-1a puis étalement. */
  codeForUid(uid: string): string {
    const u = String(uid || '').trim().toLowerCase();
    if (!u) return '';
    let h = 0x811c9dc5;
    for (let i = 0; i < u.length; i++) {
      h ^= u.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    let out = '';
    for (let i = 0; i < CODE_LEN; i++) {
      out += CODE_ALPHABET[h % CODE_ALPHABET.length];
      h = (Math.imul(h ^ (h >>> 13), 0x01000193) >>> 0) + i + 1;
      h = h >>> 0;
    }
    return out;
  }

  /** Prolonge un essai sans jamais le RACCOURCIR : on part de max(essai en cours, maintenant). */
  private extend(current: unknown, ms: number): number {
    return Math.max(typeof current === 'number' ? current : 0, Date.now()) + ms;
  }

  /**
   * Accorde les 7 jours aux DEUX parties après une réclamation déjà écrite par l'app.
   *
   * L'app a posé `referrals_claims/{filleul}` (create-only côté règles, donc infalsifiable
   * en double). Le serveur ne fait que constater ce claim et distribuer — il ne le crée
   * pas, pour ne pas courir avec le client sur la même écriture.
   *
   * Idempotent : le drapeau `granted` sur le claim empêche de rappeler la route pour
   * empiler les semaines.
   */
  async grantForClaim(callerDocId: string): Promise<{ ok: true; trialUntil: number; ownerBonusDays: number }> {
    const caller = String(callerDocId || '').trim().toLowerCase();
    if (!caller) throw new BadRequestException('Utilisateur inconnu');

    const db = this.fb.db();
    const claimRef = db.collection('referrals_claims').doc(caller);
    const claimSnap = await claimRef.get();
    if (!claimSnap.exists) throw new BadRequestException('Aucun parrainage à créditer');

    const claim: any = claimSnap.data();
    if (claim?.granted === true) throw new BadRequestException('Parrainage déjà crédité');

    const owner = String(claim?.ownerUid || '').trim().toLowerCase();
    if (!owner || owner === caller) throw new BadRequestException('Parrainage invalide');

    const callerRef = db.collection('users').doc(caller);
    const ownerRef = db.collection('users').doc(owner);
    const codeRef = db.collection('referrals').doc(this.codeForUid(owner));

    return db.runTransaction(async (tx) => {
      // Toutes les lectures AVANT toute écriture : exigence des transactions Firestore.
      const [cSnap, oSnap, codeSnap, freshClaim] = await Promise.all([
        tx.get(callerRef), tx.get(ownerRef), tx.get(codeRef), tx.get(claimRef),
      ]);
      if ((freshClaim.data() as any)?.granted === true) {
        throw new BadRequestException('Parrainage déjà crédité');
      }

      const cd: any = cSnap.exists ? cSnap.data() : {};
      const od: any = oSnap.exists ? oSnap.data() : {};
      const count = Number((codeSnap.data() as any)?.count || 0);

      // Le parrain touche 7 jours, PLUS le palier s'il vient de l'atteindre pile.
      // On ne récompense qu'au franchissement exact : repasser par 5 filleuls ne
      // redonne pas un mois à chaque fois.
      const tier = TIERS.find((t) => t.min === count);
      const ownerMs = CLAIM_BONUS_MS + (tier ? tier.ms : 0);

      const callerUntil = this.extend(cd?.premiumTrialUntil, CLAIM_BONUS_MS);
      tx.set(callerRef, { premiumTrialUntil: callerUntil }, { merge: true });
      tx.set(ownerRef, { premiumTrialUntil: this.extend(od?.premiumTrialUntil, ownerMs) }, { merge: true });
      tx.set(claimRef, { granted: true, grantedAt: Date.now() }, { merge: true });

      return { ok: true as const, trialUntil: callerUntil, ownerBonusDays: Math.round(ownerMs / DAY) };
    });
  }

  /** État Premium lisible par l'app après un octroi (pour rafraîchir l'écran). */
  async status(docId: string): Promise<{ trialUntil: number | null; referredBy: string | null }> {
    const snap = await this.fb.db().collection('users').doc(String(docId || '').toLowerCase()).get();
    const d: any = snap.exists ? snap.data() : {};
    return {
      trialUntil: typeof d?.premiumTrialUntil === 'number' ? d.premiumTrialUntil : null,
      referredBy: d?.referredBy || null,
    };
  }
}

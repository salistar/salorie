import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Publication, GroupeAmis } from './social.schemas';
import { FirebaseService } from '../firebase.service';
import { RedisService } from '../redis.service';
import { filtrerMessage, verifierPhoto } from './moderation-chat';

/**
 * Le mur : publications écrites, et groupes qui en restreignent l'audience.
 *
 * ## Pourquoi tout passe par le serveur
 *
 * Le fil existant est automatique — courses, médailles — et ne contient que des
 * types autorisés. Ici c'est du TEXTE LIBRE. Écrit directement dans Firestore
 * depuis l'app, il contournerait le filtre (liens d'arnaque, coordonnées,
 * insultes), la limite de débit, et le signalement que Play exige dès qu'un
 * utilisateur voit le contenu d'un autre.
 *
 * ## La règle de visibilité, en une phrase
 *
 * On voit une publication si son auteur est notre ami, ET si elle ne vise aucun
 * groupe ou qu'on est dans ce groupe.
 *
 * Un groupe RESTREINT, il n'élargit jamais. Sans cette asymétrie, il suffirait
 * d'ajouter quelqu'un à un groupe pour lui montrer son mur sans être son ami —
 * la liste d'amis ne voudrait plus rien dire.
 */
@Injectable()
export class MurService {
  private readonly log = new Logger('MurService');

  constructor(
    @InjectModel(Publication.name) private publications: Model<Publication>,
    @InjectModel(GroupeAmis.name) private groupes: Model<GroupeAmis>,
    private fb: FirebaseService,
    private redis: RedisService,
  ) {}

  /**
   * Les amis d'un compte, lus dans Firestore.
   *
   * Le serveur relit lui-même plutôt que de croire le client : une vérification
   * faite dans l'app protège l'usage normal, pas quelqu'un qui appelle l'API
   * directement. En cas d'erreur on rend une liste VIDE — on montre moins, jamais
   * plus, quand on n'est pas sûr.
   */
  private async amisDe(uid: string): Promise<string[]> {
    try {
      // `emailToDocId` côté app est `trim().toLowerCase()`, et rien d'autre.
      const snap = await this.fb.db().collection('users').doc(String(uid).trim().toLowerCase()).get();
      const bruts = (snap.data()?.friends as string[]) || [];
      return [...new Set(bruts.map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
    } catch (e) {
      this.log.warn(`lecture des amis impossible : ${(e as any)?.message}`);
      return [];
    }
  }

  // ── Publications ──────────────────────────────────────────────────────────

  async publier(
    uid: string,
    name: string,
    texte: string,
    image = '',
    imageType = '',
    groupe = '',
  ): Promise<{ ok: boolean; motif?: string; id?: string }> {
    // Débit : 10 publications par heure. Un mur n'est pas un fil de discussion ;
    // au-delà, c'est du spam ou un script.
    if (!(await this.redis.rateLimit(`mur:${uid}`, 10, 3600))) return { ok: false, motif: 'debit' };

    const refusPhoto = verifierPhoto(image, imageType);
    if (refusPhoto) return { ok: false, motif: refusPhoto };

    const brut = String(texte || '');
    // Une photo sans légende est une publication valide ; un vide total, non.
    if (!brut.trim() && !image) return { ok: false, motif: 'vide' };
    if (brut.trim()) {
      const verdict = filtrerMessage(brut);
      if (!verdict.ok) return { ok: false, motif: (verdict as any).motif || 'insulte' };
    }

    // Le groupe doit m'appartenir. Sans ce contrôle, on viserait le groupe d'un
    // autre et on s'adresserait à des gens qu'on ne connaît pas.
    if (groupe) {
      const g = await this.groupes.findOne({ _id: groupe, uid }).lean();
      if (!g) return { ok: false, motif: 'groupe_inconnu' };
    }

    const doc = await this.publications.create({
      uid,
      name: String(name || '').slice(0, 40),
      texte: brut.trim().slice(0, 500),
      image,
      imageType: image ? imageType : '',
      groupe,
      ts: Date.now(),
    });
    return { ok: true, id: String(doc._id) };
  }

  /** Le mur : mes publications et celles de mes amis, les plus récentes d'abord. */
  async lire(uid: string, max = 30): Promise<any[]> {
    const amis = await this.amisDe(uid);
    // Mon propre mur inclus : sans cela on ne voit pas ce qu'on vient d'écrire,
    // ce qui se lit comme un échec de publication.
    const auteurs = [...new Set([uid, ...amis])];

    const brutes = await this.publications
      .find({ uid: { $in: auteurs }, masque: false })
      .sort({ ts: -1 })
      .limit(Math.min(Math.max(max, 1), 60))
      .lean();

    // Le filtrage par groupe se fait ICI et pas dans la requête : il demande de
    // savoir si JE suis membre du groupe d'un AUTRE, ce qu'une seule requête
    // Mongo ne sait pas exprimer.
    const gIds = [...new Set(brutes.map((p: any) => p.groupe).filter(Boolean))];
    const gDocs = gIds.length ? await this.groupes.find({ _id: { $in: gIds } }).lean() : [];
    const membresPar: Record<string, string[]> = {};
    for (const g of gDocs as any[]) membresPar[String(g._id)] = g.membres || [];

    return brutes
      .filter((p: any) => {
        if (!p.groupe) return true;
        if (p.uid === uid) return true; // mes propres publications ciblées
        return (membresPar[p.groupe] || []).includes(uid);
      })
      .map((p: any) => ({
        id: String(p._id),
        auteur: p.uid,
        name: p.name,
        texte: p.texte,
        image: p.image || '',
        imageType: p.imageType || '',
        ts: p.ts,
        // `moi` évite au client de comparer des e-mails, et donc d'en manipuler.
        moi: p.uid === uid,
      }));
  }

  /** Supprimer : seulement les siennes. */
  async supprimer(uid: string, id: string): Promise<boolean> {
    const r = await this.publications.deleteOne({ _id: id, uid });
    return r.deletedCount > 0;
  }

  /**
   * Signaler. Trois signalements distincts masquent la publication.
   *
   * Un signalement par personne et par publication : sans cette borne, un seul
   * compte pourrait faire disparaître n'importe quoi en signalant trois fois.
   */
  async signaler(uid: string, id: string): Promise<boolean> {
    if (!(await this.redis.rateLimit(`signal_mur:${id}:${uid}`, 1, 24 * 3600))) return false;
    const doc = await this.publications.findByIdAndUpdate(id, { $inc: { signalements: 1 } }, { new: true });
    if (!doc) return false;
    if (doc.signalements >= 3 && !doc.masque) {
      doc.masque = true;
      await doc.save();
      this.log.warn(`publication masquée id=${id}`);
    }
    return true;
  }

  // ── Groupes ───────────────────────────────────────────────────────────────

  async creerGroupe(uid: string, nom: string, membres: string[]): Promise<{ ok: boolean; motif?: string; id?: string }> {
    const propre = String(nom || '').trim().slice(0, 40);
    if (!propre) return { ok: false, motif: 'nom_vide' };

    // Tous les membres doivent être mes amis. C'est ce qui empêche un groupe de
    // devenir un contournement de la liste d'amis.
    const amis = new Set(await this.amisDe(uid));
    const retenus = [...new Set(membres.map((m) => String(m).trim().toLowerCase()))].filter((m) => amis.has(m));
    if (retenus.length !== membres.length) return { ok: false, motif: 'membre_non_ami' };

    try {
      const doc = await this.groupes.create({ uid, nom: propre, membres: retenus });
      return { ok: true, id: String(doc._id) };
    } catch {
      // L'index unique (uid, nom) empêche deux groupes du même nom, qui seraient
      // indiscernables au moment de choisir une audience.
      return { ok: false, motif: 'nom_deja_pris' };
    }
  }

  async listerGroupes(uid: string): Promise<any[]> {
    const docs = await this.groupes.find({ uid }).sort({ nom: 1 }).lean();
    return docs.map((g: any) => ({ id: String(g._id), nom: g.nom, membres: g.membres || [] }));
  }

  async supprimerGroupe(uid: string, id: string): Promise<boolean> {
    const r = await this.groupes.deleteOne({ _id: id, uid });
    // Les publications qui visaient ce groupe deviennent invisibles à tous sauf à
    // leur auteur : `membresPar` sera vide. C'est le comportement voulu — on ne
    // rend pas public ce qui était restreint parce qu'un groupe a disparu.
    return r.deletedCount > 0;
  }
}

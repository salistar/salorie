import { Controller, Get, Post, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

/**
 * Parrainage — octroi du Premium uniquement. Codes, réclamations et compteurs restent
 * gérés par l'app (`lib/referral.ts`).
 *
 * L'identité vient du JETON, jamais du corps de la requête : sinon il suffirait d'envoyer
 * l'e-mail d'un tiers pour se faire créditer à sa place.
 */
@UseGuards(FirebaseAuthGuard)
@Controller('referral')
export class ReferralController {
  constructor(private referral: ReferralService) {}

  /** Identifiant de document utilisateur = e-mail en minuscules (convention du projet). */
  private docIdOf(req: any): string {
    const u = req?.user || {};
    const id = String(u.email || u.uid || '').trim().toLowerCase();
    if (!id) throw new BadRequestException('Utilisateur inconnu');
    return id;
  }

  /** À appeler juste après une réclamation réussie côté app. */
  @Post('grant')
  grant(@Req() req: any) {
    return this.referral.grantForClaim(this.docIdOf(req));
  }

  @Get('status')
  status(@Req() req: any) {
    return this.referral.status(this.docIdOf(req));
  }
}

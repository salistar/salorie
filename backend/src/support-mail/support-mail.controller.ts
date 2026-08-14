import { Body, Controller, ForbiddenException, Headers, Logger, Post } from '@nestjs/common';
import { createHash } from 'crypto';
import { SupportMailService } from './support-mail.service';

// Réception des mails de support@salorie.com, POSTés par l'Email Worker
// Cloudflare avec la clé partagée MAIL_INGEST_KEY. Clé OBLIGATOIRE : sans
// MAIL_INGEST_KEY définie, l'endpoint est fermé — même leçon que
// /pipeline/webhook-sink (jamais de repli ouvert).
@Controller('support-mail')
export class SupportMailController {
  private readonly log = new Logger('SupportMail');
  constructor(private svc: SupportMailService) {}

  // Empreinte courte, pour comparer deux clés dans les journaux SANS jamais en
  // écrire la valeur. Le 14/08/2026, un mail est arrivé chez Cloudflare, a été
  // transféré au Gmail, et n'a jamais atteint Mongo : impossible de dire si la
  // requête n'arrivait pas ou si elle était refusée, faute de toute trace ici.
  private static empreinte(v?: string): string {
    if (!v) return 'absente';
    return createHash('sha256').update(v).digest('hex').slice(0, 8) + '/' + v.length;
  }

  @Post('ingest')
  ingest(@Body() dto: { from?: string; to?: string; raw?: string }, @Headers('x-mail-key') k?: string) {
    const key = process.env.MAIL_INGEST_KEY;
    if (!key || k !== key) {
      this.log.warn(
        `ingest REFUSE — recue=${SupportMailController.empreinte(k)} attendue=${SupportMailController.empreinte(key)}`,
      );
      throw new ForbiddenException('mail key invalide');
    }
    this.log.log(`ingest ACCEPTE de=${dto?.from || '?'} taille=${dto?.raw?.length || 0}`);
    return this.svc.ingest(dto || {});
  }
}

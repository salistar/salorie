import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { SupportMailService } from './support-mail.service';

// Réception des mails de support@salorie.com, POSTés par l'Email Worker
// Cloudflare avec la clé partagée MAIL_INGEST_KEY. Clé OBLIGATOIRE : sans
// MAIL_INGEST_KEY définie, l'endpoint est fermé — même leçon que
// /pipeline/webhook-sink (jamais de repli ouvert).
@Controller('support-mail')
export class SupportMailController {
  constructor(private svc: SupportMailService) {}

  @Post('ingest')
  ingest(@Body() dto: { from?: string; to?: string; raw?: string }, @Headers('x-mail-key') k?: string) {
    const key = process.env.MAIL_INGEST_KEY;
    if (!key || k !== key) throw new ForbiddenException('mail key invalide');
    return this.svc.ingest(dto || {});
  }
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { simpleParser } from 'mailparser';
import { SupportEmail } from './support-mail.schemas';

@Injectable()
export class SupportMailService {
  constructor(@InjectModel(SupportEmail.name) private model: Model<SupportEmail>) {}

  // Ingestion d'un mail brut (MIME) relayé par l'Email Worker Cloudflare.
  // Le worker envoie { from, to, raw } ; from/to viennent de l'enveloppe SMTP,
  // le reste est extrait du MIME. Un mail illisible est stocké quand même
  // (brut dans text) plutôt que perdu.
  async ingest(dto: { from?: string; to?: string; raw?: string }) {
    const raw = (dto.raw || '').slice(0, 2_000_000);
    let parsed: Awaited<ReturnType<typeof simpleParser>> | null = null;
    try {
      parsed = await simpleParser(raw);
    } catch {
      /* on garde le brut */
    }
    const fromValue = parsed?.from?.value?.[0];
    const toValue = Array.isArray(parsed?.to) ? parsed?.to[0]?.value?.[0] : parsed?.to?.value?.[0];
    const doc = {
      from: dto.from || fromValue?.address || 'inconnu',
      fromName: fromValue?.name || '',
      to: dto.to || toValue?.address || '',
      subject: parsed?.subject || '(sans sujet)',
      date: parsed?.date || new Date(),
      text: parsed?.text || (parsed ? '' : raw.slice(0, 20_000)),
      html: typeof parsed?.html === 'string' ? parsed.html : '',
      size: raw.length,
    };
    const messageId = parsed?.messageId;
    if (messageId) {
      await this.model.updateOne(
        { messageId },
        { $setOnInsert: { ...doc, messageId, read: false } },
        { upsert: true },
      );
    } else {
      await this.model.create(doc);
    }
    return { ok: true };
  }
}

import { Body, Controller, Post, UseGuards, BadRequestException, Req, HttpException } from '@nestjs/common';
import { AiService } from './ai.service';
import { RedisService } from '../redis.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { lirePage } from './lecture-page';
import { MlService } from '../ml/ml.service';

@UseGuards(FirebaseAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private ai: AiService, private redis: RedisService, private ml: MlService) {}

  // Anti-abus : 30 appels IA / min / utilisateur (coût Gemini). 429 au-delà.
  private async limit(req: any, bucket: string) {
    const uid = req?.user?.uid || 'anon';
    const ok = await this.redis.rateLimit(`ai:${bucket}:${uid}`, 30, 60);
    if (!ok) throw new HttpException('Trop de requêtes IA — réessaie dans une minute.', 429);
  }

  @Post('generate')
  async generate(@Body() body: { prompt?: string; model?: string }, @Req() req: any) {
    await this.limit(req, 'gen');
    if (!body?.prompt || typeof body.prompt !== 'string') throw new BadRequestException('prompt required');
    if (body.prompt.length > 20000) throw new BadRequestException('prompt too long');
    return { text: await this.ai.generate(body.prompt, body.model) };
  }

  @Post('vision')
  async vision(@Body() body: { prompt?: string; imageBase64?: string; mimeType?: string; model?: string }, @Req() req: any) {
    await this.limit(req, 'vis');
    if (!body?.prompt || !body?.imageBase64) throw new BadRequestException('prompt and imageBase64 required');
    // S-fix : borne la taille de l'image AVANT tout envoi cloud (anti-abus coût/mémoire).
    if (typeof body.imageBase64 !== 'string' || body.imageBase64.length > 8_000_000)
      throw new BadRequestException('image too large');
    // ── La cascade D'ABORD, Gemini en dernier recours ────────────────────
    //
    // Cet endpoint n'appelait QUE Gemini. Le 25/08/2026 il rendait 500 sur
    // chaque appel — le modele par defaut avait ete retire par Google — et
    // avec lui trois ecrans : scan d'equipement, recettes du frigo, photos de
    // progression. Tous levent sur `!res.ok`, donc tous morts.
    //
    // Or `/ml/vision` fait deja tourner ONZE paliers, gratuits d'abord
    // (food4k auto-heberge, Cloudflare, Groq, Ollama...), et repond en 82 ms.
    // Il n'y avait aucune raison que celui-ci s'en prive.
    //
    // Injection au niveau du CONTROLEUR : `MlService` importe deja `AiService`,
    // l'inverse ferait une dependance circulaire.
    try {
      const r = await this.ml.visionLocal(body.prompt, body.imageBase64, body.mimeType || 'image/jpeg');
      if (r?.text) return { text: r.text, engine: r.engine };
    } catch (e: any) {
      // On ne renonce pas ici : Gemini reste a essayer juste en dessous.
    }
    return { text: await this.ai.vision(body.prompt, body.imageBase64, body.mimeType || 'image/jpeg', body.model) };
  }

  // Vocal → texte : faster-whisper local (fallback Gemini). Limite 10 Mo base64.
  @Post('transcribe')
  async transcribe(@Body() body: { audioBase64?: string; mimeType?: string; language?: string }, @Req() req: any) {
    await this.limit(req, 'stt');
    if (!body?.audioBase64) throw new BadRequestException('audioBase64 required');
    if (body.audioBase64.length > 10_000_000) throw new BadRequestException('audio too large');
    return this.ai.transcribe(body.audioBase64, body.mimeType || 'audio/mp4', body.language);
  }

  // Recette depuis une URL. La page est allee chercher PAR LE SERVEUR : un
  // navigateur ne peut pas lire un site tiers (CORS), et le mobile qui le faisait
  // depuis le client exposait l'IP de l'utilisateur sans limite de debit.
  //
  // Debit reduit a 8/min : chaque appel declenche une requete sortante VERS UN
  // TIERS, pas seulement vers notre fournisseur d'IA. Trente par minute feraient
  // de Salorie un outil de martelage.
  @Post('recipe-from-url')
  async recipeFromUrl(@Body() body: { url?: string; lang?: string }, @Req() req: any) {
    const uid = req?.user?.uid || 'anon';
    const ok = await this.redis.rateLimit(`ai:url:${uid}`, 8, 60);
    if (!ok) throw new HttpException('Trop de requêtes — réessaie dans une minute.', 429);
    if (!body?.url || typeof body.url !== 'string' || body.url.length > 2000)
      throw new BadRequestException('url required');

    let html: string;
    try {
      html = await lirePage(body.url);
    } catch (e: any) {
      // On rend un code de motif, pas le message brut : « ECONNREFUSED
      // 10.0.0.5:6379 » confirmerait a l'appelant ce qui tourne sur le reseau
      // interne, ce que precisement on lui refuse.
      const motif = String(e?.message || 'erreur');
      const connus = ['url-invalide', 'adresse-refusee', 'pas-une-page', 'trop-de-redirections'];
      throw new BadRequestException(connus.includes(motif) ? motif : 'page-illisible');
    }
    if (html.trim().length < 200) throw new BadRequestException('page-vide');

    const langue = body.lang === 'ar' ? 'Arabic' : body.lang === 'fr' ? 'French' : 'English';
    const prompt =
      `Here is the HTML of a recipe page. Extract and return concisely in ${langue}: ` +
      `1) the recipe NAME, 2) the INGREDIENTS as a bullet list, 3) the STEPS as a short summary, ` +
      `4) a NUTRITION ESTIMATE per serving (calories, protein, carbs, fat). ` +
      `If the page is not a recipe, say so in one line and stop. HTML:\n${html}`;
    return { text: await this.ai.generate(prompt) };
  }
}

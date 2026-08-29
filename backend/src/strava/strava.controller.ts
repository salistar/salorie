import { Controller, Get, Post, Delete, Req, Res, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { StravaService } from './strava.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';

/**
 * Strava — les routes.
 *
 * ⚠ UNE SEULE ROUTE EST PUBLIQUE, ET IL LE FAUT.
 * `GET /strava/retour` est appelée par le NAVIGATEUR que Strava redirige. Ce
 * navigateur ne porte pas notre jeton d'authentification : exiger le garde ici
 * rendrait le retour impossible. C'est précisément pourquoi le `state` est signé
 * (cf. strava.service.ts) : l'identité vient de la signature que nous avons
 * nous-mêmes émise, jamais d'un paramètre que l'appelant choisit.
 *
 * Toutes les autres routes portent le garde et tirent l'identité du JETON, jamais
 * du corps de la requête — même règle que le parrainage.
 */
@Controller('strava')
export class StravaController {
  constructor(private strava: StravaService) {}

  /** Identifiant de document utilisateur = e-mail en minuscules (convention du projet). */
  private docIdOf(req: any): string {
    const u = req?.user || {};
    const id = String(u.email || u.uid || '').trim().toLowerCase();
    if (!id) throw new BadRequestException('Utilisateur inconnu');
    return id;
  }

  @UseGuards(FirebaseAuthGuard)
  @Get('etat')
  etat(@Req() req: any) {
    return this.strava.etat(this.docIdOf(req));
  }

  @UseGuards(FirebaseAuthGuard)
  @Get('lien')
  lien(@Req() req: any) {
    return { url: this.strava.urlAutorisation(this.docIdOf(req)) };
  }

  /**
   * Le retour de Strava. PUBLIQUE par nécessité (voir l'en-tête).
   *
   * On répond une page, pas du JSON : ce qui s'affiche ici est ce que
   * l'utilisateur voit dans son navigateur au bout du parcours. Une page blanche
   * couverte d'accolades donnerait l'impression que quelque chose a échoué au
   * moment précis où tout a réussi.
   */
  @Get('retour')
  async retour(@Query('code') code: string, @Query('state') state: string, @Query('error') erreur: string, @Res() res: any) {
    const page = (titre: string, texte: string, ok: boolean) =>
      res.type('html').send(
        `<!doctype html><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>${titre}</title>` +
        `<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;` +
        `min-height:100vh;display:grid;place-items:center;background:#0f1512;color:#e8efe9;` +
        `text-align:center;padding:24px}h1{font-size:20px;margin:0 0 8px}` +
        `p{margin:0;color:#9fb0a5;line-height:1.5}.p{font-size:44px;margin-bottom:12px}</style>` +
        `<div><div class="p">${ok ? '✅' : '⚠️'}</div><h1>${titre}</h1><p>${texte}</p></div>`,
      );

    // L'utilisateur a refusé dans l'écran Strava : ce n'est pas une panne, et le
    // lui présenter comme telle serait mentir sur ce qui vient de se passer.
    if (erreur) return page('Connexion annulée', 'Vous pouvez revenir à Salorie et réessayer quand vous voulez.', false);
    if (!code || !state) return page('Retour incomplet', 'Relancez la connexion depuis Salorie.', false);

    try {
      const uid = this.strava.verifierState(state);
      const { athlete } = await this.strava.finaliser(uid, code);
      return page('Strava est relié', `Compte ${athlete} connecté. Revenez à Salorie pour importer vos séances.`, true);
    } catch (e: any) {
      return page('Connexion impossible', String(e?.message || 'Réessayez depuis Salorie.'), false);
    }
  }

  @UseGuards(FirebaseAuthGuard)
  @Post('importer')
  importer(@Req() req: any, @Query('depuis') depuis?: string) {
    const d = depuis ? Number(depuis) : undefined;
    return this.strava.importer(this.docIdOf(req), Number.isFinite(d as number) ? d : undefined);
  }

  @UseGuards(FirebaseAuthGuard)
  @Delete('lien')
  delier(@Req() req: any) {
    return this.strava.delier(this.docIdOf(req));
  }
}

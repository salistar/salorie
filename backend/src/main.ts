// ⚠️ PREMIER import du fichier, avant NestFactory : Sentry instrumente Express et
// Mongoose au moment du require. Un import placé plus bas ne patcherait plus rien.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Images/audio base64 dans le JSON (vision, transcribe) : la limite Express par
  // défaut (100kb) provoquait des 413 sur les photos — on l'élève explicitement.
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ limit: '25mb', extended: true }));
  // S3/CORS: restrict to known origins. Native mobile requests send no Origin
  // header and are allowed by the cors lib; only browsers are constrained.
  // salorie.com ajoute le 14 aout 2026 : le domaine PROPRE de l'application manquait a
  // sa propre liste CORS, alors que tout y passe (app.salorie.com, api.salorie.com).
  // Rien ne cassait parce que l'admin appelle via ses routes serveur — mais le premier
  // appel navigateur direct aurait echoue sans un mot. gowithsally.com retire : reste de
  // copier-coller d'un autre projet, aucun front de ce domaine n'appelle ce backend.
  // ⚠ L'APEX, pas seulement les sous-domaines. `/\.salorie\.com$/` exige un POINT
  // avant : il accepte `app.salorie.com` et refuse `salorie.com`. Tant que l'espace
  // utilisateur vivait sur un sous-domaine, personne ne s'en apercevait. Depuis la
  // bascule du 22/08/2026 il vit sur l'APEX — et tout ce qui passe par cette API
  // (les 9 ecrans d'IA, les identifiants TURN) tombait sur un « Failed to fetch »
  // muet, sans erreur serveur puisque le navigateur bloque avant l'envoi.
  //
  // Ancrees des deux cotes : `^https://` empeche qu'un `http://` en clair passe, et
  // le groupe optionnel couvre l'apex comme les sous-domaines sans jamais accepter
  // un voisin du genre `evilsalorie.com`.
  const ORIGINES = [
    /^https:\/\/([a-z0-9-]+\.)*salorie\.com$/,
    /^https:\/\/([a-z0-9-]+\.)*salistar\.com$/,
    'http://localhost:3000',
    'http://localhost:8081',
  ];
  app.enableCors({
    origin: ORIGINES,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = process.env.PORT || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Salorie API on http://localhost:${port}`);
}
bootstrap();

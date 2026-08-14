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
  app.enableCors({
    origin: [/\.salorie\.com$/, /\.salistar\.com$/, 'http://localhost:3000', 'http://localhost:8081'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = process.env.PORT || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Salorie API on http://localhost:${port}`);
}
bootstrap();

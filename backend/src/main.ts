import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // S3/CORS: restrict to known origins. Native mobile requests send no Origin
  // header and are allowed by the cors lib; only browsers are constrained.
  app.enableCors({
    origin: [/\.salistar\.com$/, /\.gowithsally\.com$/, 'http://localhost:3000', 'http://localhost:8081'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = process.env.PORT || 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Salorie API on http://localhost:${port}`);
}
bootstrap();

import type { RequestListener } from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { NetworkService } from './network/network.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1', {
    // Le callback OAuth est appelé par Google, qui ne connaît pas notre
    // préfixe ; /health doit rester trivial à interroger ; et
    // l'assistant d'installation précède l'existence de l'API versionnée
    // — c'est la première adresse qu'on ouvre sur un serveur neuf.
    exclude: [
      'health',
      'version',
      'identity',
      'calendars/google/callback',
      'setup',
      'setup/*path',
      // L'app interroge la version attendue avant toute connexion, et
      // avant de savoir quelle API ce serveur parle.
      'app-release',
    ],
  });

  app.use(helmet());

  // Le client est une application mobile, pas un navigateur : aucune
  // origine n'a besoin d'être autorisée par défaut.
  app.enableCors({ origin: false });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (config.get<boolean>('MH_EXPOSE_DOCS')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('MyHousehold')
        .setDescription(
          'API du serveur auto-hébergé MyHousehold. Contrat détaillé dans docs/api.md.',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
  }

  app.enableShutdownHooks();

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port, config.getOrThrow<string>('MH_HTTP_HOST'));

  // La même application, en HTTPS, pour le réseau local : c'est là que
  // le téléphone se connecte, en vérifiant l'empreinte du certificat.
  app
    .get(NetworkService)
    .listenHttps(app.getHttpAdapter().getInstance() as RequestListener);
}

void bootstrap();

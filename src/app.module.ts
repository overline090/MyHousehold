import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RightsGuard } from './households/guards/rights.guard';
import { ClockModule } from './common/clock/clock.module';
import { HttpExceptionFilter } from './common/errors/http-exception.filter';
import { PrismaModule } from './common/prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { validateConfig } from './config/configuration';
import { HealthModule } from './health/health.module';
import { ActivityModule } from './activity/activity.module';
import { AdminModule } from './admin/admin.module';
import { AgendaModule } from './agenda/agenda.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { HouseholdsModule } from './households/households.module';
import { NetworkModule } from './network/network.module';
import { ReleasesModule } from './releases/releases.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SetupModule } from './setup/setup.module';
import { WebModule } from './web/web.module';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.module';

/**
 * L'interface web est servie en statique quand elle a été construite.
 * Absente — une installation qui ne sert que l'API, ou un
 * développement où `npm --prefix web run dev` tourne à côté — le
 * serveur démarre quand même.
 */
const RACINE_WEB = join(process.cwd(), 'web-dist');

function interfaceWeb(): DynamicModule[] {
  if (!existsSync(RACINE_WEB)) {
    return [];
  }

  return [
    WebModule.forRoot(RACINE_WEB),
    ServeStaticModule.forRoot({
      rootPath: RACINE_WEB,
      // Ces chemins appartiennent à l'API : l'assistant
      // d'installation en particulier partage son préfixe avec la page
      // qui l'affiche, /setup étant la page et /setup/... les routes.
      exclude: [
        '/api/v1{*path}',
        '/health',
        '/version',
        '/identity',
        '/app-release',
        '/setup/{*path}',
      ],
    }),
  ];
}

@Module({
  imports: [
    ...interfaceWeb(),
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateConfig,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        // Aucun secret dans les journaux. La liste est volontairement
        // large : un champ masqué par excès ne coûte rien, un jeton
        // écrit en clair dans un fichier de log y reste.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.refreshToken',
            'req.body.credentials',
            'req.body.code',
            'res.headers["set-cookie"]',
          ],
          censor: '[masqué]',
        },
        transport:
          process.env.NODE_ENV === 'development'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    ThrottlerModule.forRoot({
      // Un seul limiteur déclaré, volontairement : le garde applique
      // TOUS les limiteurs configurés à TOUTES les routes. Déclarer ici
      // un limiteur strict « pour l'authentification » le soumettait en
      // réalité à chaque endpoint, plafonnant l'app entière à 5 requêtes
      // par quart d'heure. Les routes sensibles resserrent la limite
      // route par route avec @Throttle (voir AuthController).
      throttlers: [{ limit: 300, ttl: 60_000 }],
    }),
    PrismaModule,
    RedisModule,
    ClockModule,
    AuthModule,
    HouseholdsModule,
    TasksModule,
    AppointmentsModule,
    AgendaModule,
    ActivityModule,
    SchedulerModule,
    NetworkModule,
    SetupModule,
    ReleasesModule,
    UsersModule,
    AdminModule,
    HealthModule,
  ],
  providers: [
    // Route protégée par défaut : c'est l'ouverture qui est explicite.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Puis le droit exigé par la route, s'il y en a un. L'ordre compte :
    // il faut un compte résolu pour lire ses droits.
    { provide: APP_GUARD, useClass: RightsGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}

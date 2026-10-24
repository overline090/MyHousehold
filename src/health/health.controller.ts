import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';

interface ComponentStatus {
  status: 'up' | 'down';
  error?: string;
}

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Non authentifié, et volontairement avare en informations : il indique
   * si le serveur fonctionne, sans détailler sa configuration à un
   * visiteur anonyme.
   */
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'État du serveur et de ses dépendances' })
  async health() {
    const [database, redis] = await Promise.all([
      this.check(() => this.prisma.ping()),
      this.check(() => this.redis.ping()),
    ]);

    return {
      // Redis ne sert pas encore de file de jobs : son indisponibilité
      // n'empêche pas de répondre, elle est seulement signalée.
      status: database.status === 'up' ? 'ok' : 'degraded',
      components: { database, redis },
    };
  }

  @Public()
  @Get('version')
  @ApiOperation({ summary: 'Version du serveur' })
  version() {
    return {
      name: 'myhousehold-server',
      version: process.env.npm_package_version ?? '0.1.0',
      environment: this.config.get<string>('NODE_ENV'),
    };
  }

  private async check(probe: () => Promise<boolean>): Promise<ComponentStatus> {
    try {
      return (await probe()) ? { status: 'up' } : { status: 'down' };
    } catch (error) {
      return {
        status: 'down',
        error: error instanceof Error ? error.message : 'erreur inconnue',
      };
    }
  }
}

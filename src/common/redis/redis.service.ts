import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis ne sert pas encore de file de jobs (les jobs arrivent en v0.2),
 * mais la connexion est établie dès maintenant pour que /health signale
 * une indisponibilité avant qu'elle ne casse la génération des tâches.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      // Sans cela, ioredis réessaie indéfiniment et /health reste bloqué.
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    // Un Redis indisponible ne doit pas faire tomber le processus.
    this.client.on('error', () => undefined);
    void this.client.connect().catch(() => undefined);
  }

  async ping(): Promise<boolean> {
    const pong = await this.client.ping();
    return pong === 'PONG';
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}

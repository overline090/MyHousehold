import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { JobName } from '../scheduler/job-names';
import { ReleasesService } from '../releases/releases.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { Right } from '@prisma/client';
import { RequireRight } from '../households/decorators/require-right.decorator';
import { DeleteAccountDto } from '../users/dto/delete-account.dto';
import { statfs } from 'node:fs/promises';
import QRCode from 'qrcode';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { NetworkService } from '../network/network.service';
import { buildServerLink } from '../network/server-link';
import { displayFingerprint } from '../network/tls';
import { UsersService } from '../users/users.service';

/**
 * Administration du serveur : réservée au droit `MANAGE_SERVER`, qui a
 * remplacé l'ancien drapeau « administrateur de l'instance ». Il n'y a
 * plus d'existence à cacher — une machine, un foyer — donc un droit
 * manquant est un 403 et non un 404.
 */
@ApiTags('admin')
@Controller('admin')
@RequireRight(Right.MANAGE_SERVER)
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly scheduler: SchedulerService,
    private readonly releases: ReleasesService,
    private readonly network: NetworkService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Ce que montre Administration › Serveur : de quoi connecter un
   * téléphone (adresse, empreinte, QR code sans code d'appariement), la
   * santé de la machine, et où en sont les téléphones.
   */
  @Get('server')
  @ApiOperation({ summary: 'Le serveur : connexion des téléphones, santé, versions des apps' })
  async server() {
    const address = this.network.localAddress();
    const link = buildServerLink({ address, fingerprint: this.network.fingerprint });
    const essai = async (sonde: () => Promise<boolean>) => {
      try {
        return (await sonde()) ? 'up' : 'down';
      } catch {
        return 'down';
      }
    };
    let disk: { free: number; total: number } | null = null;
    try {
      const stats = await statfs(this.config.getOrThrow<string>('MH_DATA_DIR'));
      disk = { free: stats.bavail * stats.bsize, total: stats.blocks * stats.bsize };
    } catch {
      disk = null;
    }
    const attendue = (await this.releases.appRelease()).version;
    const appareils = await this.prisma.device.findMany({
      where: { appVersion: { not: null }, user: { deletedAt: null } },
      select: { appVersion: true, platform: true, user: { select: { firstName: true } } },
    });
    const enRetard = attendue
      ? appareils.filter((a) => a.appVersion && a.appVersion.replace(/^v/, '') !== attendue.replace(/^v/, ''))
      : [];
    return {
      address,
      fingerprint: this.network.fingerprint,
      fingerprintDisplay: displayFingerprint(this.network.fingerprint),
      link,
      qrSvg: await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
      health: {
        database: await essai(() => this.prisma.ping()),
        redis: await essai(() => this.redis.ping()),
        mdns: this.network.annonceActive,
        disk,
      },
      phones: {
        expectedVersion: attendue,
        total: appareils.length,
        upToDate: appareils.length - enRetard.length,
        behind: enRetard.map((a) => ({ name: a.platform ?? a.user.firstName, version: a.appVersion })),
      },
    };
  }

  @Get('users')
  @ApiOperation({ summary: 'Comptes du serveur' })
  list(
    @Query('includeDeleted', new ParseBoolPipe({ optional: true }))
    includeDeleted?: boolean,
  ) {
    return this.users.listAccounts(includeDeleted ?? false);
  }

  /**
   * Réservé à l'administrateur, et non exposé sur /version : annoncer à
   * tout visiteur qu'un serveur est en retard d'une version, c'est lui
   * indiquer quelles failles essayer.
   */
  @Get('updates')
  @ApiOperation({ summary: 'Mises à jour disponibles pour le serveur et l’app' })
  updates() {
    return this.releases.status();
  }

  /**
   * Relance un balayage sans attendre son prochain passage. Utile quand
   * Redis a été indisponible : les jobs étant idempotents, un
   * déclenchement manuel ne risque rien.
   */
  @Post('jobs/:name/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Déclencher un balayage immédiatement' })
  async runJob(@Param('name') name: string): Promise<{ queued: string }> {
    const known = Object.values(JobName) as string[];
    if (!known.includes(name)) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        `Job inconnu. Valeurs possibles : ${known.join(', ')}.`,
      );
    }

    await this.scheduler.runNow(name);
    return { queued: name };
  }

  @Delete('users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Supprimer le compte d’un membre' })
  async deleteAccount(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.users.deleteAccount(userId, admin, dto.password);
  }
}

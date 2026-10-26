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
  ) {}

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

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
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { JobName } from '../scheduler/job-names';
import { ReleasesService } from '../releases/releases.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { DeleteAccountDto } from '../users/dto/delete-account.dto';
import { UsersService } from '../users/users.service';
import { ServerAdminGuard } from './server-admin.guard';

@ApiTags('admin')
@Controller('admin')
@UseGuards(ServerAdminGuard)
export class AdminController {
  constructor(
    private readonly users: UsersService,
    private readonly scheduler: SchedulerService,
    private readonly releases: ReleasesService,
  ) {}

  @Get('users')
  @ApiOperation({ summary: 'Comptes de l’instance' })
  list(
    @Query('includeDeleted', new ParseBoolPipe({ optional: true }))
    includeDeleted?: boolean,
  ) {
    return this.users.listAccounts(includeDeleted ?? false);
  }

  /**
   * Permet de supprimer le compte de quelqu'un qui n'est plus joignable.
   * Ce n'est pas une exclusion déguisée : le compte disparaît de
   * l'instance entière, il n'est pas retiré d'un foyer.
   */
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
  @ApiOperation({ summary: 'Supprimer le compte d’un membre de l’instance' })
  async deleteAccount(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.users.deleteAccount(userId, admin, dto.password);
  }
}

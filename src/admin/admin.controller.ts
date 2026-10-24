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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { DeleteAccountDto } from '../users/dto/delete-account.dto';
import { UsersService } from '../users/users.service';
import { ServerAdminGuard } from './server-admin.guard';

@ApiTags('admin')
@Controller('admin')
@UseGuards(ServerAdminGuard)
export class AdminController {
  constructor(private readonly users: UsersService) {}

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

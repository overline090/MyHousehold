import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { InvitesService } from './invites.service';

/**
 * Routes d'invitation hors de /households/:householdId : accepter un code
 * se fait justement quand on n'est pas encore membre, donc la garde
 * d'appartenance ne peut pas s'appliquer.
 */
@ApiTags('invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post(':code/accept')
  @ApiOperation({ summary: 'Rejoindre un foyer avec un code' })
  accept(@Param('code') code: string, @CurrentUser() user: AuthenticatedUser) {
    return this.invites.accept(code, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer un code (propriétaire du foyer)' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.invites.revoke(id, user.id);
  }
}

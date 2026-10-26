import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Right } from '@prisma/client';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { RequireRight } from '../households/decorators/require-right.decorator';
import { AvatarsService } from './avatars.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

/** Un téléphone qui envoie plus de 8 Mo pour un avatar se trompe. */
const TAILLE_MAX = 8 * 1024 * 1024;

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly avatars: AvatarsService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Mon profil' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.profile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Modifier mon profil (jamais mon statut)' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(user.id, dto);
  }

  @Post('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Changer mon mot de passe' })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.users.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Put('me/avatar')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TAILLE_MAX } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiOperation({ summary: 'Envoyer ma photo de profil' })
  async setAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: { buffer: Buffer },
  ) {
    if (!file?.buffer?.length) {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        'Aucun fichier reçu, sous le champ « file ».',
      );
    }

    const ancien = await this.users.avatarPathOf(user.id);
    const chemin = await this.avatars.store(user.id, file.buffer);
    const profil = await this.users.setAvatarPath(user.id, chemin);
    await this.avatars.remove(ancien);
    return profil;
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Retirer ma photo de profil' })
  async removeAvatar(@CurrentUser() user: AuthenticatedUser) {
    const ancien = await this.users.avatarPathOf(user.id);
    const profil = await this.users.setAvatarPath(user.id, null);
    await this.avatars.remove(ancien);
    return profil;
  }

  @Get(':userId/avatar')
  @RequireRight(Right.VIEW)
  @ApiOperation({ summary: 'Photo de profil d’un membre' })
  async avatar(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Res() response: Response,
  ): Promise<void> {
    const chemin = await this.users.avatarPathOf(userId);

    if (!chemin) {
      throw AppException.notFound("Ce membre n'a pas de photo de profil.");
    }

    // Le nom du fichier change à chaque envoi : il peut donc se mettre en
    // cache longuement sans qu'une nouvelle photo reste invisible.
    response.setHeader('Cache-Control', 'private, max-age=86400');
    response.sendFile(this.avatars.absolu(chemin));
  }

  /**
   * Seule façon de sortir du foyer : il n'y a pas de départ volontaire
   * ni d'exclusion dans ce modèle.
   */
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Supprimer son compte (irréversible, anonymise l’historique)',
  })
  async deleteOwnAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.users.deleteAccount(user.id, user, dto.password);
  }
}

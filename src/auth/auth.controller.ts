import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './jwt.strategy';
import { effacerCookie, estNavigateur, lireCookie, poserCookie } from './web-session';

/**
 * Limites par route et par IP. La connexion est la seule porte exposée à
 * la force brute, donc la plus serrée.
 *
 * L'inscription est plus permissive à dessein : un foyer qui s'installe
 * crée cinq ou six comptes d'affilée, tous derrière la même adresse IP
 * familiale. Avec la limite de la connexion, le dernier arrivé se
 * retrouvait bloqué.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /** Pour le navigateur : le jeton de renouvellement part dans le cookie, pas dans la réponse. */
  private livrer<T extends { refreshToken: string }>(
    request: Request,
    response: Response,
    session: T,
  ) {
    if (!estNavigateur(request)) return session;
    poserCookie(
      request,
      response,
      session.refreshToken,
      this.config.getOrThrow<number>('MH_REFRESH_TOKEN_TTL'),
    );
    const { refreshToken: _, ...sansJeton } = session;
    return sansJeton;
  }

  private jeton(request: Request, dto: RefreshDto): string {
    const jeton = dto.refreshToken ?? lireCookie(request);
    if (!jeton) {
      throw AppException.unauthorized(
        ErrorCode.REFRESH_TOKEN_INVALID,
        'Session expirée : reconnectez-vous.',
      );
    }
    return jeton;
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @Post('register')
  @ApiOperation({ summary: 'Créer un compte sur cette instance' })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Ouvrir une session' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.livrer(request, response, await this.auth.login(dto));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Échanger et faire tourner le jeton de rafraîchissement' })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.livrer(
      request,
      response,
      await this.auth.refresh(this.jeton(request, dto)),
    );
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer le jeton de cet appareil' })
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const jeton = dto.refreshToken ?? lireCookie(request);
    effacerCookie(response);
    if (jeton) await this.auth.logout(jeton);
  }

  @Get('me')
  @ApiOperation({ summary: 'Profil, statut et droits de l’utilisateur connecté' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}

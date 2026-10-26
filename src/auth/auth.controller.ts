import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './jwt.strategy';

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
  constructor(private readonly auth: AuthService) {}

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
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 900_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Échanger et faire tourner le jeton de rafraîchissement' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Révoquer le jeton de cet appareil' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiOperation({ summary: 'Profil, statut et droits de l’utilisateur connecté' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}

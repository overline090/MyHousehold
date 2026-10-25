import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ReleasesService } from './releases.service';

@ApiTags('releases')
@Controller()
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  /**
   * Public : l'app doit pouvoir l'interroger avant toute connexion, et
   * c'est son serveur qui lui dit quelle version installer.
   */
  @Public()
  @Get('app-release')
  @ApiOperation({ summary: 'Version de l’application attendue par ce serveur' })
  appRelease() {
    return this.releases.appRelease();
  }
}

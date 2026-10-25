import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { join } from 'node:path';
import { Public } from '../auth/decorators/public.decorator';

/** Racine des fichiers construits de l'interface web. */
export const RACINE_WEB = 'RACINE_WEB';

/**
 * La page de l'assistant d'installation.
 *
 * Elle partage son chemin avec les routes de l'API — `/setup` est la
 * page, `/setup/...` sont les routes — et le routeur répondrait donc
 * 404 sur la page sans ce point d'entrée explicite.
 */
@ApiExcludeController()
@Controller()
export class WebController {
  constructor(@Inject(RACINE_WEB) private readonly racine: string) {}

  @Public()
  @Get('setup')
  assistant(@Res() res: Response): void {
    res.sendFile(join(this.racine, 'index.html'));
  }
}

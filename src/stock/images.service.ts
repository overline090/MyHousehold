import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/** Les images importées pour les tableaux et les articles : carrées, petites, en WebP, à côté de la base. */
@Injectable()
export class StockImagesService {
  private readonly logger = new Logger(StockImagesService.name);
  private readonly racine: string;

  constructor(config: ConfigService) {
    this.racine = resolve(config.getOrThrow<string>('MH_DATA_DIR'), 'stock');
  }

  absolu(chemin: string): string {
    return resolve(this.racine, '..', chemin);
  }

  async store(id: string, donnees: Buffer): Promise<string> {
    let carre: Buffer;
    try {
      carre = await sharp(donnees).rotate().resize(256, 256, { fit: 'cover', position: 'attention' }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Ce fichier n'est pas une image que le serveur sache lire (JPEG, PNG, WebP, HEIC).",
      );
    }
    await mkdir(this.racine, { recursive: true });
    const nom = `${id}-${Date.now().toString(36)}.webp`;
    await writeFile(join(this.racine, nom), carre);
    return `stock/${nom}`;
  }

  async remove(chemin: string | null): Promise<void> {
    if (!chemin) return;
    await rm(this.absolu(chemin), { force: true }).catch((erreur: unknown) => this.logger.warn(`Image non effacée : ${String(erreur)}`));
  }
}

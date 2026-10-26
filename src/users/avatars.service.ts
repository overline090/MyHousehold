import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';

/** 256 px suffisent partout où l'app affiche une photo de profil. */
const COTE = 256;

/**
 * Les photos de profil sont des fichiers, à côté de la base : les images
 * n'ont rien à faire dans une base que l'on sauvegarde par `pg_dump`.
 *
 * Elles sont **recompressées à l'arrivée** et l'original n'est jamais
 * conservé : un téléphone envoie volontiers 4 Mo pour une vignette de
 * 96 px, et six personnes rempliraient la carte SD d'un Raspberry Pi en
 * photos que personne ne regardera en taille réelle.
 */
@Injectable()
export class AvatarsService {
  private readonly logger = new Logger(AvatarsService.name);
  private readonly racine: string;

  constructor(config: ConfigService) {
    this.racine = resolve(config.getOrThrow<string>('MH_DATA_DIR'), 'avatars');
  }

  /** Chemin absolu d'un avatar enregistré, à servir en lecture. */
  absolu(chemin: string): string {
    return resolve(this.racine, '..', chemin);
  }

  async store(userId: string, donnees: Buffer): Promise<string> {
    let carre: Buffer;

    try {
      carre = await sharp(donnees)
        .rotate() // respecte l'orientation EXIF, sinon les photos arrivent couchées
        .resize(COTE, COTE, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      // Un fichier illisible par sharp n'est pas une image, quel que
      // soit ce que prétend son nom ou son en-tête HTTP.
      throw AppException.badRequest(
        ErrorCode.VALIDATION_FAILED,
        "Ce fichier n'est pas une image que le serveur sache lire (JPEG, PNG, WebP, HEIC).",
      );
    }

    await mkdir(this.racine, { recursive: true });

    // Le nom change à chaque envoi : un nom fixe resterait en cache dans
    // les navigateurs et les téléphones, et la nouvelle photo ne
    // s'afficherait pas.
    const nom = `${userId}-${Date.now().toString(36)}.webp`;
    await writeFile(join(this.racine, nom), carre);

    return `avatars/${nom}`;
  }

  async remove(chemin: string | null): Promise<void> {
    if (!chemin) {
      return;
    }
    try {
      await rm(this.absolu(chemin), { force: true });
    } catch (error) {
      // Une photo qui ne s'efface pas ne doit pas faire échouer le
      // changement de photo : la ligne en base, elle, est à jour.
      this.logger.warn(`Avatar ${chemin} non supprimé : ${String(error)}`);
    }
  }
}

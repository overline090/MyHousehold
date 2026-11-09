import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';
import { ClockService } from '../common/clock/clock.service';
import { ecrirePolitique, lireOutil, lirePolitique, type PolitiqueDeMiseAJour } from './mise-a-jour.fichiers';

/** Les réglages des mises à jour automatiques, et ce qu'en dit l'outil qui les fait (voir mise-a-jour.fichiers.ts). */
@Injectable()
export class MiseAJourService {
  private readonly logger = new Logger(MiseAJourService.name);
  private readonly dossier: string;

  constructor(
    config: ConfigService,
    private readonly clock: ClockService,
  ) {
    this.dossier = resolve(config.getOrThrow<string>('MH_DATA_DIR'), 'mises-a-jour');
  }

  politique(): Promise<PolitiqueDeMiseAJour> {
    return lirePolitique(this.dossier);
  }

  async changer(changement: Partial<Omit<PolitiqueDeMiseAJour, 'maintenant'>>): Promise<PolitiqueDeMiseAJour> {
    const nouvelle = { ...(await this.politique()), ...changement };
    await ecrirePolitique(this.dossier, nouvelle);
    return nouvelle;
  }

  /** « Mettre à jour maintenant » : l'outil la verra à son prochain passage. */
  async demander(): Promise<PolitiqueDeMiseAJour> {
    const nouvelle = { ...(await this.politique()), maintenant: this.clock.now().toISOString() };
    await ecrirePolitique(this.dossier, nouvelle);
    return nouvelle;
  }

  outil() {
    return lireOutil(this.dossier, this.clock.now());
  }

  /** Au démarrage : le fichier existe, avec ses valeurs par défaut, pour que l'outil n'ait rien à deviner. */
  async initialiser(): Promise<void> {
    try {
      await ecrirePolitique(this.dossier, await this.politique());
    } catch (e) {
      this.logger.warn(`Politique de mise à jour non écrite : ${(e as Error).message}`);
    }
  }
}

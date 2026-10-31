import { Injectable } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { CATALOGUE } from './catalogue';

@Injectable()
export class PluginsService {
  constructor(private readonly prisma: PrismaService) {}

  private async actives(): Promise<Record<string, boolean>> {
    const foyer = await this.prisma.household.findFirst({
      where: { deletedAt: null },
      select: { plugins: true },
    });
    return (foyer?.plugins ?? {}) as Record<string, boolean>;
  }

  async list() {
    const actives = await this.actives();
    return CATALOGUE.map((p) => ({ ...p, enabled: p.disponible && actives[p.id] === true }));
  }

  async setEnabled(id: string, enabled: boolean) {
    const plugin = CATALOGUE.find((p) => p.id === id);
    if (!plugin) throw AppException.notFound("Ce plugin n'existe pas.");
    if (!plugin.disponible && enabled) {
      throw AppException.badRequest(ErrorCode.PLUGIN_DISABLED, 'Ce plugin n’est pas encore disponible.');
    }
    const foyer = await this.prisma.household.findFirstOrThrow({
      where: { deletedAt: null },
      select: { id: true, plugins: true },
    });
    await this.prisma.household.update({
      where: { id: foyer.id },
      data: { plugins: { ...(foyer.plugins as object), [id]: enabled } },
    });
    return this.list();
  }

  /** Les routes d'un plugin désactivé répondent comme s'il n'existait pas. */
  async assertEnabled(id: string): Promise<void> {
    if ((await this.actives())[id] !== true) {
      throw AppException.forbidden(ErrorCode.PLUGIN_DISABLED, 'Ce plugin n’est pas activé sur ce foyer.');
    }
  }
}

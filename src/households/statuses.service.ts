import { Injectable } from '@nestjs/common';
import { Prisma, Right } from '@prisma/client';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { ClockService } from '../common/clock/clock.service';
import { CreateStatusDto, DeleteStatusDto, UpdateStatusDto } from './dto/status.dto';
import { HouseholdsService } from './households.service';
import { DROITS_D_ADMINISTRATION } from './rights';

const SELECTION = {
  id: true,
  name: true,
  rights: true,
  isDefault: true,
  position: true,
  _count: { select: { users: { where: { deletedAt: null } } } },
} satisfies Prisma.StatusSelect;

/**
 * Les statuts et leurs droits. Les mutations ne sont exposées qu'à
 * l'interface web du serveur : l'app Android lit cette liste pour
 * afficher le statut d'un membre, et n'offre aucun écran pour le
 * modifier. Ce n'est pas une restriction technique — le serveur n'a
 * aucun moyen fiable de savoir qui l'appelle — mais une décision de
 * produit, tenue côté client.
 */
@Injectable()
export class StatusesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly households: HouseholdsService,
  ) {}

  async list() {
    const statuts = await this.prisma.status.findMany({
      where: { deletedAt: null },
      select: SELECTION,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return statuts.map((statut) => this.vue(statut));
  }

  async create(dto: CreateStatusDto) {
    const statut = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.status.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.status.create({
        data: {
          id: dto.id,
          name: dto.name.trim(),
          rights: this.normaliser(dto.rights),
          isDefault: dto.isDefault ?? false,
          position: dto.position ?? 0,
        },
        select: SELECTION,
      });
    });

    return this.vue(statut);
  }

  async update(id: string, dto: UpdateStatusDto) {
    const existant = await this.require(id);

    // Retirer un droit d'administration au dernier statut qui le porte
    // bloquerait le foyer : la règle se vérifie membre par membre, car
    // c'est un compte, pas un statut, qui administre.
    if (dto.rights) {
      const futurs = this.normaliser(dto.rights);
      const perdus = DROITS_D_ADMINISTRATION.filter(
        (droit) => existant.rights.includes(droit) && !futurs.includes(droit),
      );

      if (perdus.length > 0) {
        const porteurs = await this.prisma.user.findMany({
          where: { deletedAt: null, statusId: id },
          select: { id: true },
        });

        for (const porteur of porteurs) {
          await this.households.assertResteUnAdministrateur(porteur.id, futurs);
        }
      }
    }

    const statut = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.status.updateMany({
          where: { isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }
      return tx.status.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          rights: dto.rights ? this.normaliser(dto.rights) : undefined,
          isDefault: dto.isDefault,
          position: dto.position,
        },
        select: SELECTION,
      });
    });

    return this.vue(statut);
  }

  /**
   * Supprimer un statut porté par quelqu'un demande de dire où vont ses
   * membres : le supprimer en silence reviendrait à leur retirer des
   * droits sans le dire.
   */
  async remove(id: string, dto: DeleteStatusDto): Promise<void> {
    const statut = await this.require(id);

    const porteurs = await this.prisma.user.findMany({
      where: { deletedAt: null, statusId: id },
      select: { id: true },
    });

    let destination: { id: string; rights: Right[] } | null = null;

    if (porteurs.length > 0) {
      if (!dto.moveMembersTo) {
        throw AppException.conflict(
          ErrorCode.STATUS_IN_USE,
          `« ${statut.name} » est porté par ${porteurs.length} membre(s). Indiquez vers quel statut les déplacer.`,
          { memberCount: porteurs.length },
        );
      }

      if (dto.moveMembersTo === id) {
        throw AppException.badRequest(
          ErrorCode.VALIDATION_FAILED,
          'Les membres ne peuvent pas être déplacés vers le statut supprimé.',
        );
      }

      destination = await this.require(dto.moveMembersTo);

      for (const porteur of porteurs) {
        await this.households.assertResteUnAdministrateur(porteur.id, destination.rights);
      }
    }

    const estDefaut = await this.prisma.status.findUnique({
      where: { id },
      select: { isDefault: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (destination) {
        await tx.user.updateMany({
          where: { statusId: id },
          data: { statusId: destination.id },
        });
        await tx.invite.updateMany({
          where: { statusId: id },
          data: { statusId: destination.id },
        });
      }

      await tx.status.update({
        where: { id },
        data: { deletedAt: this.clock.now(), isDefault: false },
      });

      // Un foyer sans statut par défaut n'aurait rien à donner au
      // prochain arrivant : le plus prudent des restants reprend le rôle.
      if (estDefaut?.isDefault) {
        const repli = await tx.status.findFirst({
          where: { deletedAt: null },
          orderBy: [{ position: 'desc' }, { name: 'asc' }],
          select: { id: true },
        });
        if (repli) {
          await tx.status.update({ where: { id: repli.id }, data: { isDefault: true } });
        }
      }
    });
  }

  /** Statut donné aux nouveaux comptes. */
  async defaultStatusId(): Promise<string> {
    const statut =
      (await this.prisma.status.findFirst({
        where: { deletedAt: null, isDefault: true },
        select: { id: true },
      })) ??
      (await this.prisma.status.findFirst({
        where: { deletedAt: null },
        orderBy: { position: 'desc' },
        select: { id: true },
      }));

    if (!statut) {
      throw AppException.notFound("Ce serveur n'a aucun statut configuré.");
    }

    return statut.id;
  }

  /** Statut portant tous les droits, donné au premier compte. */
  async administratorStatusId(): Promise<string> {
    const statuts = await this.prisma.status.findMany({
      where: { deletedAt: null },
      select: { id: true, rights: true, position: true },
      orderBy: { position: 'asc' },
    });

    const administrateur = statuts.find((statut) =>
      DROITS_D_ADMINISTRATION.every((droit) => statut.rights.includes(droit)),
    );

    if (!administrateur) {
      throw AppException.notFound("Ce serveur n'a aucun statut d'administration.");
    }

    return administrateur.id;
  }

  private async require(id: string) {
    const statut = await this.prisma.status.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, rights: true },
    });
    if (!statut) {
      throw AppException.notFound("Ce statut n'existe pas.");
    }
    return statut;
  }

  /** `VIEW` est implicite : un statut qui ne voit rien ne sert à rien. */
  private normaliser(rights: Right[]): Right[] {
    const uniques = new Set<Right>(rights);
    uniques.add(Right.VIEW);
    return [...uniques];
  }

  private vue(statut: {
    id: string;
    name: string;
    rights: Right[];
    isDefault: boolean;
    position: number;
    _count: { users: number };
  }) {
    const { _count, ...reste } = statut;
    return { ...reste, memberCount: _count.users };
  }
}

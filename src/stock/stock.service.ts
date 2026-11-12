import { Injectable } from '@nestjs/common';
import { ActivityVerb, Prisma } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../common/prisma/prisma.service';
import { todayIn } from '../tasks/recurrence';
import {
  CreateBoardDto,
  CreateGroupDto,
  CreateItemDto,
  SortieDto,
  UpdateBoardDto,
  UpdateGroupDto,
  UpdateItemDto,
} from './dto/stock.dto';

/**
 * Change à chaque image importée : l'app ne retélécharge une image que
 * quand sa version a changé.
 */
function versionDe(imagePath: string | null): string | null {
  return imagePath ? (imagePath.split('/').pop() ?? imagePath).replace(/\.webp$/, '').split('-').pop() ?? null : null;
}

const BOARD = {
  id: true,
  name: true,
  icon: true,
  imagePath: true,
  color: true,
  position: true,
  updatedAt: true,
  _count: { select: { items: { where: { deletedAt: null } } } },
} satisfies Prisma.StockBoardSelect;

const GROUP = {
  id: true,
  boardId: true,
  name: true,
  color: true,
  position: true,
  updatedAt: true,
} satisfies Prisma.StockGroupSelect;

const ITEM = {
  id: true,
  boardId: true,
  groupId: true,
  name: true,
  icon: true,
  imagePath: true,
  color: true,
  quantity: true,
  minimum: true,
  expiresOn: true,
  link: true,
  detail: true,
  position: true,
  updatedAt: true,
} satisfies Prisma.StockItemSelect;

/** Bientôt périmé : dans les quinze jours. */
const JOURS_AVANT_PEREMPTION = 15;

type ItemRow = Prisma.StockItemGetPayload<{ select: typeof ITEM }>;

/**
 * Le plugin Gestion de stock : des tableaux d'articles, leurs quantités,
 * et les sorties déclarées. Un article sous son minimum est « à
 * racheter » ; un article qui périme dans les quinze jours, « bientôt
 * périmé ».
 */
@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
  ) {}

  private async foyer() {
    return this.prisma.household.findFirstOrThrow({ where: { deletedAt: null }, select: { id: true, timezone: true } });
  }

  private vueTableau(b: Prisma.StockBoardGetPayload<{ select: typeof BOARD }>) {
    const { _count, imagePath, ...reste } = b;
    return { ...reste, hasImage: !!imagePath, imageVersion: versionDe(imagePath), itemCount: _count.items };
  }

  private vueArticle(i: ItemRow, aujourdHui: string) {
    const { imagePath, expiresOn, ...reste } = i;
    const peremption = expiresOn ? expiresOn.toISOString().slice(0, 10) : null;
    const limite = new Date(`${aujourdHui}T00:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() + JOURS_AVANT_PEREMPTION);
    return {
      ...reste,
      expiresOn: peremption,
      hasImage: !!imagePath,
      imageVersion: versionDe(imagePath),
      toBuy: i.minimum !== null && i.quantity < i.minimum,
      expired: peremption !== null && peremption < aujourdHui,
      expiresSoon: peremption !== null && peremption <= limite.toISOString().slice(0, 10),
    };
  }

  // ── Tableaux ──────────────────────────────────────────────────────────

  async boards() {
    const foyer = await this.foyer();
    const rows = await this.prisma.stockBoard.findMany({
      where: { householdId: foyer.id, deletedAt: null },
      select: BOARD,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((b) => this.vueTableau(b));
  }

  async createBoard(dto: CreateBoardDto) {
    const foyer = await this.foyer();
    // Création idempotente : un envoi rejoué par le téléphone ne crée pas un second tableau.
    if (dto.id) {
      const existant = await this.prisma.stockBoard.findUnique({ where: { id: dto.id }, select: { ...BOARD, householdId: true } });
      if (existant) {
        if (existant.householdId !== foyer.id) throw AppException.notFound("Ce tableau n'existe pas.");
        return this.vueTableau(existant);
      }
    }
    const b = await this.prisma.stockBoard.create({
      data: { id: dto.id, householdId: foyer.id, name: dto.name.trim(), icon: dto.icon ?? null, color: dto.color ?? null, position: dto.position ?? 0 },
      select: BOARD,
    });
    return this.vueTableau(b);
  }

  async updateBoard(id: string, dto: UpdateBoardDto) {
    await this.requireBoard(id);
    const b = await this.prisma.stockBoard.update({
      where: { id },
      data: { name: dto.name?.trim(), icon: dto.icon, color: dto.color, position: dto.position },
      select: BOARD,
    });
    return this.vueTableau(b);
  }

  async removeBoard(id: string) {
    await this.requireBoard(id);
    const maintenant = this.clock.now();
    await this.prisma.$transaction([
      this.prisma.stockItem.updateMany({ where: { boardId: id, deletedAt: null }, data: { deletedAt: maintenant } }),
      this.prisma.stockGroup.updateMany({ where: { boardId: id, deletedAt: null }, data: { deletedAt: maintenant } }),
      this.prisma.stockBoard.update({ where: { id }, data: { deletedAt: maintenant } }),
    ]);
  }

  async requireBoard(id: string) {
    const foyer = await this.foyer();
    const b = await this.prisma.stockBoard.findFirst({ where: { id, householdId: foyer.id, deletedAt: null }, select: { id: true, imagePath: true } });
    if (!b) throw AppException.notFound("Ce tableau n'existe pas.");
    return b;
  }

  async setBoardImage(id: string, chemin: string | null) {
    const b = await this.prisma.stockBoard.update({ where: { id }, data: { imagePath: chemin, ...(chemin ? { icon: null } : {}) }, select: BOARD });
    return this.vueTableau(b);
  }

  // ── Articles ──────────────────────────────────────────────────────────

  async items(boardId?: string) {
    const foyer = await this.foyer();
    const aujourdHui = todayIn(foyer.timezone, this.clock.now());
    const rows = await this.prisma.stockItem.findMany({
      where: { deletedAt: null, board: { householdId: foyer.id, deletedAt: null }, ...(boardId ? { boardId } : {}) },
      select: ITEM,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return rows.map((i) => this.vueArticle(i, aujourdHui));
  }

  /** Pour la tuile « À racheter » : sous le minimum, ou bientôt périmé, tous tableaux confondus. */
  async aRacheter() {
    const tous = await this.items();
    const tableaux = new Map((await this.boards()).map((b) => [b.id, b.name]));
    return tous
      .filter((i) => i.toBuy || i.expiresSoon)
      .map((i) => ({ ...i, boardName: tableaux.get(i.boardId) ?? null }));
  }

  async createItem(dto: CreateItemDto) {
    await this.requireBoard(dto.boardId);
    const foyer = await this.foyer();
    if (dto.id) {
      const existant = await this.prisma.stockItem.findUnique({ where: { id: dto.id }, select: { ...ITEM, board: { select: { householdId: true } } } });
      if (existant) {
        if (existant.board.householdId !== foyer.id) throw AppException.notFound("Cet article n'existe pas.");
        const { board: _board, ...article } = existant;
        return this.vueArticle(article, todayIn(foyer.timezone, this.clock.now()));
      }
    }
    const i = await this.prisma.stockItem.create({
      data: {
        id: dto.id,
        boardId: dto.boardId,
        name: dto.name.trim(),
        icon: dto.icon ?? null,
        color: dto.color ?? null,
        quantity: dto.quantity ?? 0,
        minimum: dto.minimum ?? null,
        expiresOn: dto.expiresOn ? new Date(dto.expiresOn) : null,
        link: dto.link || null,
        detail: dto.detail?.trim() || null,
        groupId: await this.groupeDuTableau(dto.groupId, dto.boardId),
      },
      select: ITEM,
    });
    return this.vueArticle(i, todayIn(foyer.timezone, this.clock.now()));
  }

  async updateItem(id: string, dto: UpdateItemDto) {
    const avant = await this.requireItem(id);
    if (dto.boardId) await this.requireBoard(dto.boardId);
    const foyer = await this.foyer();
    const tableau = dto.boardId ?? avant.boardId;
    // Changer de tableau sans dire de groupe : l'article quitte l'ancien groupe.
    const groupId =
      dto.groupId !== undefined
        ? await this.groupeDuTableau(dto.groupId, tableau)
        : dto.boardId && dto.boardId !== avant.boardId
          ? null
          : undefined;
    const i = await this.prisma.stockItem.update({
      where: { id },
      data: {
        boardId: dto.boardId,
        name: dto.name?.trim(),
        icon: dto.icon,
        color: dto.color,
        quantity: dto.quantity,
        minimum: dto.minimum,
        expiresOn: dto.expiresOn === undefined ? undefined : dto.expiresOn ? new Date(dto.expiresOn) : null,
        link: dto.link === undefined ? undefined : dto.link || null,
        detail: dto.detail === undefined ? undefined : dto.detail?.trim() || null,
        groupId,
      },
      select: ITEM,
    });
    return this.vueArticle(i, todayIn(foyer.timezone, this.clock.now()));
  }

  async removeItem(id: string) {
    await this.requireItem(id);
    await this.prisma.stockItem.update({ where: { id }, data: { deletedAt: this.clock.now() } });
  }

  async requireItem(id: string) {
    const foyer = await this.foyer();
    const i = await this.prisma.stockItem.findFirst({
      where: { id, deletedAt: null, board: { householdId: foyer.id, deletedAt: null } },
      select: { id: true, imagePath: true, quantity: true, name: true, boardId: true },
    });
    if (!i) throw AppException.notFound("Cet article n'existe pas.");
    return i;
  }

  async setItemImage(id: string, chemin: string | null) {
    const foyer = await this.foyer();
    const i = await this.prisma.stockItem.update({ where: { id }, data: { imagePath: chemin, ...(chemin ? { icon: null } : {}) }, select: ITEM });
    return this.vueArticle(i, todayIn(foyer.timezone, this.clock.now()));
  }

  /** + ou − depuis la liste. La quantité ne descend pas sous zéro, et l'historique le garde. */
  async adjust(id: string, delta: number, actorId?: string) {
    const avant = await this.requireItem(id);
    const apres = Math.max(0, avant.quantity + delta);
    if (apres !== avant.quantity) {
      await this.prisma.stockMovement.create({ data: { itemId: id, delta: apres - avant.quantity, actorId: actorId ?? null } });
    }
    return this.updateItem(id, { quantity: apres });
  }

  /**
   * Déclarer une sortie : consommé, utilisé, jeté. Toutes les quantités
   * baissent ensemble, et le journal du foyer le raconte.
   */
  async sortie(dto: SortieDto, actorId: string) {
    const foyer = await this.foyer();
    const articles = await Promise.all(dto.items.map((l) => this.requireItem(l.id)));
    const ids = new Set<string>();
    for (const l of dto.items) {
      if (ids.has(l.id)) throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, 'Le même article apparaît deux fois.');
      ids.add(l.id);
    }
    const note = dto.note?.trim() || null;
    await this.prisma.$transaction([
      ...dto.items.map((l, k) =>
        this.prisma.stockItem.update({ where: { id: l.id }, data: { quantity: Math.max(0, articles[k].quantity - l.quantity) } }),
      ),
      // Ce qui est vraiment sorti : jamais plus que ce qu'il y avait.
      ...dto.items
        .map((l, k) => ({ l, retire: Math.min(l.quantity, articles[k].quantity) }))
        .filter(({ retire }) => retire > 0)
        .map(({ l, retire }) => this.prisma.stockMovement.create({ data: { itemId: l.id, delta: -retire, note, actorId } })),
      this.prisma.activityLog.create({
        data: {
          householdId: foyer.id,
          actorId,
          verb: ActivityVerb.STOCK_OUT,
          summary:
            `a déclaré une sortie de stock : ${dto.items.map((l, k) => `${articles[k].name} ×${l.quantity}`).join(', ')}` +
            (note ? ` — « ${note} »` : ''),
          subjectType: 'STOCK',
          subjectId: dto.items[0].id,
        },
      }),
    ]);
    return this.items();
  }

  // ── Groupes ───────────────────────────────────────────────────────────

  /** Les groupes d'un tableau, ou de tous. */
  async groups(boardId?: string) {
    const foyer = await this.foyer();
    return this.prisma.stockGroup.findMany({
      where: { deletedAt: null, board: { householdId: foyer.id, deletedAt: null }, ...(boardId ? { boardId } : {}) },
      select: GROUP,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createGroup(dto: CreateGroupDto) {
    await this.requireBoard(dto.boardId);
    const foyer = await this.foyer();
    if (dto.id) {
      const existant = await this.prisma.stockGroup.findUnique({ where: { id: dto.id }, select: { ...GROUP, board: { select: { householdId: true } } } });
      if (existant) {
        if (existant.board.householdId !== foyer.id) throw AppException.notFound("Ce groupe n'existe pas.");
        const { board: _board, ...groupe } = existant;
        return groupe;
      }
    }
    return this.prisma.stockGroup.create({
      data: { id: dto.id, boardId: dto.boardId, name: dto.name.trim(), color: dto.color ?? '#0F766E', position: dto.position ?? 0 },
      select: GROUP,
    });
  }

  async updateGroup(id: string, dto: UpdateGroupDto) {
    await this.requireGroup(id);
    return this.prisma.stockGroup.update({
      where: { id },
      data: { name: dto.name?.trim(), color: dto.color, position: dto.position },
      select: GROUP,
    });
  }

  /** Supprimer un groupe garde ses articles : ils passent « Sans groupe ». */
  async removeGroup(id: string) {
    await this.requireGroup(id);
    await this.prisma.$transaction([
      this.prisma.stockItem.updateMany({ where: { groupId: id }, data: { groupId: null } }),
      this.prisma.stockGroup.update({ where: { id }, data: { deletedAt: this.clock.now() } }),
    ]);
  }

  private async requireGroup(id: string) {
    const foyer = await this.foyer();
    const g = await this.prisma.stockGroup.findFirst({
      where: { id, deletedAt: null, board: { householdId: foyer.id, deletedAt: null } },
      select: { id: true, boardId: true },
    });
    if (!g) throw AppException.notFound("Ce groupe n'existe pas.");
    return g;
  }

  /** Un groupe n'accueille que les articles de son tableau. */
  private async groupeDuTableau(groupId: string | null | undefined, boardId: string): Promise<string | null> {
    if (!groupId) return null;
    const g = await this.requireGroup(groupId);
    if (g.boardId !== boardId) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, "Ce groupe appartient à un autre tableau.");
    }
    return g.id;
  }

  // ── Historique ────────────────────────────────────────────────────────

  /** Les mouvements des 90 derniers jours, tous articles : ce que l'app garde pour ses fiches. */
  async recentMovements() {
    const foyer = await this.foyer();
    const depuis = new Date(this.clock.now().getTime() - 90 * 86_400_000);
    return this.prisma.stockMovement.findMany({
      where: { createdAt: { gte: depuis }, item: { deletedAt: null, board: { householdId: foyer.id, deletedAt: null } } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { id: true, itemId: true, delta: true, note: true, createdAt: true, actor: { select: { id: true, firstName: true } } },
    });
  }

  /** Les derniers mouvements d'un article : ce qui est entré, sorti, par qui, et la note. */
  async movements(itemId: string) {
    await this.requireItem(itemId);
    const rows = await this.prisma.stockMovement.findMany({
      where: { itemId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, delta: true, note: true, createdAt: true, actor: { select: { id: true, firstName: true } } },
    });
    return rows;
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

/**
 * Fil d'activité du foyer. Les textes sont figés à l'écriture et ne
 * recopient pas le nom de leur auteur : il est résolu depuis la table
 * des comptes, ce qui fait qu'anonymiser un compte supprimé anonymise
 * tout son historique d'un coup.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async list(householdId: string, limit: number, cursor?: string) {
    const rows = await this.prisma.activityLog.findMany({
      where: { householdId },
      select: {
        id: true,
        verb: true,
        summary: true,
        subjectType: true,
        subjectId: true,
        createdAt: true,
        actor: { select: { id: true, displayName: true, avatarColor: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const page = rows.slice(0, limit);
    return {
      data: page,
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}

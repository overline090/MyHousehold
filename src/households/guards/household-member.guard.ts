import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HouseholdRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../auth/jwt.strategy';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REQUIRED_ROLE_KEY } from '../decorators/require-role.decorator';
import { MembershipCacheService } from '../membership-cache.service';
import { hasAtLeastRole } from '../roles';

export interface HouseholdMembershipContext {
  householdId: string;
  role: HouseholdRole;
}

/**
 * Seule frontière de sécurité du projet : un membre du foyer A ne doit
 * jamais atteindre une donnée du foyer B.
 *
 * Un non-membre reçoit 404 et non 403, pour ne pas confirmer l'existence
 * d'un foyer qu'il n'a pas le droit de voir. 403 est réservé au cas où
 * l'on est bien membre, mais avec un rôle insuffisant.
 */
@Injectable()
export class HouseholdMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly cache: MembershipCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { membership?: HouseholdMembershipContext }>();
    const user = request.user as AuthenticatedUser | undefined;
    const rawHouseholdId: unknown = request.params?.householdId;
    const householdId = typeof rawHouseholdId === 'string' ? rawHouseholdId : undefined;

    if (!user || !householdId) {
      throw AppException.notFound();
    }

    const role = await this.resolveRole(user.id, householdId);
    if (!role) {
      throw AppException.notFound();
    }

    request.membership = { householdId, role };

    const required = this.reflector.getAllAndOverride<HouseholdRole>(REQUIRED_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required && !hasAtLeastRole(role, required)) {
      throw AppException.forbidden(
        ErrorCode.FORBIDDEN_ROLE,
        'Votre rôle dans ce foyer ne permet pas cette action.',
        { requiredRole: required, yourRole: role },
      );
    }

    return true;
  }

  /**
   * Cache court, porté par MembershipCacheService. Le JWT ne contient pas
   * les rôles — ils changeraient sans que le jeton expire — donc on les
   * relit, avec 30 secondes de tolérance pour ne pas faire une requête
   * par appel.
   */
  private async resolveRole(
    userId: string,
    householdId: string,
  ): Promise<HouseholdRole | null> {
    const cached = this.cache.get(userId, householdId);
    if (cached) {
      return cached;
    }

    const membership = await this.prisma.householdMember.findFirst({
      where: {
        userId,
        householdId,
        deletedAt: null,
        household: { deletedAt: null },
      },
      select: { role: true },
    });

    if (!membership) {
      this.cache.invalidate(userId, householdId);
      return null;
    }

    this.cache.set(userId, householdId, membership.role);
    return membership.role;
  }
}

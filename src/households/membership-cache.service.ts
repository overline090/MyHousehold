import { Injectable } from '@nestjs/common';
import { HouseholdRole } from '@prisma/client';
import { ClockService } from '../common/clock/clock.service';

const TTL_MS = 30_000;

/**
 * Cache des appartenances, partagé entre le garde (qui le remplit) et les
 * services (qui l'invalident après un changement de rôle ou une
 * exclusion).
 *
 * Il est délibérément dans un fournisseur distinct : Nest peut créer sa
 * propre instance d'un garde déclaré par @UseGuards, et un cache porté
 * par le garde lui-même n'est alors pas celui que le service invalide.
 * Un départ restait visible pendant 30 secondes.
 *
 * Cache en mémoire du processus : à remplacer par Redis le jour où le
 * serveur tournera en plusieurs instances. Pour un foyer auto-hébergé,
 * un seul processus est la norme.
 */
@Injectable()
export class MembershipCacheService {
  private readonly entries = new Map<
    string,
    { role: HouseholdRole; expiresAt: number }
  >();

  constructor(private readonly clock: ClockService) {}

  get(userId: string, householdId: string): HouseholdRole | undefined {
    const key = this.keyOf(userId, householdId);
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.clock.now().getTime()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.role;
  }

  set(userId: string, householdId: string, role: HouseholdRole): void {
    this.entries.set(this.keyOf(userId, householdId), {
      role,
      expiresAt: this.clock.now().getTime() + TTL_MS,
    });
  }

  invalidate(userId: string, householdId: string): void {
    this.entries.delete(this.keyOf(userId, householdId));
  }

  /** Après une suppression de foyer : toutes ses appartenances tombent. */
  invalidateHousehold(householdId: string): void {
    for (const key of this.entries.keys()) {
      if (key.endsWith(`:${householdId}`)) {
        this.entries.delete(key);
      }
    }
  }

  private keyOf(userId: string, householdId: string): string {
    return `${userId}:${householdId}`;
  }
}

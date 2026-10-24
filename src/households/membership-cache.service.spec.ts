import { HouseholdRole } from '@prisma/client';
import { FixedClock } from '../common/clock/clock.service';
import { MembershipCacheService } from './membership-cache.service';

const USER = 'user-1';
const HOUSEHOLD = 'household-1';

describe('MembershipCacheService', () => {
  let clock: FixedClock;
  let cache: MembershipCacheService;

  beforeEach(() => {
    clock = new FixedClock(new Date('2026-10-24T18:00:00Z'));
    cache = new MembershipCacheService(clock);
  });

  it('rend le rôle mis en cache', () => {
    cache.set(USER, HOUSEHOLD, HouseholdRole.OWNER);
    expect(cache.get(USER, HOUSEHOLD)).toBe(HouseholdRole.OWNER);
  });

  it('ne rend rien pour une appartenance inconnue', () => {
    expect(cache.get(USER, HOUSEHOLD)).toBeUndefined();
  });

  it('oublie une entrée au bout de 30 secondes', () => {
    cache.set(USER, HOUSEHOLD, HouseholdRole.ADULT);
    clock.advance(29);
    expect(cache.get(USER, HOUSEHOLD)).toBe(HouseholdRole.ADULT);
    clock.advance(2);
    expect(cache.get(USER, HOUSEHOLD)).toBeUndefined();
  });

  it('invalide immédiatement après une exclusion ou un départ', () => {
    // C'est le cœur du problème que ce cache partagé résout : un membre
    // exclu gardait l'accès pendant 30 secondes.
    cache.set(USER, HOUSEHOLD, HouseholdRole.OWNER);
    cache.invalidate(USER, HOUSEHOLD);
    expect(cache.get(USER, HOUSEHOLD)).toBeUndefined();
  });

  it('invalide tout un foyer sans toucher aux autres', () => {
    cache.set(USER, HOUSEHOLD, HouseholdRole.OWNER);
    cache.set('user-2', HOUSEHOLD, HouseholdRole.CHILD);
    cache.set(USER, 'household-2', HouseholdRole.ADULT);

    cache.invalidateHousehold(HOUSEHOLD);

    expect(cache.get(USER, HOUSEHOLD)).toBeUndefined();
    expect(cache.get('user-2', HOUSEHOLD)).toBeUndefined();
    expect(cache.get(USER, 'household-2')).toBe(HouseholdRole.ADULT);
  });
});

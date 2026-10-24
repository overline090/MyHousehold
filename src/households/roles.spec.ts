import { HouseholdRole } from '@prisma/client';
import { hasAtLeastRole, ROLE_TO_COMPLETE, ROLE_TO_MANAGE_CONTENT } from './roles';

describe('hiérarchie des rôles', () => {
  it('un propriétaire peut tout ce que peut un adulte', () => {
    expect(hasAtLeastRole(HouseholdRole.OWNER, HouseholdRole.ADULT)).toBe(true);
    expect(hasAtLeastRole(HouseholdRole.OWNER, HouseholdRole.OWNER)).toBe(true);
  });

  it('un adulte n’est pas propriétaire', () => {
    expect(hasAtLeastRole(HouseholdRole.ADULT, HouseholdRole.OWNER)).toBe(false);
  });

  it('un enfant complète ce qui lui est assigné mais ne gère pas le contenu', () => {
    expect(hasAtLeastRole(HouseholdRole.CHILD, ROLE_TO_COMPLETE)).toBe(true);
    expect(hasAtLeastRole(HouseholdRole.CHILD, ROLE_TO_MANAGE_CONTENT)).toBe(false);
  });

  it('un invité ne fait que lire', () => {
    expect(hasAtLeastRole(HouseholdRole.GUEST, ROLE_TO_COMPLETE)).toBe(false);
    expect(hasAtLeastRole(HouseholdRole.GUEST, ROLE_TO_MANAGE_CONTENT)).toBe(false);
  });
});

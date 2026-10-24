import { HouseholdRole } from '@prisma/client';
import { pickOwnershipSuccessor, SuccessorCandidate } from './ownership-successor';

const at = (iso: string): Date => new Date(iso);

const candidate = (
  userId: string,
  role: HouseholdRole,
  joinedAt: string,
): SuccessorCandidate => ({ userId, role, joinedAt: at(joinedAt) });

describe('pickOwnershipSuccessor', () => {
  it('choisit l’adulte le plus ancien', () => {
    const picked = pickOwnershipSuccessor([
      candidate('recent', HouseholdRole.ADULT, '2026-06-01'),
      candidate('ancien', HouseholdRole.ADULT, '2026-01-01'),
      candidate('enfant', HouseholdRole.CHILD, '2025-01-01'),
    ]);
    expect(picked?.userId).toBe('ancien');
  });

  it('préfère un propriétaire restant s’il y en a un', () => {
    const picked = pickOwnershipSuccessor([
      candidate('adulte', HouseholdRole.ADULT, '2025-01-01'),
      candidate('copropriétaire', HouseholdRole.OWNER, '2026-01-01'),
    ]);
    expect(picked?.userId).toBe('copropriétaire');
  });

  it('se rabat sur l’enfant le plus ancien plutôt que de détruire le foyer', () => {
    const picked = pickOwnershipSuccessor([
      candidate('cadet', HouseholdRole.CHILD, '2026-06-01'),
      candidate('aîné', HouseholdRole.CHILD, '2026-01-01'),
    ]);
    expect(picked?.userId).toBe('aîné');
  });

  it('écarte les invités', () => {
    // Un invité est de passage : il n'a pas vocation à administrer un foyer.
    expect(
      pickOwnershipSuccessor([candidate('invite', HouseholdRole.GUEST, '2026-01-01')]),
    ).toBeNull();
  });

  it('ne désigne personne dans un foyer vide', () => {
    expect(pickOwnershipSuccessor([])).toBeNull();
  });
});

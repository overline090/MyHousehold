import { pickAdminSuccessor } from './admin-successor';

describe('pickAdminSuccessor', () => {
  const le = (jour: number) => new Date(`2026-03-${String(jour).padStart(2, '0')}T10:00:00Z`);

  it('désigne le compte actif le plus ancien', () => {
    const successeur = pickAdminSuccessor([
      { userId: 'paul', createdAt: le(5) },
      { userId: 'lou', createdAt: le(2) },
      { userId: 'noe', createdAt: le(9) },
    ]);

    expect(successeur?.userId).toBe('lou');
  });

  it('ne modifie pas la liste reçue', () => {
    const candidats = [
      { userId: 'paul', createdAt: le(5) },
      { userId: 'lou', createdAt: le(2) },
    ];

    pickAdminSuccessor(candidats);

    expect(candidats.map((c) => c.userId)).toEqual(['paul', 'lou']);
  });

  it("rend null quand il ne reste personne — le foyer part avec le dernier compte", () => {
    expect(pickAdminSuccessor([])).toBeNull();
  });
});

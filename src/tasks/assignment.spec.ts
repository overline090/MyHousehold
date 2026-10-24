import { AssignmentMode } from '@prisma/client';
import { assertAssignmentIsCoherent, assigneeForOrdinal } from './assignment';

const MARIE = 'marie';
const PAUL = 'paul';
const LOU = 'lou';

describe('assigneeForOrdinal', () => {
  it('fait tourner dans l’ordre de la liste', () => {
    const pool = [MARIE, PAUL, LOU];
    const turns = [0, 1, 2, 3, 4, 5].map((o) =>
      assigneeForOrdinal(AssignmentMode.ROTATION, pool, o),
    );
    expect(turns).toEqual([MARIE, PAUL, LOU, MARIE, PAUL, LOU]);
  });

  it('rend toujours la même personne pour une tâche fixe', () => {
    expect(assigneeForOrdinal(AssignmentMode.FIXED, [MARIE], 0)).toBe(MARIE);
    expect(assigneeForOrdinal(AssignmentMode.FIXED, [MARIE], 7)).toBe(MARIE);
  });

  it('n’assigne personne pour une tâche ouverte à tous', () => {
    expect(assigneeForOrdinal(AssignmentMode.ANYONE, [], 3)).toBeNull();
  });

  it('est déterministe : la même position donne toujours la même personne', () => {
    // C'est la propriété qui compte : regénérer la série ne doit pas
    // redistribuer les tours.
    const pool = [MARIE, PAUL];
    expect(assigneeForOrdinal(AssignmentMode.ROTATION, pool, 42)).toBe(
      assigneeForOrdinal(AssignmentMode.ROTATION, pool, 42),
    );
    expect(assigneeForOrdinal(AssignmentMode.ROTATION, pool, 42)).toBe(MARIE);
  });

  it('ne tombe pas sur une liste vide', () => {
    expect(assigneeForOrdinal(AssignmentMode.ROTATION, [], 1)).toBeNull();
  });
});

describe('assertAssignmentIsCoherent', () => {
  it('accepte les combinaisons valides', () => {
    expect(() => assertAssignmentIsCoherent(AssignmentMode.ANYONE, [])).not.toThrow();
    expect(() => assertAssignmentIsCoherent(AssignmentMode.FIXED, [MARIE])).not.toThrow();
    expect(() =>
      assertAssignmentIsCoherent(AssignmentMode.ROTATION, [MARIE, PAUL]),
    ).not.toThrow();
  });

  it('refuse une tâche fixe à plusieurs personnes', () => {
    // Une occurrence n'a qu'un assigné : « plusieurs personnes fixes »
    // n'aurait pas de traduction.
    expect(() => assertAssignmentIsCoherent(AssignmentMode.FIXED, [MARIE, PAUL])).toThrow(
      /exactement une personne/,
    );
  });

  it('refuse une tâche fixe sans personne', () => {
    expect(() => assertAssignmentIsCoherent(AssignmentMode.FIXED, [])).toThrow();
  });

  it('refuse un tour de rôle à une seule personne', () => {
    expect(() => assertAssignmentIsCoherent(AssignmentMode.ROTATION, [MARIE])).toThrow(
      /au moins deux personnes/,
    );
  });

  it('refuse une liste sur une tâche ouverte à tous', () => {
    expect(() => assertAssignmentIsCoherent(AssignmentMode.ANYONE, [MARIE])).toThrow(
      /ne désigne personne/,
    );
  });

  it('refuse un doublon dans la liste', () => {
    expect(() =>
      assertAssignmentIsCoherent(AssignmentMode.ROTATION, [MARIE, PAUL, MARIE]),
    ).toThrow(/deux fois/);
  });
});

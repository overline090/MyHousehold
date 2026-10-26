import { AssignmentMode, TaskKind } from '@prisma/client';
import { champsHorsType, assertRecurrenceRequise, assertRotationApplicable } from './task-kind';

describe('champsHorsType', () => {
  it('accepte les champs du type demandé', () => {
    expect(
      champsHorsType(TaskKind.SCHEDULED, { rrule: 'FREQ=DAILY', dueTime: '19:00' }),
    ).toEqual([]);
    expect(champsHorsType(TaskKind.BACKGROUND, { maxIntervalSeconds: 1209600 })).toEqual([]);
    expect(champsHorsType(TaskKind.ONE_OFF, { dueDate: '2026-11-15' })).toEqual([]);
  });

  it('refuse une récurrence sur une tâche de fond', () => {
    expect(champsHorsType(TaskKind.BACKGROUND, { rrule: 'FREQ=DAILY' })).toEqual(['rrule']);
  });

  it('refuse un délai sur une tâche récurrente', () => {
    expect(
      champsHorsType(TaskKind.SCHEDULED, { maxIntervalSeconds: 1209600 }),
    ).toEqual(['maxIntervalSeconds']);
  });

  // Un champ absent n'est pas un champ renseigné : l'app envoie
  // volontiers des `null` pour « rien ici ».
  it('ignore les champs absents ou nuls', () => {
    expect(
      champsHorsType(TaskKind.BACKGROUND, { rrule: undefined, dueDate: null }),
    ).toEqual([]);
  });

  it('laisse passer les champs communs à tous les types', () => {
    expect(
      champsHorsType(TaskKind.BACKGROUND, { title: 'X', priority: 2, groupId: 'g' }),
    ).toEqual([]);
  });
});

describe('assertRecurrenceRequise', () => {
  it('exige une règle pour une tâche récurrente', () => {
    expect(() => assertRecurrenceRequise(TaskKind.SCHEDULED, undefined)).toThrow();
  });

  it("n'en exige pas pour les autres", () => {
    expect(() => assertRecurrenceRequise(TaskKind.BACKGROUND, undefined)).not.toThrow();
    expect(() => assertRecurrenceRequise(TaskKind.ONE_OFF, undefined)).not.toThrow();
  });
});

describe('assertRotationApplicable', () => {
  it('accepte le tour de rôle sur une tâche récurrente', () => {
    expect(() =>
      assertRotationApplicable(TaskKind.SCHEDULED, AssignmentMode.ROTATION),
    ).not.toThrow();
  });

  it("le refuse ailleurs : sans suite d'échéances, il n'y a pas de tour", () => {
    expect(() =>
      assertRotationApplicable(TaskKind.BACKGROUND, AssignmentMode.ROTATION),
    ).toThrow();
    expect(() =>
      assertRotationApplicable(TaskKind.ONE_OFF, AssignmentMode.ROTATION),
    ).toThrow();
  });

  it('laisse les autres modes tranquilles', () => {
    expect(() =>
      assertRotationApplicable(TaskKind.BACKGROUND, AssignmentMode.ANYONE),
    ).not.toThrow();
  });
});

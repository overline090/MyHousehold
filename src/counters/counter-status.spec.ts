import { CounterStatus, deriveCounterState } from './counter-status';

const NOW = new Date('2026-10-24T18:00:00Z');
const DAY = 86_400;

const at = (daysAgo: number): Date => new Date(NOW.getTime() - daysAgo * DAY * 1000);

describe('deriveCounterState', () => {
  it('signale une action jamais faite', () => {
    const state = deriveCounterState({
      lastEventAt: null,
      targetIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(CounterStatus.NEVER_DONE);
    expect(state.elapsedSeconds).toBeNull();
    expect(state.nextDueAt).toBeNull();
  });

  it('reste OK tant qu’on est loin de l’échéance', () => {
    const state = deriveCounterState({
      lastEventAt: at(3),
      targetIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(CounterStatus.OK);
    expect(state.elapsedSeconds).toBe(3 * DAY);
    expect(state.nextDueAt?.toISOString()).toBe('2026-11-04T18:00:00.000Z');
  });

  it('prévient à partir de la fraction d’alerte', () => {
    // 80 % de 14 jours, c'est 11,2 jours.
    const avant = deriveCounterState({
      lastEventAt: at(11),
      targetIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    const apres = deriveCounterState({
      lastEventAt: at(12),
      targetIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(avant.status).toBe(CounterStatus.OK);
    expect(apres.status).toBe(CounterStatus.DUE_SOON);
  });

  it('passe en retard une fois l’intervalle dépassé', () => {
    const state = deriveCounterState({
      lastEventAt: at(23),
      targetIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(CounterStatus.OVERDUE);
    expect(state.elapsedSeconds).toBe(23 * DAY);
  });

  it('bascule pile à l’échéance', () => {
    const state = deriveCounterState({
      lastEventAt: at(14),
      targetIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(CounterStatus.OVERDUE);
  });

  it('ne juge pas un compteur sans intervalle cible', () => {
    // « Il s'est passé tant de jours depuis… », sans notion de retard.
    const state = deriveCounterState({
      lastEventAt: at(400),
      targetIntervalSeconds: null,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(CounterStatus.OK);
    expect(state.elapsedSeconds).toBe(400 * DAY);
    expect(state.nextDueAt).toBeNull();
  });

  it('ne rend jamais un écoulement négatif', () => {
    const state = deriveCounterState({
      lastEventAt: new Date(NOW.getTime() + 60_000),
      targetIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.elapsedSeconds).toBe(0);
    expect(state.status).toBe(CounterStatus.OK);
  });
});

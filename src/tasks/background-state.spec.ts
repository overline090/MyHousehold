import { BackgroundState, deriveBackgroundState } from './background-state';

const NOW = new Date('2026-10-24T18:00:00Z');
const DAY = 86_400;

const at = (daysAgo: number): Date => new Date(NOW.getTime() - daysAgo * DAY * 1000);

describe('deriveBackgroundState', () => {
  it('signale une action jamais faite', () => {
    const state = deriveBackgroundState({
      lastDoneAt: null,
      maxIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(BackgroundState.NEVER_DONE);
    expect(state.elapsedSeconds).toBeNull();
    expect(state.nextDueAt).toBeNull();
  });

  it('reste OK tant qu’on est loin de l’échéance', () => {
    const state = deriveBackgroundState({
      lastDoneAt: at(3),
      maxIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(BackgroundState.OK);
    expect(state.elapsedSeconds).toBe(3 * DAY);
    expect(state.nextDueAt?.toISOString()).toBe('2026-11-04T18:00:00.000Z');
  });

  it('prévient à partir de la fraction d’alerte', () => {
    // 80 % de 14 jours, c'est 11,2 jours.
    const avant = deriveBackgroundState({
      lastDoneAt: at(11),
      maxIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    const apres = deriveBackgroundState({
      lastDoneAt: at(12),
      maxIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(avant.status).toBe(BackgroundState.OK);
    expect(apres.status).toBe(BackgroundState.DUE_SOON);
  });

  it('passe en retard une fois l’intervalle dépassé', () => {
    const state = deriveBackgroundState({
      lastDoneAt: at(23),
      maxIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(BackgroundState.OVERDUE);
    expect(state.elapsedSeconds).toBe(23 * DAY);
  });

  it('bascule pile à l’échéance', () => {
    const state = deriveBackgroundState({
      lastDoneAt: at(14),
      maxIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(BackgroundState.OVERDUE);
  });

  it('ne juge pas un compteur sans intervalle cible', () => {
    // « Il s'est passé tant de jours depuis… », sans notion de retard.
    const state = deriveBackgroundState({
      lastDoneAt: at(400),
      maxIntervalSeconds: null,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.status).toBe(BackgroundState.OK);
    expect(state.elapsedSeconds).toBe(400 * DAY);
    expect(state.nextDueAt).toBeNull();
  });

  it('ne rend jamais un écoulement négatif', () => {
    const state = deriveBackgroundState({
      lastDoneAt: new Date(NOW.getTime() + 60_000),
      maxIntervalSeconds: 14 * DAY,
      warnRatio: 0.8,
      now: NOW,
    });
    expect(state.elapsedSeconds).toBe(0);
    expect(state.status).toBe(BackgroundState.OK);
  });
});

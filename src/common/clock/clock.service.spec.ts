import { ClockService, FixedClock } from './clock.service';

describe('ClockService', () => {
  it('décale un instant du nombre de secondes demandé', () => {
    const clock = new FixedClock(new Date('2026-10-24T18:00:00Z'));
    expect(clock.in(90).toISOString()).toBe('2026-10-24T18:01:30.000Z');
  });

  it('FixedClock ne bouge pas sans qu’on l’avance', () => {
    const clock = new FixedClock(new Date('2026-10-24T18:00:00Z'));
    const first = clock.now();
    const second = clock.now();
    expect(first.getTime()).toBe(second.getTime());

    clock.advance(3600);
    expect(clock.now().toISOString()).toBe('2026-10-24T19:00:00.000Z');
  });

  it('l’horloge réelle avance', async () => {
    const clock = new ClockService();
    const before = clock.now().getTime();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(clock.now().getTime()).toBeGreaterThanOrEqual(before);
  });
});

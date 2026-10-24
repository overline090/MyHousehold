import {
  assertValidRrule,
  dueInstant,
  generateOccurrences,
  shiftDays,
  todayIn,
} from './recurrence';

const PARIS = 'Europe/Paris';

const dates = (occurrences: { scheduledFor: string }[]): string[] =>
  occurrences.map((o) => o.scheduledFor);

describe('generateOccurrences', () => {
  it('déroule une règle hebdomadaire', () => {
    const occurrences = generateOccurrences(
      {
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        timezone: PARIS,
        seriesStart: '2026-10-01',
        dueTime: '19:00',
      },
      '2026-10-01',
      '2026-10-31',
    );

    expect(dates(occurrences)).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
  });

  it('numérote les occurrences depuis le début de la série, pas depuis la fenêtre', () => {
    // C'est ce qui rend le tour de rôle stable : la même date doit
    // toujours porter la même position, quelle que soit la fenêtre
    // demandée.
    const series = {
      rrule: 'FREQ=WEEKLY;BYDAY=MO',
      timezone: PARIS,
      seriesStart: '2026-10-01',
    };

    const full = generateOccurrences(series, '2026-10-01', '2026-10-31');
    const partial = generateOccurrences(series, '2026-10-19', '2026-10-31');

    expect(full.find((o) => o.scheduledFor === '2026-10-19')?.ordinal).toBe(2);
    expect(partial.find((o) => o.scheduledFor === '2026-10-19')?.ordinal).toBe(2);
  });

  it('respecte les bornes de la série', () => {
    const occurrences = generateOccurrences(
      {
        rrule: 'FREQ=DAILY',
        timezone: PARIS,
        seriesStart: '2026-10-10',
        seriesEnd: '2026-10-12',
      },
      '2026-10-01',
      '2026-10-31',
    );

    expect(dates(occurrences)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
  });

  it('gère une règle mensuelle sur un jour qui n’existe pas partout', () => {
    // Le 31 n'existe pas tous les mois : la règle ne doit pas inventer
    // une date, ni décaler au 1er du mois suivant.
    const occurrences = generateOccurrences(
      {
        rrule: 'FREQ=MONTHLY;BYMONTHDAY=31',
        timezone: PARIS,
        seriesStart: '2026-01-01',
      },
      '2026-01-01',
      '2026-06-30',
    );

    expect(dates(occurrences)).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });

  it('s’arrête après COUNT occurrences', () => {
    const occurrences = generateOccurrences(
      {
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=2',
        timezone: PARIS,
        seriesStart: '2026-10-01',
      },
      '2026-10-01',
      '2026-12-31',
    );

    expect(dates(occurrences)).toEqual(['2026-10-05', '2026-10-12']);
  });

  it('ne rend rien si la fenêtre est avant le début de la série', () => {
    expect(
      generateOccurrences(
        { rrule: 'FREQ=DAILY', timezone: PARIS, seriesStart: '2026-11-01' },
        '2026-10-01',
        '2026-10-31',
      ),
    ).toEqual([]);
  });
});

describe('échéances et changements d’heure', () => {
  it('garde 19 h locales de part et d’autre du passage à l’heure d’hiver', () => {
    // Paris est à UTC+2 en été et UTC+1 en hiver : l'instant UTC change,
    // l'heure locale ne doit pas. C'est tout l'enjeu de dérouler la
    // règle en heure locale.
    const occurrences = generateOccurrences(
      {
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        timezone: PARIS,
        seriesStart: '2026-10-19',
        dueTime: '19:00',
      },
      '2026-10-19',
      '2026-11-02',
    );

    const byDate = new Map(
      occurrences.map((o) => [o.scheduledFor, o.dueAt.toISOString()]),
    );
    // Changement d'heure en France : nuit du 24 au 25 octobre 2026.
    expect(byDate.get('2026-10-19')).toBe('2026-10-19T17:00:00.000Z');
    expect(byDate.get('2026-10-26')).toBe('2026-10-26T18:00:00.000Z');
  });

  it('garde 19 h locales au passage à l’heure d’été', () => {
    const occurrences = generateOccurrences(
      {
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        timezone: PARIS,
        seriesStart: '2026-03-23',
        dueTime: '19:00',
      },
      '2026-03-23',
      '2026-04-06',
    );

    const byDate = new Map(
      occurrences.map((o) => [o.scheduledFor, o.dueAt.toISOString()]),
    );
    // Changement d'heure : nuit du 28 au 29 mars 2026.
    expect(byDate.get('2026-03-23')).toBe('2026-03-23T18:00:00.000Z');
    expect(byDate.get('2026-03-30')).toBe('2026-03-30T17:00:00.000Z');
  });

  it('reporte une heure qui n’existe pas le jour du passage à l’heure d’été', () => {
    // Le 29 mars 2026 à 02 h 00, l'horloge passe à 03 h 00 : 02 h 30
    // n'existe pas. On veut un instant valide plutôt qu'une échéance
    // absente.
    const dueAt = dueInstant('2026-03-29', '02:30', PARIS);
    expect(Number.isNaN(dueAt.getTime())).toBe(false);
    expect(dueAt.toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('retient la première des deux heures ambiguës au passage à l’heure d’hiver', () => {
    // Le 25 octobre 2026, 02 h 30 a lieu deux fois.
    const dueAt = dueInstant('2026-10-25', '02:30', PARIS);
    expect(dueAt.toISOString()).toBe('2026-10-25T00:30:00.000Z');
  });

  it('place l’échéance d’une tâche sans heure à la fin de la journée locale', () => {
    // Une tâche « du lundi » n'est pas en retard à 00 h 01 le lundi.
    expect(dueInstant('2026-10-26', null, PARIS).toISOString()).toBe(
      '2026-10-26T22:59:59.999Z',
    );
  });

  it('respecte un autre fuseau que celui du serveur', () => {
    expect(dueInstant('2026-10-26', '19:00', 'Pacific/Auckland').toISOString()).toBe(
      '2026-10-26T06:00:00.000Z',
    );
  });
});

describe('assertValidRrule', () => {
  it('accepte les récurrences usuelles', () => {
    for (const rrule of [
      'FREQ=DAILY',
      'FREQ=WEEKLY;BYDAY=MO,TH',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SA',
      'FREQ=MONTHLY;BYMONTHDAY=1',
      'FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=1',
    ]) {
      expect(() => assertValidRrule(rrule)).not.toThrow();
    }
  });

  it('refuse une règle plus fréquente qu’une fois par jour', () => {
    // Une seule règle HOURLY générerait des dizaines de milliers
    // d'occurrences et saturerait la base.
    expect(() => assertValidRrule('FREQ=HOURLY')).toThrow(/une fois par jour/);
    expect(() => assertValidRrule('FREQ=MINUTELY')).toThrow(/une fois par jour/);
  });

  it('refuse une règle illisible', () => {
    expect(() => assertValidRrule('tous les lundis')).toThrow();
    expect(() => assertValidRrule('')).toThrow();
  });

  it('refuse COUNT et UNTIL ensemble', () => {
    expect(() => assertValidRrule('FREQ=DAILY;COUNT=3;UNTIL=20261231T000000Z')).toThrow(
      /ensemble/,
    );
  });

  it('refuse un intervalle absurde', () => {
    expect(() => assertValidRrule('FREQ=DAILY;INTERVAL=0')).toThrow();
    expect(() => assertValidRrule('FREQ=DAILY;INTERVAL=1000')).toThrow();
  });
});

describe('utilitaires de date', () => {
  it('rend le jour courant dans le fuseau du foyer', () => {
    // 23 h 30 UTC, c'est déjà le lendemain à Paris.
    const instant = new Date('2026-10-24T23:30:00Z');
    expect(todayIn(PARIS, instant)).toBe('2026-10-25');
    expect(todayIn('UTC', instant)).toBe('2026-10-24');
  });

  it('décale un jour local sans se laisser piéger par les fuseaux', () => {
    expect(shiftDays('2026-10-24', 60)).toBe('2026-12-23');
    expect(shiftDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

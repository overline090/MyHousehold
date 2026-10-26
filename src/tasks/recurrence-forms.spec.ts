import { formToRrule, RecurrenceForm, rruleToForm } from './recurrence-forms';

/** Aller-retour : ce qu'on écrit doit se relire à l'identique. */
function allerRetour(forme: RecurrenceForm): RecurrenceForm | null {
  return rruleToForm(formToRrule(forme));
}

describe('formToRrule', () => {
  it('traduit « tous les jours »', () => {
    expect(formToRrule({ form: 'DAILY' })).toBe('FREQ=DAILY');
    expect(formToRrule({ form: 'DAILY', interval: 3 })).toBe('FREQ=DAILY;INTERVAL=3');
  });

  it('traduit des jours de la semaine, remis dans l’ordre', () => {
    expect(formToRrule({ form: 'WEEKDAYS', days: ['TH', 'MO'] })).toBe(
      'FREQ=WEEKLY;BYDAY=MO,TH',
    );
  });

  it('traduit des dates du mois, dernier jour compris', () => {
    expect(formToRrule({ form: 'MONTH_DAYS', days: [15, 1] })).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=1,15',
    );
    expect(formToRrule({ form: 'MONTH_DAYS', days: [-1] })).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=-1',
    );
  });

  it('traduit une date de l’année', () => {
    expect(formToRrule({ form: 'YEAR_DATES', dates: ['09-15'] })).toBe(
      'FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=15',
    );
  });

  it('traduit « toutes les N semaines » et « tous les N mois »', () => {
    expect(formToRrule({ form: 'EVERY_N', unit: 'WEEK', interval: 3 })).toBe(
      'FREQ=WEEKLY;INTERVAL=3',
    );
    expect(formToRrule({ form: 'EVERY_N', unit: 'MONTH', interval: 2 })).toBe(
      'FREQ=MONTHLY;INTERVAL=2',
    );
  });

  // BYMONTH × BYMONTHDAY est un produit, pas une liste de couples :
  // « le 15 mars et le 2 juin » donnerait aussi le 2 mars et le 15 juin.
  it('refuse deux dates annuelles qui ne partagent ni jour ni mois', () => {
    expect(() => formToRrule({ form: 'YEAR_DATES', dates: ['03-15', '06-02'] })).toThrow();
  });

  it('accepte deux dates annuelles du même jour', () => {
    expect(formToRrule({ form: 'YEAR_DATES', dates: ['03-15', '09-15'] })).toBe(
      'FREQ=YEARLY;BYMONTH=3,9;BYMONTHDAY=15',
    );
  });

  it('refuse une liste vide, une date illisible, un intervalle aberrant', () => {
    expect(() => formToRrule({ form: 'WEEKDAYS', days: [] })).toThrow();
    expect(() => formToRrule({ form: 'YEAR_DATES', dates: ['15 mars'] })).toThrow();
    expect(() => formToRrule({ form: 'DAILY', interval: 0 })).toThrow();
    expect(() => formToRrule({ form: 'MONTH_DAYS', days: [42] })).toThrow();
  });
});

describe('rruleToForm', () => {
  it('relit chaque forme à l’identique', () => {
    const formes: RecurrenceForm[] = [
      { form: 'DAILY', interval: 1 },
      { form: 'DAILY', interval: 3 },
      { form: 'WEEKDAYS', days: ['MO', 'TH'] },
      { form: 'MONTH_DAYS', days: [1, 15] },
      { form: 'MONTH_DAYS', days: [-1] },
      { form: 'YEAR_DATES', dates: ['09-15'] },
      { form: 'EVERY_N', unit: 'WEEK', interval: 3 },
      { form: 'EVERY_N', unit: 'MONTH', interval: 2 },
    ];

    for (const forme of formes) {
      expect(allerRetour(forme)).toEqual(forme);
    }
  });

  // Une règle affichée de travers est pire qu'une règle affichée telle
  // quelle : hors du vocabulaire des cinq formes, on ne devine pas.
  it('rend null pour ce que les cinq formes ne savent pas dire', () => {
    expect(rruleToForm('FREQ=MONTHLY;BYDAY=2FR')).toBeNull();
    expect(rruleToForm('FREQ=DAILY;COUNT=10')).toBeNull();
    expect(rruleToForm('FREQ=WEEKLY;BYDAY=MO;INTERVAL=2')).toBeNull();
    expect(rruleToForm('tous les lundis')).toBeNull();
  });
});

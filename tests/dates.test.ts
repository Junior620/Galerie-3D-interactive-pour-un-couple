import { describe, expect, it } from 'vitest';
import { formatDate, parseDate } from '../src/utils/dates';

describe('dates', () => {
  it('lit les formats acceptés', () => {
    expect(parseDate('2020-02-14')).toMatchObject({ annee: 2020, mois: 2, jour: 14 });
    expect(parseDate('2020-02')).toMatchObject({ annee: 2020, mois: 2 });
    expect(parseDate('2020')).toMatchObject({ annee: 2020 });
    expect(parseDate('14/02/2020')).toMatchObject({ annee: 2020, mois: 2, jour: 14 });
    expect(parseDate('02/2020')).toMatchObject({ annee: 2020, mois: 2 });
  });

  it('refuse les dates impossibles', () => {
    expect(parseDate('2020-13-45')).toBeNull();
    expect(parseDate('31/02/2021')).toBeNull();
    expect(parseDate('hier')).toBeNull();
    expect(parseDate('1700')).toBeNull();
  });

  it('accepte le 29 février des années bissextiles seulement', () => {
    expect(parseDate('2024-02-29')).not.toBeNull();
    expect(parseDate('2023-02-29')).toBeNull();
  });

  it('formate en français', () => {
    expect(formatDate(parseDate('2020-02-14'))).toBe('14 février 2020');
    expect(formatDate(parseDate('2021-03-01'))).toBe('1er mars 2021');
    expect(formatDate(parseDate('2022-08'))).toBe('août 2022');
    expect(formatDate(parseDate('2023'))).toBe('2023');
    expect(formatDate(null)).toBe('');
  });

  it('trie chronologiquement', () => {
    const a = parseDate('2020-12')!;
    const b = parseDate('2021-01-05')!;
    expect(a.time).toBeLessThan(b.time);
  });
});

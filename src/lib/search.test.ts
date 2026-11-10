import { describe, expect, it } from 'vitest';
import { looksLikeTicketNo, matchesRest, parseCustomerQuery, searchTokens, serialKey } from './search';

describe('searchTokens', () => {
  it('stores prefixes of every word, lower-case', () => {
    const t = searchTokens('Kasun Fernando');
    for (const x of ['ka', 'kasun', 'fe', 'fern', 'fernando']) expect(t).toContain(x);
    expect(t).not.toContain('k');
    expect(t).not.toContain('Kasun');
  });

  it('includes the company name and caps the prefix length', () => {
    const t = searchTokens('Anura', 'Lanka Computer Solutions');
    expect(t).toContain('solu');
    expect(t).toContain('computer');
    expect(searchTokens('Wickramasinghearachchi')).not.toContain('wickramasinghearachchi');
  });

  it('keeps one-letter words searchable', () => {
    expect(searchTokens('A Silva')).toContain('a');
  });
});

describe('parseCustomerQuery', () => {
  it('treats digits as a phone search in local form', () => {
    expect(parseCustomerQuery('077')).toEqual({ kind: 'phone', digits: '077' });
    expect(parseCustomerQuery('076 552 1098')).toEqual({ kind: 'phone', digits: '0765521098' });
    expect(parseCustomerQuery('+94 76 552')).toEqual({ kind: 'phone', digits: '076552' });
    expect(parseCustomerQuery('765521098')).toEqual({ kind: 'phone', digits: '0765521098' });
  });

  it('queries the longest word and filters the rest', () => {
    expect(parseCustomerQuery('k fernando')).toEqual({ kind: 'name', token: 'fernando', rest: ['k'] });
  });

  it('ignores too-short input', () => {
    expect(parseCustomerQuery(' ')).toEqual({ kind: 'none' });
    expect(parseCustomerQuery('k')).toEqual({ kind: 'none' });
    expect(parseCustomerQuery('12')).toEqual({ kind: 'name', token: '12', rest: [] });
  });
});

describe('helpers', () => {
  it('matches remaining words by prefix', () => {
    expect(matchesRest(['ka'], 'Kasun Fernando')).toBe(true);
    expect(matchesRest(['ni'], 'Kasun Fernando')).toBe(false);
  });

  it('recognises ticket numbers', () => {
    expect(looksLikeTicketNo('T-2026-0142')).toBe(true);
    expect(looksLikeTicketNo('inv-0012')).toBe(true);
    expect(looksLikeTicketNo('Kasun')).toBe(false);
  });

  it('normalises serials', () => {
    expect(serialKey(' 7xk2-q93 ')).toBe('7XK2Q93');
  });
});

// Pseudo-localization (D95): the two made-up languages the layout is tested in.
import { describe, expect, it } from 'vitest';
import en from './messages/en.json';
import { expansionFactor, pseudoLocalize, pseudoMessages } from './pseudo';

const placeholders = (text: string) => text.match(/\{\w+\}/g) ?? [];
const withoutPlaceholders = (text: string) => text.replace(/\{\w+\}/g, '');
const plainLength = (text: string) => [...withoutPlaceholders(text)].length;

describe('expansionFactor (IBM text expansion, the lower bound of each band)', () => {
  it('grows short strings most and long ones least', () => {
    expect(expansionFactor(1)).toBe(2);
    expect(expansionFactor(10)).toBe(2);
    expect(expansionFactor(11)).toBe(1.8);
    expect(expansionFactor(20)).toBe(1.8);
    expect(expansionFactor(30)).toBe(1.6);
    expect(expansionFactor(50)).toBe(1.4);
    expect(expansionFactor(70)).toBe(1.31);
    expect(expansionFactor(71)).toBe(1.3);
    expect(expansionFactor(500)).toBe(1.3);
  });
});

describe('pseudoLocalize long', () => {
  it('accents, doubles vowels and brackets a word', () => {
    expect(pseudoLocalize('Pay', 'long')).toMatch(/^\[Páaý.*\]$/);
    expect(pseudoLocalize('Catalogue', 'long').startsWith('[Çáaťáaľöoğüuée')).toBe(true);
  });

  it('reaches the expansion target for the string length', () => {
    for (const message of ['Pay', 'Continue as', 'Send me a sign-in link', 'A '.repeat(40)]) {
      const out = pseudoLocalize(message, 'long');
      const inner = out.slice(1, -1);
      expect(plainLength(inner), message).toBeGreaterThanOrEqual(
        Math.ceil(plainLength(message) * expansionFactor(plainLength(message)))
      );
    }
  });

  it('keeps every placeholder exactly, and translates only the text around them', () => {
    const out = pseudoLocalize('Sent {sent}, works until {expires}', 'long');
    expect(placeholders(out)).toEqual(['{sent}', '{expires}']);
    expect(out).toContain('{sent}');
    expect(out).not.toContain('Sent');
  });

  it('leaves an empty or blank message as it is', () => {
    expect(pseudoLocalize('', 'long')).toBe('');
    expect(pseudoLocalize('  ', 'long')).toBe('  ');
  });

  it('is the same every time (no randomness)', () => {
    expect(pseudoLocalize('Your account', 'long')).toBe(pseudoLocalize('Your account', 'long'));
  });
});

describe('pseudoLocalize short', () => {
  it('cuts each word to its first letter and consonants, at most four letters', () => {
    expect(pseudoLocalize('Catalogue', 'short')).toBe('Ctlg');
    expect(pseudoLocalize('Send me a sign-in link', 'short')).toBe('Snd m a sgn-in lnk');
    expect(pseudoLocalize('Öppna länken', 'short')).toBe('Öppn lnkn');
  });

  it('keeps placeholders, numbers and punctuation; an acronym is a word like any other', () => {
    expect(pseudoLocalize('Sent {sent}, 25.5 % VAT', 'short')).toBe('Snt {sent}, 25.5 % VT');
  });
});

describe('pseudoMessages over the real English file', () => {
  const long = pseudoMessages(en, 'long');
  const short = pseudoMessages(en, 'short');

  it('has every key, and every placeholder of every message', () => {
    expect(Object.keys(long)).toEqual(Object.keys(en));
    expect(Object.keys(short)).toEqual(Object.keys(en));
    for (const [key, message] of Object.entries(en)) {
      expect(placeholders(long[key as keyof typeof en]).sort(), key).toEqual(
        placeholders(message).sort()
      );
      expect(placeholders(short[key as keyof typeof en]).sort(), key).toEqual(
        placeholders(message).sort()
      );
    }
  });

  it('makes the long language at least 30 % longer and the short one shorter, overall', () => {
    const total = (messages: Record<string, string>) =>
      Object.values(messages).reduce((sum, message) => sum + plainLength(message), 0);
    expect(total(long) / total(en)).toBeGreaterThanOrEqual(1.3);
    expect(total(short) / total(en)).toBeLessThan(0.75);
  });

  it('uses only characters the fonts carry: Latin-1, Latin Extended-A or already in English', () => {
    const english = new Set([...Object.values(en).join('')]);
    const carried = (char: string) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x80 || (code >= 0xa0 && code <= 0x17f) || english.has(char);
    };
    const outside = [...new Set([...Object.values(long).join('')])].filter((c) => !carried(c));
    expect(outside).toEqual([]);
  });
});

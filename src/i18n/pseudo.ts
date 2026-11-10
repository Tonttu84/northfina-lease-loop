// Pseudo-localization (D95, docs/features/responsive-layout.md): two made-up languages generated
// from the English messages, so every page can be tested against text far longer and far shorter
// than any real translation, before a translator has seen a word. It is how Google (en-XA),
// Microsoft (qps-ploc) and Mozilla test a layout's room for languages they do not ship yet.
//
// - `long` (`qps-long`): every letter accented (a font without the glyph shows at once), every
//   vowel doubled (longer words, which cannot wrap, like Finnish compounds), padded with extra
//   words up to IBM's expansion guideline for the string's length, and wrapped in `[` `]` so a
//   clipped string shows a missing bracket.
// - `short` (`qps-short`): every word cut to its first letter and its consonants, at most four
//   letters: about half the English, for layouts that assume text fills a box.
//
// `{placeholders}` are kept as they are: the values put into them (names, amounts, dates, ids)
// come from the data, which a translator never touches either. Pure: no clock, no I/O.

export type PseudoMode = 'long' | 'short';

/** Accented forms from Latin-1 and Latin Extended-A, which the app's fonts carry (latin-ext). */
const ACCENTED: Readonly<Record<string, string>> = {
  a: 'á',
  c: 'ç',
  d: 'ď',
  e: 'é',
  g: 'ğ',
  h: 'ĥ',
  i: 'í',
  j: 'ĵ',
  k: 'ķ',
  l: 'ľ',
  n: 'ñ',
  o: 'ö',
  r: 'ř',
  s: 'š',
  t: 'ť',
  u: 'ü',
  w: 'ŵ',
  y: 'ý',
  z: 'ž',
  A: 'Á',
  C: 'Ç',
  D: 'Ď',
  E: 'É',
  G: 'Ğ',
  H: 'Ĥ',
  I: 'Í',
  J: 'Ĵ',
  K: 'Ķ',
  L: 'Ľ',
  N: 'Ñ',
  O: 'Ö',
  R: 'Ř',
  S: 'Š',
  T: 'Ť',
  U: 'Ü',
  W: 'Ŵ',
  Y: 'Ý',
  Z: 'Ž',
};
const VOWEL = /^[aeiouyAEIOUY]$/;
/** Vowels a short word drops, the Nordic and Estonian ones included. */
const SHORT_DROPS = /[aeiouyåäöõüAEIOUYÅÄÖÕÜ]/g;
/** Words appended to reach the expansion target; accented like the rest. */
const PADDING = ['ľöñğ', 'ťéšť', 'ĥéřé', 'ýéš', 'ŵöřď'];
const PLACEHOLDER = /(\{\w+\})/;

/**
 * How much longer a translation of `length` English characters gets, at least (IBM
 * Globalization Design, "text expansion": up to 10 characters 100-200 %, 11-20 80-100 %,
 * 21-30 60-80 %, 31-50 40-60 %, 51-70 31-40 %, over 70 30 %); the lower bound of each band.
 */
export function expansionFactor(length: number): number {
  if (length <= 10) return 2;
  if (length <= 20) return 1.8;
  if (length <= 30) return 1.6;
  if (length <= 50) return 1.4;
  if (length <= 70) return 1.31;
  return 1.3;
}

/** The text a reader sees: without the placeholders, which are filled in later. */
const visibleLength = (pieces: readonly string[]) =>
  pieces.reduce((sum, piece) => sum + (PLACEHOLDER.test(piece) ? 0 : [...piece].length), 0);

function lengthen(text: string): string {
  return [...text]
    .map((char) => {
      const accented = ACCENTED[char] ?? char;
      return VOWEL.test(char) ? `${accented}${char}` : accented;
    })
    .join('');
}

function shorten(text: string): string {
  return text.replace(/\p{L}+/gu, (word) => {
    const [first = '', ...rest] = [...word];
    return (first + rest.join('').replace(SHORT_DROPS, '')).slice(0, 4);
  });
}

/** One message in a pseudo-language. Placeholders and whitespace-only messages are kept. */
export function pseudoLocalize(message: string, mode: PseudoMode): string {
  if (message.trim() === '') return message;
  const pieces = message.split(PLACEHOLDER);
  const words = (piece: string, change: (text: string) => string) =>
    PLACEHOLDER.test(piece) ? piece : change(piece);
  if (mode === 'short') return pieces.map((piece) => words(piece, shorten)).join('');

  const target = Math.ceil(visibleLength(pieces) * expansionFactor(visibleLength(pieces)));
  const out = pieces.map((piece) => words(piece, lengthen));
  for (let i = 0; visibleLength(out) < target; i++) {
    out.push(` ${PADDING[i % PADDING.length]}`);
  }
  return `[${out.join('')}]`;
}

/** Every message of a language in a pseudo-language, the keys unchanged. */
export function pseudoMessages<K extends string>(
  source: Readonly<Record<K, string>>,
  mode: PseudoMode
): Record<K, string> {
  return Object.fromEntries(
    Object.entries<string>(source).map(([key, message]) => [key, pseudoLocalize(message, mode)])
  ) as Record<K, string>;
}

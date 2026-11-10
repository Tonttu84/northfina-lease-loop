// The languages the app speaks. The first segment of every page URL is one of these: /en, /fi, ...
import { demoToolsOn } from '@/demo-tools-switch';
import { pseudoLocalize, type PseudoMode } from './pseudo';

/** The four languages the app ships, in the order the language switcher lists them. */
export const locales = ['en', 'fi', 'sv', 'et'] as const;

/**
 * Two made-up languages generated from English for testing the layout (D95, `pseudo.ts`): text
 * far longer and far shorter than any real translation. They answer only while the demo tools
 * are on (D74: development, the tests, a pitch build with DEMO_TOOLS=1), never on a plain
 * production build. `qps` is the private-use language code reserved for pseudo-localization.
 */
export const pseudoLocales = ['qps-long', 'qps-short'] as const;

export type ShippedLocale = (typeof locales)[number];
export type PseudoLocale = (typeof pseudoLocales)[number];
export type Locale = ShippedLocale | PseudoLocale;

const PSEUDO_MODE: Record<PseudoLocale, PseudoMode> = { 'qps-long': 'long', 'qps-short': 'short' };

/**
 * A text the app holds per shipped language outside the message files (the data pack's
 * questions, a domain function's sentence), in `locale`: `read(locale)` for a shipped one, and
 * English run through the pseudo-localizer for a pseudo one (D95).
 */
export function translated(locale: Locale, read: (shipped: ShippedLocale) => string): string {
  return locale in PSEUDO_MODE
    ? pseudoLocalize(read('en'), PSEUDO_MODE[locale as PseudoLocale])
    : read(locale as ShippedLocale);
}

export const defaultLocale: Locale = 'en';

/** Whether `value` is a language this request may use: a real one, or a pseudo one in demo mode. */
export function isLocale(
  value: string,
  env: Record<string, string | undefined> = process.env
): value is Locale {
  if ((locales as readonly string[]).includes(value)) return true;
  return (pseudoLocales as readonly string[]).includes(value) && demoToolsOn(env);
}

/** Each language's name in that language, for the language switcher. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  fi: 'Suomi',
  sv: 'Svenska',
  et: 'Eesti',
  'qps-long': 'Pseudo long',
  'qps-short': 'Pseudo short',
};

/**
 * Locale tag for Intl (dates, numbers, money). Swedish uses the Finland-Swedish variant; the
 * pseudo-languages format like English, since a translator does not touch numbers either.
 */
export const intlLocale: Record<Locale, string> = {
  en: 'en-GB',
  fi: 'fi-FI',
  sv: 'sv-FI',
  et: 'et-EE',
  'qps-long': 'en-GB',
  'qps-short': 'en-GB',
};

/**
 * The same page in `locale`: `/fi/assets/x` + `?quote=…` → `/en/assets/x?quote=…`. The query
 * (the stored quote, the down payment, the catalogue filters) is kept (review finding 14).
 */
export function localeHref(pathname: string, locale: Locale, search = ''): string {
  const rest = pathname.split('/').slice(2).join('/');
  const query =
    search === '' || search === '?' ? '' : search.startsWith('?') ? search : `?${search}`;
  return `${rest ? `/${locale}/${rest}` : `/${locale}`}${query}`;
}

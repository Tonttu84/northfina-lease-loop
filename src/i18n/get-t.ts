// Translations. Add a key to ALL four files in ./messages (a test checks they match),
// then use it: `const t = getT(locale); t('catalogue.title')`.
import en from './messages/en.json';
import et from './messages/et.json';
import fi from './messages/fi.json';
import sv from './messages/sv.json';
import type { Locale, PseudoLocale } from './locales';
import { pseudoMessages } from './pseudo';

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

/** D95: the pseudo-languages' messages, generated from English the first time one is read. */
const generated: Partial<Record<PseudoLocale, Messages>> = {};

export const messages: Record<Locale, Messages> = {
  en,
  fi,
  sv,
  et,
  // Generated from English for testing the layout, and only when first read: a pseudo-language
  // is reachable only in demo mode (`isLocale`), so a production page never builds them.
  get 'qps-long'() {
    return (generated['qps-long'] ??= pseudoMessages(en, 'long'));
  },
  get 'qps-short'() {
    return (generated['qps-short'] ??= pseudoMessages(en, 'short'));
  },
};

export type TranslateValues = Record<string, string | number>;
export type Translate = (key: MessageKey, values?: TranslateValues) => string;

/**
 * Returns `t(key, values?)` for a locale. `{name}` in a message is replaced by `values.name`.
 * A key cast from a server code that has no message yet shows as the key itself, so a new code
 * never takes the page down (the parity tests still catch it).
 */
export function getT(locale: Locale): Translate {
  const dictionary = messages[locale];
  return (key, values) => {
    const template = dictionary[key] as string | undefined;
    return template === undefined ? key : interpolate(template, values);
  };
}

function interpolate(template: string, values?: TranslateValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}

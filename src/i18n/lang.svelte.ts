/** Active UI language (reactive) and number formatting that follows it. */
import { branding } from '../branding';
import { setDecimalComma } from '../physics/units';
import { de, type Strings } from './de';
import { en } from './en';

export type Lang = 'de' | 'en';
export const LANGS: Lang[] = ['de', 'en'];
const dicts: Record<Lang, Strings> = { de, en };
const KEY = `${branding.storageNamespace}:lang`;

function initial(): Lang {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'de' || s === 'en') return s;
  } catch {
    // storage blocked: fall back to the browser language
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const i18n = $state({ lang: initial() as Lang });
setDecimalComma(i18n.lang === 'de');

/** Strings of the active language; reading through it makes Svelte templates follow the language. */
export const t: Strings = new Proxy({} as Strings, {
  get: (_, key) => dicts[i18n.lang][key as keyof Strings],
});

export function setLang(lang: Lang) {
  i18n.lang = lang;
  setDecimalComma(lang === 'de');
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // not persisted; the choice still applies to this session
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/** Fixed-point number with the decimal separator of the active language. */
export function fmtNum(v: number, digits = 1): string {
  const s = v.toFixed(digits);
  return i18n.lang === 'de' ? s.replace('.', ',') : s;
}

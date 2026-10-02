/**
 * Back-office translations. Italian is the source language: every string in the code is written in
 * Italian and wrapped in t(); en.ts and zh.ts map the Italian text to the translation. Missing
 * entries fall back to Italian, so an untranslated string never breaks the page.
 *
 *   t('Ordini da preparare')                → "Orders to prepare"
 *   t('Ci sono {n} ordini', { n: 3 })        → placeholders in braces
 *   t('Ordine##posizione')                  → same Italian word, different meaning: the text after ## only
 *                                             tells the keys apart (Italian shows "Ordine")
 *
 * The language is per staff member (staff_members.locale), cached in localStorage so the login page
 * opens in the last language used on this device. Changing it remounts the app (see main.tsx).
 */
import en from './i18n/en';
import zh from './i18n/zh';

export type Locale = 'it' | 'en' | 'zh';
export const LOCALES: Array<{ id: Locale; label: string }> = [
  { id: 'it', label: 'Italiano' }, { id: 'en', label: 'English' }, { id: 'zh', label: '中文' },
];
const DICTS: Record<Exclude<Locale, 'it'>, Record<string, string>> = { en, zh };
const STORAGE_KEY = 'casa-te-admin-locale';
const DATE_LOCALE: Record<Locale, string> = { it: 'it-IT', en: 'en-GB', zh: 'zh-CN' };

const isLocale = (v: unknown): v is Locale => v === 'it' || v === 'en' || v === 'zh';

function initial(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch { /* storage unavailable */ }
  return 'it';
}

let current: Locale = initial();
const listeners = new Set<(l: Locale) => void>();

export const getLocale = () => current;
/** Locale tag for dates and numbers (toLocaleDateString etc.). */
export const dateLocale = () => DATE_LOCALE[current];

export function setLocale(locale: Locale) {
  if (!isLocale(locale) || locale === current) return;
  current = locale;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* storage unavailable */ }
  document.documentElement.lang = locale;
  listeners.forEach((fn) => fn(locale));
}

export function onLocaleChange(fn: (l: Locale) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function t(text: string, vars?: Record<string, string | number>): string {
  const out = (current === 'it' ? undefined : DICTS[current][text]) ?? text.split('##')[0];
  return vars ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : out;
}

if (typeof document !== 'undefined') document.documentElement.lang = current;

/**
 * The prerendered HTML is what a crawler indexes; the runtime is what a visitor
 * gets. This file pins the locale the prerender ships.
 *
 * Those are now two different questions, on purpose:
 *
 * - A crawler sends no Accept-Language, so index.html must carry ONE locale.
 *   It ships Arabic, the site's primary locale, unchanged by browser detection.
 * - A visitor with no saved preference gets their browser's language
 *   (see i18nStartupLanguage.test.ts). For an English browser that is English,
 *   so the runtime replaces the prerendered title, description, social card and
 *   direction as soon as JS runs.
 *
 * So a mismatch here is not the bug this file used to guard against — a
 * *silent* one still is. What must stay true is that the two agree at the
 * bottom: a browser asking for neither shipped language gets the same locale the
 * crawler was served, so the site never presents a third, unintended language.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import ar from '../i18n/locales/ar.json';
import en from '../i18n/locales/en.json';

const root = resolve(__dirname, '..', '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const i18nSource = readFileSync(resolve(root, 'src/i18n/index.ts'), 'utf8');

type AppMessages = typeof en.app & { [key: string]: string };

const app = { en: en.app as AppMessages, ar: ar.app as AppMessages };

/** Read a <meta> value by the attribute that identifies it, e.g. 'property="og:title"'. */
function meta(selector: string): string | null {
  const eq = selector.indexOf('=');
  const attr = selector.slice(0, eq);
  // The capture group below excludes the surrounding quotes, so strip them here
  // or the comparison never matches.
  const want = selector.slice(eq + 1).replace(/^"(.*)"$/, '$1');
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (tag.match(new RegExp(`\\b${attr}\\s*=\\s*"([^"]*)"`, 'i'))?.[1] !== want) continue;
    return tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? null;
  }
  return null;
}

/** The single locale the prerendered shell carries, for crawlers and no-JS visitors. */
const PRERENDER_LANG = 'ar';
/** The runtime's last-resort locale, read from source rather than assumed. */
const RUNTIME_FALLBACK = /const DEFAULT_LANGUAGE: Language = '(\w+)'/.exec(i18nSource)?.[1] ?? '';
const expected = app[PRERENDER_LANG];

describe('prerendered document language', () => {
  it('ships Arabic, the primary locale, regardless of any browser preference', () => {
    // Guards the assumption the rest of this file is built on.
    expect(PRERENDER_LANG).toBe('ar');
  });

  it('ends up in the same locale when the browser asks for neither language', () => {
    // The one place the crawler locale and the runtime have to agree: a French
    // or Japanese browser is not redirected to a locale nobody asked for.
    expect(RUNTIME_FALLBACK).toBe(PRERENDER_LANG);
  });

  it('declares the document language the app will actually render', () => {
    const tag = html.match(/<html\b[^>]*>/i)?.[0] ?? '';
    expect(tag).toContain(`lang="${PRERENDER_LANG}"`);
    expect(tag).toContain(`dir="${PRERENDER_LANG === 'ar' ? 'rtl' : 'ltr'}"`);
  });

  it('ships a bilingual EN-first title for crawlers', () => {
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '';
    expect(title).toBe('Qfza — Search Inside Videos & Jump to the Moment | قفزة');
  });

  it('ships the description the runtime falls back to', () => {
    expect(meta('name="description"')).toBe(expected.metaDescription);
  });

  it('ships a social card in the default language, not the other one', () => {
    const other = app[PRERENDER_LANG === 'ar' ? 'en' : 'ar'];
    for (const [selector, value] of [
      ['property="og:title"', expected.ogTitle],
      ['property="og:description"', expected.ogDescription],
      ['property="og:image:alt"', expected.ogImageAlt],
      ['name="twitter:title"', expected.ogTitle],
      ['name="twitter:description"', expected.ogDescription],
      ['name="twitter:image:alt"', expected.ogImageAlt],
    ] as const) {
      expect(meta(selector), `${selector} should be in ${PRERENDER_LANG}`).toBe(value);
      expect(value, `${selector} must not be the ${other.ogLocale} string`).not.toBe(other.ogTitle);
    }
  });

  it('declares og:locale on the homepage', () => {
    // The blog pages already emitted this; the homepage silently did not, so an
    // Arabic share had no locale for the scraper to read.
    expect(meta('property="og:locale"')).toBe(expected.ogLocale);
    expect(meta('property="og:locale:alternate"')).toBe(expected.ogLocaleAlternate);
  });

  it('never ships a bare root-relative og:image', () => {
    // Scrapers reject a relative image URL. The source carries Vite's
    // %VITE_SITE_URL% placeholder, which the build substitutes with the real
    // origin; the runtime composes one from window.location.origin. What must
    // never appear is a plain "/og-*.png", which unfurls with no preview.
    for (const selector of ['property="og:image"', 'name="twitter:image"']) {
      const value = meta(selector) ?? '';
      expect(value, `${selector} must be absolutised at build or runtime`).toMatch(
        /^(https?:\/\/|%VITE_SITE_URL%)/,
      );
      expect(value).toContain(expected.ogImage);
    }
  });

  it('keeps og:site_name as the neutral brand, matching the blog pages', () => {
    expect(meta('property="og:site_name"')).toBe('Qfza');
  });
});

describe('applyDocumentLanguage', () => {
  it('updates the social card alongside the title', () => {
    // applyDocumentLanguage rewrites document.title and meta[name=description]
    // already; the og:/twitter: tags were left behind, so an Arabic page
    // unfurled an English card.
    for (const selector of [
      'og:title',
      'og:description',
      'og:image',
      'og:image:alt',
      'og:locale',
      'og:locale:alternate',
      'twitter:title',
      'twitter:description',
      'twitter:image',
      'twitter:image:alt',
    ]) {
      expect(i18nSource, `${selector} must be updated at runtime`).toContain(selector);
    }
  });
});

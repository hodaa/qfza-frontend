import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderHeader, counterpartPath, HEADER_CSS } from '../../scripts/lib/header.mjs';
import { renderMaintenance, isMaintenanceOn } from '../../scripts/lib/maintenance.mjs';

const SITE_URL = 'https://qfza.app';
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('counterpartPath', () => {
  it.each([
    ['/blog/', '/ar/blog/'],
    ['/ar/blog/', '/blog/'],
    ['/privacy/', '/ar/privacy/'],
    ['/ar/privacy/', '/privacy/'],
    ['/blog/search-youtube-video/', '/ar/blog/search-youtube-video/'],
  ])('maps %s to %s', (input, expected) => {
    expect(counterpartPath(input)).toBe(expected);
  });
});

describe('static site header', () => {
  it('links the wordmark home with a real accessible name', () => {
    const html = renderHeader('en', '/blog/');
    expect(html).toMatch(/<a class="qlf-header-logo" href="\/\?lang=en" aria-label="Qfza home">/);
  });

  it('uses the locale-correct wordmark, as the React Logo does', () => {
    // The Arabic wordmark keeps the icon on the right, so it is logo.svg; the
    // English one is logo-en.svg. Mirroring the play icon would be wrong.
    expect(renderHeader('en', '/blog/')).toContain('/logo-en.svg');
    expect(renderHeader('ar', '/blog/')).toContain('src="/logo.svg"');
  });

  it('prefixes nav anchors with / so they resolve off the homepage', () => {
    // The app uses bare #how-it-works, which is a dead link on a static
    // page because that anchor only exists on the homepage. The ?lang=
    // parameter carries the page's locale to the homepage, which ships
    // no script of its own to remember it.
    for (const locale of ['en', 'ar'] as const) {
      const html = renderHeader(locale, '/blog/');
      expect(html).toContain(`href="/?lang=${locale}#how-it-works"`);
      expect(html).toContain(`href="/?lang=${locale}#why-qfza"`);
      expect(html).not.toMatch(/href="#(how-it-works|why-qfza)"/);
    }
  });

  it('labels the nav in the page language', () => {
    expect(renderHeader('en', '/blog/')).toContain('How it works?');
    expect(renderHeader('ar', '/blog/')).toContain('كيف يعمل؟');
  });

  it('offers a real link to the counterpart page, not a JS dropdown', () => {
    const html = renderHeader('ar', '/ar/privacy/');
    expect(html).toMatch(/class="qlf-pill" href="\/privacy\/" hreflang="en" lang="en"/);
    expect(html).toContain('class="qlf-language-mobile" role="group" aria-label="اللغة"');
    expect(html).toContain('aria-current="page">عربي</span>');
    expect(html).toContain('hreflang="en" lang="en" aria-label="English">EN</a>');
  });

  it('renders a sign-in pill, so static pages have an account affordance', () => {
    // The React header renders <AccountMenu />; these pages ship no script and so
    // cannot show session state, but they must still offer the way in.
    for (const locale of ['en', 'ar'] as const) {
      const html = renderHeader(locale, '/blog/');
      expect(html).toContain('qlf-pill-primary');
      expect(html).toContain(locale === 'en' ? 'Sign in' : 'تسجيل الدخول');
    }
  });

  it('points sign-in at the clean /login path, never a fragment', () => {
    // Two reasons, and either alone is enough. These pages ship no script, so
    // #/login would resolve against the current static path and dead-end on the
    // blog post instead of loading the app. And a hash URL in the markup of an
    // indexable page reads as a separate address to a crawler, which is a
    // ranking liability for a page that is only ever one.
    for (const locale of ['en', 'ar'] as const) {
      const html = renderHeader(locale, '/blog/');
      expect(html).toContain('href="/login"');
      expect(html).not.toMatch(/href="[^"]*#\//);
    }
  });

  it('keeps the sign-in pill even where the language pill is dropped', () => {
    // The 404 passes language:false because it renders both locales already. An
    // empty actions track would leave it with no account affordance at all.
    const html = renderHeader('en', '/404.html', { language: false });
    expect(html).toContain('qlf-pill-primary');
    // The language pill is the one whose class list is exactly "qlf-pill".
    expect(html).not.toMatch(/class="qlf-pill"/);
  });

  it('emits no script, so it stays usable with JS disabled', () => {
    expect(renderHeader('en', '/blog/')).not.toMatch(/<script/i);
  });
});

/**
 * The static header is a hand copy of SiteHeader, so it drifts the moment the
 * React one changes. These assertions pin the two ends of every value that has
 * to match: if SiteHeader is edited without updating scripts/lib/header.mjs,
 * the React-side assertion fails here and names the drift.
 */
describe('static header parity with SiteHeader', () => {
  const react = read('src/components/SiteHeader.tsx');

  it('uses the same centring desktop grid', () => {
    expect(react).toContain('sm:grid-cols-[1fr_auto_1fr]');
    expect(HEADER_CSS).toContain('grid-template-columns:1fr auto 1fr');
  });

  it('scales the wordmark on hover, like the React logo', () => {
    expect(react).toContain('hover:scale-[1.04]');
    expect(HEADER_CSS).toContain('transform:scale(1.04)');
  });

  it('matches the nav gaps and header margins', () => {
    // gap-x-8 mobile / sm:gap-x-6 desktop; mb-5 mobile / sm:mb-8 desktop.
    expect(react).toContain('gap-x-8');
    expect(react).toContain('sm:gap-x-6');
    expect(HEADER_CSS).toMatch(/\.qlf-header-nav\{[^}]*gap:2rem/);
    expect(HEADER_CSS).toContain('.qlf-header-nav{order:2;width:auto;gap:1.5rem');
    expect(react).toContain('mb-5');
    expect(react).toContain('sm:mb-8');
    expect(HEADER_CSS).toMatch(/\.qlf-header\{[^}]*margin-bottom:1\.25rem/);
    expect(HEADER_CSS).toMatch(/\.qlf-header\{display:grid[^}]*margin-bottom:2rem/);
    expect(HEADER_CSS).toContain(
      '.qlf-header-actions{order:3;flex:none;justify-self:end;gap:.75rem}',
    );
  });

  it('uses the app colour tokens, not the hand-picked navy it drifted to', () => {
    // text-primary is --color-action and hover:text-action-hover is
    // --color-action-hover. The static header used to hardcode #02275a, which
    // is not a theme token at all.
    expect(react).toContain('text-primary');
    expect(react).toContain('hover:text-action-hover');
    expect(HEADER_CSS).toContain('#1e3a8a');
    expect(HEADER_CSS).toContain('#172d6e');
    expect(HEADER_CSS).not.toContain('#02275a');
  });

  it('groups the pills in the same right-hand track', () => {
    expect(react).toContain('sm:grid-cols-[1fr_auto_1fr]');
    expect(HEADER_CSS).toContain('.qlf-header-actions');
    const html = renderHeader('en', '/blog/');
    const track = /<div class="qlf-header-actions">([\s\S]*?)<\/header>/.exec(html)?.[1] ?? '';
    expect(track).toContain('qlf-pill-primary');
    expect(track).toContain('href="/ar/blog/"');
    expect(track).toContain('class="qlf-language-mobile"');
  });
});

describe('header on built pages', () => {
  it.each([
    'dist/blog/index.html',
    'dist/ar/blog/index.html',
    'dist/blog/search-youtube-video/index.html',
    'dist/privacy/index.html',
    'dist/ar/privacy/index.html',
    'dist/404.html',
  ])('%s carries the site header', (path) => {
    expect(read(path)).toContain('qlf-header-logo');
  });

  it.each([
    'dist/blog/index.html',
    'dist/ar/blog/index.html',
    'dist/privacy/index.html',
    'dist/ar/privacy/index.html',
    'dist/404.html',
  ])('%s has a way back to the homepage', (path) => {
    // The 404 carries both locale blocks; every other page has one.
    const locales = path.includes('404')
      ? (['en', 'ar'] as const)
      : ([path.includes('/ar/') ? 'ar' : 'en'] as const);
    const html = read(path);
    for (const locale of locales) {
      expect(html).toMatch(
        new RegExp(`class="qlf-header-logo" href="/\\?lang=${locale}"`),
      );
    }
  });
  it('gives each 404 locale block its own header', () => {
    // The 404 renders both locales in one document, so a substring check passes
    // as long as *one* block has a header. Both must, or one language is stuck.
    const html = read('dist/404.html');
    expect(html.match(/class="qlf-header-logo"/g) ?? []).toHaveLength(2);
    for (const [lang, logo] of [
      ['en', '/logo-en.svg'],
      ['ar', 'src="/logo.svg"'],
    ] as const) {
      const block = new RegExp(
        `<div class="nf-block" lang="${lang}"[\\s\\S]*?<div class="nf-block"|<div class="nf-block" lang="${lang}"[\\s\\S]*$`,
      ).exec(html);
      expect(block, `no ${lang} block`)?.not.toBeNull();
      expect(block?.[0], `${lang} block has no header`).toContain('qlf-header-logo');
      expect(block?.[0], `${lang} block has the wrong wordmark`).toContain(logo);
      expect(block?.[0], `${lang} block logo does not carry its locale`).toContain(
        `href="/?lang=${lang}"`,
      );
    }
  });
});

describe('maintenance flag', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['on', true],
    ['yes', true],
    ['false', false],
    ['', false],
    ['no', false],
    [undefined, false],
    // A stray space or a typo must not take the site down; failing to show the
    // page is much cheaper than showing it by accident.
    [' true ', true],
    ['ture', false],
    ['2', false],
  ])('parses %o as %s', (raw, expected) => {
    expect(isMaintenanceOn(raw)).toBe(expected);
  });
});

describe('maintenance page', () => {
  it('is noindex, so a forgotten flag cannot deindex the site', () => {
    expect(renderMaintenance(SITE_URL)).toContain('<meta name="robots" content="noindex, follow">');
  });

  it('ships no JavaScript', () => {
    expect(renderMaintenance(SITE_URL)).not.toMatch(/<script/i);
  });

  it('serves both locales with correct dir', () => {
    const html = renderMaintenance(SITE_URL);
    expect(html).toContain('lang="en" dir="ltr"');
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain('We will be back shortly');
    expect(html).toContain('سنعود قريبًا');
  });

  it('offers a contact route, since the site is otherwise unusable', () => {
    expect(renderMaintenance(SITE_URL)).toContain('mailto:support@qfza.app');
  });

  it('carries the canonical origin in og:url', () => {
    expect(renderMaintenance(SITE_URL)).toContain(
      `<meta property="og:url" content="${SITE_URL}/">`,
    );
  });
});

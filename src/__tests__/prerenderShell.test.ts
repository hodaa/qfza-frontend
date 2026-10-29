import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SHELL } from '../../scripts/lib/shell.mjs';

/**
 * The prerender shell is the only crawlable markup on the homepage: React wipes
 * #root on mount, the header nav is in-page fragments, and the footer is
 * client-rendered. If these links are missing or wrong, every blog page falls
 * back to being discovered through sitemap.xml alone.
 */
describe('prerender shell', () => {
  const hrefs = [...SHELL.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1]);

  it('links to both blog indexes with real paths', () => {
    // Not fragments: "#" targets resolve to the same URL and crawl nothing.
    const paths = hrefs.filter((href) => !href.startsWith('#'));
    expect(paths).toContain('/blog/');
    expect(paths).toContain('/ar/blog/');
  });

  it('leaves no page reachable only through the sitemap', async () => {
    // Derived from the content tree rather than hand-listed, so this fails in both
    // directions: a page that ships without being linked here, and a link here
    // pointing at a page that was renamed out from under it. Both are silent
    // otherwise — the sitemap still lists the URL either way.
    const { loadAllPages } = await import('../../scripts/lib/legal.mjs');
    const staticUrls = (await loadAllPages()).map((page) => page.url);
    const expected = ['/', '/blog/', '/ar/blog/', ...staticUrls];
    const navigable = hrefs.filter((href) => href.startsWith('/'));
    for (const path of navigable) {
      expect(expected, `shell links to unmapped path ${path}`).toContain(path);
    }
    // The assertion that matters: every generated page is one link away from the
    // homepage. Auth routes are excluded — they are noindex and need a session.
    for (const url of staticUrls) {
      expect(navigable, `${url} is reachable only through the sitemap`).toContain(url);
    }
  });

  it('declares the language on every cross-locale link', () => {
    // The page is bilingual in one document, so each link into the other set must
    // say which language it leads to — otherwise a crawler cannot pair the two and
    // the hreflang clusters on the destination pages have nothing to point back
    // to. In-page anchors are exempt: they stay on this document.
    const tags = [...SHELL.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
    const crossLocale = tags.filter((tag) => /href="\//.test(tag));
    // Guard the guard: a regex that matches nothing makes this loop vacuous.
    expect(crossLocale, 'no cross-locale <a> tags found to check').not.toHaveLength(0);

    for (const tag of crossLocale) {
      const locale = /href="\/ar\//.test(tag) ? 'ar' : 'en';
      expect(tag, `missing hreflang on ${locale} link`).toContain(`hreflang="${locale}"`);
      expect(tag, `missing lang on ${locale} link`).toContain(`lang="${locale}"`);
    }
  });

  it('keeps one link per locale rather than linking the blog twice', () => {
    expect(hrefs.filter((h) => h === '/blog/')).toHaveLength(1);
    expect(hrefs.filter((h) => h === '/ar/blog/')).toHaveLength(1);
  });

  it('uses visible markup, not noscript, and keeps a single h1', () => {
    // Crawlers and SEO audit tools skip <noscript> entirely.
    expect(SHELL).not.toMatch(/<noscript/i);
    expect(SHELL.match(/<h1[\s>]/g) ?? []).toHaveLength(1);
  });

  it('carries no content outside the two declared language blocks', () => {
    // Guards the CJK / replacement-character contamination seen in earlier
    // drafts of this file, which silently shipped to the live homepage.
    expect(SHELL).not.toMatch(/[一-鿿぀-ヿ가-힯]/);
    expect(SHELL).not.toMatch(/�/);
  });
});

/**
 * The shell is the SEO half of a deliberate trade: its text must reach crawlers
 * in the served HTML, and it must never reach a visitor's screen. Both
 * assertions below are load-bearing, and neither is sufficient alone — the
 * "obvious fix" for a flash of unstyled content is to delete the shell, which
 * would satisfy a visibility-only test and silently empty the homepage.
 */
describe('prerender shell in the built homepage', () => {
  const htmlPath = resolve(process.cwd(), 'dist/index.html');
  const built = existsSync(htmlPath);
  const html = built ? readFileSync(htmlPath, 'utf8') : '';
  const shellMarkup = html.match(/<div id="app-shell"[^>]*>/)?.[0] ?? '';

  it.runIf(built)('hides the shell so a refresh cannot flash unstyled content', () => {
    // `hidden` rather than a CSS rule: it holds even if the stylesheet fails to
    // load, and it costs no bytes on the critical path.
    expect(shellMarkup).not.toBe('');
    expect(shellMarkup).toContain('hidden');
  });

  it.runIf(built)('keeps the crawlable text in the HTML that ships', () => {
    // Deleting the shell is the cheap way to remove a flash, and it is the one
    // way to break the homepage for search engines without any test noticing.
    expect(html).toContain('Search Inside Videos');
    expect(html).toMatch(/<h1[\s>]/);
    expect(html).toContain('href="/blog/"');
    expect(html).toContain('href="/ar/blog/"');
  });

  it.runIf(built)('leaves no visible fallback styling to fight the real app', () => {
    // The old shell shipped a <style> block that styled headings and links.
    // Pointless once hidden, and a stray unlayered rule can outrank the app.
    expect(html).not.toContain('app-shell-style');
    expect(html).not.toMatch(/<style[^>]*data-app-shell/);
  });

  it.runIf(built)('does not put the shell inside a noscript block', () => {
    // Google skips <noscript>; content hidden that way is not crawlable at all.
    const before = html.slice(0, html.indexOf('id="app-shell"'));
    expect(before).not.toMatch(/<noscript/i);
  });
});

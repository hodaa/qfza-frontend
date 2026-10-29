import type { Plugin } from 'vite';

/**
 * A static page as `loadPages` actually builds it: frontmatter plus the slug,
 * locale, url and rendered body. Locale metadata (`dir`, `prefix`, `ogLocale`)
 * deliberately is *not* on this type — `loadPages` never sets it, and renderPage
 * reads it from LOCALES[page.locale] instead, so declaring it here would only
 * invite a caller to read a field that is always undefined.
 */
export interface LegalPage {
  slug: string;
  locale: string;
  title: string;
  description: string;
  /** Optional: a static page with no date renders no eyebrow and no <lastmod>. */
  updated?: string;
  url: string;
  html: string;
  /** Which content directory the page came from. Present on `loadAllPages`. */
  section?: 'legal' | 'faq' | 'pages';
  /** Optional sitemap override; falls back to the section default. */
  changefreq?: string;
  /** Optional sitemap override; falls back to the section default. */
  priority?: string;
  /**
   * When set, the page is also a client route and gets the app's entry script
   * injected after generation, so React mounts over the generated copy. Contact
   * is the only page using this; every other page stays script-free.
   */
  hydrate?: boolean;
}

export declare const ROOT: string;

export declare const CONTENT_DIR: string;

export declare const FAQ_CONTENT_DIR: string;

export declare const PAGES_CONTENT_DIR: string;

export declare const STATIC_SECTIONS: {
  section: 'legal' | 'faq' | 'pages';
  dir: string;
}[];

export declare function loadPages(contentDir?: string): Promise<LegalPage[]>;

/** Every static page across every section, each tagged with its section. */
export declare function loadAllPages(): Promise<LegalPage[]>;

export declare function renderPage(
  page: LegalPage,
  ctx: { siteUrl: string; css: string; cssHref?: string; twin?: LegalPage },
): string;

export declare function legalDevPlugin(siteUrl: string): Plugin;

import { describe, expect, it } from 'vitest';
import {
  parseFrontmatter,
  loadPosts,
  renderPost,
  renderIndex,
  CONTENT_DIR,
} from '../../scripts/lib/blog.mjs';
import type { BlogPost } from '../../scripts/lib/blog.mjs';

const siteUrl = 'https://qfza.app';

const all = () => loadPosts(CONTENT_DIR);

/** Fail loudly if seed content goes missing, rather than rendering undefined. */
async function pick(predicate: (post: BlogPost) => boolean): Promise<BlogPost> {
  const found = (await all()).find(predicate);
  if (!found) throw new Error('expected a matching blog post in content/blog');
  return found;
}

const jsonLdOf = (html: string) =>
  JSON.parse(/application\/ld\+json">(.*?)<\/script>/s.exec(html)![1]);

describe('blog frontmatter', () => {
  it('splits frontmatter from the body and trims quotes', () => {
    const { data, body } = parseFrontmatter(
      ['---', 'title: "Hello"', 'description: World', 'date: 2026-01-02', '---', '', '# Hi'].join(
        '\n',
      ),
    );
    expect(data).toEqual({ title: 'Hello', description: 'World', date: '2026-01-02' });
    expect(body.trim()).toBe('# Hi');
  });

  it('treats a document without frontmatter as all body', () => {
    const { data, body } = parseFrontmatter('# Just markdown');
    expect(data).toEqual({});
    expect(body).toBe('# Just markdown');
  });
});

describe('blog posts', () => {
  it('publishes EN at /blog/<slug>/ and AR at /ar/blog/<slug>/', async () => {
    const en = await pick((p) => p.locale === 'en');
    const ar = await pick((p) => p.locale === 'ar');
    expect(en.url).toMatch(/^\/blog\/[a-z0-9-]+\/$/);
    expect(ar.url).toMatch(/^\/ar\/blog\/[a-z0-9-]+\/$/);
  });

  it('translates every EN post to AR, while allowing Arabic-only posts', async () => {
    const posts = await all();
    const slugs = (locale: string) => posts.filter((p) => p.locale === locale).map((p) => p.slug);
    const en = slugs('en');
    const ar = slugs('ar');
    expect(en.length).toBeGreaterThan(0);
    // AR is allowed to run ahead of EN, but no EN post may go untranslated.
    for (const slug of en) expect(ar).toContain(slug);
  });

  it('emits no hreflang for a post that has no translation in the other locale', async () => {
    // Synthetic, not drawn from content/: an untranslated post is a supported state
    // (AR is allowed to run ahead of EN), so the guard is asserted directly rather
    // than depending on a real AR-only post continuing to exist.
    const posts = await all();
    const orphan: BlogPost = {
      ...(await pick((p) => p.locale === 'ar')),
      slug: 'ar-only-for-test',
      title: 'AR only',
      url: '/ar/blog/ar-only-for-test/',
    };
    const html = renderPost(orphan, { siteUrl, css: '', posts: [...posts, orphan] });
    expect(html).not.toContain('rel="alternate" hreflang');
  });

  it('gives every post a title, description and parseable date', async () => {
    for (const post of await all()) {
      expect(post.title).toBeTruthy();
      expect(post.description).toBeTruthy();
      expect(Number.isNaN(Date.parse(post.date))).toBe(false);
    }
  });

  it('orders posts newest first', async () => {
    const dates = (await all()).map((p) => p.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe('blog page output', () => {
  it('emits a canonical URL, description and BlogPosting markup', async () => {
    const post = await pick((p) => p.locale === 'en');
    const html = renderPost(post, { siteUrl, css: '', posts: await all() });

    expect(html).toContain(`<link rel="canonical" href="${siteUrl}${post.url}">`);
    expect(html).toContain('<meta name="description"');
    expect(jsonLdOf(html)).toMatchObject({ '@type': 'BlogPosting', inLanguage: 'en' });
  });

  it('cross-links translations with hreflang and an x-default', async () => {
    const post = await pick((p) => p.slug === 'search-youtube-video' && p.locale === 'en');
    const posts = await all();
    const html = renderPost(post, { siteUrl, css: '', posts });

    expect(html).toContain('hreflang="ar"');
    expect(html).toContain('hreflang="en"');
    // English is the primary SEO target, so the fallback resolves to the English page.
    expect(html).toContain(`hreflang="x-default" href="${siteUrl}/blog/search-youtube-video/"`);
  });

  it('links contextually from the article body, not just the page chrome', async () => {
    // The article named Qfza repeatedly but linked nowhere, so a reader who
    // finished it had no path to the tool and no link equity reached the money
    // page. "Try Qfza" existed only in the shared header/footer, which every
    // post has, so it did not make the body itself a dead end.
    const posts = await all();
    const bodyLinks = (html: string) => {
      const article = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
      return [...article.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
        href: m[1]!,
        text: m[2]!
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim(),
      }));
    };

    for (const post of posts) {
      const html = renderPost(post, { siteUrl, css: '', posts });
      const links = bodyLinks(html);
      expect(
        links.length,
        `${post.locale}/${post.slug}: article body has no links`,
      ).toBeGreaterThan(0);
    }
  });

  it('uses descriptive anchor text rather than bare "click here"', async () => {
    const posts = await all();
    for (const post of posts) {
      const html = renderPost(post, { siteUrl, css: '', posts });
      const article = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
      const texts = [...article.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) =>
        m[1]!
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase(),
      );
      for (const text of texts) {
        expect(
          ['here', 'click here', 'read more', 'more', 'this', 'link'],
          `${post.locale}/${post.slug}: non-descriptive anchor text`,
        ).not.toContain(text);
        // An anchor that is just a word or two carries no topic signal.
        expect(
          text.split(/\s+/).length,
          `${post.locale}/${post.slug}: anchor too terse`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('keeps contextual link counts equal across translations', async () => {
    // hreflang promises the two pages are the same page in different
    // languages, so a link present in one and missing in the other is a broken
    // promise as well as lost link equity.
    const posts = await all();
    const bySlug = new Map<string, Map<string, BlogPost>>();
    for (const post of posts) {
      const locales = bySlug.get(post.slug) ?? new Map<string, BlogPost>();
      locales.set(post.locale, post);
      bySlug.set(post.slug, locales);
    }
    for (const [slug, locales] of bySlug) {
      if (!locales.has('en') || !locales.has('ar')) continue;
      const count = (post: BlogPost) => {
        const html = renderPost(post, { siteUrl, css: '', posts });
        const article = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
        return (article.match(/<a\b[^>]*>/gi) ?? []).length;
      };
      expect(count(locales.get('en')!), `${slug}: en/ar contextual link count mismatch`).toBe(
        count(locales.get('ar')!),
      );
    }
  });

  it('points every contextual link at a path this site actually has', async () => {
    // A typo'd href ships silently: marked renders it, the build passes, and
    // the only symptom is a 404 nobody sees until a crawler follows it.
    const posts = await all();
    const valid = new Set<string>(['/']);
    for (const post of posts) valid.add(post.url);
    const { loadAllPages } = await import('../../scripts/lib/legal.mjs');
    for (const page of await loadAllPages()) valid.add(page.url);

    for (const post of posts) {
      const html = renderPost(post, { siteUrl, css: '', posts });
      const article = /<article[\s\S]*?<\/article>/i.exec(html)?.[0] ?? html;
      const hrefs = [...article.matchAll(/<a\b[^>]*href="([^"]+)"/gi)].map((m) => m[1]!);
      for (const href of hrefs) {
        expect(href, `${post.locale}/${post.slug}: link should be site-relative`).toMatch(/^\//);
        expect(
          valid.has(href),
          `${post.locale}/${post.slug}: "${href}" is not a real path (known: ${[...valid].join(', ')})`,
        ).toBe(true);
      }
    }
  });

  it('keeps every translation pair genuinely equivalent', async () => {
    const posts = await all();
    const bySlug = new Map<string, Map<string, BlogPost>>();
    for (const post of posts) {
      const locales = bySlug.get(post.slug) ?? new Map<string, BlogPost>();
      locales.set(post.locale, post);
      bySlug.set(post.slug, locales);
    }

    for (const [slug, locales] of bySlug) {
      if (!locales.has('en') || !locales.has('ar')) continue;

      // Counted from the rendered HTML, not the markdown, so a heading written
      // as `**bold**` instead of `## ` cannot silently break the comparison.
      const headings = (post: BlogPost) => (post.html.match(/<h2[\s>]/g) ?? []).length;
      const words = (post: BlogPost) =>
        post.html
          .replace(/<[^>]*>/g, ' ')
          .replace(/[^\p{L}\p{N}\s]/gu, ' ')
          .split(/\s+/)
          .filter(Boolean).length;

      // hreflang tells Google "same page, different language". If one locale
      // is rewritten and its twin is not, that promise is false: Google may
      // consolidate, drop one, or mis-target. Section parity is the cheap
      // proxy — a real divergence changes the heading count.
      expect(headings(locales.get('en')!), `${slug}: en/ar h2 mismatch`).toBe(
        headings(locales.get('ar')!),
      );

      // And length parity, with slack for the scripts' different word density.
      const [en, ar] = [words(locales.get('en')!), words(locales.get('ar')!)];
      const ratio = Math.max(en, ar) / Math.min(en, ar);
      expect(ratio, `${slug}: en ${en}w vs ar ${ar}w (${ratio.toFixed(2)}x) diverged`).toBeLessThan(
        1.6,
      );
    }
  });

  it('never repeats the brand inside one title', async () => {
    const posts = await all();
    const pages: [string, string][] = [];
    for (const locale of ['en', 'ar']) {
      pages.push([`${locale} index`, renderIndex({ locale, posts, siteUrl, css: '' })]);
      for (const post of posts.filter((p) => p.locale === locale)) {
        pages.push([`${locale} ${post.slug}`, renderPost(post, { siteUrl, css: '', posts })]);
      }
    }

    for (const [label, html] of pages) {
      const title = /<title>([^<]*)<\/title>/.exec(html)![1];
      const brand = label.startsWith('ar') ? 'قفزة' : 'Qfza';
      const occurrences = title.split(brand).length - 1;

      // The index title leads with the brand and must not take the usual
      // " — Qfza" suffix on top; that once rendered "Qfza blog — Qfza".
      expect(occurrences, `${label}: "${title}" repeats the brand`).toBeLessThanOrEqual(1);
      expect(title.length, `${label}: title ${title.length} chars`).toBeLessThanOrEqual(60);
    }
  });

  it('types the blog index as a website and posts as articles', async () => {
    const posts = await all();
    for (const locale of ['en', 'ar']) {
      const index = renderIndex({ locale, posts, siteUrl, css: '' });
      expect(index, `${locale} index`).toContain('<meta property="og:type" content="website">');
      expect(index, `${locale} index`).not.toContain('og:type" content="article"');
    }
    for (const post of posts) {
      const html = renderPost(post, { siteUrl, css: '', posts });
      expect(html, post.url).toContain('<meta property="og:type" content="article">');
      expect(html, post.url).toContain(
        `<meta property="article:published_time" content="${post.date}">`,
      );
    }
  });

  it('gives the blog index a substantive description, not a stub', async () => {
    const posts = await all();
    for (const locale of ['en', 'ar']) {
      const html = renderIndex({ locale, posts, siteUrl, css: '' });
      const description = /name="description" content="([^"]*)"/.exec(html)![1];
      // Was 82 (en) / 73 (ar) — thin enough to be rewritten as boilerplate.
      expect(description.length, `${locale} index: ${description.length} chars`).toBeGreaterThan(
        110,
      );
      expect(description.length, `${locale} index`).toBeLessThanOrEqual(160);
    }
  });

  it('emits a valid BreadcrumbList for every post', async () => {
    const posts = await all();
    for (const post of posts) {
      const html = renderPost(post, { siteUrl, css: '', posts });
      const blocks = [...html.matchAll(/application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
        JSON.parse(m[1]),
      );
      const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');

      expect(crumbs, `${post.url}: no BreadcrumbList`).toBeDefined();
      const items = crumbs!.itemListElement;
      expect(items).toHaveLength(3);
      // Positions must be 1-based and ascending, or Google discards the trail.
      expect(items.map((i: { position: number }) => i.position)).toEqual([1, 2, 3]);
      expect(items.every((i: { name: string }) => Boolean(i.name.trim()))).toBe(true);
      expect(items[1].item).toBe(`${siteUrl}${post.prefix}/blog/`);
      expect(items[2].item).toBe(`${siteUrl}${post.url}`);
    }
  });

  it('attributes every post to the brand, without inventing a byline', async () => {
    for (const post of await all()) {
      const { author } = jsonLdOf(renderPost(post, { siteUrl, css: '', posts: await all() }));
      expect(author, post.url).toMatchObject({
        '@type': 'Organization',
        name: post.locale === 'ar' ? 'قفزة' : 'Qfza',
      });
    }
  });

  it('gives the blog index the same reciprocal hreflang cluster as a post', async () => {
    const posts = await all();
    const en = renderIndex({ locale: 'en', siteUrl, css: '', posts });
    const ar = renderIndex({ locale: 'ar', siteUrl, css: '', posts });

    for (const [label, html] of [
      ['en index', en],
      ['ar index', ar],
    ] as const) {
      // Both locales must advertise both hreflang targets, not just their own,
      // otherwise the cluster is one-way and search engines ignore the pairing.
      expect(html, label).toContain(`hreflang="en" href="${siteUrl}/blog/"`);
      expect(html, label).toContain(`hreflang="ar" href="${siteUrl}/ar/blog/"`);
      expect(html, label).toContain(`hreflang="x-default" href="${siteUrl}/blog/"`);
    }
  });

  it('puts a dimensioned social image on BlogPosting markup', async () => {
    const post = await pick((p) => p.locale === 'en');
    const { image } = jsonLdOf(renderPost(post, { siteUrl, css: '', posts: await all() }));

    expect(image.url).toBe(`${siteUrl}/og-blog.png`);
    expect(image.width).toBe(1200);
    expect(image.height).toBe(630);
  });

  it('keeps every description within the SERP snippet budget', async () => {
    for (const post of await all()) {
      expect(post.description.length, post.url).toBeLessThanOrEqual(160);
    }
  });

  it('sets RTL direction and language on Arabic pages only', async () => {
    const posts = await all();
    const ar = posts.find((p) => p.locale === 'ar')!;
    const en = posts.find((p) => p.locale === 'en')!;
    expect(renderPost(ar, { siteUrl, css: '', posts })).toContain('<html lang="ar" dir="rtl">');
    expect(renderPost(en, { siteUrl, css: '', posts })).toContain('<html lang="en" dir="ltr">');
  });

  it('renders the article body as real markup, not escaped markdown', async () => {
    const post = await pick((p) => p.locale === 'en');
    const html = renderPost(post, { siteUrl, css: '', posts: await all() });
    expect(html).toContain('<h2>');
    expect(html).toContain('<p>');
    expect(html).not.toContain('## ');
  });

  it('links every post from the index for that locale', async () => {
    const posts = await all();
    for (const locale of ['en', 'ar']) {
      const index = renderIndex({ locale, posts, siteUrl, css: '' });
      for (const post of posts.filter((p) => p.locale === locale)) {
        expect(index).toContain(`href="${post.url}"`);
      }
    }
  });

  it('colours titles with the brand accent via theme variables, not raw hex', async () => {
    const post = await pick((p) => p.locale === 'en');
    const posts = await all();
    const styles = /<style>(.*?)<\/style>/s.exec(renderPost(post, { siteUrl, css: '', posts }))![1];

    expect(styles).toMatch(/\.qlf-post h1\{[^}]*color:var\(--color-accent\)/);
    expect(styles).toMatch(/\.qlf-index-list h2 a\{[^}]*color:var\(--color-accent-strong\)/);
  });

  it('gives every post a large social card with absolute image dimensions', async () => {
    for (const post of await all()) {
      const html = renderPost(post, { siteUrl, css: '', posts: await all() });

      // A 1200x630 card is 1.91:1 — what Facebook wants and what Twitter's
      // summary_large_image expects. `summary` (small) letterboxes a wide card.
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
      expect(html).toContain('<meta property="og:image" content="https://qfza.app/og-blog.png">');
      expect(html).toContain('<meta property="og:image:width" content="1200">');
      expect(html).toContain('<meta property="og:image:height" content="630">');
      expect(html).toContain('<meta name="twitter:image" content="https://qfza.app/og-blog.png">');
    }
  });
});

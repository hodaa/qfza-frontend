import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { marked } from 'marked';

import { LOCALES, ROOT, parseFrontmatter, document_, esc } from './blog.mjs';
import { HEADER_CSS, renderHeader } from './header.mjs';

export { ROOT };
export const CONTENT_DIR = resolve(ROOT, 'content/legal');
/**
 * The FAQ lives in its own directory rather than beside the policies, because it
 * is neither: it is support content that changes often and ranks for questions,
 * and a page that answers "why did my search fail" is not a legal document.
 * Splitting it out keeps `content/legal` meaning one thing, and lets the sitemap
 * give the two sections different priorities — see `sitemapEntry` in
 * prerender.mjs.
 */
export const FAQ_CONTENT_DIR = resolve(ROOT, 'content/faq');

/**
 * Ordinary content pages: About, Terms and Contact.
 *
 * A third directory rather than more sections, because these three have nothing
 * in common with each other beyond being neither a policy nor a FAQ. One section
 * also means one entry in `STATIC_SECTIONS` instead of three near-identical ones.
 * Contact lives here because it is a real generated document — crawlable copy with
 * its own title, description and canonical — that the app then mounts a live form
 * over. That is why it is a file and not a hash route.
 */
export const PAGES_CONTENT_DIR = resolve(ROOT, 'content/pages');

/** Every non-blog static page section, in the order the build walks them. */
export const STATIC_SECTIONS = [
  { section: 'legal', dir: CONTENT_DIR },
  { section: 'faq', dir: FAQ_CONTENT_DIR },
  { section: 'pages', dir: PAGES_CONTENT_DIR },
];

/**
 * Static pages are referenced by name rather than enumerated, so adding
 * `content/legal/<locale>/terms.md` is enough to get it built. Sitemap,
 * alternates and hreflang are all derived from the same slug set, which is
 * what keeps a new page from shipping in only one locale by accident.
 *
 * `loadAllPages` is the whole-site view the build and the dev server use;
 * `loadPages` stays scoped to one section for callers that want just that one.
 */
export async function loadAllPages() {
  const bySection = await Promise.all(
    STATIC_SECTIONS.map(async ({ section, dir }) =>
      (await loadPages(dir)).map((page) => ({ ...page, section })),
    ),
  );
  return bySection.flat();
}

export async function loadPages(contentDir = CONTENT_DIR) {
  const pages = [];
  for (const locale of Object.keys(LOCALES)) {
    const dir = resolve(contentDir, locale);
    const files = await readdir(dir).catch(() => []);
    for (const file of files.filter((f) => f.endsWith('.md'))) {
      const raw = await readFile(resolve(dir, file), 'utf8');
      const { data, body } = parseFrontmatter(raw);
      // `parseFrontmatter` hands back plain text, so YAML's `hydrate: true`
      // arrives as the string 'true'. Coerce it once here: the alternative is
      // every caller writing its own truthiness test, and a caller that forgets
      // produces a page that ships the app's script with no #root for it to
      // mount into — a blank page that no assertion would have caught.
      const hydrate = data.hydrate === true || data.hydrate === 'true';
      pages.push({
        ...data,
        ...(data.hydrate === undefined ? {} : { hydrate }),
        locale,
        slug: file.replace(/\.md$/, ''),
        url: `${LOCALES[locale].prefix}/${file.replace(/\.md$/, '')}/`,
        html: marked.parse(body),
      });
    }
  }
  return pages;
}

/** Reciprocal hreflang for a same-slug page in the other locale. */
function headExtra(page, twin, siteUrl) {
  if (!twin) return '';
  return [
    `<link rel="alternate" hreflang="${twin.locale}" href="${siteUrl + twin.url}">`,
    `<link rel="alternate" hreflang="${page.locale}" href="${siteUrl + page.url}">`,
    // English is the primary SEO target, matching the blog's x-default.
    '<link rel="alternate" hreflang="x-default" href="' +
      siteUrl +
      (page.locale === 'en' ? page.url : twin.url) +
      '">',
  ].join('\n');
}

/**
 * FAQ questions are headings (`##` in the markdown), so they arrive as `h2` and
 * would otherwise be navy like every other section heading on the site.
 *
 * Scoped to `.qlf-faq` rather than changing the shared `.qlf-body h2` rule: the
 * same class styles About, Terms and Privacy, and their `##` headings are prose
 * structure, not questions. The doubled class is also what lets this win over
 * `.qlf-body h2` regardless of stylesheet order — dev and build emit the shared
 * rules in different positions, so relying on source order would style the page
 * in one and not the other.
 *
 * `--color-accent` is the bright brand orange. An `h2` here renders at 24px, which
 * meets the WCAG "large text" threshold (18pt) on size alone, so the 3:1 ratio
 * applies and this orange clears it on white; body copy would need the darker
 * `--color-accent-strong` instead.
 *
 * Accordion functionality: each h2 becomes a button that toggles its following
 * sibling content. The script runs after DOMContentLoaded and progressively
 * enhances the static HTML into an accordion.
 */
const FAQ_CSS = `
.qlf-body.qlf-faq h2{color:var(--color-accent)}

.faq-accordion{
  border:1px solid var(--color-border);
  border-radius:.75rem;
  background:var(--color-surface);
  margin:.75rem 0;
  overflow:hidden;
  transition:box-shadow .2s ease, border-color .2s ease;
}
.faq-accordion:hover{
  box-shadow:0 4px 12px -2px rgb(0 0 0 / .08);
  border-color:var(--color-accent);
}
.faq-accordion[open]{
  box-shadow:0 8px 24px -4px rgb(0 0 0 / .1);
  border-color:var(--color-accent);
}

.faq-accordion summary{
  cursor:pointer;
  list-style:none;
  display:flex;
  align-items:center;
  gap:.75rem;
  padding:1rem 1.25rem;
  font-weight:600;
  font-size:1.05rem;
  color:var(--color-text);
  background:linear-gradient(90deg, transparent, var(--color-accent-bg));
  user-select:none;
  outline:none;
}
.faq-accordion summary::-webkit-details-marker{display:none}
.faq-accordion summary::after{
  content:'';
  width:.6rem;height:.6rem;
  border-right:2px solid var(--color-accent);
  border-bottom:2px solid var(--color-accent);
  transform:rotate(45deg);
  transition:transform .25s cubic-bezier(.4,0,.2,1);
  flex-shrink:0;
  margin-inline-end:auto;
}
.faq-accordion[open] summary::after{
  transform:rotate(-135deg);
}
[dir="rtl"] .faq-accordion summary::after{
  margin-inline-start:auto;
  margin-inline-end:0;
}
[dir="rtl"] .faq-accordion[open] summary::after{
  transform:rotate(45deg);
}
.faq-accordion summary:focus-visible{
  outline:2px solid var(--color-accent);
  outline-offset:-2px;
  border-radius:.5rem;
}

.faq-accordion > *:not(summary){
  padding:0 1.25rem 1.25rem;
  animation:faq-slide .3s cubic-bezier(.4,0,.2,1);
  line-height:1.7;
  color:var(--color-text-muted);
}
.faq-accordion > *:not(summary) p:first-child{margin-top:.5rem}
.faq-accordion > *:not(summary) p:last-child{margin-bottom:0}
.faq-accordion > *:not(summary) ul{margin:.75rem 0;padding-inline-start:1.5rem}
.faq-accordion > *:not(summary) li{margin:.35rem 0}
.faq-accordion > *:not(summary) a{color:var(--color-accent-strong);font-weight:500}
.faq-accordion > *:not(summary) code{background:var(--color-accent-bg);padding:.1em .4em;border-radius:.25rem;font-size:.9em}

@keyframes faq-slide{
  from{opacity:0;transform:translateY(-.75rem)}
  to{opacity:1;transform:translateY(0)}
}

/* RTL support */
[dir="rtl"] .faq-accordion summary::after{
  transform:rotate(-135deg);
}
[dir="rtl"] .faq-accordion[open] summary::after{
  transform:rotate(45deg);
}
`;

/**
 * Strip markup down to the text a schema.org `Answer` can carry.
 *
 * `acceptedAnswer.text` is plain text, not HTML, so the rendered markdown has to be
 * flattened. Entities are decoded here rather than left escaped, because the JSON-LD
 * consumer reads the result as a sentence — `&amp;` in an answer is a visible defect.
 */
function plainText(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FAQPage structured data, built from the same `##` headings the accordion uses.
 *
 * The FAQ is the only section written as question-and-answer, and it is the section
 * the sitemap ranks highest among the content pages (priority 0.7) precisely because
 * it answers things people search for. FAQPage is the schema that matches that shape.
 *
 * Reading the questions off the rendered HTML rather than re-parsing the markdown means
 * the schema cannot drift from the visible page: if a heading stops being an `h2` it
 * stops being a question here too, rather than emitting markup for a question that is
 * no longer on the page.
 *
 * The intro paragraph before the first `##` belongs to no question and is dropped —
 * it is page framing, and attaching it to the first answer would state something the
 * page does not.
 */
function faqJsonLd(page, siteUrl) {
  const mainEntity = [];
  const heading = /<h2[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2|$)/g;
  for (const [, question, answer] of page.html.matchAll(heading)) {
    const name = plainText(question);
    const text = plainText(answer);
    // A heading with no body under it is a section label, not a question, and an
    // empty acceptedAnswer is a false claim that the page answers it.
    if (!name || !text) continue;
    mainEntity.push({
      '@type': 'Question',
      name,
      acceptedAnswer: { '@type': 'Answer', text },
    });
  }
  if (!mainEntity.length) return '';
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: page.locale,
    url: `${siteUrl}${page.url}`,
    mainEntity,
  }).replace(/</g, '\\u003c')}</script>`;
}

export function renderPage(page, { siteUrl, css, cssHref, twin }) {
  const meta = LOCALES[page.locale];
  const header = renderHeader(page.locale, page.url);
  const isFaq = page.section === 'faq';
  // A hydrated page (Contact) is a document for crawlers and no-JS readers, but
  // the app replaces its body with a live form. Post chrome is wrong twice over:
  // a bare `updated` date floating above "Contact us" in the HTML that actually
  // ships, and a standfirst the app throws away on hydration in favour of its
  // own. `updated` stays in the frontmatter either way — the sitemap still reads
  // its <lastmod> from there — this only decides what gets rendered.
  const isHydrated = page.hydrate === true;
  const body = [
    // `updated` is optional because these pages are added by name, not by a
    // manifest: without this guard a page that omits it renders the literal
    // string "undefined" above its title. A page with no date simply has no
    // eyebrow, and ships without a <lastmod> in the sitemap.
    !isHydrated && page.updated ? `<p class="qlf-post-eyebrow">${esc(page.updated)}</p>` : '',
    `<h1>${esc(page.title)}</h1>`,
    isHydrated ? '' : `<p class="qlf-post-meta">${esc(page.description)}</p>`,
    `<div class="qlf-body${isFaq ? ' qlf-faq' : ''}">`,
    page.html,
    '</div>',
  ].join('\n  ');

  // Progressive enhancement script for FAQ accordion
  const faqScript = isFaq ? `
<script>
(function(){
  function initFaqAccordion() {
    try {
      // Convert FAQ h2 headings into accordion details/summary
      const faqBody = document.querySelector('.qlf-faq');
      if (!faqBody) return;
      const headings = Array.from(faqBody.querySelectorAll('h2'));
      headings.forEach(function(h2) {
        // Collect all following siblings until next h2
        var content = [];
        var node = h2.nextElementSibling;
        while (node && node.tagName !== 'H2') {
          content.push(node);
          node = node.nextElementSibling;
        }
        if (content.length === 0) return;
        var details = document.createElement('details');
        details.className = 'faq-accordion';
        var summary = document.createElement('summary');
        summary.textContent = h2.textContent;
        details.appendChild(summary);
        content.forEach(function(el) { details.appendChild(el); });
        h2.replaceWith(details);
      });
    } catch (e) {
      console.error('FAQ accordion init failed:', e);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFaqAccordion);
  } else {
    initFaqAccordion();
  }
})();
</script>
` : '';

  return document_({
    siteUrl,
    url: page.url,
    title: page.title,
    description: page.description,
    locale: page.locale,
    dir: meta.dir,
    css,
    header,
    cssHref,
    ogType: 'website',
    // A policy page has no author or publish date, so it must not claim to be a
    // BlogPosting — that would be a false structured-data signal. The FAQ is the
    // one section whose content genuinely is question-and-answer, so it is the only
    // one that earns schema, and it earns FAQPage rather than a post type.
    jsonLd: isFaq ? faqJsonLd(page, siteUrl) : '',
    headExtra: headExtra(page, twin, siteUrl),
    extraCss: isFaq ? FAQ_CSS : '',
    body: body + faqScript,
    // Contact asks to be a mount point for the app; see `document_`'s hydrate.
    // Every other page leaves this false and stays free of script tags.
    hydrate: page.hydrate === true,
  });
}

/**
 * Serve the same static pages during `vite dev` that build-legal.mjs emits for
 * production, so `/privacy/`, `/faq/` and their Arabic counterparts are
 * previewable at their real paths before a deploy. Without this, dev falls
 * through to the SPA fallback and the app renders instead of the page, which
 * makes it look broken. Registered ahead of Vite's SPA fallback.
 *
 * Named for the legal section it was born from; it now serves every section in
 * STATIC_SECTIONS, so renaming it would churn the Vite config and the tests for
 * no behaviour change.
 */
export function legalDevPlugin(siteUrl) {
  return {
    name: 'qfza-legal-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url || '').split('?')[0];
        const match = /^\/(?:(ar)\/)?([a-z0-9-]+)\/?$/.exec(url);
        if (!match) return next();
        try {
          const pages = await loadAllPages();
          const locale = match[1] === 'ar' ? 'ar' : 'en';
          const page = pages.find((p) => p.slug === match[2] && p.locale === locale);
          // Not a static page: hand it back so the SPA can handle it, rather than
          // swallowing every single-segment path.
          if (!page) return next();
          const twin = pages.find((p) => p.slug === page.slug && p.locale !== page.locale);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          // In dev the stylesheet is linked rather than inlined so HMR still applies.
          const html = renderPage(page, { siteUrl, css: '', cssHref: '/src/index.css', twin });
          // A hydrated page is a document *and* a client route: the markdown ships
          // for crawlers and readers without JS, then React replaces it with the
          // live view. Production gets the built entry script from
          // `scripts/prerender.mjs`, which only runs during a build — so dev has to
          // inject its own or `/contact/` renders as static prose with no form at
          // all, and the form can only be worked on in a built preview.
          const withEntry = page.hydrate
            ? html.replace(
                '</body>',
                '  <script type="module" src="/src/main.tsx"></script>\n</body>',
              )
            : html;
          // Through Vite's HTML transform, because this string bypasses
          // `index.html`. That transform is what injects the React Fast Refresh
          // preamble; without it every `.tsx` module throws "can't detect
          // preamble" and the page silently stays static with no console error
          // from the app itself.
          res.end(await server.transformIndexHtml(url, withEntry));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

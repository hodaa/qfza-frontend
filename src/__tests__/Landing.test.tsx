import { act, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import App from '../App';
import i18n, { setLanguage } from '../i18n';
import englishMessages from '../i18n/locales/en.json';
import arabicMessages from '../i18n/locales/ar.json';
import { Features } from '../components/Features';
import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { SiteFooter } from '../components/SiteFooter';
import { SiteHeader } from '../components/SiteHeader';
import social from '../social.json';

describe('Landing sections', () => {
  it.each([
    { language: 'en' as const, heading: 'Why Qfza', nav: 'Why Qfza?' },
    { language: 'ar' as const, heading: 'لماذا قفزة؟', nav: 'لماذا قفزة؟' },
  ])(
    'uses the corrected brand spelling throughout the $language landing page',
    async ({ language, heading, nav }) => {
      await act(async () => setLanguage(language));
      render(<App />);
      const brand = language === 'ar' ? 'قفزة' : 'Qfza';
      expect(i18n.t('app.title')).toBe(brand);
      expect(screen.getByAltText(language === 'ar' ? 'قفزة' : 'Qfza')).toHaveAttribute(
        'src',
        language === 'ar' ? '/logo.svg' : '/logo-en.svg?v=icon-left',
      );
      expect(
        screen.getByRole('link', {
          name: language === 'ar' ? 'قفزة — الصفحة الرئيسية' : 'Qfza home',
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: nav })).toBeInTheDocument();
      expect(i18n.t('footer.note')).toContain(brand);
      expect(i18n.t('footer.rights', { year: 2026 })).toContain(brand);
    },
  );

  it('uses only Qfza for brand references in the English messages', () => {
    expect(JSON.stringify(englishMessages)).not.toContain('قفزة');
    expect(englishMessages.app.title).toBe('Qfza');
    expect(englishMessages.nav.whyQfza).toBe('Why Qfza?');
  });

  it('keeps browser-tab and description branding in sync with language selection', async () => {
    // A real document ships exactly one description tag, and
    // `applyDocumentLanguage` updates the first one it finds. Start from that
    // state: if an earlier test left a description tag behind, the one appended
    // here would sit behind it and never be the element that gets rewritten —
    // the assertion would pass or fail for reasons unrelated to the language.
    for (const stale of document.querySelectorAll('meta[name="description"]')) stale.remove();
    const description = document.createElement('meta');
    description.name = 'description';
    document.head.appendChild(description);
    try {
      await act(async () => setLanguage('en'));
      expect(document.title).toBe('Qfza — Search Inside Videos & Jump to the Moment');
      expect(description.content).toBe(
        'Qfza lets you search inside videos and their transcripts for any word or phrase, then jump straight to the exact timestamp where it appears.',
      );

      await act(async () => setLanguage('ar'));
      expect(document.title).toBe('قفزة — ابحث داخل الفيديوهات وانتقل إلى اللحظة');
      expect(description.content).toBe(
        'قفزة يتيح لك البحث داخل الفيديوهات ونصوصها التفرغية عن أي كلمة أو عبارة، ثم الانتقال مباشرةً إلى التوقيت الذي تظهر فيه.',
      );

      await act(async () => setLanguage('en'));
      expect(document.title).toBe('Qfza — Search Inside Videos & Jump to the Moment');
      expect(description.content).toBe(
        'Qfza lets you search inside videos and their transcripts for any word or phrase, then jump straight to the exact timestamp where it appears.',
      );
    } finally {
      description.remove();
    }
  });

  it('renders the brand header with the logo and language toggle', () => {
    render(<SiteHeader />);
    expect(screen.getByAltText('Qfza')).toHaveAttribute('src', '/logo-en.svg?v=icon-left');
    expect(screen.getByRole('link', { name: 'Qfza home' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Why Qfza?' })).toHaveAttribute('href', '/#why-qfza');
    expect(screen.getByRole('link', { name: 'How it works?' })).toHaveAttribute(
      'href',
      '/#how-it-works',
    );
    expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument();
  });

  it('points every in-page nav link at a section that actually exists', () => {
    // The href and the section id are declared in different files, so pinning
    // each on its own still passes when only one of them is renamed — the
    // link then silently scrolls nowhere. Assert the pairing instead.
    // "#/contact" is a hash route, not a fragment, so skip it.
    render(<App />);
    const anchors = [...document.querySelectorAll('a[href^="#"]')].filter(
      (anchor) => !anchor.getAttribute('href')!.startsWith('#/'),
    );
    expect(anchors.length).toBeGreaterThan(0);
    for (const anchor of anchors) {
      const href = anchor.getAttribute('href')!;
      expect(href).not.toBe('#');
      expect(
        document.getElementById(href.slice(1)),
        `nav link ${href} has no matching element id`,
      ).not.toBeNull();
    }
  });

  it('switches between English and Arabic logo assets without changing their layout size', async () => {
    render(<SiteHeader />);
    const logo = screen.getByRole('img', { name: 'Qfza' });
    expect(logo).toHaveAttribute('src', '/logo-en.svg?v=icon-left');
    expect(logo).toHaveAttribute('width', '124');
    expect(logo).toHaveAttribute('height', '48');

    await act(async () => setLanguage('ar'));
    expect(screen.getByRole('img', { name: 'قفزة' })).toBe(logo);
    expect(logo).toHaveAttribute('src', '/logo.svg');
    expect(screen.getByRole('link', { name: 'قفزة — الصفحة الرئيسية' })).toHaveAttribute(
      'href',
      '/',
    );

    await act(async () => setLanguage('en'));
    expect(screen.getByRole('img', { name: 'Qfza' })).toBe(logo);
    expect(logo).toHaveAttribute('src', '/logo-en.svg?v=icon-left');
    expect(logo).toHaveAttribute('width', '124');
    expect(logo).toHaveAttribute('height', '48');
    expect(screen.getByRole('link', { name: 'Qfza home' })).toHaveAttribute('href', '/');
  });

  it('renders the hero headline with the search card slot', () => {
    render(<Hero>search card</Hero>);
    expect(screen.getByText('Search Inside Videos')).toBeInTheDocument();
    expect(screen.getByText('search card')).toBeInTheDocument();
  });

  it('sets the hero subtitle in the high-contrast muted-strong tone', () => {
    const { container } = render(<Hero compact />);
    const subtitle = container.querySelector('h1 + p');
    expect(subtitle?.textContent).toBe(
      'Paste a video URL and search for any word or phrase. Qfza finds where it appears and lets you jump directly to that moment.',
    );
    expect(subtitle?.className).toContain('text-muted-strong');
    expect(subtitle?.className).not.toContain('text-slate-600');
  });

  it('spreads the header across three zones: logo, nav, language switcher', () => {
    const { container } = render(<SiteHeader />);
    const header = container.querySelector('header');
    // Balanced three-track grid at sm+ instead of `ms-auto` + space-between,
    // which left one big void between the logo and the nav links.
    expect(header?.className).toContain('sm:grid');
    expect(header?.className).toContain('sm:grid-cols-[1fr_auto_1fr]');
    expect(header?.className).not.toContain('justify-between');
    const nav = screen.getByRole('navigation', { name: 'Primary' });
    // Logo → nav → language, and the nav owns the flexible middle track.
    expect(nav.className).toContain('sm:order-2');
    expect(nav.className).toContain('justify-center');
    expect(nav.parentElement?.firstElementChild?.className).toContain('order-1');
  });

  it.each([
    {
      language: 'en' as const,
      heading: 'Why Qfza',
      cards: [
        'Exact phrase matching',
        'Faster repeat searches',
        'Watch at the right second',
        'Download what you find',
      ],
    },
    {
      language: 'ar' as const,
      heading: 'لماذا قفزة؟',
      cards: [
        'مطابقة تامة للعبارة',
        'بحث أسرع عند التكرار',
        'شاهد في الثانية الصحيحة',
        'حمل المقاطع',
      ],
    },
  ])('renders the four feature cards in $language', async ({ language, heading, cards }) => {
    await act(async () => setLanguage(language));
    render(<Features />);
    expect(screen.getByText(heading)).toBeInTheDocument();
    for (const title of cards) expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('renders the three-step how it works strip', () => {
    render(<HowItWorks />);
    expect(screen.getByText('How it works')).toBeInTheDocument();
    expect(screen.getByText('Paste a video URL')).toBeInTheDocument();
    expect(screen.getByText('Enter a word or phrase')).toBeInTheDocument();
    expect(screen.getByText('Jump to the moment')).toBeInTheDocument();
    for (const step of [1, 2, 3]) {
      expect(screen.getByLabelText(`Step ${step}`)).toHaveClass('bg-accent');
      expect(screen.getByLabelText(`Step ${step}`)).not.toHaveClass('bg-accent-strong');
    }
  });

  it('renders the footer with the current year', () => {
    render(<SiteFooter />);
    expect(screen.getByText('Qfza — Find the moments that matter')).toBeInTheDocument();
    expect(
      screen.getByText(`© ${new Date().getFullYear()} Qfza. All rights reserved.`),
    ).toBeInTheDocument();
  });

  it('links to the Facebook page in a new tab', () => {
    render(<SiteFooter />);
    // The accessible name carries the new-tab hint appended to the label.
    const link = screen.getByRole('link', { name: 'Facebook Opens in a new tab' });
    expect(link).toHaveAttribute('href', social.facebook);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each([
    { language: 'en' as const, name: 'LinkedIn Opens in a new tab', label: 'LinkedIn' },
    { language: 'ar' as const, name: 'لينكدإن يفتح في تبويب جديد', label: 'لينكدإن' },
  ])('links to the LinkedIn company page from the $language footer', async ({ language, name, label }) => {
    await act(async () => setLanguage(language));
    render(<SiteFooter />);
    const link = screen.getByRole('link', { name });
    expect(link).toHaveAttribute('href', social.linkedin);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // The 44px tap target is only meaningful if the label is still visible text;
    // an icon-only link would drop the accessible name entirely.
    expect(link).toHaveTextContent(label);
    expect(link.className).toMatch(/min-h-11/);
    // The brand mark and the new-tab cue are both decorative; the
    // accessible name comes from the label plus the sr-only hint.
    for (const svg of link.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('names every social profile in the homepage sameAs set', () => {
    // sameAs is how the profiles are attached to the site entity in Google's
    // knowledge graph, so a footer link alone does not establish the link.
    // jsdom gives import.meta.url an http: scheme, so resolve from the project
    // root rather than trying to read it as a file URL.
    // index.html carries %FACEBOOK_URL% / %LINKEDIN_URL% placeholders
    // that the build substitutes from src/social.json; resolve them
    // here the same way before parsing.
    const raw = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
      .replaceAll('%FACEBOOK_URL%', social.facebook)
      .replaceAll('%LINKEDIN_URL%', social.linkedin);
    const block = /application\/ld\+json">([\s\S]*?)<\/script>/.exec(raw)![1];
    const parsed = JSON.parse(block) as { sameAs?: string[]; '@graph'?: { sameAs?: string[] }[] };
    // The document is a @graph now that the WebSite references a publisher, so
    // the profiles live on the WebSite node rather than at the top level.
    const nodes = parsed['@graph'] ?? [parsed];
    for (const node of nodes) {
      expect(node.sameAs).toContain(social.facebook);
      expect(node.sameAs).toContain(social.linkedin);
    }
  });

  it('translates the social link labels in both locales', () => {
    expect(englishMessages.footer.linkedin).toBe('LinkedIn');
    expect(arabicMessages.footer.linkedin).toBe('لينكدإن');
    // A key present in one locale and missing in the other renders the raw key.
    expect(Object.keys(englishMessages.footer).sort()).toEqual(
      Object.keys(arabicMessages.footer).sort(),
    );
  });

  it('composes all landing sections on the idle home page', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Why Qfza' })).toBeInTheDocument();
    expect(screen.getByText('Exact phrase matching')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument();
    expect(screen.getByText('Paste a video URL')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jump to video' })).toBeInTheDocument();
  });
});

describe('static document metadata ownership', () => {
  /**
   * The generated pages carry their own title, description and social card.
   * `contact` is both a document and a client route, so the app boots there —
   * and the i18n module that boots it stamps the homepage's branding on every
   * one of those tags. The canonical survives (nothing touches it), which is
   * what makes the damage easy to miss: the page ends up claiming to be
   * /contact/ while calling itself the homepage.
   */
  /** Put a generated page's own head tags in place, as the static renderer would. */
  function primeContactDocument(): () => void {
    // A document has exactly one <title>, and `document.title` reports the first
    // one in <head>. An earlier test's title would otherwise win and the
    // assertion would read that instead of the page's own.
    const previousTitles = [...document.querySelectorAll('title')];
    for (const stale of previousTitles) stale.remove();
    const previousMeta = [...document.querySelectorAll('meta[name="description"]')];
    for (const stale of previousMeta) stale.remove();
    // Same for the canonical: it is singular per document, and the hook writes
    // the first one it finds.
    const previousCanonicals = [...document.querySelectorAll('link[rel="canonical"]')];
    for (const stale of previousCanonicals) stale.remove();
    const title = document.createElement('title');
    title.textContent = 'Contact Qfza';
    document.head.appendChild(title);
    const meta = document.createElement('meta');
    meta.name = 'description';
    meta.content = 'Email support@qfza.app';
    document.head.appendChild(meta);
    const canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.href = 'https://qfza.app/contact/';
    document.head.appendChild(canonical);
    return () => {
      title.remove();
      meta.remove();
      canonical.remove();
      for (const node of [...previousTitles, ...previousMeta, ...previousCanonicals]) {
        document.head.appendChild(node);
      }
    };
  }

  it('leaves a generated page its own title and description on load', async () => {
    window.history.replaceState(null, '', '/contact/');
    const cleanup = primeContactDocument();
    try {
      await act(async () => setLanguage('ar'));
      expect(document.title).toBe('Contact Qfza');
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
        'Email support@qfza.app',
      );
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://qfza.app/contact/',
      );
    } finally {
      cleanup();
      window.history.replaceState(null, '', '/');
    }
  });

  it('still re-brands the app views, which own their metadata', async () => {
    window.history.replaceState(null, '', '/login');
    await act(async () => setLanguage('en'));
    expect(document.title).toBe('Qfza — Search Inside Videos & Jump to the Moment');
  });
});

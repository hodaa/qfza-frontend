import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ContactPage } from '../components/ContactPage';
import { LoginPage } from '../components/auth/LoginPage';
import { RegisterPage } from '../components/auth/RegisterPage';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * The auth pages are part of the same product as the homepage, so these pin the
 * specific traits that make that true. A visitor arriving from the header's
 * "sign in" link should not feel they left the site: same heading treatment with
 * the orange brand bar, same card depth, same weight of primary action.
 */
vi.mock('../config', () => ({
  CSRF_TOKEN: '',
  CSRF_HEADER_NAME: 'X-CSRF-Token',
  CONTACT_EMAIL: 'support@qfza.app',
  CONTACT_FORM_ENDPOINT: 'https://form.example/submit',
  GOOGLE_CLIENT_ID: '',
}));

vi.mock('../hooks/useRoute', () => ({ navigate: vi.fn() }));

function jsonResponse(data: unknown, status = 200, ok = true): Response {
  return { ok, status, json: () => Promise.resolve(data) } as unknown as Response;
}

async function renderAuth(node: ReactElement, fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  render(<AuthProvider>{node}</AuthProvider>);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  fetchMock.mockClear();
}

const heading = () => screen.getByRole('heading', { level: 1 });
/**
 * The card is the rounded-2xl wrapper inside the page. Searched from the body
 * rather than from `main`, because `<main>` belongs to PageShell, which these
 * tests deliberately do not mount.
 */
const card = () =>
  [...document.querySelectorAll('body *')].find((el) =>
    String(el.className).includes('rounded-2xl'),
  ) as HTMLElement;
const submit = () => screen.getByRole('button', { name: /sign in|create account/i });

describe.each([
  ['login', <LoginPage key="login" />],
  ['register', <RegisterPage key="register" />],
])('%s page shares the homepage styling', (_name, page) => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ user: null }, 401, false));
  });

  it('uses the homepage section heading, which carries the orange brand bar', () => {
    // `section-title` is what paints the accent bar under the headline. A plain
    // h1 here was the most visible sign these pages belonged to another product.
    renderAuth(page, fetchMock);
    expect(heading().className).toContain('section-title');
  });

  it('leads with an accent-coloured icon, like the other sub-pages', () => {
    // The homepage and ContactPage both open with a large accent glyph; the auth
    // pages used to jump straight into a bordered box.
    renderAuth(page, fetchMock);
    const glyph = heading().previousElementSibling as HTMLElement;
    expect(glyph?.className).toContain('text-accent');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  });

  it('gives the heading and its lead a visible, readable treatment', () => {
    // The old subtitle was 14px `text-muted`; the homepage lead is larger and
    // uses the higher-contrast token.
    renderAuth(page, fetchMock);
    const lead = heading().nextElementSibling as HTMLElement;
    expect(lead.className).toContain('text-muted-strong');
    expect(lead.className).toContain('text-lg');
  });

  it('dresses the form card with the search panel depth', () => {
    // Same radius, border, ring and raised shadow as the search panel, so the
    // form reads as part of the same surface rather than a separate widget.
    renderAuth(page, fetchMock);
    const c = card();
    expect(c.className).toContain('rounded-2xl');
    expect(c.className).toContain('border-slate-200');
    expect(c.className).toContain('shadow-xl');
    expect(c.className).toContain('ring-1');
  });

  it('enters with the same animation the rest of the site uses', () => {
    renderAuth(page, fetchMock);
    expect(card().className).toContain('animate-fade-in-up');
  });

  it('keeps the card narrow enough for two fields', () => {
    // Deliberately not the search panel's max-w-2xl: two inputs centred in 42rem
    // of whitespace read as broken rather than generous.
    renderAuth(page, fetchMock);
    const container = heading().parentElement as HTMLElement;
    expect(container.className).toContain('max-w-xl');
    expect(container.className).not.toContain('max-w-2xl');
  });

  it('gives the primary action the same weight as the homepage CTA', () => {
    renderAuth(page, fetchMock);
    const b = submit().className;
    expect(b).toContain('font-bold');
    expect(b).toContain('shadow-lg');
    expect(b).toContain('bg-action');
  });

  it('marks the busy state for assistive tech, not just visually', () => {
    // Swapping the label for a spinner alone announces nothing.
    renderAuth(page, fetchMock);
    fetchMock.mockResolvedValue(jsonResponse({ user: null }, 401, false));
    expect(submit()).toHaveAttribute('aria-busy', 'false');
  });

  it('leaves text direction to the document, not the card', () => {
    // The card is `text-start`, which resolves per direction, so Arabic text
    // stays right-aligned without a physical class.
    renderAuth(page, fetchMock);
    expect(card().className).toContain('text-start');
    expect(card().className).not.toMatch(/text-left|text-right/);
  });
});

describe('contact page shares the auth page styling', () => {
  // Contact used to roll its own heading and render the form straight onto the
  // page, so it read as a different product from the sign-in flow one click away.
  // It shares `AuthCard` now, which is the guarantee; these pin the traits that
  // make the sharing visible, in case someone inlines the classes again.
  const renderContact = () => render(<ContactPage />);

  it('carries the same heading and accent glyph as the auth pages', () => {
    renderContact();
    expect(heading().className).toContain('section-title');
    const glyph = heading().previousElementSibling as HTMLElement;
    expect(glyph?.className).toContain('text-accent');
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the same lead treatment', () => {
    renderContact();
    const lead = heading().nextElementSibling as HTMLElement;
    expect(lead.className).toContain('text-muted-strong');
    expect(lead.className).toContain('text-lg');
  });

  it('puts the form in the same raised card, with the same entrance', () => {
    renderContact();
    const c = card();
    expect(c.className).toContain('rounded-2xl');
    expect(c.className).toContain('border-slate-200');
    expect(c.className).toContain('shadow-xl');
    expect(c.className).toContain('ring-1');
    expect(c.className).toContain('animate-fade-in-up');
  });

  it('keeps the card the same width the auth pages use', () => {
    renderContact();
    const container = heading().parentElement as HTMLElement;
    expect(container.className).toContain('max-w-xl');
    expect(container.className).not.toContain('max-w-2xl');
  });

  it('gives the send button the same weight as sign in', () => {
    renderContact();
    const b = screen.getByRole('button', { name: /send message/i }).className;
    expect(b).toContain('font-bold');
    expect(b).toContain('shadow-lg');
    expect(b).toContain('bg-action');
  });

  it('leaves text direction to the document, not the card', () => {
    renderContact();
    expect(card().className).toContain('text-start');
    expect(card().className).not.toMatch(/text-left|text-right/);
  });
});

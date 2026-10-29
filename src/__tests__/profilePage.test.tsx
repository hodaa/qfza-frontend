import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountMenu } from '../components/auth/AccountMenu';
import { ProfilePage } from '../components/auth/ProfilePage';
import { RegisterPage } from '../components/auth/RegisterPage';
import { AuthProvider } from '../auth/AuthProvider';
import { navigate } from '../hooks/useRoute';
import type { AuthUser } from '../types';

vi.mock('../config', () => ({
  CSRF_TOKEN: '',
  CSRF_HEADER_NAME: 'X-CSRF-Token',
  CONTACT_EMAIL: 'support@qfza.app',
  CONTACT_FORM_ENDPOINT: '',
  get GOOGLE_CLIENT_ID() {
    return googleClientId;
  },
}));

let googleClientId = '';

vi.mock('../hooks/useRoute', () => ({ navigate: vi.fn() }));

const navigateMock = vi.mocked(navigate);

function jsonResponse(data: unknown, status = 200, ok = true): Response {
  return { ok, status, json: () => Promise.resolve(data) } as unknown as Response;
}

// Typed so a field added to AuthUser without being added here is a compile
// error, rather than an undefined that quietly falls back to the address.
const GOOGLE_USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'google.user@example.com',
  email_verified: true,
  created_at: '2026-01-15T10:00:00Z',
  has_password: false,
  full_name: 'Hoda Hussin',
};

const PASSWORD_USER = { ...GOOGLE_USER, email: 'pw.user@example.com', has_password: true };

/** Which account the session endpoint reports. Reset by each `renderProfile`. */
let sessionUser = GOOGLE_USER;

/** Mount the page with a session that resolves to the given user. */
async function renderProfile(fetchMock: ReturnType<typeof vi.fn>, user = GOOGLE_USER) {
  sessionUser = user;
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthProvider>
      <ProfilePage />
    </AuthProvider>,
  );
  await screen.findByText(user.email);
  fetchMock.mockClear();
}

function callsTo(fetchMock: ReturnType<typeof vi.fn>, path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(path));
}

/**
 * The confirmation must name the address it was sent to.
 *
 * Matching the sentence alone was not enough: the string carried a single-brace
 * `{email}`, which i18next renders as literal text, so the page read "we sent a
 * link to {email}" and a prefix match still passed.
 */
function confirmSentTo(email: string): RegExp {
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`we sent a link to ${escaped}\\.`, 'i');
}

describe('registering with Google lands on the home page', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    navigateMock.mockClear();
    googleClientId = 'test-client.apps.googleusercontent.com';
    vi.stubGlobal('google', {
      accounts: { id: { initialize: vi.fn(), renderButton: vi.fn() } },
    });
  });

  it('navigates home once the credential is accepted', async () => {
    // The whole point of registering is to end up signed in and able to search.
    // Staying on the form would look like the attempt did nothing.
    let configured: { callback: (r: { credential: string }) => void } | null = null;
    vi.stubGlobal('google', {
      accounts: {
        id: {
          initialize: vi.fn((c: typeof configured) => {
            configured = c;
          }),
          renderButton: vi.fn(),
        },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      jsonResponse({ user: GOOGLE_USER, token: 't', expires_at: '2026-02-01T00:00:00Z' }),
    );

    await waitFor(() => expect(configured).not.toBeNull());
    configured!.callback({ credential: 'google-issued-token' });

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('home'));
  });

  it('stays put when the backend refuses the credential', async () => {
    // Navigating away from a failure would hide the message that explains it.
    let configured: { callback: (r: { credential: string }) => void } | null = null;
    vi.stubGlobal('google', {
      accounts: {
        id: {
          initialize: vi.fn((c: typeof configured) => {
            configured = c;
          }),
          renderButton: vi.fn(),
        },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'CONFLICT', message: 'taken' } }, 409, false),
    );

    await waitFor(() => expect(configured).not.toBeNull());
    configured!.callback({ credential: 'google-issued-token' });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('set a password on the account page', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path.includes('/api/v1/auth/session')) {
        return Promise.resolve(jsonResponse({ user: sessionUser, csrf_token: 'csrf' }));
      }
      return Promise.resolve(jsonResponse(null, 202));
    });
  });

  it('offers to set a password when the account has none', async () => {
    // The Google-only account is the whole reason this page exists: the login
    // form can never succeed for it, so it needs a way to stop depending on
    // Google.
    await renderProfile(fetchMock, GOOGLE_USER);
    expect(
      screen.getByRole('button', { name: /email me a link to set my password/i }),
    ).toBeVisible();
  });

  it('says the account is Google-only', async () => {
    await renderProfile(fetchMock, GOOGLE_USER);
    expect(screen.getByText(/google only — no password/i)).toBeVisible();
  });

  it('offers to change the password when one already exists', async () => {
    // "Set" would be a lie here, and inviting a visitor to set a second password
    // is how you get two passwords on one account. The change itself is a quiet
    // link, not the page's headline action: someone opening their account is
    // usually checking a detail, not replacing a credential.
    await renderProfile(fetchMock, PASSWORD_USER);
    expect(screen.getByRole('button', { name: /^change password$/i })).toBeVisible();
    expect(screen.queryByRole('button', { name: /set my password/i })).not.toBeInTheDocument();
  });

  it('asks the dedicated first-password endpoint, not the reset one', async () => {
    // The reset endpoint refuses accounts with no password, so calling it here
    // returned a cheerful 202 and mailed nothing at all. This is that bug.
    const user = userEvent.setup();
    await renderProfile(fetchMock, GOOGLE_USER);
    await user.click(screen.getByRole('button', { name: /email me a link to set my password/i }));

    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/auth/password-set')).toHaveLength(1));
    expect(callsTo(fetchMock, '/api/v1/auth/password-reset')).toHaveLength(0);
  });

  it('sends no address, so the link can only go to the session owner', async () => {
    // The backend derives the recipient from the cookie, so an address in the
    // body would be a way to aim the link at somebody else's inbox.
    const user = userEvent.setup();
    await renderProfile(fetchMock, GOOGLE_USER);
    await user.click(screen.getByRole('button', { name: /email me a link to set my password/i }));

    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/auth/password-set')).toHaveLength(1));
    const call = callsTo(fetchMock, '/api/v1/auth/password-set')[0] as [string, RequestInit];
    expect(call[1].body ?? '').not.toContain(GOOGLE_USER.email);
  });

  it('presents the first-password request as a real authenticated call', async () => {
    // The session cookie alone must not authorise this, so the CSRF header has
    // to go out or the backend answers 403 and no mail is sent.
    const user = userEvent.setup();
    await renderProfile(fetchMock, GOOGLE_USER);
    await user.click(screen.getByRole('button', { name: /email me a link to set my password/i }));

    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/auth/password-set')).toHaveLength(1));
    const call = callsTo(fetchMock, '/api/v1/auth/password-set')[0] as [string, RequestInit];
    const headers = (call[1].headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).toContain('x-csrf-token');
  });

  it('goes through the emailed link rather than setting the password directly', async () => {
    // A live session must not be enough authority to mint a password: the
    // session is a cookie, so one XSS would otherwise be enough to keep access
    // after the owner closed the tab. The link re-proves the address.
    const user = userEvent.setup();
    await renderProfile(fetchMock, GOOGLE_USER);
    await user.click(screen.getByRole('button', { name: /email me a link to set my password/i }));

    await waitFor(() => expect(screen.getByText(confirmSentTo(GOOGLE_USER.email))).toBeVisible());
    expect(callsTo(fetchMock, '/api/v1/auth/password-reset/confirm')).toHaveLength(0);
    expect(callsTo(fetchMock, '/api/v1/auth/password-set/confirm')).toHaveLength(0);
  });

  it('never shows the placeholder to the visitor', async () => {
    // A single-brace `{email}` is literal text to i18next, so the old
    // prefix-only assertion above passed while the page displayed the braces.
    const user = userEvent.setup();
    await renderProfile(fetchMock, GOOGLE_USER);
    await user.click(screen.getByRole('button', { name: /email me a link to set my password/i }));
    await waitFor(() => expect(screen.getByText(confirmSentTo(GOOGLE_USER.email))).toBeVisible());

    const shown = document.body.textContent ?? '';
    expect(shown).not.toContain('{email}');
    expect(shown).not.toContain('{{email}}');
  });

  it('replaces the action with its outcome instead of leaving it armed', async () => {
    // Each press mails another link. Leaving the button there invites a
    // duplicate-link support ticket.
    const user = userEvent.setup();
    await renderProfile(fetchMock, GOOGLE_USER);
    await user.click(screen.getByRole('button', { name: /email me a link to set my password/i }));
    await waitFor(() => expect(screen.getByText(confirmSentTo(GOOGLE_USER.email))).toBeVisible());

    expect(screen.queryByRole('button', { name: /email me a link/i })).not.toBeInTheDocument();
  });

  it('warns that opening the link signs the visitor out everywhere', async () => {
    // The backend revokes every session on confirm, so silence here would look
    // like a bug when their next search suddenly asks them to sign in.
    const user = userEvent.setup();
    await renderProfile(fetchMock, GOOGLE_USER);
    await user.click(screen.getByRole('button', { name: /email me a link to set my password/i }));
    await waitFor(() => expect(screen.getByText(confirmSentTo(GOOGLE_USER.email))).toBeVisible());
    expect(screen.getByText(/signs you out of every device/i)).toBeVisible();
  });

  it('keeps the action available when the request fails', async () => {
    // A failed send is the normal case when mail is misconfigured, and the
    // visitor has to be able to try again without reloading.
    fetchMock.mockImplementation((url: unknown) => {
      if (String(url).includes('/api/v1/auth/session')) {
        return Promise.resolve(jsonResponse({ user: sessionUser, csrf_token: 'csrf' }));
      }
      return Promise.resolve(
        jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE', message: 'mail down' } }, 503, false),
      );
    });
    const user = userEvent.setup();
    await renderProfile(fetchMock, GOOGLE_USER);
    await user.click(screen.getByRole('button', { name: /email me a link to set my password/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a link/i })).toBeEnabled();
  });

  it('shows a sign-in prompt instead of an account when signed out', async () => {
    fetchMock.mockImplementation((url: unknown) => {
      if (String(url).includes('/api/v1/auth/session')) {
        return Promise.resolve(jsonResponse({ error: { code: 'UNAUTHENTICATED' } }, 401, false));
      }
      return Promise.resolve(jsonResponse(null, 202));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthProvider>
        <ProfilePage />
      </AuthProvider>,
    );

    expect(await screen.findByRole('heading', { name: /not signed in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^sign in$/i })).toBeVisible();
  });

  it('links onward to history and sign out', async () => {
    await renderProfile(fetchMock, GOOGLE_USER);
    expect(screen.getByRole('link', { name: /your searches/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeVisible();
  });
});

describe('greeting an account by name', () => {
  /** Mount the whole header, which is where the account label actually lives. */
  async function renderHeader(user: AuthUser) {
    sessionUser = user;
    const fetchMock = vi.fn(async (url: string) => {
      const path = String(url);
      if (path.includes('/api/v1/auth/session')) {
        return new Response(JSON.stringify({ user: sessionUser, csrf_token: 'csrf' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthProvider>
        <AccountMenu />
        <ProfilePage />
      </AuthProvider>,
    );
  }

  it('shows the name, not the address, in the account menu', async () => {
    await renderHeader(GOOGLE_USER);

    const trigger = await screen.findByRole('button', { name: /signed in as hoda hussin/i });
    expect(trigger).toHaveTextContent('Hoda Hussin');
    // The address is still the account identifier, just not the headline.
    expect(trigger).not.toHaveTextContent('google.user@example.com');
  });

  it('still lists the address in the menu so it stays identifiable', async () => {
    await renderHeader(GOOGLE_USER);
    await userEvent.click(await screen.findByRole('button', { name: /signed in as hoda hussin/i }));

    // The dropdown carries both, which is the only place the email is still
    // needed now that the trigger leads with the name. Scoped to the menu
    // because the profile heading above shows the same name.
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Hoda Hussin');
    expect(menu).toHaveTextContent('google.user@example.com');
  });

  it('uses the name as the profile page heading', async () => {
    await renderHeader(GOOGLE_USER);
    expect(await screen.findByRole('heading', { name: 'Hoda Hussin' })).toBeInTheDocument();
  });

  it('falls back to the address when the account has no name', async () => {
    // A password-only account never gets a name from Google, so this is the
    // normal case for it rather than an edge case.
    const nameless: AuthUser = { ...GOOGLE_USER, full_name: null, has_password: true };
    await renderHeader(nameless);

    const trigger = await screen.findByRole('button', {
      name: /signed in as google.user@example.com/i,
    });
    expect(trigger).toHaveTextContent('google.user@example.com');
    // No name, so the heading must fall back to the generic title rather than
    // rendering an empty one.
    expect(screen.getByRole('heading', { name: 'Your account' })).toBeInTheDocument();
  });

  it('falls back to the address when the name is only whitespace', async () => {
    // Google can return a profile whose name field is blank rather than absent.
    const blank: AuthUser = { ...GOOGLE_USER, full_name: '   ' };
    await renderHeader(blank);

    const trigger = await screen.findByRole('button', {
      name: /signed in as google.user@example.com/i,
    });
    expect(trigger).not.toHaveTextContent('Hoda Hussin');
  });

  it('does not show a blank name line in the menu when there is no name', async () => {
    const nameless: AuthUser = { ...GOOGLE_USER, full_name: null };
    await renderHeader(nameless);
    await userEvent.click(
      await screen.findByRole('button', { name: /signed in as google.user@example.com/i }),
    );

    // The email is the label here, so an extra blank row would read as a
    // rendering fault rather than as "this account simply has no name".
    const menu = await screen.findByRole('menu');
    expect(menu.querySelectorAll('p')).toHaveLength(1);
  });
});

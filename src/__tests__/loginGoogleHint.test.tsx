import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginPage } from '../components/auth/LoginPage';
import { AuthProvider } from '../auth/AuthProvider';

let googleClientId = '';

vi.mock('../config', () => ({
  CSRF_TOKEN: '',
  CSRF_HEADER_NAME: 'X-CSRF-Token',
  CONTACT_EMAIL: 'support@qfza.app',
  CONTACT_FORM_ENDPOINT: '',
  get GOOGLE_CLIENT_ID() {
    return googleClientId;
  },
}));

vi.mock('../hooks/useRoute', () => ({
  navigate: vi.fn(),
}));

function installFakeGoogle() {
  vi.stubGlobal('google', {
    accounts: {
      id: { initialize: vi.fn(), renderButton: vi.fn() },
    },
  });
}

function jsonResponse(data: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

/** An unknown address and a Google-only account are the same answer, on purpose. */
function refused(): Response {
  return jsonResponse(
    { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
    401,
    false,
  );
}

async function renderLogin(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
  // The provider checks the session on mount; clear that request so only the
  // sign-in attempt is left to assert on.
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  fetchMock.mockClear();
}

async function submitPasswordLogin(fetchMock: ReturnType<typeof vi.fn>) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), 'someone@example.com');
  await user.type(screen.getByLabelText('Password'), 'somepassword');
  await user.click(screen.getByRole('button', { name: /^sign in$/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
}

describe('Google-only accounts on the login page', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    googleClientId = 'test-client.apps.googleusercontent.com';
    installFakeGoogle();
  });

  it('points a visitor at the Google button before they try anything', async () => {
    // A Google-only account can never succeed with the password form, so the
    // dead end has to be visible before the failure rather than only after it.
    await renderLogin(fetchMock);
    expect(screen.getByTestId('google-only-hint')).toBeInTheDocument();
  });

  it('repeats the hint at the error after the password form is refused', async () => {
    // The visitor's eyes are on the red message at that moment, not on a hint
    // further down the page.
    await renderLogin(fetchMock);
    fetchMock.mockResolvedValue(refused());
    await submitPasswordLogin(fetchMock);

    await screen.findByRole('alert');
    await waitFor(() =>
      expect(screen.getAllByTestId('google-only-hint').length).toBeGreaterThan(1),
    );
  });

  it('shows the same hint whether or not the address exists', async () => {
    // The backend answers identically for an unknown address, a wrong password
    // and a Google-only account. If this hint were ever shown for some addresses
    // and not others it would reveal which addresses are registered, so the
    // tests below pin that it is driven by the error code alone and not by any
    // account-specific signal.
    await renderLogin(fetchMock);
    fetchMock.mockResolvedValue(refused());
    await submitPasswordLogin(fetchMock);
    const afterRefusal = screen.getAllByTestId('google-only-hint').length;

    expect(afterRefusal).toBeGreaterThan(0);
    for (const hint of screen.getAllByTestId('google-only-hint')) {
      expect(hint).toHaveTextContent(/google/i);
    }
  });

  it('does not add the hint for failures that are not credential refusals', async () => {
    // A locked account is a different problem; pointing at Google would be
    // misleading and would leak that the account exists.
    await renderLogin(fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'ACCOUNT_LOCKED', message: 'locked' } }, 423, false),
    );
    await submitPasswordLogin(fetchMock);

    await screen.findByRole('alert');
    // Only the always-present one under the divider.
    expect(screen.getAllByTestId('google-only-hint')).toHaveLength(1);
  });

  it('hides the hint when Google sign-in is not configured', async () => {
    // Pointing at a button that cannot exist is worse than saying nothing.
    googleClientId = '';
    await renderLogin(fetchMock);
    expect(screen.queryByTestId('google-only-hint')).not.toBeInTheDocument();
  });

  it('renders in Arabic without losing the hint', async () => {
    const i18n = (await import('../i18n')).default;
    await i18n.changeLanguage('ar');
    document.documentElement.lang = 'ar';
    document.documentElement.dir = 'rtl';
    await renderLogin(fetchMock);

    expect(screen.getByTestId('google-only-hint')).toHaveTextContent('Google');
    await i18n.changeLanguage('en');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RegisterPage } from '../components/auth/RegisterPage';
import { AuthProvider } from '../auth/AuthProvider';

/**
 * The client id is read once at module load, so the value the page sees has to
 * be swapped through the module mock rather than through the environment. A
 * getter keeps it live, so one test can configure a client id and the next can
 * run with none.
 */
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

/**
 * A stand-in for the real Google widget.
 *
 * The point of these tests is what our code does with the credential, so the
 * fake records the options it was configured with and hands back a token on
 * demand — exactly the two seams `GoogleButton` actually uses.
 */
function installFakeGoogle() {
  const state = {
    configured: null as null | {
      client_id: string;
      callback: (response: { credential: string }) => void;
    },
    renderCount: 0,
  };

  vi.stubGlobal('google', {
    accounts: {
      id: {
        initialize: vi.fn((config: typeof state.configured) => {
          state.configured = config;
        }),
        renderButton: vi.fn(() => {
          state.renderCount += 1;
        }),
      },
    },
  });
  return state;
}

function jsonResponse(data: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
  } as unknown as Response;
}

const USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'new@example.com',
  email_verified: true,
  created_at: '2026-01-01T00:00:00Z',
};

const ISSUED = { user: USER, token: 'opaque', expires_at: '2026-02-01T00:00:00Z' };

/** The call that carried the Google sign-in, once it has happened. */
function googleCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/v1/auth/google')) as
    [string, RequestInit] | undefined;
  if (!call) throw new Error('no /api/v1/auth/google call was made');
  return call;
}

/**
 * Render the page with Google configured and the widget already initialised.
 * Returns the fake so a test can hand back a credential.
 */
async function renderRegisterWithGoogle(fetchMock: ReturnType<typeof vi.fn>) {
  googleClientId = 'test-client.apps.googleusercontent.com';
  const google = installFakeGoogle();
  vi.stubGlobal('fetch', fetchMock);

  render(
    <AuthProvider>
      <RegisterPage />
    </AuthProvider>,
  );

  // Let the provider's own session check finish first, so its request is never
  // mistaken for the sign-in attempt.
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  fetchMock.mockClear();

  await waitFor(() => expect(google.configured).not.toBeNull());
  return google;
}

describe('register with Google', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    googleClientId = '';
  });

  it('renders the Google button alongside the password form', async () => {
    // Sign-up by Google has to be visible without scrolling past two fields, or
    // a visitor who already has a Google account gives up here.
    await renderRegisterWithGoogle(fetchMock);
    expect(screen.getByTestId('google-button')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('hides the Google button when no client id is configured', async () => {
    // Better to show one way to register than a Google button that fails for
    // every visitor because the env var was never set.
    vi.stubGlobal('fetch', fetchMock);
    render(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByTestId('google-button')).not.toBeInTheDocument();
  });

  it('initialises the widget with the configured client id', async () => {
    const google = await renderRegisterWithGoogle(fetchMock);
    expect(google.configured?.client_id).toBe('test-client.apps.googleusercontent.com');
    expect(google.renderCount).toBeGreaterThan(0);
  });

  it('posts the credential Google returns to the backend', async () => {
    // This is the whole mechanism: the token has to reach /auth/google, and the
    // backend decides whether it is genuine. Nothing is taken on the widget's
    // word from the client side.
    const google = await renderRegisterWithGoogle(fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(ISSUED));
    google.configured?.callback({ credential: 'google-issued-token' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(googleCall(fetchMock)[1].body as string)).toEqual({
      id_token: 'google-issued-token',
    });
  });

  it('sends the session cookie with the Google sign-in', async () => {
    // The session is an HttpOnly cookie; a call without credentials would leave
    // the visitor signed out of the very page that just created their session.
    const google = await renderRegisterWithGoogle(fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(ISSUED));
    google.configured?.callback({ credential: 'google-issued-token' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(googleCall(fetchMock)[1].credentials).toBe('include');
  });

  it('never sends a password with a Google sign-in', async () => {
    // Google proves the address; the backend never learns a Google password and
    // nothing we send may imply that it does.
    const google = await renderRegisterWithGoogle(fetchMock);
    fetchMock.mockResolvedValue(jsonResponse(ISSUED));
    google.configured?.callback({ credential: 'google-issued-token' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(googleCall(fetchMock)[1].body as string) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['id_token']);
  });

  it('says so when the address already has an account', async () => {
    // The real case: someone who signed up with a password tries Google with
    // the same address. The backend answers 409 and the page has to explain it
    // rather than showing a blank failure.
    const google = await renderRegisterWithGoogle(fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'CONFLICT', message: 'already registered' } }, 409, false),
    );
    google.configured?.callback({ credential: 'google-issued-token' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/already has an account/i);
  });

  it('explains a locked account instead of reporting a generic failure', async () => {
    const google = await renderRegisterWithGoogle(fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'ACCOUNT_LOCKED', message: 'locked' } }, 423, false),
    );
    google.configured?.callback({ credential: 'google-issued-token' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/locked/i);
  });

  it('keeps the password form usable when Google sign-in fails', async () => {
    // A failed Google attempt must not leave the page in a state where the only
    // way forward is to reload.
    const google = await renderRegisterWithGoogle(fetchMock);
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'SERVICE_UNAVAILABLE', message: 'down' } }, 503, false),
    );
    google.configured?.callback({ credential: 'google-issued-token' });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeEnabled();
  });

  it('reports a network failure to the visitor', async () => {
    const google = await renderRegisterWithGoogle(fetchMock);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    google.configured?.callback({ credential: 'google-issued-token' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });
});

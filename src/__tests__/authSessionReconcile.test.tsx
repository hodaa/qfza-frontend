import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '../auth/AuthProvider';
import { useAuth } from '../auth/useAuth';
import type { AuthState } from '../auth/context';
import { AUTH_UNAUTHENTICATED_EVENT, currentCsrfToken } from '../api/authClient';
import type { AuthUser } from '../types';

// A build-time secret is only a fallback; the session endpoint is the authority.
vi.mock('../config', () => ({
  CSRF_TOKEN: '',
  CSRF_HEADER_NAME: 'X-CSRF-Token',
  CONTACT_EMAIL: 'support@qfza.app',
  CONTACT_FORM_ENDPOINT: '',
  get GOOGLE_CLIENT_ID() {
    return '';
  },
}));

const USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'fresh.visitor@example.com',
  email_verified: true,
  created_at: '2026-01-15T10:00:00Z',
  has_password: false,
  full_name: 'Fresh Visitor',
};

const SESSION_SECRET = 'session-csrf-secret';

function jsonResponse(data: unknown, status = 200, ok = true): Response {
  return { ok, status, json: () => Promise.resolve(data) } as unknown as Response;
}

function errorResponse(code: string, status: number): Response {
  return jsonResponse({ error: { code, message: code } }, status, false);
}

let fetchMock: ReturnType<typeof vi.fn>;

let sessionCalls = 0;

/**
 * Wire a signed-out page load that becomes a session after sign-in, which is
 * the visitor who has never seen the session endpoint.
 */
function signedOutThenSession(): void {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/auth/session')) {
      sessionCalls += 1;
      return Promise.resolve(
        sessionCalls === 1
          ? errorResponse('UNAUTHENTICATED', 401)
          : jsonResponse({ user: USER, csrf_token: SESSION_SECRET }),
      );
    }
    if (String(url).includes('/auth/login')) {
      return Promise.resolve(jsonResponse({ user: USER, token: 't', expires_at: 'later' }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

/** A sign-in whose response arrives, but whose cookie never does. */
function signInWithoutACookie(): void {
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/auth/session')) {
      return Promise.resolve(errorResponse('UNAUTHENTICATED', 401));
    }
    if (String(url).includes('/auth/login')) {
      return Promise.resolve(jsonResponse({ user: USER, token: 't', expires_at: 'later' }));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

/** Renders the provider and hands back the real context actions. */
function renderAuth() {
  let actions: AuthState | null = null;
  function Probe() {
    actions = useAuth();
    return <span data-testid="who">{actions.user ? actions.user.email : 'signed-out'}</span>;
  }
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  return {
    signIn: () =>
      act(async () => {
        await actions!.signIn(USER.email, 'TestPass123!');
      }),
    signInWithGoogle: () =>
      act(async () => {
        await actions!.signInWithGoogle('google-id-token');
      }),
    who: () => screen.getByTestId('who').textContent,
  };
}

beforeEach(() => {
  sessionCalls = 0;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('signing in settles the session', () => {
  it('reads the session again, because the sign-in response is not the authority', async () => {
    // A visitor who arrived signed out has never seen /session. Without this
    // re-check they hold no CSRF token, and their first cookie-authenticated
    // mutation comes back CSRF_FAILED.
    signedOutThenSession();
    const auth = renderAuth();
    await screen.findByText('signed-out');

    await auth.signIn();

    expect(auth.who()).toBe(USER.email);
    expect(sessionCalls).toBeGreaterThanOrEqual(2);
  });

  it('takes the CSRF token the session hands back', async () => {
    // The token sent on every later mutation comes from /session, so a
    // successful sign-in has to leave it set.
    signedOutThenSession();
    const auth = renderAuth();
    await screen.findByText('signed-out');

    await auth.signIn();

    await waitFor(() => expect(currentCsrfToken()).toBe(SESSION_SECRET));
  });

  it('does the same after a Google sign-in', async () => {
    // The Google path is the one that actually reaches the set-password button.
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/auth/session')) {
        sessionCalls += 1;
        return Promise.resolve(
          sessionCalls === 1
            ? errorResponse('UNAUTHENTICATED', 401)
            : jsonResponse({ user: USER, csrf_token: SESSION_SECRET }),
        );
      }
      if (String(url).includes('/auth/google')) {
        return Promise.resolve(jsonResponse({ user: USER, token: 't', expires_at: 'later' }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const auth = renderAuth();
    await screen.findByText('signed-out');

    await auth.signInWithGoogle();

    await waitFor(() => expect(currentCsrfToken()).toBe(SESSION_SECRET));
  });

  it('signs the visitor out when the session does not survive sign-in', async () => {
    // The cookie is the only thing that counts. If it never arrived - a Secure
    // cookie over plain http, say - the page must not go on claiming otherwise.
    signInWithoutACookie();
    const auth = renderAuth();
    await screen.findByText('signed-out');

    await auth.signIn();

    expect(auth.who()).toBe('signed-out');
  });

  it('keeps the signed-in account when the re-check itself fails', async () => {
    // A network blip must not turn a successful sign-in into a visible error.
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/auth/session')) {
        sessionCalls += 1;
        if (sessionCalls === 1) return Promise.resolve(errorResponse('UNAUTHENTICATED', 401));
        throw new TypeError('network down');
      }
      if (String(url).includes('/auth/login')) {
        return Promise.resolve(jsonResponse({ user: USER, token: 't', expires_at: 'later' }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    const auth = renderAuth();
    await screen.findByText('signed-out');

    await auth.signIn();

    expect(auth.who()).toBe(USER.email);
  });
});

describe('losing the session mid-visit', () => {
  it('clears the account as soon as a call says it is gone', async () => {
    // An account on screen the server no longer recognises is what made a
    // dropped cookie so confusing: it stayed visible and every action failed.
    fetchMock.mockImplementation((url: string) =>
      String(url).includes('/auth/session')
        ? Promise.resolve(jsonResponse({ user: USER, csrf_token: 'x' }))
        : Promise.resolve(jsonResponse({})),
    );
    const auth = renderAuth();
    await screen.findByText(USER.email);

    act(() => {
      window.dispatchEvent(new Event(AUTH_UNAUTHENTICATED_EVENT));
    });

    await waitFor(() => expect(auth.who()).toBe('signed-out'));
  });
});

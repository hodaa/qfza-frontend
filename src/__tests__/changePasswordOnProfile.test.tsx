import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePage } from '../components/auth/ProfilePage';
import { AuthProvider } from '../auth/AuthProvider';
import type { AuthUser } from '../types';

vi.mock('../config', () => ({
  CSRF_TOKEN: '',
  CSRF_HEADER_NAME: 'X-CSRF-Token',
  CONTACT_EMAIL: 'support@qfza.app',
  CONTACT_FORM_ENDPOINT: '',
  get GOOGLE_CLIENT_ID() {
    return '';
  },
}));

vi.mock('../hooks/useRoute', () => ({ navigate: vi.fn() }));

const GOOGLE_USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'google.user@example.com',
  email_verified: true,
  created_at: '2026-01-15T10:00:00Z',
  has_password: false,
  full_name: 'Hoda Hussin',
};

const PASSWORD_USER = { ...GOOGLE_USER, email: 'pw.user@example.com', has_password: true };

const OLD_PASSWORD = 'the original secret';
const NEW_PASSWORD = 'a brand new secret';

function jsonResponse(data: unknown, status = 200, ok = true): Response {
  return { ok, status, json: () => Promise.resolve(data) } as unknown as Response;
}

/** The session endpoint answers, then the page is settled and calls are cleared. */
function sessionReply(user: AuthUser) {
  return jsonResponse({ user, csrf_token: 'csrf-value' });
}

/** Answer the session endpoint with this user, then wait for the page to settle. */
async function renderProfile(fetchMock: ReturnType<typeof vi.fn>, user: AuthUser) {
  fetchMock.mockResolvedValue(sessionReply(user));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <AuthProvider>
      <ProfilePage />
    </AuthProvider>,
  );
  await screen.findByText(user.email);
  fetchMock.mockClear();
  fetchMock.mockResolvedValue(jsonResponse(null, 204));
}

function callsTo(fetchMock: ReturnType<typeof vi.fn>, path: string) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(path));
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, path: string): string {
  const call = callsTo(fetchMock, path)[0] as [string, RequestInit];
  return String(call[1].body ?? '');
}

function headersOf(fetchMock: ReturnType<typeof vi.fn>, path: string): Record<string, string> {
  const call = callsTo(fetchMock, path)[0] as [string, RequestInit];
  return (call[1].headers ?? {}) as Record<string, string>;
}

const fetchMock = vi.fn();

describe('changing a password on the profile page', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('keeps the change a quiet link, not a button that mails a link', async () => {
    // The bug this replaces: one button whose label swapped on has_password,
    // wired to /password-set for both cases. For an account that already has a
    // password that endpoint declines and still answers 202, so the button
    // reported success and mailed nothing.
    await renderProfile(fetchMock, PASSWORD_USER);

    const link = screen.getByRole('button', { name: /^change password$/i });
    expect(link).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /email me a link to change my password/i }),
    ).toBeNull();
    expect(callsTo(fetchMock, '/api/v1/auth/password-set')).toHaveLength(0);
  });

  it('never shows the change link to an account with no password', async () => {
    // Google-only: there is no current password to replace, so the in-page form
    // would be asking for something the account does not have.
    await renderProfile(fetchMock, GOOGLE_USER);

    expect(screen.queryByRole('button', { name: /^change password$/i })).toBeNull();
    expect(
      screen.getByRole('button', { name: /email me a link to set my password/i }),
    ).toBeVisible();
  });

  it('opens the form on this page rather than navigating away', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);

    await user.click(screen.getByRole('button', { name: /^change password$/i }));

    expect(screen.getByLabelText(/^current password$/i)).toBeVisible();
    expect(screen.getByLabelText(/^new password$/i)).toBeVisible();
    expect(screen.getByLabelText(/^confirm new password$/i)).toBeVisible();
    // Still the profile page: the account details above are untouched.
    expect(screen.getByText(PASSWORD_USER.email)).toBeVisible();
  });

  it('sends both passwords and the CSRF header', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);
    await user.click(screen.getByRole('button', { name: /^change password$/i }));

    await user.type(screen.getByLabelText(/^current password$/i), OLD_PASSWORD);
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(screen.getByLabelText(/^confirm new password$/i), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: /^change password$/i, hidden: false })!);

    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/auth/password-change')).toHaveLength(1));
    expect(JSON.parse(bodyOf(fetchMock, '/api/v1/auth/password-change'))).toEqual({
      current_password: OLD_PASSWORD,
      new_password: NEW_PASSWORD,
    });
    // The session cookie alone must not authorise a takeover.
    expect(
      Object.keys(headersOf(fetchMock, '/api/v1/auth/password-change')).map((k) => k.toLowerCase()),
    ).toContain('x-csrf-token');
  });

  it('confirms success and says the other devices went', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);
    await user.click(screen.getByRole('button', { name: /^change password$/i }));

    await user.type(screen.getByLabelText(/^current password$/i), OLD_PASSWORD);
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(screen.getByLabelText(/^confirm new password$/i), NEW_PASSWORD);
    await user.click(screen.getByRole('button', { name: /^change password$/i, hidden: false })!);

    expect(await screen.findByText(/password has been changed/i)).toBeVisible();
    // The exact promise matters: this browser stays in, so telling the visitor
    // it was signed out would be the opposite of what happened.
    expect(screen.getByText(/this browser is still signed in/i)).toBeVisible();
    expect(screen.getByText(/every other device has been signed out/i)).toBeVisible();
  });

  it('blocks a new password under ten characters before sending it', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);
    await user.click(screen.getByRole('button', { name: /^change password$/i }));

    await user.type(screen.getByLabelText(/^current password$/i), OLD_PASSWORD);
    await user.type(screen.getByLabelText(/^new password$/i), 'ninechars');
    await user.type(screen.getByLabelText(/^confirm new password$/i), 'ninechars');
    await user.click(screen.getByRole('button', { name: /^change password$/i, hidden: false })!);

    expect(await screen.findByText(/at least 10 characters/i)).toBeVisible();
    expect(callsTo(fetchMock, '/api/v1/auth/password-change')).toHaveLength(0);
  });

  it('blocks a confirmation that does not match', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);
    await user.click(screen.getByRole('button', { name: /^change password$/i }));

    await user.type(screen.getByLabelText(/^current password$/i), OLD_PASSWORD);
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(screen.getByLabelText(/^confirm new password$/i), 'something else entirely');
    await user.click(screen.getByRole('button', { name: /^change password$/i, hidden: false })!);

    expect(await screen.findByText(/do not match/i)).toBeVisible();
    expect(callsTo(fetchMock, '/api/v1/auth/password-change')).toHaveLength(0);
  });

  it('shows the wrong-current-password message on the field it concerns', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);
    await user.click(screen.getByRole('button', { name: /^change password$/i }));

    await user.type(screen.getByLabelText(/^current password$/i), 'not the password');
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(screen.getByLabelText(/^confirm new password$/i), NEW_PASSWORD);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: 'WRONG_CURRENT_PASSWORD', message: '' } }, 401, false),
    );
    await user.click(screen.getByRole('button', { name: /^change password$/i, hidden: false })!);

    // Not the sign-in wording: this form has no address field, so "that email
    // and password do not match" would point at the wrong box.
    expect(await screen.findAllByText(/isn't your current password/i)).not.toHaveLength(0);
    expect(screen.queryByText(/do not match an account/i)).toBeNull();
    expect(screen.getByLabelText(/^current password$/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears the field error once the password is corrected', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);
    await user.click(screen.getByRole('button', { name: /^change password$/i }));

    await user.type(screen.getByLabelText(/^current password$/i), OLD_PASSWORD);
    await user.type(screen.getByLabelText(/^new password$/i), 'ninechars');
    await user.type(screen.getByLabelText(/^confirm new password$/i), 'ninechars');
    await user.click(screen.getByRole('button', { name: /^change password$/i, hidden: false })!);
    await screen.findByText(/at least 10 characters/i);

    // Extending the value past the floor must clear the complaint without a
    // second submit: the error is stale the moment the input no longer is.
    await user.type(screen.getByLabelText(/^new password$/i), 'chars');
    await waitFor(() => expect(screen.queryByText(/at least 10 characters/i)).toBeNull());
    expect(screen.getByLabelText(/^new password$/i)).not.toHaveAttribute('aria-invalid');
  });

  it('keeps the emailed link as the way out for a forgotten password', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);

    await user.click(screen.getByRole('button', { name: /email me a link/i }));

    // /password-reset, not /password-set: the set endpoint refuses accounts
    // that already have a password, so it would send nothing.
    await waitFor(() => expect(callsTo(fetchMock, '/api/v1/auth/password-reset')).toHaveLength(1));
    expect(callsTo(fetchMock, '/api/v1/auth/password-set')).toHaveLength(0);
    expect(bodyOf(fetchMock, '/api/v1/auth/password-reset')).toContain(PASSWORD_USER.email);
  });

  it('closes the form on cancel without sending anything', async () => {
    const user = userEvent.setup();
    await renderProfile(fetchMock, PASSWORD_USER);
    await user.click(screen.getByRole('button', { name: /^change password$/i }));
    await user.type(screen.getByLabelText(/^current password$/i), OLD_PASSWORD);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByLabelText(/^current password$/i)).toBeNull();
    expect(callsTo(fetchMock, '/api/v1/auth/password-change')).toHaveLength(0);
  });
});

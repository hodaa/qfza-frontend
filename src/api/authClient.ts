import { CSRF_HEADER_NAME, CSRF_TOKEN } from '../config';
import type { AuthResponse, AuthUser, HistoryPage, SessionInfo } from '../types';

/** Event name emitted whenever the current session becomes invalid. */
export const AUTH_UNAUTHENTICATED_EVENT = 'qfza:auth-unauthenticated';

/** Dispatch a global event to notify listeners that the session was lost. */
function emitAuthUnauthenticated(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_UNAUTHENTICATED_EVENT));
}

/**
 * Error carrying the backend's stable code.
 *
 * The backend never ships user-facing prose, so `code` is what the UI renders
 * from. `serverMessage` is developer-facing detail and is logged, never shown.
 */
export class AuthApiError extends Error {
  code: string;
  serverMessage?: string;

  constructor(code: string, serverMessage?: string) {
    super(code);
    this.name = 'AuthApiError';
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';
const TIMEOUT_MS = 30_000;

interface ErrorPayload {
  error?: { code?: string; message?: string };
}

/**
 * CSRF token to send on mutations.
 *
 * Starts from the build-time value and is overwritten by the session endpoint
 * once the visitor is known to be signed in, which is the authoritative source.
 * Module-level rather than a React value: `request` is a plain function used
 * from hooks and components alike, and threading a token through every call
 * site would make it easy to forget on exactly the calls that need it.
 */
let csrfToken: string = CSRF_TOKEN;

/** Update the CSRF token from a session response. */
export function setCsrfToken(token: string): void {
  if (token) csrfToken = token;
}

/** The CSRF token currently in use, for tests and for the session bootstrap. */
export function currentCsrfToken(): string {
  return csrfToken;
}

interface RequestOptions {
  method?: string;
  json?: unknown;
  signal?: AbortSignal;
  /** Send the CSRF header. Defaults to true for anything that mutates. */
  csrf?: boolean;
}

/**
 * Fetch wrapper for the auth and history surface.
 *
 * `credentials: 'include'` is the whole point: the session lives in an HttpOnly
 * cookie the JavaScript cannot read, so every call has to let the browser
 * attach it. Dropping it would make the entire auth flow silently anonymous.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method, json, signal, csrf } = options;
  const verb = method ?? (json !== undefined ? 'POST' : 'GET');
  const mutating = verb !== 'GET' && verb !== 'HEAD';

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const propagateAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', propagateAbort, { once: true });
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (mutating && csrf !== false && csrfToken) headers[CSRF_HEADER_NAME] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: verb,
      headers,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === 'AbortError' &&
      !timedOut &&
      signal?.aborted
    ) {
      throw error;
    }
    throw new AuthApiError('NETWORK');
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', propagateAbort);
  }

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    // Start from the status, then let the error envelope override it. FastAPI
    // answers its own request-validation failures with {"detail": [...]}, not
    // this envelope, so a body that parses as JSON but carries no code used to
    // leave every such response reported as SERVER - a 422 for a password one
    // character too short was shown to the visitor as "something went wrong on
    // our side, try again shortly", which is both untrue and unactionable.
    let code = codeForStatus(res.status);
    let serverMessage: string | undefined;
    try {
      const data = (await res.json()) as ErrorPayload;
      if (data?.error?.code) code = data.error.code;
      serverMessage = data?.error?.message;
    } catch {
      // Non-JSON body: the status-derived code already stands.
    }
    const error = new AuthApiError(code, serverMessage);
    if (error.code === 'UNAUTHENTICATED') emitAuthUnauthenticated();
    throw error;
  }

  if (res.status === 202) return undefined as T;
  return (await res.json()) as T;
}

/** Fallback code when the error body is not the expected envelope. */
function codeForStatus(status: number): string {
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'CSRF_FAILED';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 423) return 'ACCOUNT_LOCKED';
  if (status === 429) return 'TOO_MANY_ATTEMPTS';
  if (status === 422) return 'VALIDATION';
  return 'SERVER';
}

/** Register an account. The address must still be verified before it can sign in. */
export function registerAccount(email: string, password: string, signal?: AbortSignal) {
  return request<AuthUser>('/api/v1/auth/register', {
    method: 'POST',
    json: { email, password },
    signal,
    csrf: false,
  });
}

/** Sign in with an email and password. Sets the session cookie. */
export function loginAccount(email: string, password: string, signal?: AbortSignal) {
  return request<AuthResponse>('/api/v1/auth/login', {
    method: 'POST',
    json: { email, password },
    signal,
    csrf: false,
  });
}

/** Sign in with a Google ID token. Sets the session cookie. */
export function loginWithGoogle(idToken: string, signal?: AbortSignal) {
  return request<AuthResponse>('/api/v1/auth/google', {
    method: 'POST',
    json: { id_token: idToken },
    signal,
    csrf: false,
  });
}

/** Revoke the current session and clear the cookie. */
export function logoutAccount(signal?: AbortSignal) {
  return request<void>('/api/v1/auth/logout', { method: 'POST', signal });
}

/**
 * Fetch the current session, or null when signed out.
 *
 * A 401 here is an ordinary state, not a failure: a first-time visitor has no
 * session. It returns null so callers do not have to catch, and so an
 * unauthenticated page load is not reported as an error.
 */
export async function fetchSession(signal?: AbortSignal): Promise<SessionInfo | null> {
  try {
    const info = await request<SessionInfo>('/api/v1/auth/session', { signal });
    setCsrfToken(info.csrf_token);
    return info;
  } catch (error) {
    // The event has already fired from inside `request`, which raises on every
    // UNAUTHENTICATED. Being signed out is not a failure here, so it resolves.
    if (error instanceof AuthApiError && error.code === 'UNAUTHENTICATED') return null;
    throw error;
  }
}

/** Redeem an email verification link. */
export function verifyEmailToken(token: string, signal?: AbortSignal) {
  return request<AuthUser>('/api/v1/auth/verify', {
    method: 'POST',
    json: { token },
    signal,
    csrf: false,
  });
}

/**
 * Request a password reset link.
 *
 * Always resolves: the backend answers 202 whether or not the address exists,
 * so the UI must not pretend otherwise or it becomes an account oracle.
 */
export function requestPasswordReset(email: string, signal?: AbortSignal) {
  return request<void>('/api/v1/auth/password-reset', {
    method: 'POST',
    json: { email },
    signal,
    csrf: false,
  });
}

/**
 * Request a link that lets this account choose its first password.
 *
 * Sends no address on purpose: the backend mails the session's own account, so
 * a caller cannot aim the link at somebody else's inbox. Needs the session's
 * CSRF token, since the session cookie alone must not authorise this.
 */
export function requestPasswordSet(signal?: AbortSignal) {
  return request<void>('/api/v1/auth/password-set', {
    method: 'POST',
    signal,
  });
}

/** Redeem a reset token and set a new password. */
export function confirmPasswordReset(token: string, password: string, signal?: AbortSignal) {
  return request<void>('/api/v1/auth/password-reset/confirm', {
    method: 'POST',
    json: { token, password },
    signal,
    csrf: false,
  });
}

/**
 * Change the signed-in account's password without leaving the page.
 *
 * Carries the current password because the session alone is not proof of
 * ownership: a cookie lifted through XSS must not be enough to take the account
 * over for good. Needs the session's CSRF token, and rejects with
 * INVALID_CREDENTIALS when the current password is wrong - the same code a wrong
 * sign-in gets, so this cannot be used to probe the account.
 */
export function changePassword(
  payload: { currentPassword: string; newPassword: string },
  signal?: AbortSignal,
) {
  return request<void>('/api/v1/auth/password-change', {
    method: 'POST',
    json: { current_password: payload.currentPassword, new_password: payload.newPassword },
    signal,
  });
}

/** One page of the caller's own history, newest first. */
export function fetchHistory(cursor?: string, signal?: AbortSignal) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request<HistoryPage>(`/api/v1/history${query}`, { signal });
}

/** Delete one history entry. Scoped server-side to the caller. */
export function deleteHistoryEntry(entryId: string, signal?: AbortSignal) {
  return request<void>(`/api/v1/history/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
    signal,
  });
}

/** Delete the caller's entire history. */
export function clearHistory(signal?: AbortSignal) {
  return request<void>('/api/v1/history', { method: 'DELETE', signal });
}

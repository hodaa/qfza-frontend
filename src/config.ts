/**
 * Canonical site origin, no trailing slash.
 *
 * Used at runtime to build the `<link rel="canonical">` and `og:url` for the
 * client-rendered views, which have no generated document to carry them. The
 * static pages get theirs stamped at build time by scripts/build-legal.mjs and
 * scripts/build-blog.mjs, so both paths must agree on this one value.
 *
 * Falls back to the serving origin so a dev build (where VITE_SITE_URL is often
 * unset) canonicals to the origin it is actually served from instead of claiming
 * qfza.app — a dev page canonicalising to production is how a staging URL ends up
 * competing with the real site.
 */
export const SITE_URL: string = (
  (import.meta.env.VITE_SITE_URL as string | undefined)?.trim() ?? ''
).replace(/\/+$/, '') ||
  (typeof window !== 'undefined' ? window.location.origin : '');

/** Contact email shown on the Contact page. Configurable via VITE_CONTACT_EMAIL. */
export const CONTACT_EMAIL: string =
  (import.meta.env.VITE_CONTACT_EMAIL as string | undefined)?.trim() ?? 'support@qfza.app';

/** API base the search client talks to. */
const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? '';

/**
 * Per-deployment CSRF secret, echoed as a header on cookie-authenticated
 * mutations.
 *
 * It is not a credential: the same value is handed to every visitor of this
 * deployment by GET /api/v1/auth/session and is worthless without the HttpOnly
 * session cookie, which a cross-site page cannot read. Baking it in here means
 * the auth pages can make a mutating call before that fetch resolves, so a
 * signed-in visitor clicking Delete on the history page is not rejected for
 * want of a token that is still in flight.
 *
 * Leave empty and the client falls back to the value from the session endpoint.
 */
export const CSRF_TOKEN: string =
  (import.meta.env.VITE_CSRF_TOKEN as string | undefined)?.trim() ?? '';

/** Header name the backend reads the CSRF token from. Must match CSRF_HEADER_NAME. */
export const CSRF_HEADER_NAME: string =
  (import.meta.env.VITE_CSRF_HEADER_NAME as string | undefined)?.trim() || 'X-CSRF-Token';

/**
 * Google OAuth client id for the sign-in button.
 *
 * Empty means the Google button is not rendered at all, rather than rendered
 * and broken. Must match GOOGLE_CLIENT_ID in the backend's environment, because
 * the backend refuses a token minted for any other client.
 */
export const GOOGLE_CLIENT_ID: string =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';

/**
 * Form endpoint the contact form POSTs JSON to ({name, email, message}).
 *
 * Uses VITE_CONTACT_FORM_ENDPOINT when set (e.g. a third-party form service),
 * otherwise derives the backend's OWN /api/contact from VITE_API_BASE_URL so the
 * contact form rides the same API host as search. Empty = form hidden (mailto only).
 */
export const CONTACT_FORM_ENDPOINT: string =
  (import.meta.env.VITE_CONTACT_FORM_ENDPOINT as string | undefined)?.trim() ||
  (API_BASE_URL ? `${API_BASE_URL}/api/contact` : '');

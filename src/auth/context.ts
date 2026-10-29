import { createContext } from 'react';
import type { AuthUser } from '../types';

/**
 * Who the browser is signed in as, and the operations that change it.
 *
 * The session token itself never enters this state. It lives in an HttpOnly
 * cookie that JavaScript cannot read, so "signed in" is a fact the server owns
 * and this context only mirrors it. That is the entire reason a cookie is used
 * over a token in localStorage: there is nothing here for an injected script
 * to steal and replay.
 */
export interface AuthState {
  user: AuthUser | null;
  /** True until the first session check settles, so pages can avoid a flash. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-read the session, e.g. after an email verification. */
  refresh: () => Promise<void>;
}

const noop = async () => {};

/**
 * Signed-out default rather than null.
 *
 * The header is rendered on its own — in the prerendered shell's test, and
 * anywhere a page is mounted without the app tree — and throwing there would
 * take the whole page down over a missing account chip. Signed out with inert
 * actions is the safe reading: a visitor who is actually signed in still gets
 * the real state, because main.tsx always mounts the provider.
 */
const ANONYMOUS: AuthState = {
  user: null,
  loading: false,
  signIn: noop,
  signInWithGoogle: noop,
  signUp: noop,
  signOut: noop,
  refresh: noop,
};

export const AuthContext = createContext<AuthState>(ANONYMOUS);

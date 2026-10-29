import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { resolveVideo, submitSearch } from '../api/client';
import { clearResultsCache } from '../utils/resultsCache';
import type { ResolvedVideo } from '../types';

/**
 * Signing out has to leave nothing of the previous session on screen.
 *
 * The search view lives in App, but signing out happens in the account menu or
 * the profile page. Nothing in either place can reach back and clear it, so the
 * two halves drift apart: the session ends, the visitor is sent home, and the
 * previous person's video, keyword and results are still sitting there in the
 * fields. On a shared device that is the worst possible thing to hand to the
 * next person — and it is invisible in a test that only checks the session.
 *
 * These tests go through the real sign-out control rather than poking props, so
 * the whole path is covered: button, session, and what the screen shows after.
 */

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    submitSearch: vi.fn(),
    fetchVideoSearch: vi.fn(),
    fetchJobStatus: vi.fn(),
    resolveVideo: vi.fn(),
  };
});

const USER: MockUser = { id: 'u1', email: 'a@example.com', email_verified: true };

/**
 * A shared store, not a plain variable.
 *
 * The real provider holds the session in React state, so signing out re-renders
 * every consumer — which is the only reason App ever learns the session ended.
 * A module-level variable would change without rendering anything, and the whole
 * point of these tests is what the screen shows afterwards, so the mock has to
 * notify the way the real one does.
 */
interface MockUser {
  id: string;
  email: string;
  email_verified: boolean;
}

const { authStore } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  // Held in a closure rather than on the returned object so the accessors do not
  // refer to the object they are part of while it is still being built.
  let current: { id: string; email: string; email_verified: boolean } | null = null;
  return {
    authStore: {
      get: (): MockUser | null => current,
      set: (next: MockUser | null) => {
        current = next;
        listeners.forEach((listener) => listener());
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
});

vi.mock('../auth/useAuth', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useAuth: () => ({
      user: useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get),
      loading: false,
      signOut: async () => {
        authStore.set(null);
      },
    }),
  };
});

const RESULTS = [{ timestamp: '00:05', progress_seconds: 5, text_snippet: null }];
const URL_UNDER_TEST = 'https://www.youtube.com/watch?v=abcdef12345';
const RESOLVED: ResolvedVideo = {
  id: 'video-row-1',
  video_id: 'abcdef12345',
  title: 'Test video',
  duration_seconds: 300,
  transcribed: false,
};

/** Sign in, search, and leave a filled-in result on screen. */
async function searchAsSignedInUser(): Promise<ReturnType<typeof render>> {
  vi.mocked(submitSearch).mockResolvedValue({ status: 'found', results: RESULTS } as never);
  const view = render(<App />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Video URL'), URL_UNDER_TEST);
  await user.click(screen.getByRole('button', { name: 'Jump to video' }));
  await user.type(await screen.findByLabelText('Search this video'), 'how to type faster');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await screen.findByText('00:05');
  return view;
}

/** Click the sign-out control in the header account menu. */
async function signOutFromMenu(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /account menu/i }));
  await user.click(screen.getByRole('menuitem', { name: /^sign out$/i }));
}

describe('signing out', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearResultsCache();
    vi.mocked(resolveVideo).mockResolvedValue(RESOLVED);
    authStore.set(USER);
    window.history.replaceState(null, '', '/');
  });

  it('lands on the home page', async () => {
    await searchAsSignedInUser();
    await signOutFromMenu();

    expect(await screen.findByRole('button', { name: 'Jump to video' })).toBeInTheDocument();
    expect(screen.getByLabelText('Video URL')).toBeInTheDocument();
  });

  it('clears both fields', async () => {
    await searchAsSignedInUser();
    await signOutFromMenu();

    await waitFor(() => expect(screen.getByLabelText('Video URL')).toHaveValue(''));
    expect(screen.queryByLabelText('Search this video')).not.toBeInTheDocument();
  });

  it('takes the previous results with it', async () => {
    await searchAsSignedInUser();
    await signOutFromMenu();

    // The match and the empty-results notice both belonged to the search that
    // just ended.
    await waitFor(() => expect(screen.queryByText('00:05')).toBeNull());
    expect(screen.queryByText(/no exact matches found/i)).toBeNull();
  });

  it('returns to the landing view, not a half-finished search', async () => {
    await searchAsSignedInUser();
    await signOutFromMenu();

    expect(await screen.findByRole('button', { name: 'Jump to video' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('leaves the previous visitor no deep link to come back to', async () => {
    // Arrived on a shared moment, signed in, then signed out.
    window.history.replaceState(null, '', '/?v=abcdef12345&t=62');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Shared moment at 01:02' }),
    ).toBeInTheDocument();

    await signOutFromMenu();

    // Left in place, a reload would reopen it — the one artefact of the old
    // session that survives a fresh page load.
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('leaves an anonymous deep link alone', async () => {
    // Nobody signed in, so there is no session to end and nothing to clear:
    // the visitor's own shared link must still work.
    authStore.set(null);
    window.history.replaceState(null, '', '/?v=abcdef12345&t=62');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Shared moment at 01:02' }),
    ).toBeInTheDocument();
    expect(window.location.search).toBe('?v=abcdef12345&t=62');
  });
});

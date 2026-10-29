import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { fetchVideoSearch, resolveVideo, submitSearch } from '../api/client';
import type { HistoryEntry, ResolvedVideo } from '../types';

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

const RESOLVED: ResolvedVideo = {
  id: 'video-row-1',
  video_id: 'abcdef12345',
  title: 'Typing without looking down',
  duration_seconds: 3600,
  transcribed: false,
};

/**
 * Replaying a saved search, end to end.
 *
 * The point of this file is the seam between two pages: the history page knows
 * when a keyword was found, and the home view owns the player. Nothing else
 * proves that clicking a keyword on one actually puts the video on screen at the
 * right second on the other — the two halves can each be correct while the
 * handoff between them is wrong, and the symptom (a link that goes nowhere
 * useful) is exactly what a user notices first.
 *
 * A shared-moment link and a history click are the same journey, so this also
 * pins that they end in the same place: arriving at `?v=…&t=…` on a cold load
 * and clicking a keyword from `#/history` must be indistinguishable to App.
 */

const fetchHistory = vi.fn();
// hoisted so the mock factory below can close over it: vi.mock factories are
// lifted above the imports, so a plain top-level const would not exist yet.
const { seekTo } = vi.hoisted(() => ({ seekTo: vi.fn() }));

const USER = { id: 'u1', email: 'a@example.com', email_verified: true };

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: USER, loading: false, signOut: vi.fn() }),
}));

vi.mock('../api/authClient', () => ({
  fetchHistory: (...args: unknown[]) => fetchHistory(...args),
  clearHistory: vi.fn(),
  deleteHistoryEntry: vi.fn(),
  AuthApiError: class extends Error {},
}));

// The real player needs the YouTube iframe API, which jsdom never loads. The
// stub still exposes the handle App holds, so the seek stays observable — which
// is the thing under test, not the player itself.
vi.mock('../components/VideoPlayer', async () => {
  const { createElement, forwardRef, useImperativeHandle } = await import('react');
  return {
    VideoPlayer: forwardRef(function FakePlayer(_props: unknown, ref: React.Ref<unknown>) {
      useImperativeHandle(ref, () => ({ seekTo }));
      return createElement('div', { 'data-testid': 'video-player' });
    }),
  };
});

beforeEach(() => {
  vi.mocked(resolveVideo).mockResolvedValue(RESOLVED);
});

const ENTRY: HistoryEntry = {
  id: 'e1',
  keyword: 'how to type faster',
  video_id: 'abcdef12345',
  video_title: 'Typing without looking down',
  progress_seconds: 754,
  created_at: '2026-01-01T00:00:00Z',
} as HistoryEntry;

function goToHistory(): void {
  window.history.replaceState(null, '', '/#/history');
}

async function openHistoryAndClickKeyword(): Promise<void> {
  fetchHistory.mockResolvedValue({ entries: [ENTRY], next_cursor: null });
  goToHistory();
  render(<App />);

  const link = await screen.findByRole('link', { name: /replay .*how to type faster.* at 12:34/i });
  await userEvent.click(link);
}

const REPLAY_HEADING = 'Matches for \u201Chow to type faster\u201D';

describe('replaying a saved search from history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('lands on the home view with that video loaded, not on YouTube', async () => {
    await openHistoryAndClickKeyword();

    // The home view is showing, and it is the shared view — the same one a
    // shared link opens.
    expect(await screen.findByRole('heading', { name: REPLAY_HEADING })).toBeInTheDocument();
    expect(screen.getByTestId('video-player')).toBeInTheDocument();
    expect(screen.getByLabelText('Video URL')).toHaveValue(
      'https://www.youtube.com/watch?v=abcdef12345&t=0',
    );

    // And this page is gone, rather than left mounted behind it.
    expect(screen.queryByRole('heading', { name: 'Search history' })).not.toBeInTheDocument();
  });

  it('puts the keyword it was clicked for back in the search field', async () => {
    await openHistoryAndClickKeyword();

    // The visitor arrived here *from* a search for this phrase, so the field
    // shows it. An empty field falls back to the "e.g. …" placeholder and reads
    // as though nothing had been searched for.
    expect(await screen.findByLabelText('Search this video')).toHaveValue('how to type faster');
  });

  it('seeks the player to the second the keyword was found', async () => {
    await openHistoryAndClickKeyword();

    // 754s is where the quote sat. Replaying the video from the top would be a
    // worse answer than a plain YouTube link, not a better one.
    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(754, expect.anything()));
  });

  it('stops the video on that moment instead of playing past it', async () => {
    await openHistoryAndClickKeyword();

    // autoplay:false. The request is "show me this moment". Starting playback
    // runs the viewer straight through the frame the click was about, which is
    // the one outcome the moment link exists to prevent.
    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(754, { autoplay: false }));
  });

  it('is not a new search: no search is run and no new entry is filed', async () => {
    await openHistoryAndClickKeyword();
    await screen.findByRole('heading', { name: REPLAY_HEADING });

    // Replaying a saved answer must not look like searching again. A search here
    // would re-run the job, write a second history row for a search nobody
    // typed, and cost the visitor a wait they already paid for once.
    expect(submitSearch).not.toHaveBeenCalled();
    expect(fetchVideoSearch).not.toHaveBeenCalled();

    // And the form reads as a replay, not a search in flight: the video is
    // loaded, the phrase it was clicked for is there to re-run or edit, and
    // nothing is spinning.
    expect(screen.getByLabelText('Search this video')).toHaveValue('how to type faster');
    expect(screen.queryByText(/finding your moment|finding the moment/i)).toBeNull();
  });

  it('leaves a shareable deep link behind, so a reload replays it too', async () => {
    await openHistoryAndClickKeyword();
    await screen.findByRole('heading', { name: REPLAY_HEADING });

    // The address bar is the same ?v=…&t=… a cold-arriving visitor would get,
    // so copy-pasting it, reloading, or sharing it all land on this moment.
    expect(window.location.search).toBe('?v=abcdef12345&t=754');
  });

  it('names the keyword and the time, the way the search view does', async () => {
    await openHistoryAndClickKeyword();

    // The heading names the keyword the visitor clicked; the badge only says
    // where they are, with no second of its own. The active row below already
    // carries the position, and a third copy of it in the header read as
    // clutter rather than information.
    await screen.findByRole('heading', { name: REPLAY_HEADING });
    expect(screen.getByText('Saved moment')).toBeInTheDocument();
    expect(screen.queryByText(/Saved moment.*12:34/)).toBeNull();
  });

  it('shows that moment as the active match row, not a bare video', async () => {
    await openHistoryAndClickKeyword();
    await screen.findByRole('heading', { name: REPLAY_HEADING });

    // The same row the search view would render for this match, so a replay and
    // a search look like the same screen rather than two different ones. A replay
    // has no fresh result set, so the row carries the phrase that was clicked in
    // place of a transcript snippet - the moment is known, its wording is not.
    const row = screen.getByRole('button', { name: /Play at 12:34/i }).closest('li');
    expect(row).toHaveTextContent('how to type faster');
  });

  it('re-cues the same moment if the row is clicked', async () => {
    await openHistoryAndClickKeyword();
    await screen.findByRole('heading', { name: REPLAY_HEADING });

    seekTo.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /Play at 12:34/i }));
    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(754, { autoplay: false }));
  });
});

describe('a saved search replays every match it found', () => {
  const MULTI: HistoryEntry = {
    id: 'e2',
    keyword: 'how to type faster',
    video_id: 'abcdef12345',
    video_title: 'Typing without looking down',
    // Where it resumes at. Not the first match: the entry also carries two
    // earlier ones, so a view pinned only to the head of the list would hide
    // them behind the active row.
    progress_seconds: 3600,
    status: 'found',
    match_results: [
      { timestamp: '01:00', progress_seconds: 60, text_snippet: 'I type much faster now' },
      {
        timestamp: '07:30',
        progress_seconds: 450,
        text_snippet: 'how to type faster without looking',
      },
      { timestamp: '1:00:00', progress_seconds: 3600, text_snippet: 'practise this every day' },
    ],
    created_at: '2026-01-01T00:00:00Z',
  } as HistoryEntry;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function replay(entry: HistoryEntry): Promise<void> {
    fetchHistory.mockResolvedValue({ entries: [entry], next_cursor: null });
    goToHistory();
    render(<App />);
    await userEvent.click(await screen.findByRole('link', { name: /how to type faster/i }));
    await screen.findByRole('heading', { name: REPLAY_HEADING });
  }

  it('lists every match the search returned, not only the moment it opens on', async () => {
    await replay(MULTI);

    // This is the whole point of storing the results: a keyword that occurs all
    // over a video must be revisitable anywhere it occurs. Showing only the
    // 60:00 moment would be the old behaviour - one row for a three-row search.
    expect(screen.getByRole('button', { name: /Play at 01:00/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play at 07:30/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play at 1:00:00/i })).toBeInTheDocument();
  });

  it('keeps the snippet each match was found in', async () => {
    await replay(MULTI);

    // The stored snapshot is the text that was on screen when the search ran.
    // Without it the rows would be bare timestamps, which cannot be told apart
    // from each other at a glance. MatchRow highlights the phrase, so the words
    // are split across elements - read the rendered row, not a text node.
    const row = screen.getByRole('button', { name: /Play at 07:30/i }).closest('li');
    expect(row).toHaveTextContent('how to type faster without looking');
  });

  it('marks the saved moment active while still listing the others', async () => {
    await replay(MULTI);

    // The player is parked on 60:00, so that row is the current one - and the
    // earlier matches are still listed, not dropped to reach it.
    expect(screen.getByRole('button', { name: /Play at 1:00:00/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /Play at 01:00/i })).not.toHaveAttribute(
      'aria-current',
    );
    // Scoped to the match list: the page has other lists (nav, footer) whose
    // items would swamp a document-wide count and hide a dropped match.
    // The replay labels its results the way a fresh search does, so the same
    // query finds the same list in both.
    const momentList = screen.getByRole('region', {
      name: /matching moments for .*how to type faster/i,
    });
    expect(within(momentList).getAllByRole('listitem')).toHaveLength(3);
  });

  it('seeks to the saved moment, not to the first match', async () => {
    await replay(MULTI);

    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(3600, { autoplay: false }));
  });

  it('re-cues any of the saved moments when its row is clicked', async () => {
    await replay(MULTI);

    // The earlier matches are first-class rows, not decoration: clicking one
    // takes the player there, exactly as it would in the search view.
    seekTo.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /Play at 01:00/i }));
    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(60, { autoplay: false }));
  });

  it('still runs no new search, however many matches were saved', async () => {
    await replay(MULTI);

    expect(submitSearch).not.toHaveBeenCalled();
    expect(fetchVideoSearch).not.toHaveBeenCalled();
  });
});

describe('a saved search that found nothing replays as no results', () => {
  const MISSED: HistoryEntry = {
    id: 'e3',
    keyword: 'how to type faster',
    video_id: 'abcdef12345',
    video_title: 'Typing without looking down',
    progress_seconds: null,
    status: 'not_found',
    match_results: [],
    locale: null,
    source: null,
    created_at: '2026-01-01T00:00:00Z',
  } as HistoryEntry;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty result the search actually returned', async () => {
    fetchHistory.mockResolvedValue({ entries: [MISSED], next_cursor: null });
    goToHistory();
    render(<App />);
    await userEvent.click(await screen.findByRole('link', { name: /how to type faster/i }));

    // The visitor's phrase was not in this video. Reopening the entry must say so
    // rather than implying the quote was found somewhere.
    // The exact copy the search itself shows when it finds nothing, so a replayed
    // no-match reads identically to a live one.
    expect(
      await screen.findByText('No exact matches found. Try a different word or phrase.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Saved moment/i)).not.toBeInTheDocument();
  });

  it('survives a reload: the link itself carries the fact that nothing was found', async () => {
    fetchHistory.mockResolvedValue({ entries: [MISSED], next_cursor: null });
    goToHistory();
    render(<App />);

    // Clicking the row can pass the answer along in memory; reloading cannot. The
    // href is the only thing that survives, so it has to say what happened —
    // otherwise a reload invents a match at 00:00 and answers a question the
    // visitor already knows the answer to.
    const link = await screen.findByRole('link', { name: /how to type faster/i });
    expect(link).toHaveAttribute('href', '/?v=abcdef12345&t=0&empty=1');
  });

  it('does not invent a match at 00:00 for a search that found nothing', async () => {
    fetchHistory.mockResolvedValue({ entries: [MISSED], next_cursor: null });
    goToHistory();
    render(<App />);
    await userEvent.click(await screen.findByRole('link', { name: /how to type faster/i }));

    // A fabricated 00:00 row would be the worst possible answer here: it looks
    // like a real result and points at the wrong part of the video.
    expect(screen.queryByRole('button', { name: /Play at 00:00/i })).not.toBeInTheDocument();
  });
});

describe('cold-loading the link to a search that found nothing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the same empty result as clicking the row, not a moment at 00:00', async () => {
    // The href a `not_found` row leaves behind, opened cold — which is what a
    // reload, an open-in-new-tab and a shared link all produce.
    window.history.replaceState(null, '', '/?v=abcdef12345&t=0&empty=1');
    render(<App />);

    expect(
      await screen.findByText('No exact matches found. Try a different word or phrase.'),
    ).toBeInTheDocument();
    // The two tells that a moment had been invented: a row that can be played,
    // and a control that shares it. Both would be lies about a search that
    // found nothing.
    expect(screen.queryByRole('button', { name: /Play at 00:00/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share link to 00:00/i })).not.toBeInTheDocument();
  });

  it('does not announce a saved moment to a screen reader either', async () => {
    window.history.replaceState(null, '', '/?v=abcdef12345&t=0&empty=1');
    render(<App />);

    // The live region sits outside the card, so it survives independently of what
    // is drawn — and it was the one place still claiming a moment existed.
    expect(
      await screen.findByText('This search found no matches in this video.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Shared moment at 00:00/i)).not.toBeInTheDocument();
  });

  it('still opens an ordinary t=0 link as a moment', async () => {
    // `t=0` on its own is a real moment at the start of the video; only the
    // explicit marker means the search came back empty.
    window.history.replaceState(null, '', '/?v=abcdef12345&t=0');
    render(<App />);

    // Twice over: the visible heading and the live region both name it, which is
    // what a real moment looks like.
    expect(await screen.findAllByText(/Shared moment at 00:00/i)).toHaveLength(2);
  });
});

describe('an entry with only the older seconds list still lists its moments', () => {
  const LEGACY: HistoryEntry = {
    id: 'e4',
    keyword: 'how to type faster',
    video_id: 'abcdef12345',
    video_title: 'Typing without looking down',
    progress_seconds: 10,
    status: 'found',
    // Recorded before results were stored whole: positions, no snippets.
    match_timestamps: [10, 900],
    created_at: '2026-01-01T00:00:00Z',
  } as HistoryEntry;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows both positions rather than only the one it opens on', async () => {
    fetchHistory.mockResolvedValue({ entries: [LEGACY], next_cursor: null });
    goToHistory();
    render(<App />);
    await userEvent.click(await screen.findByRole('link', { name: /how to type faster/i }));
    await screen.findByRole('heading', { name: REPLAY_HEADING });

    // The list is all this row can still answer, so it is better than the one
    // moment it used to show - it just has no snippets to go with them.
    expect(screen.getByRole('button', { name: /Play at 00:10/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play at 15:00/i })).toBeInTheDocument();
  });
});

describe('a bare moment link carries no keyword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to the timestamp-only heading and still parks the video', async () => {
    // ?v=…&t=… is all a pasted link has. There is no keyword to name, so it must
    // not invent one \u2014 but the moment still has to land and hold.
    window.history.replaceState(null, '', '/?v=abcdef12345&t=754');
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'Shared moment at 12:34' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Saved moment')).toBeInTheDocument();
    await waitFor(() => expect(seekTo).toHaveBeenCalledWith(754, { autoplay: false }));
  });
});

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsPanel } from '../components/ResultsPanel';
import { fetchVideoFormats } from '../api/client';
import { saveDownload, saveNotes } from '../utils/download';
import type { SearchMatch } from '../types';

// The dialog probes the server for qualities on open; those requests would
// otherwise need the real client. The save flow itself (queue, poll, fetch
// the blob, consume) is covered in download.test.ts; these tests only check
// what the panel asks it to do and how the button behaves around it.
vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  fetchVideoFormats: vi.fn(),
}));

vi.mock('../utils/download', () => ({
  downloadNameFor: vi.fn(() => 'video.mp4'),
  saveDownload: vi.fn(),
  saveNotes: vi.fn(),
  saveSummaryVideo: vi.fn(),
}));

const formatsMock = vi.mocked(fetchVideoFormats);
const saveDownloadMock = vi.mocked(saveDownload);
const saveNotesMock = vi.mocked(saveNotes);

beforeEach(() => {
  formatsMock.mockReset();
  formatsMock.mockResolvedValue([]);
  saveDownloadMock.mockReset();
  saveNotesMock.mockReset();
});

const RESULTS: SearchMatch[] = [{ timestamp: '00:05', progress_seconds: 5, text_snippet: null }];

/** Control the mocked save flow: finish it, fail it, or observe cancellation. */
function holdSave() {
  let settle!: () => void;
  let reject!: (error: unknown) => void;
  let aborted = false;
  const pending = new Promise<void>((resolve, failing) => {
    settle = resolve;
    reject = failing;
  });
  saveDownloadMock.mockImplementation((_url, signal) => {
    signal?.addEventListener('abort', () => {
      aborted = true;
      reject(new DOMException('Aborted', 'AbortError'));
    });
    return pending;
  });
  return {
    aborted: () => aborted,
    finish: () => settle(),
    fail: (error: unknown = new Error('download failed')) => reject(error),
  };
}

/** Control the mocked notes flow: finish it, fail it, or observe cancellation. */
function holdNotes() {
  let settle!: () => void;
  let reject!: (error: unknown) => void;
  let aborted = false;
  const pending = new Promise<void>((resolve, failing) => {
    settle = resolve;
    reject = failing;
  });
  saveNotesMock.mockImplementation((_youtubeId, signal) => {
    signal?.addEventListener('abort', () => {
      aborted = true;
      reject(new DOMException('Aborted', 'AbortError'));
    });
    return pending;
  });
  return {
    aborted: () => aborted,
    finish: () => settle(),
    fail: (error: unknown = new Error('notes failed')) => reject(error),
  };
}

const baseProps = {
  progress: 40,
  matches: RESULTS,
  errorText: '',
  keyword: 'hello',
  video: { source: 'youtube', id: 'abcdef12345' } as const,
  playerRef: { current: null },
  onSeek: vi.fn(),
  onClear: vi.fn(),
  onRetry: vi.fn(),
};

describe('ResultsPanel', () => {
  it('renders the status stepper while processing', () => {
    render(<ResultsPanel {...baseProps} phase="processing" />);
    expect(screen.getByText('Fetching transcript…')).toBeInTheDocument();
    expect(screen.getByText('Finding timestamps…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    const card = screen.getByRole('region', { name: 'Transcribing video' });
    expect(card).toHaveClass('border-slate-200');
    expect(card).not.toHaveClass('border-accent', 'border-dashed');
  });

  it('replaces the bare idle box with a labelled mock preview of the results', () => {
    const { container } = render(<ResultsPanel {...baseProps} phase="idle" />);
    expect(screen.getByText('Ready to find your moment')).toBeInTheDocument();
    expect(screen.getByText('Your matches will appear here after you search.')).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Ready to find your moment' });
    expect(card).toHaveClass('border-dashed', 'border-accent');
    expect(card).not.toHaveClass('border-slate-200');

    // Preview: a faux player frame plus timestamped skeleton rows.
    expect(container.querySelector('.aspect-video')).toBeInTheDocument();
    expect(screen.getAllByText('04:12').length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll('li')).toHaveLength(3);
    // A visible caption keeps the fake rows from being read as real results.
    expect(screen.getByText('Illustrative preview of what a search returns')).toBeInTheDocument();

    // The mock is decorative: it must not be announced by assistive tech.
    const mock = screen.getAllByText('04:12')[0].closest('[aria-hidden="true"]');
    expect(mock).toBeInTheDocument();
  });

  it('keeps the illustrative rows but drops the faux player when the workspace owns the player', () => {
    const { container } = render(
      <ResultsPanel {...baseProps} phase="idle" showPlayer={false} />,
    );

    expect(screen.getByText('Ready to find your moment')).toBeInTheDocument();
    expect(container.querySelector('.aspect-video')).not.toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(screen.getAllByText('04:12')).toHaveLength(1);
    expect(screen.getByText('Illustrative preview of what a search returns')).toBeInTheDocument();
  });

  it('renders matches when done', () => {
    render(<ResultsPanel {...baseProps} phase="done" />);
    expect(screen.getByText('00:05')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: /Matches for/ });
    const count = screen.getByText('1 match');
    expect(heading.parentElement).toContainElement(count);
    expect(screen.getAllByText('1 match')).toHaveLength(1);
    const watch = screen.getByRole('link', {
      name: 'Watch on YouTube at 00:05 (opens in a new tab)',
    });
    expect(watch).toHaveAttribute('href', 'https://www.youtube.com/watch?v=abcdef12345&t=5');
  });

  it('offers the whole transcript as a PDF download for the searched video', () => {
    render(<ResultsPanel {...baseProps} phase="done" />);

    const link = screen.getByRole('link', { name: 'Download full transcript (PDF)' });
    // The href carries whatever API origin the build was given, so assert the
    // path that matters rather than pinning the prefix to a test constant.
    const href = link.getAttribute('href') ?? '';
    expect(href.slice(href.indexOf('/api'))).toBe('/api/videos/abcdef12345/transcript.pdf');
    expect(link).toHaveAttribute('download');
  });

  it('omits the transcript download when no video is known', () => {
    render(<ResultsPanel {...baseProps} phase="done" video={null} />);

    expect(
      screen.queryByRole('link', { name: 'Download full transcript (PDF)' }),
    ).not.toBeInTheDocument();
  });

  it('offers the video itself as an MP4 download for the searched video', () => {
    render(<ResultsPanel {...baseProps} phase="done" />);

    const button = screen.getByRole('button', { name: 'Download video (MP4)' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('text-slate-700');
    expect(button).not.toHaveClass('text-danger');
    // The button only opens the chooser; the request is queued on confirm.
    expect(saveDownloadMock).not.toHaveBeenCalled();
  });

  it('offers the video itself as an MP4 download for a Drive video', async () => {
    const user = userEvent.setup();
    holdSave();
    render(
      <ResultsPanel {...baseProps} phase="done" video={{ source: 'drive', id: 'drivefile123' }} />,
    );

    await user.click(screen.getByRole('button', { name: 'Download video (MP4)' }));
    expect(screen.queryByLabelText('Quality')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download' }));

    const url = String(saveDownloadMock.mock.calls[0]?.[0]);
    expect(url.slice(url.indexOf('/api'))).toBe('/api/videos/drivefile123/video.mp4');
  });

  it('omits the video download when no video is known', () => {
    render(<ResultsPanel {...baseProps} phase="done" video={null} />);

    expect(screen.queryByRole('button', { name: 'Download video (MP4)' })).not.toBeInTheDocument();
  });

  it('offers an AI text summary for the searched video', () => {
    render(<ResultsPanel {...baseProps} phase="done" />);
    expect(
      screen.getByRole('button', { name: 'Download summary (PDF)' }),
    ).toBeInTheDocument();
  });

  it('hides the recap-video action for now', () => {
    render(<ResultsPanel {...baseProps} phase="done" />);
    expect(
      screen.queryByRole('button', { name: 'Download recap video (MP4)' }),
    ).not.toBeInTheDocument();
  });

  it('omits the text summary when the video has no speech', () => {
    render(<ResultsPanel {...baseProps} phase="done" noSpeech />);
    expect(
      screen.queryByRole('button', { name: 'Download summary (PDF)' }),
    ).not.toBeInTheDocument();
  });

  it('turns summary generation into a cancel control and re-arms on cancel', async () => {
    const user = userEvent.setup();
    const notes = holdNotes();
    render(<ResultsPanel {...baseProps} phase="done" />);

    await user.click(screen.getByRole('button', { name: 'Download summary (PDF)' }));

    expect(saveNotesMock).toHaveBeenCalledWith(
      'abcdef12345',
      expect.any(AbortSignal),
      false,
    );
    const pending = screen.getByRole('button', { name: 'Cancel summary' });
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(pending.querySelector('.animate-spin')).not.toBeNull();
    expect(
      screen.getByText(/AI is reading the transcript and writing your summary/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel summary' }));

    expect(notes.aborted()).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Download summary (PDF)' }),
    ).toBeInTheDocument();
  });

  it('re-arms the summary download after the PDF is saved', async () => {
    const user = userEvent.setup();
    const notes = holdNotes();
    render(<ResultsPanel {...baseProps} phase="done" />);

    await user.click(screen.getByRole('button', { name: 'Download summary (PDF)' }));
    await act(async () => notes.finish());

    expect(
      screen.getByRole('button', { name: 'Download summary (PDF)' }),
    ).toBeInTheDocument();
  });

  it('shows a safe error when notes generation fails', async () => {
    const user = userEvent.setup();
    const notes = holdNotes();
    render(<ResultsPanel {...baseProps} phase="done" />);

    await user.click(screen.getByRole('button', { name: 'Download summary (PDF)' }));
    await act(async () => notes.fail());

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not prepare the summary. Please try again.',
    );
    expect(
      screen.getByRole('button', { name: 'Download summary (PDF)' }),
    ).toBeInTheDocument();
  });

  it('asks where the download should start and end before fetching', async () => {
    const user = userEvent.setup();
    render(<ResultsPanel {...baseProps} phase="done" />);

    await user.click(screen.getByRole('button', { name: 'Download video (MP4)' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Start (mm:ss)')).toBeInTheDocument();
    expect(screen.getByLabelText('End (mm:ss)')).toBeInTheDocument();
  });

  it('turns the video download into a cancel control once a download starts', async () => {
    const user = userEvent.setup();
    holdSave();
    render(<ResultsPanel {...baseProps} phase="done" />);

    await user.click(screen.getByRole('button', { name: 'Download video (MP4)' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Download' }));

    const url = String(saveDownloadMock.mock.calls[0]?.[0]);
    expect(url.slice(url.indexOf('/api'))).toBe('/api/videos/abcdef12345/video.mp4');
    const pending = screen.getByRole('button', { name: 'Cancel download' });
    expect(pending).toHaveAttribute('aria-busy', 'true');
    expect(pending).toHaveClass('text-danger');
    expect(pending).not.toHaveClass('text-slate-700');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'The download will start automatically when the video is ready. Long videos can take several minutes. Click the button again to cancel.',
      ),
    ).toBeInTheDocument();
  });

  it('stops waiting when the pending video download is cancelled', async () => {
    const user = userEvent.setup();
    const save = holdSave();
    render(<ResultsPanel {...baseProps} phase="done" />);
    await user.click(screen.getByRole('button', { name: 'Download video (MP4)' }));
    await user.click(screen.getByRole('button', { name: 'Download' }));

    await user.click(screen.getByRole('button', { name: 'Cancel download' }));

    expect(save.aborted()).toBe(true);
    expect(screen.getByRole('button', { name: 'Download video (MP4)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel download' })).not.toBeInTheDocument();
    // Cancelling must not queue a second download.
    expect(saveDownloadMock).toHaveBeenCalledTimes(1);
  });

  it('downloads the entered range and keeps the pending state', async () => {
    const user = userEvent.setup();
    holdSave();
    render(<ResultsPanel {...baseProps} phase="done" />);
    await user.click(screen.getByRole('button', { name: 'Download video (MP4)' }));
    await user.type(screen.getByLabelText('Start (mm:ss)'), '0:30');
    await user.type(screen.getByLabelText('End (mm:ss)'), '1:15');

    await user.click(screen.getByRole('button', { name: 'Download' }));

    const url = String(saveDownloadMock.mock.calls[0]?.[0]);
    expect(url.slice(url.indexOf('/api'))).toBe(
      '/api/videos/abcdef12345/video.mp4?start=30&end=75',
    );
    expect(screen.getByRole('button', { name: 'Cancel download' })).toBeInTheDocument();
  });

  it('sends the quality chosen in the dialog with the download', async () => {
    const user = userEvent.setup();
    formatsMock.mockResolvedValue([1080, 720]);
    holdSave();
    render(<ResultsPanel {...baseProps} phase="done" />);
    await user.click(screen.getByRole('button', { name: 'Download video (MP4)' }));
    await screen.findByRole('option', { name: '720p' });
    await user.selectOptions(screen.getByLabelText('Quality'), '720');

    await user.click(screen.getByRole('button', { name: 'Download' }));

    const url = String(saveDownloadMock.mock.calls[0]?.[0]);
    expect(url.slice(url.indexOf('/api'))).toBe('/api/videos/abcdef12345/video.mp4?height=720');
  });

  it('re-arms the button once the prepared file is saved', async () => {
    const user = userEvent.setup();
    const save = holdSave();
    render(<ResultsPanel {...baseProps} phase="done" />);
    await user.click(screen.getByRole('button', { name: 'Download video (MP4)' }));

    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getByRole('button', { name: 'Cancel download' })).toBeInTheDocument();

    await act(async () => {
      save.finish();
    });

    expect(screen.getByRole('button', { name: 'Download video (MP4)' })).toBeInTheDocument();
  });

  it('re-arms the video download when the server cannot prepare the file', async () => {
    const user = userEvent.setup();
    const save = holdSave();
    render(<ResultsPanel {...baseProps} phase="done" />);
    await user.click(screen.getByRole('button', { name: 'Download video (MP4)' }));
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getByRole('button', { name: 'Cancel download' })).toBeInTheDocument();

    await act(async () => {
      save.fail(new Error('download failed'));
    });

    expect(screen.getByRole('button', { name: 'Download video (MP4)' })).toBeInTheDocument();
  });

  it('re-arms the video download after the preparation window elapses', () => {
    vi.useFakeTimers();
    holdSave();
    try {
      render(<ResultsPanel {...baseProps} phase="done" />);
      fireEvent.click(screen.getByRole('button', { name: 'Download video (MP4)' }));
      fireEvent.click(screen.getByRole('button', { name: 'Download' }));
      expect(screen.getByRole('button', { name: 'Cancel download' })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(11 * 60 * 1000);
      });

      expect(screen.getByRole('button', { name: 'Download video (MP4)' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-arms the video download when the searched video changes', () => {
    holdSave();
    const { rerender } = render(<ResultsPanel {...baseProps} phase="done" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download video (MP4)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(screen.getByRole('button', { name: 'Cancel download' })).toBeInTheDocument();

    rerender(
      <ResultsPanel {...baseProps} phase="done" video={{ source: 'youtube', id: 'othervid123' }} />,
    );

    expect(screen.getByRole('button', { name: 'Download video (MP4)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel download' })).not.toBeInTheDocument();
  });

  it('renders the keyword inside the title without leaking [object Object]', () => {
    render(<ResultsPanel {...baseProps} phase="done" />);
    expect(screen.getByRole('heading', { name: 'Matches for “hello”' })).toBeInTheDocument();
    expect(screen.queryByText(/object Object/)).not.toBeInTheDocument();
  });

  it('shows an error view with retry', async () => {
    const user = userEvent.setup();
    render(<ResultsPanel {...baseProps} phase="error" errorText="error.network" />);
    expect(
      screen.getByText(
        'Could not connect. Check your internet connection and try again. If it continues, please try later.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(baseProps.onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('accessible results and announcements', () => {
  it('names the card from its actual heading and gives the list a plain-text name', () => {
    render(<ResultsPanel {...baseProps} phase="done" video={null} />);
    const heading = screen.getByRole('heading', { name: 'Matches for “hello”' });
    const card = screen.getByRole('region', { name: 'Matches for “hello”' });
    expect(card).toHaveAttribute('aria-labelledby', heading.id);
    expect(
      screen.getByRole('region', { name: 'Matching moments for “hello”' }),
    ).toBeInTheDocument();
    for (const region of screen.getAllByRole('region')) {
      expect(region.getAttribute('aria-label') ?? '').not.toContain('<keyword>');
    }
    expect(heading.querySelector('bdi')).toHaveAttribute('dir', 'auto');
  });

  it('announces stage changes and outcomes once, without repeating percentages or ETA ticks', () => {
    const { rerender, container } = render(<ResultsPanel {...baseProps} phase="idle" />);
    const live = screen.getByRole('status');
    expect(live).toBeEmptyDOMElement();
    expect(live).not.toHaveAttribute('aria-label');
    rerender(<ResultsPanel {...baseProps} phase="processing" progress={10} />);
    expect(live).toHaveTextContent('Search started. Fetching the transcript.');
    rerender(<ResultsPanel {...baseProps} phase="processing" progress={40} />);
    expect(live).toHaveTextContent('Search started. Fetching the transcript.');
    expect(live).not.toHaveTextContent('%');
    expect(container.querySelector('[aria-busy="true"] [aria-live]')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    rerender(<ResultsPanel {...baseProps} phase="processing" progress={50} />);
    expect(live).toHaveTextContent('Finding matching timestamps.');
    rerender(<ResultsPanel {...baseProps} phase="done" video={null} />);
    expect(live).toHaveTextContent('Search complete: 1 match.');
    // The live region stays unnamed: naming it can suppress content announcements in NVDA/JAWS.
    expect(live).not.toHaveAttribute('aria-label');
  });

  it('uses a concise failure announcement rather than a live copy of the entire error card', () => {
    render(<ResultsPanel {...baseProps} phase="error" errorText="error.network" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'The search couldn’t finish. Your inputs have been kept.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveAccessibleDescription(
      'Try again uses the URL and phrase currently shown in the form.',
    );
  });

  it('keeps the timeout card’s reassurance the same as the live region’s', () => {
    // The announcement tells a screen reader nothing was lost. The card is what
    // a sighted user reads, so it has to say the same thing — otherwise the
    // promise only exists for one audience.
    render(<ResultsPanel {...baseProps} phase="error" errorText="error.timeout" />);
    expect(screen.getByText(/This is taking longer than expected/)).toHaveTextContent(
      'Your inputs have been kept',
    );
    expect(screen.getByRole('status')).toHaveTextContent('Your inputs have been kept');
  });
});

describe('ResultsPanel replaying a saved search', () => {
  const THREE = [
    { timestamp: '00:30', progress_seconds: 30, text_snippet: 'first sighting' },
    { timestamp: '02:00', progress_seconds: 120, text_snippet: 'second sighting' },
    { timestamp: '05:00', progress_seconds: 300, text_snippet: 'third sighting' },
  ];

  const shared = {
    phase: 'done' as const,
    sharedSeconds: 120,
    sharedKeyword: 'sighting',
    matches: [],
  };

  it('lists every saved match rather than the one it opens on', () => {
    render(<ResultsPanel {...baseProps} {...shared} sharedMatches={THREE} video={null} />);

    // The stored result set, all three of it. Trimming to the moment the player
    // opens on would make a keyword that occurs all over a video look like it
    // occurred once.
    expect(screen.getByRole('button', { name: /Play at 00:30/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play at 02:00/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play at 05:00/i })).toBeInTheDocument();
  });

  it('marks only the moment the player is parked on as current', () => {
    render(<ResultsPanel {...baseProps} {...shared} sharedMatches={THREE} video={null} />);

    // aria-current is the screen-reader half of the accent ring: without it the
    // list reads as three undifferentiated matches with no indication of where
    // the video actually is.
    expect(screen.getByRole('button', { name: /Play at 02:00/i })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: /Play at 00:30/i })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('shows one row for a bare moment link that knows of nothing else', () => {
    // ?v=&t= carries a second and nothing else. The single row is the honest
    // rendering of that, and must not be mistaken for a one-result search.
    render(<ResultsPanel {...baseProps} {...shared} sharedMatches={null} video={null} />);

    expect(screen.getByRole('button', { name: /Play at 02:00/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Play at 00:30/i })).not.toBeInTheDocument();
  });

  it('names a bare moment link\u2019s row instead of labelling it with an empty phrase', () => {
    // ?v=&t= with no history entry carries no keyword. ResultsList names the list
    // after the keyword it is given, so an empty one leaves a label reading
    // "Matching moments for \u201C\u201D" \u2014 strictly worse than naming the moment itself.
    render(
      <ResultsPanel
        {...baseProps}
        phase="done"
        keyword=""
        matches={[]}
        sharedSeconds={754}
        sharedKeyword={null}
        sharedMatches={null}
        video={null}
      />,
    );

    expect(screen.getByRole('region', { name: 'The saved moment' })).toBeInTheDocument();
  });

  it('lays a replayed result out exactly as a fresh search result is laid out', () => {
    // The rows decide row-vs-column with a container query against the wrapper
    // ResultsList puts around them. Rendering the replay with its own markup left
    // that wrapper out, and every replayed match pushed its share and YouTube
    // buttons onto a second line while the search it replays kept them inline.
    const listOf = (element: HTMLElement) => element.querySelector('ol')!.closest('section')!;
    const rowsOf = (element: HTMLElement) => element.querySelectorAll<HTMLElement>('ol > li > div');

    const replayed = render(
      <ResultsPanel
        {...baseProps}
        phase="done"
        keyword="sighting"
        matches={[]}
        sharedSeconds={30}
        sharedKeyword="sighting"
        sharedMatches={THREE}
        video={{ source: 'youtube', id: 'abcdef12345' }}
      />,
    );
    const searched = render(
      <ResultsPanel
        {...baseProps}
        phase="done"
        matches={THREE}
        video={{ source: 'youtube', id: 'abcdef12345' }}
      />,
    );

    // Same list wrapper, same row markup, same inline action buttons: the replay is
    // the search, re-shown.
    expect(listOf(replayed.container).className).toBe(listOf(searched.container).className);
    expect(listOf(replayed.container).tagName).toBe(listOf(searched.container).tagName);
    expect(rowsOf(replayed.container)[0].className).toBe(rowsOf(searched.container)[0].className);
    expect(replayed.container.querySelectorAll('[aria-label^="Share"]').length).toBe(
      searched.container.querySelectorAll('[aria-label^="Share"]').length,
    );
    expect(replayed.container.querySelectorAll('[aria-label^="Watch"]').length).toBe(
      searched.container.querySelectorAll('[aria-label^="Watch"]').length,
    );
  });

  it('shows the original empty result for a saved search that found nothing', () => {
    render(
      <ResultsPanel
        {...baseProps}
        {...shared}
        sharedMatches={[]}
        sharedMatched={false}
        video={null}
      />,
    );

    // Not a moment panel with a row in it. This search matched nothing, and the
    // replay has to say that with the same copy a live no-match search uses.
    expect(
      screen.getByText('No exact matches found. Try a different word or phrase.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Play at/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved moment/i)).not.toBeInTheDocument();
  });
});

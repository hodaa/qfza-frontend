import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import {
  ApiError,
  fetchJobStatus,
  fetchVideoSearch,
  resolveVideo,
  submitSearch,
} from '../api/client';
import { clearResultsCache } from '../utils/resultsCache';
import { buildDriveStreamUrl } from '../utils/videoSources';
import type { ResolvedVideo, SearchMatch, SearchResponse } from '../types';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    submitSearch: vi.fn(),
    fetchJobStatus: vi.fn(),
    fetchVideoSearch: vi.fn(),
    resolveVideo: vi.fn(),
  };
});

const mockSubmit = vi.mocked(submitSearch);
const mockStatus = vi.mocked(fetchJobStatus);
const mockVideoSearch = vi.mocked(fetchVideoSearch);
const mockResolve = vi.mocked(resolveVideo);

const URL = 'https://www.youtube.com/watch?v=abcdef12345';
const RESULTS: SearchMatch[] = [{ timestamp: '00:05', progress_seconds: 5, text_snippet: null }];

const RESOLVED: ResolvedVideo = {
  id: 'video-row-1',
  video_id: 'abcdef12345',
  title: 'Test video',
  duration_seconds: 300,
  transcribed: false,
};

async function fillAndSubmit(keyword = 'hello world'): Promise<void> {
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText('Video URL'), URL);
  await user.click(screen.getByRole('button', { name: 'Jump to video' }));
  await screen.findByLabelText('Search this video');
  await user.type(screen.getByLabelText('Search this video'), keyword);
  await user.click(screen.getByRole('button', { name: 'Search' }));
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearResultsCache();
    mockResolve.mockResolvedValue(RESOLVED);
    window.history.replaceState(null, '', '/');
  });

  it('shows cached results when the video is already transcribed', async () => {
    mockSubmit.mockResolvedValue({ status: 'found', results: RESULTS });
    await fillAndSubmit();
    expect(await screen.findByText('00:05')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Play at/ })).toHaveLength(RESULTS.length);
  });

  it('submits a Google Drive link through the same form', async () => {
    const driveUrl = 'https://drive.google.com/file/d/1DOoJhC6NHpLSu2nAvaWy3HukVimEyyhE/view';
    mockSubmit.mockResolvedValue({ status: 'found', results: RESULTS });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Video URL'), driveUrl);
    await user.click(screen.getByRole('button', { name: 'Jump to video' }));
    await user.type(await screen.findByLabelText('Search this video'), 'hello world');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('00:05')).toBeInTheDocument();
    // The raw pasted link is what the backend identifies; the app does not rewrite it.
    expect(mockSubmit).toHaveBeenCalledWith(driveUrl, 'hello world', expect.any(AbortSignal));
  });

  it('opens a video shared from YouTube with its URL filled in', async () => {
    window.history.replaceState(null, '', `/?url=${encodeURIComponent(URL)}`);
    render(<App />);

    expect(await screen.findByLabelText('Search this video')).toBeInTheDocument();
    expect(screen.getByLabelText('Video URL')).toHaveValue(URL);
    expect(mockResolve).toHaveBeenCalledWith(URL, expect.any(AbortSignal));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('offers Clear keyword when there are no matches', async () => {
    mockSubmit.mockResolvedValue({ status: 'found', results: [] });
    await fillAndSubmit();
    expect(await screen.findByText(/No exact matches found/)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('Ready to find your moment')).toBeInTheDocument();
  });

  it('shows the empty state for a not_found cached response instead of spinning forever', async () => {
    mockSubmit.mockResolvedValue({ status: 'not_found', results: [] });
    await fillAndSubmit();
    expect(await screen.findByText(/No exact matches found/)).toBeInTheDocument();
    expect(screen.queryByText('Transcribing video')).not.toBeInTheDocument();
  });

  it('polls the job and shows results once it completes', async () => {
    mockSubmit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'vid-1' });
    mockStatus.mockResolvedValue({
      status: 'completed',
      video_id: 'vid-1',
      progress: 100,
      results: null,
      error: null,
      video_language: null,
    });
    mockVideoSearch.mockResolvedValue({ status: 'found', results: RESULTS });

    await fillAndSubmit();
    expect(await screen.findAllByText('hello world')).not.toHaveLength(0);
    expect(mockVideoSearch).toHaveBeenCalledWith('vid-1', 'hello world', expect.any(AbortSignal));
  });

  it('shows the failure message reported by the job', async () => {
    mockSubmit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'vid-1' });
    mockStatus.mockResolvedValue({
      status: 'failed',
      video_id: 'vid-1',
      progress: null,
      results: null,
      error: 'Assembly API quota exceeded',
      video_language: null,
    });

    await fillAndSubmit();
    expect(
      await screen.findByText('Transcription failed: Assembly API quota exceeded'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows a localized error when polling fails', async () => {
    mockSubmit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'vid-1' });
    mockStatus.mockRejectedValue(new ApiError('error.network'));

    await fillAndSubmit();
    expect(
      await screen.findByText(
        'Could not connect. Check your internet connection and try again. If it continues, please try later.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a validation error with retry', async () => {
    mockSubmit.mockRejectedValue(new ApiError('error.validation'));
    await fillAndSubmit();
    expect(
      await screen.findByText('Please enter a video URL and a word or phrase.'),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(mockSubmit).toHaveBeenCalledTimes(2));
  });

  it('shows a local time-based progress indicator before completion', async () => {
    mockSubmit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'vid-1' });
    mockStatus
      .mockResolvedValueOnce({
        status: 'processing',
        video_id: 'vid-1',
        progress: null,
        results: null,
        error: null,
        video_language: null,
      })
      .mockResolvedValueOnce({
        status: 'completed',
        video_id: 'vid-1',
        progress: null,
        results: null,
        error: null,
        video_language: null,
      });
    mockVideoSearch.mockResolvedValue({ status: 'found', results: RESULTS });

    await fillAndSubmit();
    expect(await screen.findByText('Transcribing video')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('00:05')).toBeInTheDocument(), { timeout: 5000 });
  });

  it('starts counting progress the moment Jump is clicked, before the request resolves', async () => {
    mockSubmit.mockImplementation(() => new Promise<SearchResponse>(() => {}));

    await fillAndSubmit();

    expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByText('Transcribing video')).toBeInTheDocument();
  });

  it('serves repeat searches for the same video/keyword from the in-memory cache', async () => {
    mockSubmit.mockResolvedValue({ status: 'found', results: RESULTS });
    await fillAndSubmit();
    await screen.findByText('00:05');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('00:05')).toBeInTheDocument();
    expect(mockSubmit).toHaveBeenCalledTimes(1);
  });

  it('keeps the search action available after results', async () => {
    mockSubmit.mockResolvedValue({ status: 'found', results: RESULTS });
    await fillAndSubmit();
    await screen.findByText('00:05');

    expect(screen.getByRole('button', { name: 'Search' })).toBeEnabled();
    expect(screen.getByLabelText('Search this video')).toHaveValue('hello world');
  });

  it('uses the real progress reported by the backend while processing', async () => {
    mockSubmit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'vid-1' });
    mockStatus.mockResolvedValue({
      status: 'processing',
      video_id: 'vid-1',
      progress: 10,
      results: null,
      error: null,
      video_language: null,
    });

    await fillAndSubmit();
    const bar = await screen.findByRole('progressbar');
    await waitFor(() =>
      expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(10),
    );
  });

  it('always shows the progress counter in 10-step increments', async () => {
    mockSubmit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'vid-1' });
    // Non-multiples of 10 from the backend must be snapped, never shown raw.
    mockStatus.mockResolvedValue({
      status: 'processing',
      video_id: 'vid-1',
      progress: 45,
      results: null,
      error: null,
      video_language: null,
    });

    await fillAndSubmit();
    const bar = await screen.findByRole('progressbar');
    await waitFor(() => {
      const value = Number(bar.getAttribute('aria-valuenow'));
      expect(value).toBeGreaterThanOrEqual(10);
      expect(value % 10).toBe(0);
    });
  });

  it('cancels an in-progress search and returns to the idle state', async () => {
    mockSubmit.mockImplementation(() => new Promise<SearchResponse>(() => {}));

    await fillAndSubmit();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancel search' }));
    expect(await screen.findByText('Ready to find your moment')).toBeInTheDocument();
  });

  it('returns to the fresh landing view when the logo is clicked', async () => {
    mockSubmit.mockResolvedValue({ status: 'found', results: RESULTS });
    await fillAndSubmit();
    expect(await screen.findByText('00:05')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Qfza home' }));

    expect(await screen.findByRole('button', { name: 'Jump to video' })).toBeInTheDocument();
    expect(screen.getByLabelText('Video URL')).toHaveValue('');
    expect(screen.queryByText('00:05')).toBeNull();
    expect(screen.queryByLabelText('Search this video')).toBeNull();
  });

  it('clears a shared-moment deep link when the logo is clicked', async () => {
    window.history.replaceState({}, '', '/?v=abcdef12345&t=62');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Shared moment at 01:02' }),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('link', { name: 'Qfza home' }));

    await waitFor(() => expect(window.location.search).toBe(''));
    expect(await screen.findByRole('button', { name: 'Jump to video' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Shared moment at 01:02' })).toBeNull();
  });

  it('opens a shared-moment link into the shared view with the video pre-filled', async () => {
    window.history.replaceState({}, '', '/?v=abcdef12345&t=62');
    try {
      render(<App />);
      expect(
        await screen.findByRole('heading', { name: 'Shared moment at 01:02' }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Video URL')).toHaveValue(
        'https://www.youtube.com/watch?v=abcdef12345&t=0',
      );
      // The replay banner no longer offers its own search button: the search
      // form is already on screen, and a second way to start a search only
      // competed with it.
      expect(screen.queryByRole('button', { name: 'Search this video' })).toBeNull();
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });

  it('opens a shared Google Drive link into the shared view with the file pre-filled', async () => {
    const driveId = '1DOoJhC6NHpLSu2nAvaWy3HukVimEyyhE';
    window.history.replaceState({}, '', `/?v=${driveId}&t=62&s=drive`);
    try {
      render(<App />);
      expect(
        await screen.findByRole('heading', { name: 'Shared moment at 01:02' }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Video URL')).toHaveValue(
        `https://drive.google.com/file/d/${driveId}/view`,
      );
      // The Drive file plays through a native video element sourced from
      // Drive's Range-capable media endpoint, not the preview iframe.
      const player = screen.getByTitle('Video preview');
      expect(player.tagName).toBe('VIDEO');
      expect(player).toHaveAttribute('src', buildDriveStreamUrl(driveId));
    } finally {
      window.history.replaceState({}, '', '/');
    }
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import type {
  ResolvedVideo,
  SearchMatch,
  SearchResponse,
  StatusResponse,
  VideoSearchResponse,
} from '../types';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  submitSearch: vi.fn(),
  fetchJobStatus: vi.fn(),
  fetchVideoSearch: vi.fn(),
  resolveVideo: vi.fn(),
}));

const submit = vi.mocked(submitSearch);
const status = vi.mocked(fetchJobStatus);
const videoSearch = vi.mocked(fetchVideoSearch);
const resolve = vi.mocked(resolveVideo);
const URL = 'https://youtu.be/abcdef12345';
const RESOLVED: ResolvedVideo = {
  id: 'video-row-1',
  video_id: 'abcdef12345',
  title: 'Test video',
  duration_seconds: 300,
  transcribed: false,
};
const MATCHES: SearchMatch[] = [
  { timestamp: '00:07', progress_seconds: 7, text_snippet: 'old result' },
];
const COMPLETED: StatusResponse = {
  status: 'completed',
  video_id: 'video-1',
  progress: 100,
  results: null,
  error: null,
  video_language: 'en',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function start(keyword = 'first phrase') {
  const view = render(<App />);
  fireEvent.change(screen.getByLabelText('Video URL'), { target: { value: URL } });
  fireEvent.click(screen.getByRole('button', { name: 'Jump to video' }));
  fireEvent.change(await screen.findByLabelText('Search this video'), {
    target: { value: keyword },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  return view;
}

async function cancel() {
  // Cancellation now lives solely on the processing status card, which is
  // lazily loaded with the results panel — await it so the button is present.
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel search' }));
}

function expectIdle() {
  expect(screen.getByText('Ready to find your moment')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  expect(screen.queryByText('old result')).not.toBeInTheDocument();
}

beforeEach(() => {
  submit.mockReset();
  status.mockReset();
  videoSearch.mockReset();
  resolve.mockReset();
  resolve.mockResolvedValue(RESOLVED);
  clearResultsCache();
});

describe('search cancellation', () => {
  it.each<SearchResponse>([
    { status: 'found', results: MATCHES },
    { status: 'not_found', results: [] },
    { status: 'processing', job_id: 'old-job', video_id: 'old-video' },
  ])('ignores a late $status submission after cancel', async (response) => {
    const pending = deferred<SearchResponse>();
    submit.mockReturnValue(pending.promise);
    await start();
    const signal = submit.mock.calls[0][2];
    await cancel();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve(response));
    expectIdle();
    expect(status).not.toHaveBeenCalled();
  });

  it('ignores a late submission error after cancel', async () => {
    const pending = deferred<SearchResponse>();
    submit.mockReturnValue(pending.promise);
    await start();
    await cancel();
    await act(async () => pending.reject(new ApiError('error.network')));
    expectIdle();
  });

  it('cannot overwrite a newer search with a canceled response', async () => {
    const old = deferred<SearchResponse>();
    submit.mockReturnValueOnce(old.promise).mockResolvedValueOnce({
      status: 'found',
      results: [{ timestamp: '00:12', progress_seconds: 12, text_snippet: 'new result' }],
    });
    await start();
    await cancel();
    fireEvent.change(screen.getByLabelText('Search this video'), {
      target: { value: 'new phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('new result')).toBeInTheDocument();
    await act(async () => old.resolve({ status: 'found', results: MATCHES }));
    expect(screen.getByText('new result')).toBeInTheDocument();
    expect(screen.queryByText('old result')).not.toBeInTheDocument();
  });

  it.each(['completed', 'failed'] as const)(
    'ignores a late %s poll after cancel',
    async (result) => {
      const pending = deferred<StatusResponse>();
      submit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'video-1' });
      status.mockReturnValue(pending.promise);
      await start();
      await waitFor(() => expect(status).toHaveBeenCalledOnce());
      const signal = status.mock.calls[0][1];
      await cancel();
      expect(signal?.aborted).toBe(true);
      await act(async () =>
        pending.resolve({ ...COMPLETED, status: result, error: 'stale failure' }),
      );
      expectIdle();
      expect(screen.queryByText('stale failure')).not.toBeInTheDocument();
      expect(videoSearch).not.toHaveBeenCalled();
    },
  );

  it('ignores results already being fetched when cancel is clicked', async () => {
    const pending = deferred<VideoSearchResponse>();
    submit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'video-1' });
    status.mockResolvedValue(COMPLETED);
    videoSearch.mockReturnValue(pending.promise);
    await start();
    await waitFor(() => expect(videoSearch).toHaveBeenCalledOnce());
    const signal = videoSearch.mock.calls[0][2];
    await cancel();
    expect(signal?.aborted).toBe(true);
    await act(async () => pending.resolve({ status: 'found', results: MATCHES }));
    expectIdle();
  });

  it('cancels a scheduled completion transition without changing progress behavior', async () => {
    submit.mockResolvedValue({ status: 'processing', job_id: 'job-1', video_id: 'video-1' });
    status.mockResolvedValue(COMPLETED);
    videoSearch.mockResolvedValue({ status: 'found', results: MATCHES });
    await start();
    // Let the lazily-loaded results panel resolve before swapping in fake
    // timers (findBy/waitFor poll on real timers and would stall otherwise).
    await screen.findByRole('button', { name: 'Cancel search' });
    vi.useFakeTimers();
    await act(async () => {});
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }));
    await act(async () => vi.advanceTimersByTime(500));
    expectIdle();
  });

  it('aborts the active submission on unmount', async () => {
    const pending = deferred<SearchResponse>();
    submit.mockReturnValue(pending.promise);
    const { unmount } = await start();
    const signal = submit.mock.calls[0][2];
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () =>
      pending.resolve({ status: 'processing', job_id: 'old', video_id: 'old' }),
    );
    expect(status).not.toHaveBeenCalled();
  });
});

describe('returning to the form', () => {
  it('clears only the phrase after no matches and restores keyboard focus', async () => {
    submit.mockResolvedValue({ status: 'not_found', results: [] });
    await start();
    fireEvent.click(await screen.findByRole('button', { name: 'Clear search' }));
    const phrase = screen.getByLabelText('Search this video');
    expect(phrase).toHaveValue('');
    expect(screen.getByLabelText('Video URL')).toHaveValue(URL);
    await waitFor(() => expect(phrase).toHaveFocus());
    expectIdle();
  });
});

describe('current-query retry and persistent help', () => {
  it('retries the currently visible phrase instead of the failed query', async () => {
    submit
      .mockRejectedValueOnce(new ApiError('error.network'))
      .mockResolvedValueOnce({ status: 'found', results: MATCHES });
    await start();
    await screen.findByRole('button', { name: 'Try again' });
    fireEvent.change(screen.getByLabelText('Search this video'), {
      target: { value: 'corrected phrase' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('old result');
    expect(submit).toHaveBeenLastCalledWith(URL, 'corrected phrase', expect.any(AbortSignal));
    expect(
      screen.getByRole('heading', { name: 'Matches for “corrected phrase”' }),
    ).toBeInTheDocument();
  });

  it('validates an edited phrase on retry without submitting the old one', async () => {
    submit.mockRejectedValue(new ApiError('error.network'));
    await start();
    await screen.findByRole('button', { name: 'Try again' });
    fireEvent.change(screen.getByLabelText('Search this video'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(submit).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('Search this video')).toHaveFocus();
    expect(screen.getByLabelText('Search this video')).toHaveAttribute('aria-invalid', 'true');
  });

  it.each(['found', 'failure'] as const)(
    'keeps help available and does not steal its focus on %s',
    async (outcome) => {
      const pending = deferred<SearchResponse>();
      submit.mockReturnValue(pending.promise);
      await start();
      for (const id of ['how-it-works', 'why-qfza']) {
        expect(document.getElementById(id)).toBeInTheDocument();
      }
      const help = document.getElementById('how-it-works')!;
      act(() => help.focus());
      expect(submit.mock.calls[0][2]?.aborted).toBe(false);
      await act(async () => {
        if (outcome === 'found') pending.resolve({ status: 'found', results: MATCHES });
        else pending.reject(new ApiError('error.network'));
      });
      expect(help).toHaveFocus();
      for (const id of ['how-it-works', 'why-qfza']) {
        expect(document.getElementById(id)).toBeInTheDocument();
      }
      expect(submit).toHaveBeenCalledOnce();
      expect(screen.getByLabelText('Search this video')).toHaveValue('first phrase');
      expect(screen.getByLabelText('Video URL')).not.toHaveAttribute('readonly');
    },
  );
});

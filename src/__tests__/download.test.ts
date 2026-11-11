import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  consumeVideoDownload,
  createVideoDownload,
  createVideoNotes,
  createVideoSummary,
  fetchVideoDownloadStatus,
  fetchVideoNotesStatus,
  fetchVideoSummaryStatus,
} from '../api/client';
import type { VideoDownloadStatus, VideoNotesStatus, VideoSummaryStatus } from '../types';
import {
  downloadNameFor,
  notesNameFor,
  saveDownload,
  saveNotes,
  saveSummaryVideo,
  summaryVideoNameFor,
} from '../utils/download';

vi.mock('../api/client', () => ({
  createVideoDownload: vi.fn(),
  fetchVideoDownloadStatus: vi.fn(),
  consumeVideoDownload: vi.fn(),
  createVideoNotes: vi.fn(),
  fetchVideoNotesStatus: vi.fn(),
  createVideoSummary: vi.fn(),
  fetchVideoSummaryStatus: vi.fn(),
}));

const VIDEO_URL = 'http://api.test/api/videos/abc123/video.mp4';
const SECTION_URL = 'http://api.test/api/videos/abc123/video.mp4?start=30&height=720';

const createMock = vi.mocked(createVideoDownload);
const statusMock = vi.mocked(fetchVideoDownloadStatus);
const consumeMock = vi.mocked(consumeVideoDownload);
const createNotesMock = vi.mocked(createVideoNotes);
const notesStatusMock = vi.mocked(fetchVideoNotesStatus);
const createSummaryMock = vi.mocked(createVideoSummary);
const summaryStatusMock = vi.mocked(fetchVideoSummaryStatus);

function downloadStatus(overrides: Partial<VideoDownloadStatus> = {}): VideoDownloadStatus {
  return {
    id: 'd-1',
    status: 'ready',
    url: 'https://blob.test/produced.mp4',
    error: null,
    filename: 'video-abc123-720p-30-end.mp4',
    ...overrides,
  };
}

/** Stub the blob fetch and return the mock for assertions. */
function stubBlobFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    blob: () => Promise.resolve(new Blob(['bytes'], { type: 'video/mp4' })),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Record link clicks through the prototype so removed links stay visible. */
function spyClicks() {
  const clicked: HTMLAnchorElement[] = [];
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });
  return { clicked, clickSpy };
}

describe('downloadNameFor', () => {
  it('names a full video after its id', () => {
    expect(downloadNameFor(VIDEO_URL)).toBe('video-abc123.mp4');
  });

  it('names a section after both bounds', () => {
    expect(downloadNameFor(`${VIDEO_URL}?start=30&end=75`)).toBe('video-abc123-30-75.mp4');
  });

  it('marks a section that runs to the end', () => {
    expect(downloadNameFor(`${VIDEO_URL}?start=75`)).toBe('video-abc123-75-end.mp4');
  });

  it('sanitizes unexpected characters in the id, like the server would', () => {
    expect(downloadNameFor('http://api.test/api/videos/a%2Fb%20c/video.mp4')).toBe('video-abc.mp4');
  });

  it('marks the quality before the range, like the server would', () => {
    expect(downloadNameFor(`${VIDEO_URL}?height=720`)).toBe('video-abc123-720p.mp4');
    expect(downloadNameFor(`${VIDEO_URL}?start=30&end=75&height=360`)).toBe(
      'video-abc123-360p-30-75.mp4',
    );
  });
});

function notesStatus(overrides: Partial<VideoNotesStatus> = {}): VideoNotesStatus {
  return {
    id: 'n-1',
    status: 'ready',
    url: 'https://blob.test/notes.pdf',
    error: null,
    filename: 'notes-abc123.pdf',
    ...overrides,
  };
}

describe('saveDownload', () => {
  beforeEach(() => {
    createMock.mockReset();
    statusMock.mockReset();
    consumeMock.mockReset();
    createMock.mockResolvedValue({ id: 'd-1', status: 'pending' });
    statusMock.mockResolvedValue(downloadStatus());
    consumeMock.mockResolvedValue(downloadStatus({ status: 'consumed', url: null }));
  });

  it('queues, polls, saves the produced file, and consumes it', async () => {
    statusMock
      .mockResolvedValueOnce(downloadStatus({ status: 'processing', url: null }))
      .mockResolvedValueOnce(downloadStatus());
    const fetchMock = stubBlobFetch();
    const { clicked } = spyClicks();

    vi.useFakeTimers();
    const pending = saveDownload(VIDEO_URL);
    await vi.advanceTimersByTimeAsync(2000);
    await pending;

    expect(createMock).toHaveBeenCalledWith(
      'abc123',
      { start: null, end: null, height: null },
      undefined,
    );
    expect(fetchMock).toHaveBeenCalledWith('https://blob.test/produced.mp4', {
      signal: undefined,
    });
    expect(clicked[0]?.download).toBe('video-abc123-720p-30-end.mp4');
    expect(clicked[0]?.getAttribute('href')).toContain('blob:');
    expect(clicked[0]?.isConnected).toBe(false);
    expect(consumeMock).toHaveBeenCalledWith('abc123', 'd-1', undefined);
  });

  it('forwards the section and quality the URL names', async () => {
    const fetchMock = stubBlobFetch();
    spyClicks();
    const controller = new AbortController();

    await saveDownload(SECTION_URL, controller.signal);

    expect(createMock).toHaveBeenCalledWith(
      'abc123',
      { start: 30, end: null, height: 720 },
      controller.signal,
    );
    expect(fetchMock).toHaveBeenCalledWith('https://blob.test/produced.mp4', {
      signal: controller.signal,
    });
  });

  it('falls back to the derived name when the server sends none', async () => {
    statusMock.mockResolvedValue(downloadStatus({ filename: null }));
    stubBlobFetch();
    const { clicked } = spyClicks();

    await saveDownload(`${VIDEO_URL}?start=5`);

    expect(clicked[0]?.download).toBe('video-abc123-5-end.mp4');
  });

  it('rejects with the server message when production failed and never clicks', async () => {
    const message = 'Could not prepare the video download. Please try again later.';
    statusMock.mockResolvedValue(downloadStatus({ status: 'failed', url: null, error: message }));
    stubBlobFetch();
    const { clickSpy } = spyClicks();

    await expect(saveDownload(VIDEO_URL)).rejects.toThrow(message);

    expect(clickSpy).not.toHaveBeenCalled();
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it('rejects and never clicks when the wait is aborted while polling', async () => {
    statusMock.mockResolvedValue(downloadStatus({ status: 'processing', url: null }));
    const { clickSpy } = spyClicks();
    const controller = new AbortController();

    vi.useFakeTimers();
    const pending = saveDownload(VIDEO_URL, controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('rejects when the server refuses to queue the download', async () => {
    createMock.mockRejectedValue(new Error('error.jobGone'));
    const { clickSpy } = spyClicks();

    await expect(saveDownload(VIDEO_URL)).rejects.toThrow('error.jobGone');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('rejects when the produced file cannot be fetched and never clicks', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: false, status: 502, blob: () => Promise.resolve(new Blob()) }),
    );
    const { clickSpy } = spyClicks();

    await expect(saveDownload(VIDEO_URL)).rejects.toThrow('502');
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('still saves when the consume cleanup fails', async () => {
    consumeMock.mockRejectedValue(new Error('backend down'));
    stubBlobFetch();
    const { clicked } = spyClicks();

    await saveDownload(VIDEO_URL);

    expect(clicked).toHaveLength(1);
  });
});

describe('notesNameFor', () => {
  it('names the PDF after its video id', () => {
    expect(notesNameFor('abc123')).toBe('notes-abc123.pdf');
  });

  it('sanitizes unexpected characters in the id', () => {
    expect(notesNameFor('a/b c')).toBe('notes-abc.pdf');
  });
});

describe('saveNotes', () => {
  beforeEach(() => {
    createNotesMock.mockReset();
    notesStatusMock.mockReset();
    createNotesMock.mockResolvedValue({ id: 'n-1', status: 'pending' });
    notesStatusMock.mockResolvedValue(notesStatus());
  });

  it('queues, polls, and saves the PDF', async () => {
    notesStatusMock
      .mockResolvedValueOnce(notesStatus({ status: 'processing', url: null }))
      .mockResolvedValueOnce(notesStatus());
    const fetchMock = stubBlobFetch();
    const { clicked } = spyClicks();

    vi.useFakeTimers();
    const pending = saveNotes('abc123');
    await vi.advanceTimersByTimeAsync(3000);
    await pending;

    expect(createNotesMock).toHaveBeenCalledWith('abc123', undefined, false);
    expect(fetchMock).toHaveBeenCalledWith('https://blob.test/notes.pdf', {
      signal: undefined,
    });
    expect(clicked[0]?.download).toBe('notes-abc123.pdf');
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it('rejects with the server message when generation failed', async () => {
    notesStatusMock.mockResolvedValue(
      notesStatus({ status: 'failed', url: null, error: 'Lecture notes failed' }),
    );
    const { clicked } = spyClicks();

    await expect(saveNotes('abc123')).rejects.toThrow('Lecture notes failed');
    expect(clicked).toHaveLength(0);
  });

  it('rejects and never clicks when the wait is aborted', async () => {
    notesStatusMock.mockResolvedValue(notesStatus({ status: 'processing', url: null }));
    const { clicked } = spyClicks();
    const controller = new AbortController();

    vi.useFakeTimers();
    const pending = saveNotes('abc123', controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(DOMException);
    expect(clicked).toHaveLength(0);
  });
});

function summaryStatus(overrides: Partial<VideoSummaryStatus> = {}): VideoSummaryStatus {
  return {
    id: 's-1',
    status: 'ready',
    url: 'https://blob.test/summary.mp4',
    error: null,
    filename: 'summary-abc123.mp4',
    ...overrides,
  };
}

describe('summaryVideoNameFor', () => {
  it('names the MP4 after its video id', () => {
    expect(summaryVideoNameFor('abc123')).toBe('summary-abc123.mp4');
  });

  it('sanitizes unexpected characters in the id', () => {
    expect(summaryVideoNameFor('a/b c')).toBe('summary-abc.mp4');
  });
});

describe('saveSummaryVideo', () => {
  beforeEach(() => {
    createSummaryMock.mockReset();
    summaryStatusMock.mockReset();
    createSummaryMock.mockResolvedValue({ id: 's-1', status: 'pending' });
    summaryStatusMock.mockResolvedValue(summaryStatus());
  });

  it('queues, polls, and saves the rendered MP4', async () => {
    summaryStatusMock
      .mockResolvedValueOnce(summaryStatus({ status: 'processing', url: null }))
      .mockResolvedValueOnce(summaryStatus());
    const fetchMock = stubBlobFetch();
    const { clicked } = spyClicks();

    vi.useFakeTimers();
    const pending = saveSummaryVideo('abc123');
    await vi.advanceTimersByTimeAsync(5000);
    await pending;

    expect(createSummaryMock).toHaveBeenCalledWith('abc123', undefined, false);
    expect(fetchMock).toHaveBeenCalledWith('https://blob.test/summary.mp4', {
      signal: undefined,
    });
    expect(clicked[0]?.download).toBe('summary-abc123.mp4');
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it('rejects with the server message when rendering failed', async () => {
    summaryStatusMock.mockResolvedValue(
      summaryStatus({ status: 'failed', url: null, error: 'Summary render failed' }),
    );
    const { clicked } = spyClicks();

    await expect(saveSummaryVideo('abc123')).rejects.toThrow('Summary render failed');
    expect(clicked).toHaveLength(0);
  });

  it('rejects and never clicks when the wait is aborted', async () => {
    summaryStatusMock.mockResolvedValue(summaryStatus({ status: 'processing', url: null }));
    const { clicked } = spyClicks();
    const controller = new AbortController();

    vi.useFakeTimers();
    const pending = saveSummaryVideo('abc123', controller.signal);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await expect(pending).rejects.toBeInstanceOf(DOMException);
    expect(clicked).toHaveLength(0);
  });
});

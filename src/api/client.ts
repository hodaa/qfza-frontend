import type {
  PreparedVideo,
  ResolvedVideo,
  SearchResponse,
  StatusResponse,
  VideoDownloadCreated,
  VideoDownloadStatus,
  VideoNotesCreated,
  VideoNotesStatus,
  VideoFormatsResponse,
  VideoSearchResponse,
} from '../types';

/** Error whose message can be shown to the user. */
export class ApiError extends Error {
  messageKey: string;
  serverMessage?: string;

  constructor(messageKey: string, serverMessage?: string) {
    super(messageKey);
    this.name = 'ApiError';
    this.messageKey = messageKey;
    this.serverMessage = serverMessage;
  }
}

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';
const TIMEOUT_MS = 30_000;

interface ErrorPayload {
  error?: { message?: string };
  detail?: unknown;
}

/** Map an HTTP status (null = no response) to the matching localized error key. */
function toApiError(status: number | null, serverMessage?: string): ApiError {
  if (status === 400) return new ApiError('error.invalidUrl', serverMessage);
  if (status === 404) return new ApiError('error.jobGone', serverMessage);
  if (status === 422) return new ApiError('error.validation', serverMessage);
  if (status === null) return new ApiError('error.network');
  return new ApiError('error.server', serverMessage);
}

/**
 * Minimal fetch wrapper with a 30s timeout and user-signal cancellation,
 * replacing the (much heavier) axios dependency. Error mapping mirrors the
 * previous axios behaviour: HTTP status decides the kind of error, a network
 * failure (or timeout) surfaces as `error.network`, and a user-initiated
 * abort rethrows so callers' `signal.aborted` checks short-circuit cleanly.
 */
async function request<T>(
  path: string,
  options: { method?: string; json?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const { method, json, signal } = options;
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

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: method ?? (json !== undefined ? 'POST' : 'GET'),
      // The server expects JSON when a body is sent; plain GETs carry no body.
      headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      // Required, and not redundant with authClient: the session lives in an
      // HttpOnly cookie, and the API is a separate origin in development, where
      // the default `same-origin` would drop it. Without the cookie the backend
      // treats every search as anonymous and silently records no history, so a
      // signed-in visitor searched and then saw an empty history page.
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (error) {
    // A user-initiated abort must propagate so callers can act on signal.aborted.
    if (
      error instanceof DOMException &&
      error.name === 'AbortError' &&
      !timedOut &&
      signal?.aborted
    ) {
      throw error;
    }
    // Anything else — a network failure or the 30s timeout — is a connectivity issue.
    throw toApiError(null);
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', propagateAbort);
  }

  if (!res.ok) {
    let serverMessage: string | undefined;
    try {
      const data = (await res.json()) as ErrorPayload;
      serverMessage = data?.error?.message;
    } catch {
      // Non-JSON error body — fall back to the status-only mapping.
    }
    throw toApiError(res.status, serverMessage);
  }
  return (await res.json()) as T;
}

/** Submit a search; resolves to found results or a created job. */
export function submitSearch(
  youtubeUrl: string,
  keyword: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  return request<SearchResponse>('/api/search', {
    method: 'POST',
    json: { youtube_url: youtubeUrl, keyword },
    signal,
  });
}

/** Resolve a pasted link to a stored video without starting transcription. */
export function resolveVideo(videoUrl: string, signal?: AbortSignal): Promise<ResolvedVideo> {
  return request<ResolvedVideo>('/api/videos/resolve', {
    json: { video_url: videoUrl },
    signal,
  });
}

/** Ensure a video's transcript is ready, queueing it when necessary. */
export function prepareVideo(youtubeId: string, signal?: AbortSignal): Promise<PreparedVideo> {
  return request<PreparedVideo>(`/api/videos/${encodeURIComponent(youtubeId)}/prepare`, {
    method: 'POST',
    signal,
  });
}

/** Fetch the current status of a transcription job. */
export function fetchJobStatus(jobId: string, signal?: AbortSignal): Promise<StatusResponse> {
  return request<StatusResponse>(`/api/status/${jobId}`, { signal });
}

/** Fetch cached search results for a transcribed video. */
export function fetchVideoSearch(
  videoId: string,
  keyword: string,
  signal?: AbortSignal,
): Promise<VideoSearchResponse> {
  return request<VideoSearchResponse>(
    `/api/video/${videoId}/search?keyword=${encodeURIComponent(keyword)}`,
    { signal },
  );
}

/**
 * Absolute URL of a transcribed video's full transcript as a PDF.
 *
 * Returned for the browser to fetch rather than fetched here: the response is
 * a file, so an ordinary navigation downloads it without the transcript ever
 * passing through the app's JSON handling.
 */
export function transcriptPdfUrl(youtubeId: string): string {
  return `${BASE_URL}/api/videos/${encodeURIComponent(youtubeId)}/transcript.pdf`;
}

/**
 * Absolute URL identifying one video download request.
 *
 * URL-shaped so a call site can pass it around as one value (the filename
 * still derives from it), but the URL no longer carries the bytes itself:
 * `saveDownload` parses it, queues the download on the backend, polls until
 * the worker has produced the file, then fetches the blob it points at. With
 * `startSeconds`, only that section is produced, up to `endSeconds` or to the
 * video's end when it is omitted. With `height`, the file is capped at that
 * H.264 quality.
 */
export function videoDownloadUrl(
  youtubeId: string,
  startSeconds?: number | null,
  endSeconds?: number | null,
  height?: number | null,
): string {
  const base = `${BASE_URL}/api/videos/${encodeURIComponent(youtubeId)}/video.mp4`;
  const params = new URLSearchParams();
  if (startSeconds != null) {
    params.set('start', String(Math.floor(startSeconds)));
    if (endSeconds != null) {
      params.set('end', String(Math.floor(endSeconds)));
    }
  }
  if (height != null) {
    params.set('height', String(height));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** The section and quality a video download request asks for. */
export interface VideoDownloadRequest {
  start: number | null;
  end: number | null;
  height: number | null;
}

/** Queue a video download; the worker produces it and reports a blob URL. */
export function createVideoDownload(
  youtubeId: string,
  download: VideoDownloadRequest,
  signal?: AbortSignal,
): Promise<VideoDownloadCreated> {
  return request<VideoDownloadCreated>(`/api/videos/${encodeURIComponent(youtubeId)}/downloads`, {
    json: download,
    signal,
  });
}

/** Fetch a queued download's state, its blob URL once ready, and filename. */
export function fetchVideoDownloadStatus(
  youtubeId: string,
  downloadId: string,
  signal?: AbortSignal,
): Promise<VideoDownloadStatus> {
  return request<VideoDownloadStatus>(
    `/api/videos/${encodeURIComponent(youtubeId)}/downloads/${encodeURIComponent(downloadId)}`,
    { signal },
  );
}

/** Tell the server the file was received, so its stored blob can be deleted. */
export function consumeVideoDownload(
  youtubeId: string,
  downloadId: string,
  signal?: AbortSignal,
): Promise<VideoDownloadStatus> {
  return request<VideoDownloadStatus>(
    `/api/videos/${encodeURIComponent(youtubeId)}/downloads/${encodeURIComponent(downloadId)}/consume`,
    { method: 'POST', signal },
  );
}

/** Queue AI lecture notes; the worker produces the PDF and reports a blob URL. */
export function createVideoNotes(
  youtubeId: string,
  signal?: AbortSignal,
  regenerate = false,
): Promise<VideoNotesCreated> {
  const query = regenerate ? '?regenerate=true' : '';
  return request<VideoNotesCreated>(`/api/videos/${encodeURIComponent(youtubeId)}/notes${query}`, {
    method: 'POST',
    signal,
  });
}

/** Fetch a lecture-notes request's state, its blob URL once ready, and filename. */
export function fetchVideoNotesStatus(
  youtubeId: string,
  noteId: string,
  signal?: AbortSignal,
): Promise<VideoNotesStatus> {
  return request<VideoNotesStatus>(
    `/api/videos/${encodeURIComponent(youtubeId)}/notes/${encodeURIComponent(noteId)}`,
    { signal },
  );
}

// The qualities of a video change rarely; one probe per session is plenty.
const formatsCache = new Map<string, Promise<number[]>>();

/**
 * List a video's downloadable heights, tallest first.
 *
 * The server caches the ladder, probing YouTube in the background when it has
 * none yet (and occasionally refreshing a stale one), so most calls answer
 * from the cache. A failed call is not cached, so the next dialog can try
 * again, and callers treat a rejection as "no choice to offer".
 */
export function fetchVideoFormats(youtubeId: string): Promise<number[]> {
  const cached = formatsCache.get(youtubeId);
  if (cached) {
    return cached;
  }
  const pending = request<VideoFormatsResponse>(
    `/api/videos/${encodeURIComponent(youtubeId)}/formats`,
  )
    .then((data) => data.heights)
    .catch((error: unknown) => {
      formatsCache.delete(youtubeId);
      throw error;
    });
  formatsCache.set(youtubeId, pending);
  return pending;
}

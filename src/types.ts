/** Shared API types mirroring the قفزة backend contract. */

/** A single timestamp result for a keyword match. */
export interface SearchMatch {
  timestamp: string;
  progress_seconds: number;
  text_snippet: string | null;
}

/** Response shape when results were found in cache. */
interface SearchFoundResponse {
  status: 'found';
  results: SearchMatch[];
  /** True when the video is transcribed but has no speech/sound at all. */
  no_speech?: boolean;
}

/** Response shape when the video is transcribed but the phrase has no matches. */
interface SearchNotFoundResponse {
  status: 'not_found';
  results: [];
  /** True when the video is transcribed but has no speech/sound at all. */
  no_speech?: boolean;
}

/** Response shape when a transcription job was created. */
interface SearchProcessingResponse {
  status: 'processing';
  job_id: string;
  video_id: string;
}

/** Union of possible POST /api/search responses. */
export type SearchResponse =
  SearchFoundResponse | SearchNotFoundResponse | SearchProcessingResponse;

/** Lifecycle states for a transcription job. */
type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** Response shape for GET /api/status/{job_id}. */
export interface StatusResponse {
  status: JobStatus;
  video_id: string;
  progress: number | null;
  results: SearchMatch[] | null;
  error: string | null;
  video_language: string | null;
  /** Server-provided seconds until completion; absent when the backend doesn't send it. */
  estimatedTimeSeconds?: number | null;
}

/** Response shape for GET /api/video/{video_id}/search. */
export type VideoSearchResponse = SearchFoundResponse | SearchNotFoundResponse;

/** A video identified by a pasted link, before transcription is requested. */
export interface ResolvedVideo {
  /** Backend UUID, used by transcript and history routes. */
  id: string;
  /** Source id (YouTube video id or Drive file id), used by action routes. */
  video_id: string;
  title: string | null;
  duration_seconds: number | null;
  transcribed: boolean;
}

/** Response shape for POST /api/videos/{youtube_id}/prepare. */
export interface PreparedVideo {
  status: 'ready' | 'processing';
  video_id: string;
  job_id: string | null;
}

/** Response shape for GET /api/videos/{youtube_id}/formats. */
export interface VideoFormatsResponse {
  /** Downloadable H.264 heights in pixels, tallest first. */
  heights: number[];
}

/** Lifecycle states for an offloaded video download. */
type VideoDownloadState = 'pending' | 'processing' | 'ready' | 'failed' | 'consumed';

/** Response shape for POST /api/videos/{youtube_id}/downloads. */
export interface VideoDownloadCreated {
  id: string;
  status: VideoDownloadState;
}

/** Response shape for the download status and consume routes. */
export interface VideoDownloadStatus extends VideoDownloadCreated {
  /** Blob URL of the produced file; set only while ready. */
  url: string | null;
  /** User-safe failure message when failed. */
  error: string | null;
  /** Filename the client should save the file under. */
  filename: string | null;
}

/** Lifecycle states for an AI lecture-notes request. */
type VideoNotesState = 'pending' | 'processing' | 'ready' | 'failed';

/** Response shape for POST /api/videos/{youtube_id}/notes. */
export interface VideoNotesCreated {
  id: string;
  status: VideoNotesState;
}

/** Response shape for the lecture-notes status route. */
export interface VideoNotesStatus extends VideoNotesCreated {
  /** Blob URL of the generated PDF; set only while ready. */
  url: string | null;
  /** User-safe failure message when failed. */
  error: string | null;
  /** Filename the client should save the PDF under. */
  filename: string | null;
}

/* ── accounts and private search history ── */

/** The signed-in user. Never carries a password hash. */
export interface AuthUser {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
  /**
   * Whether the account has a password at all.
   *
   * An account created with Google has none, so the password form can only ever
   * answer "wrong details" for it. This is what lets the account page say
   * "set a password" rather than implying one exists. Returned only to the
   * session that owns the account.
   */
  has_password: boolean;
  /**
   * The display name the account owner signed in with, or null when there is
   * none. Google returns one on sign-in; a password-only account never has it.
   *
   * Null rather than an empty string, so "no name yet" stays distinguishable
   * from a name that happens to be blank. Resolve it through `displayName()`
   * rather than reading this field directly, or the greeting can render empty.
   */
  full_name: string | null;
}

/** Response shape for register, login, and Google sign-in. */
export interface AuthResponse {
  user: AuthUser;
  /**
   * Opaque session token for native clients only.
   *
   * The web client ignores this on purpose: persisting it in localStorage would
   * hand any XSS the same access as the HttpOnly cookie protects against.
   */
  token: string;
  expires_at: string;
}

/** Response shape for GET /api/v1/auth/session. */
export interface SessionInfo {
  user: AuthUser;
  /** Per-deployment secret to echo as the CSRF header on mutations. */
  csrf_token: string;
}

/** One recorded search in the caller's private history. */
export interface HistoryEntry {
  id: string;
  video_id: string;
  /** Video title when the backend has it; fall back to the id when not. */
  video_title?: string | null;
  /**
   * Where the first match sat when the search ran, so the entry reopens at the
   * moment it was found. Absent on searches recorded before the backend started
   * snapshotting it, and on ones that found nothing — those open from the top.
   */
  progress_seconds?: number | null;
  /**
   * Every result the search returned, snapshotted with its timestamp and the
   * snippet around the phrase — the same list the search produced, so replaying
   * a saved entry shows what was found rather than only where to seek.
   *
   * Absent on searches recorded before the backend started storing it, and on
   * ones that matched nothing. `match_timestamps` is the older, position-only
   * list kept for rows written in between: it can seek, but carries no snippets.
   */
  match_results?: SearchMatch[] | null;
  match_timestamps?: number[] | null;
  keyword: string;
  locale: string | null;
  source: string | null;
  status: string;
  created_at: string;
}

/** One page of history. Cursor-paginated; phone histories grow for years. */
export interface HistoryPage {
  entries: HistoryEntry[];
  next_cursor: string | null;
}

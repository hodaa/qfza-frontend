/**
 * Video-source adapters: the one place a pasted link becomes a video identity.
 *
 * Every source is a strategy with the same small surface — read a link it owns,
 * name its thumbnail, name its watch page — so adding a source means adding an
 * adapter, not touching the search form, the results list or the deep links.
 * The primitives that are YouTube-specific (its id shape, its hosts) stay in
 * `youtube.ts`.
 */

import { isYouTubeId, readYouTubeVideo } from './youtube';
import type { YouTubeUrlIssue } from './youtube';

/** Why a URL cannot start a search. Shared by every source's reader. */
export type VideoUrlIssue = YouTubeUrlIssue;

/** The video sources the app can search. */
type VideoSource = 'youtube' | 'drive';

/** A video's identity: which source owns it, and its id within that source. */
export interface VideoRef {
  source: VideoSource;
  id: string;
}

type VideoUrlInfo = { video: VideoRef; issue: null } | { video: null; issue: VideoUrlIssue };

type ParsedVideo = { id: string; issue: null } | { id: null; issue: VideoUrlIssue };

/** One source's strategy. `read` returns null when the link is not this source's. */
interface VideoSourceAdapter {
  source: VideoSource;
  read(parsed: URL): ParsedVideo | null;
  thumbnailUrl(id: string): string;
  watchUrl(id: string, seconds: number): string;
}

/**
 * Google Drive file ids are opaque, at least 25 characters from a URL-safe
 * alphabet — the same shape the backend accepts. The length is what keeps them
 * disjoint from YouTube's 11-character ids.
 */
const DRIVE_ID_REGEX = /^[A-Za-z0-9_-]{25,}$/;

const DRIVE_FILE_PATH = /^\/file\/d\/([^/]+)/;
const DRIVE_FOLDER_PATH = /^\/drive\/(?:u\/\d+\/)?folders\//;

/** Whether a bare string is a Google Drive file id. */
export function isGoogleDriveId(value: string): boolean {
  return DRIVE_ID_REGEX.test(value);
}

/**
 * Read the file a parsed Drive URL points at, when the host is Drive's.
 *
 * Accepts the shared file link (`/file/d/<id>/view`), `open?id=` and the
 * `uc?id=` download form, mirroring the backend. A folder has no video in it,
 * so it is rejected outright rather than reported as an empty video.
 */
function readDriveVideo(parsed: URL): ParsedVideo | null {
  if (parsed.hostname !== 'drive.google.com') return null;
  if (DRIVE_FOLDER_PATH.test(parsed.pathname)) return { id: null, issue: 'invalid' };
  const id = DRIVE_FILE_PATH.exec(parsed.pathname)?.[1] ?? parsed.searchParams.get('id') ?? '';
  return isGoogleDriveId(id) ? { id, issue: null } : { id: null, issue: 'invalid' };
}

const youtubeAdapter: VideoSourceAdapter = {
  source: 'youtube',
  read: readYouTubeVideo,
  // `hqdefault` rather than `maxresdefault`: the 480x360 frame exists for every
  // video ever uploaded, while maxres 404s for anything old or low-definition —
  // and at the size a history card draws it, 480px wide is already sharper than
  // the 1x/2x screens show. YouTube letterboxes hqdefault to 4:3, which the
  // caller's `object-cover` crops away.
  thumbnailUrl: (id) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`,
  watchUrl: (id, seconds) =>
    `https://www.youtube.com/watch?v=${encodeURIComponent(id)}&t=${Math.floor(seconds)}`,
};

const driveAdapter: VideoSourceAdapter = {
  source: 'drive',
  read: readDriveVideo,
  thumbnailUrl: (id) => `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}`,
  // Drive cannot start a file at an arbitrary second from its own URL, so the
  // seconds a moment link carries are dropped for this source.
  watchUrl: (id) => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`,
};

const DRIVE_STREAM_BASE_URL =
  (import.meta as ImportMeta).env?.VITE_DRIVE_STREAM_BASE_URL?.replace(/\/$/, '') ||
  'https://www.googleapis.com/drive/v3/files';

/**
 * Media URL for a public Drive file.
 *
 * Drive's preview iframe has no seek API, and its browser-download endpoint
 * rejects media requests (its Sec-Fetch response varies), so the in-app player
 * uses the Drive API's `alt=media` endpoint instead. It serves the bytes with
 * Range support, which is what makes `currentTime` seeking work.
 *
 * The API key is a public, referrer-restricted key: it is necessarily visible
 * in the bundle. Restrict it to this site and the Drive API in Google Cloud.
 */
export function buildDriveStreamUrl(
  id: string,
  key: string | undefined = (import.meta as ImportMeta).env?.VITE_GOOGLE_DRIVE_API_KEY,
): string {
  const url = `${DRIVE_STREAM_BASE_URL}/${encodeURIComponent(id)}?alt=media`;
  return key ? `${url}&key=${encodeURIComponent(key)}` : url;
}

export function buildDrivePreviewUrl(id: string): string {
  return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;
}

/** Adapter order is the claim order; every adapter's read must decline other hosts. */
const ADAPTERS: readonly VideoSourceAdapter[] = [youtubeAdapter, driveAdapter];

function adapterOf(video: VideoRef): VideoSourceAdapter {
  const adapter = ADAPTERS.find((candidate) => candidate.source === video.source);
  if (!adapter) throw new Error(`Unknown video source: ${video.source}`);
  return adapter;
}

const HTTP_PROTOCOLS = ['http:', 'https:'];

/**
 * Read a pasted link into the video it identifies, or the issue that stops it.
 *
 * Each adapter claims the hosts it serves; a host no adapter claims is an
 * unsupported source, while a claimed host with the wrong shape reports what is
 * wrong with it. Non-HTTP links and links carrying credentials are rejected
 * before any adapter sees them.
 */
export function inspectVideoUrl(url: string): VideoUrlInfo {
  try {
    const parsed = new URL(url);
    if (!HTTP_PROTOCOLS.includes(parsed.protocol) || parsed.username || parsed.password) {
      return { video: null, issue: 'invalid' };
    }
    for (const adapter of ADAPTERS) {
      const result = adapter.read(parsed);
      if (result) {
        return result.issue === null
          ? { video: { source: adapter.source, id: result.id }, issue: null }
          : { video: null, issue: result.issue };
      }
    }
    return { video: null, issue: 'unsupportedSource' };
  } catch {
    return { video: null, issue: 'invalid' };
  }
}

/**
 * Name the source a bare video id belongs to.
 *
 * Ids recorded before Drive existed are all YouTube's, and Drive's own are
 * recognisably longer, so an id that is not Drive's is YouTube's by default.
 */
export function identifyVideoId(id: string): VideoRef {
  return isGoogleDriveId(id) ? { source: 'drive', id } : { source: 'youtube', id };
}

const SITE_URL = (() => {
  try {
    const env = (import.meta as ImportMeta).env?.VITE_SITE_URL;
    if (env) return env.replace(/\/$/, '');
    return window.location.origin;
  } catch {
    return 'https://qfza.app';
  }
})();

/** The source's own frame for a video, at the size a card draws it. */
export function buildThumbnailUrl(video: VideoRef): string {
  return adapterOf(video).thumbnailUrl(video.id);
}

/** Build the source's own page for a video, starting at the given second when it can. */
export function buildWatchUrl(video: VideoRef, seconds: number): string {
  return adapterOf(video).watchUrl(video.id, seconds);
}

/** A deep link names its source so a pasted link survives without re-inspection. */
function sourceParam(video: VideoRef): string {
  return video.source === 'drive' ? '&s=drive' : '';
}

/** Build a shareable qfza.app link that loads the video at the given second. */
export function buildShareUrl(video: VideoRef, seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  return `${SITE_URL}/?v=${encodeURIComponent(video.id)}&t=${t}${sourceParam(video)}`;
}

/**
 * The same deep link as {@link buildShareUrl} but relative to the current host,
 * for the href of a link the app handles itself.
 *
 * An anchor keeps behaviours a button would throw away — middle-click,
 * ctrl-click, "open in new tab", and the status-bar preview all still work,
 * because the href is a real destination. Relative rather than absolute so a
 * local build replays locally instead of sending the developer to production.
 *
 * `foundNothing` is what makes a link to a fruitless search behave like the
 * search did. A search that matched nothing has no moment, so its href carries
 * `empty=1` rather than `t=0` — without it, opening or reloading the link would
 * invent a match at the start of the video and answer a question the visitor
 * already knows the answer to. Clicking the row in the app and opening that same
 * href have to agree, and the URL is the only thing that survives a reload.
 */
export function buildMomentHref(
  video: VideoRef,
  seconds: number,
  options: { foundNothing?: boolean } = {},
): string {
  const t = Math.max(0, Math.floor(seconds));
  const base = `/?v=${encodeURIComponent(video.id)}&t=${t}${sourceParam(video)}`;
  return options.foundNothing ? `${base}&empty=1` : base;
}

export interface DeepLink {
  video: VideoRef;
  seconds: number;
  /**
   * True when the link was built for a search that matched nothing.
   *
   * Distinct from `seconds === 0`: both open at the start of the video, but only
   * one of them has a result to show.
   */
  foundNothing: boolean;
}

/**
 * Read a `?v=<id>&t=<seconds>` deep link produced by {@link buildShareUrl}, or
 * the `&empty=1` variant {@link buildMomentHref} writes for a search that found
 * nothing. Returns null when the URL is not a valid shared-moment link, so a
 * normal visit to the site is unaffected.
 *
 * The `s` parameter names a non-YouTube source; without it the link is read the
 * way every link written before Drive existed was written. An unrecognised `s`
 * value is not a link this app ever produced, so it is rejected rather than
 * guessed at, and the id must match the id shape of the source it claims.
 *
 * An unrecognised `empty` value is treated as "found something", so a hand-typed
 * or truncated URL degrades to the ordinary moment view instead of an empty one.
 */
export function parseShareUrl(search: string): DeepLink | null {
  try {
    const params = new URLSearchParams(search);
    const id = params.get('v');
    if (!id) return null;
    const source = params.get('s');
    let video: VideoRef | null;
    if (source === 'drive') {
      video = isGoogleDriveId(id) ? { source: 'drive', id } : null;
    } else if (source === null) {
      video = isYouTubeId(id) ? { source: 'youtube', id } : null;
    } else {
      video = null;
    }
    if (!video) return null;
    const raw = Number(params.get('t'));
    const seconds = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    return { video, seconds, foundNothing: params.get('empty') === '1' };
  } catch {
    return null;
  }
}

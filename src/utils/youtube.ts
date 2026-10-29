/**
 * URL helpers for YouTube links and identifiers.
 *
 * This module owns only what is YouTube-specific: the id shape, the hosts it is
 * served from, and how a link is read. Anything that has to pick between video
 * sources lives in `videoSources.ts`, which builds on the primitives here.
 */

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);

export type YouTubeUrlIssue = 'invalid' | 'unsupportedSource' | 'unsupportedFormat';

type YouTubeUrlInfo = { id: string; issue: null } | { id: null; issue: YouTubeUrlIssue };

/** Whether a bare string is a YouTube video id. */
export function isYouTubeId(value: string): boolean {
  return YOUTUBE_ID_REGEX.test(value);
}

/**
 * Read the video a parsed URL points at, when the host is YouTube's.
 *
 * Returns null for every other host so a caller routing between sources can
 * tell "not mine" apart from "mine, but wrong". Only the watch/share formats
 * currently offered by the search form are accepted; anything else on a
 * YouTube host comes back as an issue explaining why.
 */
export function readYouTubeVideo(parsed: URL): YouTubeUrlInfo | null {
  let id: string | null;
  if (parsed.hostname === 'youtu.be') {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return { id: null, issue: 'unsupportedFormat' };
    id = parts[0];
  } else if (YOUTUBE_HOSTS.has(parsed.hostname) || parsed.hostname.endsWith('.youtube.com')) {
    if (parsed.pathname !== '/watch') return { id: null, issue: 'unsupportedFormat' };
    id = parsed.searchParams.get('v');
  } else {
    return null;
  }
  return id && isYouTubeId(id) ? { id, issue: null } : { id: null, issue: 'invalid' };
}

/**
 * Read a `MM:SS` or `HH:MM:SS` time back into seconds - the inverse of
 * `formatYouTubeTime`, for the segment-download fields. A bare number is read
 * as seconds, and `null` means the field was left empty rather than wrong;
 * anything unparseable comes back as `NaN` so callers can tell the two apart.
 */
export function parseYouTubeTime(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (!/^\d+(?::\d{1,2}){0,2}$/.test(trimmed)) {
    return Number.NaN;
  }
  return trimmed
    .split(':')
    .map(Number)
    .reduce((total, part) => total * 60 + part, 0);
}

/**
 * Format a timestamp the way the YouTube player controls do:
 * `MM:SS`, or `HH:MM:SS` once the duration reaches an hour.
 * Non-finite or negative input falls back to `00:00`.
 */
export function formatYouTubeTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    totalSeconds = 0;
  }
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

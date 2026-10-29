import { memo, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { videoDownloadUrl } from '../api/client';
import { usePreparingDownload } from '../hooks/usePreparingDownload';
import type { SearchMatch } from '../types';
import { buildShareUrl, buildWatchUrl } from '../utils/videoSources';
import type { VideoRef } from '../utils/videoSources';
import { formatYouTubeTime } from '../utils/youtube';
import { IconCheck, IconDownload, IconSearch, IconShare, IconYouTube } from './icons';
import { VideoDownloadDialog } from './VideoDownloadDialog';

const DEFAULT_MATCH_LIMIT = 50;

interface Props {
  matches: SearchMatch[];
  keyword: string;
  noSpeech?: boolean;
  onSeek: (seconds: number) => void;
  onClear?: () => void;
  video?: VideoRef | null;
  matchLimit?: number;
  currentPlayingTimestamp?: number | null;
  /**
   * Accessible name for the list. Defaults to the keyword-scoped label, but a
   * replayed moment with no keyword behind it would otherwise announce
   * "Matching moments for “”" — so the caller names those rows itself.
   */
  listLabel?: string;
  /** Render the count above the list; false when the caller places it in a heading. */
  showCount?: boolean;
}

/** The match count, shared by the list header and the results heading row. */
export function MatchCountBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-action/10 px-3 py-1 text-sm font-bold text-primary">
      {t('results.matchCount', { count })}
    </span>
  );
}

/** Wrap every case-insensitive occurrence of the keyword in a highlight mark. */
function highlightKeyword(text: string, keyword: string): ReactNode {
  const key = keyword.trim();
  if (!key) {
    return text;
  }
  const lowerText = text.toLowerCase();
  const lowerKey = key.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  let index = lowerText.indexOf(lowerKey, cursor);
  while (index !== -1) {
    if (index > cursor) {
      parts.push(text.slice(cursor, index));
    }
    parts.push(
      <mark
        key={index}
        className="match-card__highlight rounded bg-accent-strong px-1 text-white transition-colors duration-200 group-hover:bg-action"
      >
        {text.slice(index, index + key.length)}
      </mark>,
    );
    cursor = index + key.length;
    index = lowerText.indexOf(lowerKey, cursor);
  }
  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }
  return parts.length ? parts : text;
}

interface MatchRowProps {
  match: SearchMatch;
  keyword: string;
  onSeek: (seconds: number) => void;
  video?: VideoRef | null;
  isPlaying: boolean;
}

const SHARE_COPIED_MS = 2000;

const DOWNLOAD_SPINNER =
  'h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700';

interface SegmentDownloadButtonProps {
  videoId: string;
  timestamp: string;
  showQuality: boolean;
}

/**
 * Download the video from this moment onward. The click opens the download
 * dialog with the start time pre-filled; while the fetch runs the same button
 * turns into a cancel control, and clicking it stops waiting for the file.
 *
 * Only YouTube exposes a quality ladder; for other sources the quality field
 * is hidden and the uploaded file is cut as-is.
 */
function SegmentDownloadButton({ videoId, timestamp, showQuality }: SegmentDownloadButtonProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { preparing, beginDownload, cancelDownload } = usePreparingDownload(timestamp);
  const label = preparing
    ? t('results.cancelDownload')
    : t('results.downloadMoment', { timestamp });
  const handleDownload = (
    startSeconds: number | null,
    endSeconds: number | null,
    height: number | null,
  ) => {
    setDialogOpen(false);
    beginDownload(videoDownloadUrl(videoId, startSeconds, endSeconds, height));
  };
  const handleClick = () => {
    if (preparing) {
      cancelDownload();
      return;
    }
    setDialogOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-busy={preparing || undefined}
        aria-label={label}
        title={label}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-action ${
          preparing
            ? 'cursor-pointer text-slate-400 hover:border-slate-300 hover:bg-white hover:text-danger'
            : 'text-slate-500 hover:border-slate-300 hover:bg-white hover:text-primary'
        }`}
      >
        {preparing ? (
          <span aria-hidden="true" className={DOWNLOAD_SPINNER} />
        ) : (
          <IconDownload size={16} />
        )}
      </button>
      {dialogOpen ? (
        <VideoDownloadDialog
          key={`${videoId}-${timestamp}`}
          videoId={videoId}
          showQuality={showQuality}
          initialStart={timestamp}
          onClose={() => setDialogOpen(false)}
          onDownload={handleDownload}
        />
      ) : null}
    </>
  );
}

interface ShareButtonProps {
  video: VideoRef;
  seconds: number;
  timestamp: string;
}

/** Share the moment as a qfza.app link, falling back to copying it. */
function ShareButton({ video, seconds, timestamp }: ShareButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);
  const url = buildShareUrl(video, seconds);
  const shareLabel = t('results.shareMoment', { timestamp });

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const handleShare = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url, title: shareLabel });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), SHARE_COPIED_MS);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={copied ? t('results.copied') : shareLabel}
      title={copied ? t('results.copied') : shareLabel}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-action ${
        copied
          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
          : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-primary'
      }`}
    >
      {copied ? <IconCheck size={16} /> : <IconShare size={16} />}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('results.copied') : ''}
      </span>
    </button>
  );
}

/**
 * One timestamped result. Memoized so a playback-status change re-renders only
 * the single row whose timestamp flips (rather than all 50), and so rows never
 * re-render (and never re-run `highlightKeyword`) on an unrelated progress/ETA
 * poll.
 */
const MatchRow = memo(function MatchRow({
  match,
  keyword,
  onSeek,
  video,
  isPlaying,
}: MatchRowProps) {
  const { t } = useTranslation();
  const snippet = match.text_snippet ?? keyword;
  const timestamp = formatYouTubeTime(match.progress_seconds);
  const highlighted = highlightKeyword(snippet, keyword);
  return (
    <li key={`${match.timestamp}-${match.progress_seconds}`}>
      <div className="group flex flex-col rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm @min-[36rem]/matches:flex-row @min-[36rem]/matches:items-stretch">
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-3 text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          onClick={() => onSeek(match.progress_seconds)}
          aria-label={t('results.seek', { timestamp, snippet })}
          // The row the player is parked on. The accent ring says so visually;
          // this says it to a screen reader, which otherwise hears the same
          // list of matches with no indication of where the video actually is.
          aria-current={isPlaying ? 'true' : undefined}
        >
          <span className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-action text-white shadow-sm transition-all duration-200 group-hover:scale-105 group-hover:bg-action/90 ${
                isPlaying ? 'ring-2 ring-accent ring-offset-1' : ''
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5.14v13.72L19 12 8 5.14z" />
              </svg>
            </span>
            <span
              className={`shrink-0 rounded-md px-2 py-1 text-sm font-bold tabular-nums ${
                isPlaying ? 'bg-action text-white' : 'bg-slate-100 text-slate-600'
              }`}
              dir="ltr"
            >
              {timestamp}
            </span>
          </span>
          <p
            className="match-card__snippet min-w-0 flex-1 text-start text-sm leading-relaxed text-slate-600 [overflow-wrap:anywhere] line-clamp-2"
            dir="auto"
          >
            {highlighted}
          </p>
        </button>
        {video ? (
          <div className="flex shrink-0 items-center gap-1.5 self-stretch p-2 max-sm:w-full max-sm:justify-end max-sm:border-t max-sm:border-slate-100 @min-[36rem]/matches:items-center @min-[36rem]/matches:border-s @min-[36rem]/matches:border-slate-100">
            <SegmentDownloadButton
              videoId={video.id}
              timestamp={timestamp}
              showQuality={video.source === 'youtube'}
            />
            <ShareButton video={video} seconds={match.progress_seconds} timestamp={timestamp} />
            {video.source === 'youtube' ? (
              <a
                href={buildWatchUrl(video, match.progress_seconds)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t('results.watchMoment', { timestamp })}
                title={t('results.watchOnYouTube')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-youtube transition-colors duration-200 hover:border-red-300 hover:bg-red-100 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-action"
              >
                <IconYouTube size={18} />
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
});

export const ResultsList = memo(function ResultsList({
  matches,
  keyword,
  noSpeech = false,
  onSeek,
  onClear,
  video,
  matchLimit = DEFAULT_MATCH_LIMIT,
  currentPlayingTimestamp,
  listLabel,
  showCount = true,
}: Props) {
  const { t } = useTranslation();
  const listLabelText = listLabel ?? t('results.listLabel', { keyword });
  const listId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const focusFrameRef = useRef<number | null>(null);
  const [expandedFor, setExpandedFor] = useState<{
    matches: SearchMatch[];
    keyword: string;
    video: Props['video'];
    matchLimit: number;
  } | null>(null);
  const expanded =
    expandedFor?.matches === matches &&
    expandedFor.keyword === keyword &&
    expandedFor.video === video &&
    expandedFor.matchLimit === matchLimit;
  const capped = matchLimit > 0 && matches.length > matchLimit;
  const maxVisible = capped && !expanded ? matchLimit : matches.length;
  const hiddenCount = matches.length - maxVisible;

  useEffect(
    () => () => {
      if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    },
    [matches, keyword, video, matchLimit],
  );

  const toggleExpanded = () => {
    setExpandedFor(expanded ? null : { matches, keyword, video, matchLimit });
    if (focusFrameRef.current !== null) cancelAnimationFrame(focusFrameRef.current);
    focusFrameRef.current = requestAnimationFrame(() => {
      focusFrameRef.current = null;
      // Start keyboard browsing at the newly revealed rows, not at the footer.
      const target = expanded
        ? toggleRef.current
        : listRef.current?.children[matchLimit]?.querySelector('button');
      target?.focus({ preventScroll: true });
      target?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    });
  };

  if (matches.length === 0) {
    return (
      <section
        className="flex flex-col items-center gap-3 py-8 text-center rtl:text-right"
        aria-label={listLabelText}
      >
        {noSpeech ? (
          <>
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            >
              <IconSearch size={20} />
            </span>
            <div className="max-w-sm space-y-1">
              <p className="-mt-1 text-sm text-slate-500 rtl:text-right">{t('results.noSpeech')}</p>
            </div>
          </>
        ) : (
          <>
            {showCount ? <MatchCountBadge count={matches.length} /> : null}
            <span
              aria-hidden="true"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500"
            >
              <IconSearch size={20} />
            </span>
            <div className="max-w-sm space-y-1">
              <p className="-mt-1 text-sm text-slate-500 rtl:text-right">{t('results.empty')}</p>
              <p className="text-xs text-muted rtl:text-right">{t('results.emptyHint')}</p>
            </div>
          </>
        )}
        {onClear ? (
          <button
            type="button"
            className="min-h-11 rounded-lg px-3 text-sm font-semibold text-primary transition-colors duration-200 hover:underline focus-visible:outline-2 focus-visible:outline-action"
            onClick={onClear}
          >
            {t('results.clearKeyword')}
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <section className="@container/matches" aria-label={listLabelText}>
      <div className="mb-3 flex flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2 rtl:text-right">
          {showCount ? <MatchCountBadge count={matches.length} /> : null}
          {capped ? (
            <span className="text-sm font-normal text-muted">
              {t('results.showing', { shown: maxVisible, total: matches.length })}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-slate-500 rtl:text-right">{t('results.hint')}</p>
      </div>
      <ol
        id={listId}
        ref={listRef}
        className="matches flex flex-col gap-4 lg:max-h-[60vh] lg:overflow-y-auto lg:pe-2"
      >
        {matches.slice(0, maxVisible).map((match) => (
          <MatchRow
            key={`${match.timestamp}-${match.progress_seconds}`}
            match={match}
            keyword={keyword}
            onSeek={onSeek}
            video={video}
            isPlaying={currentPlayingTimestamp === match.progress_seconds}
          />
        ))}
      </ol>
      {capped ? (
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          className="mt-3 min-h-11 rounded-lg px-2 text-sm font-semibold text-primary transition-colors duration-200 hover:underline focus-visible:outline-2 focus-visible:outline-action"
          onClick={toggleExpanded}
        >
          {expanded ? t('results.showLess') : t('results.showMore', { count: hiddenCount })}
        </button>
      ) : null}
    </section>
  );
});

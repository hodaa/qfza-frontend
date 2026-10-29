import { useEffect, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchVideoFormats } from '../api/client';
import { IconChevronDown } from './icons';
import { parseYouTubeTime } from '../utils/youtube';

interface Props {
  videoId: string;
  /** Only YouTube has selectable qualities; other sources hide the field. */
  showQuality: boolean;
  /** Pre-fill and lock the start field, e.g. from the row's timestamp. */
  initialStart?: string;
  onClose: () => void;
  onDownload: (
    startSeconds: number | null,
    endSeconds: number | null,
    height: number | null,
  ) => void;
}

const FIELD =
  'w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-1';

const SECONDARY =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2';

const PRIMARY =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-action px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2';

/** Name the translation key for why the two times cannot form a range. */
function rangeIssue(start: number | null, end: number | null): string | null {
  if ((start !== null && Number.isNaN(start)) || (end !== null && Number.isNaN(end))) {
    return 'results.segmentInvalid';
  }
  if (end !== null && start === null) {
    return 'results.segmentNeedsStart';
  }
  if (start !== null && end !== null && end <= start) {
    return 'results.segmentOrder';
  }
  return null;
}

/**
 * Ask how the download should be cut and what quality to fetch.
 *
 * Both time fields may stay empty, which means the whole video; the end may be
 * left empty on its own, which means "to the end". A dialog opened from a
 * moment's download button arrives with its start pre-filled and locked, so
 * the clip always begins where the user clicked. The problem with the entered
 * range, if any, is only surfaced after a submit so half-typed times are not
 * scolded while they are being typed. Qualities are only offered for YouTube,
 * where the server can probe the stream ladder; the field is hidden for Drive.
 */
export function VideoDownloadDialog({
  videoId,
  showQuality,
  initialStart,
  onClose,
  onDownload,
}: Props) {
  const { t } = useTranslation();
  const startLocked = initialStart !== undefined;
  const [startValue, setStartValue] = useState(initialStart ?? '');
  const [endValue, setEndValue] = useState('');
  const [showIssue, setShowIssue] = useState(false);
  const [heights, setHeights] = useState<number[] | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const start = parseYouTubeTime(startValue);
  const end = parseYouTubeTime(endValue);
  const issue = rangeIssue(start, end);

  useEffect(() => {
    if (!showQuality) {
      return;
    }
    let cancelled = false;
    fetchVideoFormats(videoId)
      .then((next) => {
        if (!cancelled) setHeights(next);
      })
      .catch(() => {
        // No choice to offer; the download falls back to the best stream.
        if (!cancelled) setHeights([]);
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, showQuality]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (issue) {
      setShowIssue(true);
      return;
    }
    onDownload(start, end, height);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-download-title"
        className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 id="video-download-title" className="text-base font-semibold text-slate-900">
          {t('results.downloadDialogTitle')}
        </h2>
        <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          {showQuality ? (
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
              {t('results.quality')}
              <div className="relative">
                <select
                  className={`${FIELD} peer appearance-none pe-10`}
                  value={height === null ? '' : String(height)}
                  disabled={heights === null || heights.length === 0}
                  onChange={(event) =>
                    setHeight(event.target.value === '' ? null : Number(event.target.value))
                  }
                >
                  <option value="">
                    {heights === null ? t('results.qualityLoading') : t('results.qualityBest')}
                  </option>
                  {(heights ?? []).map((value) => (
                    <option key={value} value={value}>
                      {value}p
                    </option>
                  ))}
                </select>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-slate-500 peer-disabled:text-slate-300"
                >
                  <IconChevronDown />
                </span>
              </div>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            {t('results.segmentStart')}
            <input
              autoFocus={!startLocked}
              className={`${FIELD} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`}
              dir="ltr"
              inputMode="numeric"
              placeholder="0:30"
              value={startValue}
              disabled={startLocked}
              onChange={(event) => setStartValue(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            {t('results.segmentEnd')}
            <input
              autoFocus={startLocked}
              className={FIELD}
              dir="ltr"
              inputMode="numeric"
              placeholder="1:15"
              value={endValue}
              onChange={(event) => setEndValue(event.target.value)}
            />
          </label>
          <p className="text-xs text-slate-500">{t('results.segmentHint')}</p>
          {showIssue && issue ? (
            <p role="alert" className="text-sm font-medium text-danger">
              {t(issue)}
            </p>
          ) : null}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className={SECONDARY} onClick={onClose}>
              {t('results.cancel')}
            </button>
            <button type="submit" className={PRIMARY}>
              {t('results.download')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

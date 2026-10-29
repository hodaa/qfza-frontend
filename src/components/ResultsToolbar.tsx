import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { videoDownloadUrl } from '../api/client';
import { usePreparingAction } from '../hooks/usePreparingAction';
import { usePreparingDownload } from '../hooks/usePreparingDownload';
import { usePreparingNotes } from '../hooks/usePreparingNotes';
import { IconBolt, IconFileText, IconVideo } from './icons';
import { VideoDownloadDialog } from './VideoDownloadDialog';

interface Props {
  transcriptUrl?: string;
  videoId?: string;
  showQuality: boolean;
  allowNotes?: boolean;
  transcriptReady?: boolean;
  ensureTranscript?: (signal: AbortSignal) => Promise<void>;
}

const BUTTON_BASE =
  'inline-flex min-h-11 max-w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold transition-all duration-200 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-100 @max-[36rem]/toolbar:w-full';

const BUTTON = `${BUTTON_BASE} text-slate-700`;

/** Pending download reads as a destructive action: the same click cancels it. */
const BUTTON_PENDING = `${BUTTON_BASE} text-danger`;

const SPINNER =
  'h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700';

/** Wrapping download actions and a status row below the headline. */
export function ResultsToolbar({
  transcriptUrl,
  videoId,
  showQuality,
  allowNotes = true,
  transcriptReady = true,
  ensureTranscript,
}: Props) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const {
    preparing: preparingVideo,
    beginDownload,
    cancelDownload: cancelVideoDownload,
  } = usePreparingDownload(videoId);
  const {
    preparing: preparingTranscript,
    failed: transcriptFailed,
    begin: beginTranscript,
    cancel: cancelTranscript,
  } = usePreparingAction(videoId ? `transcript:${videoId}` : undefined);
  const { preparingNotes, notesFailed, notesReady, beginNotes, regenerateNotes, cancelNotes } =
    usePreparingNotes(videoId, ensureTranscript);

  const handleVideoClick = () => {
    // Always the dialog, never a direct download: a click opens the quality
    // and section choices. While a download is being prepared the same click
    // cancels it instead.
    if (preparingVideo) {
      cancelVideoDownload();
      return;
    }
    setDialogOpen(true);
  };

  const handleTranscriptClick = () => {
    if (preparingTranscript) {
      cancelTranscript();
      return;
    }
    if (!transcriptUrl || !ensureTranscript) {
      return;
    }
    beginTranscript(async (signal) => {
      await ensureTranscript(signal);
      window.location.assign(transcriptUrl);
    });
  };

  const handleNotesClick = () => {
    if (preparingNotes) {
      cancelNotes();
      return;
    }
    beginNotes();
  };

  const handleDownloadSection = (
    startSeconds: number | null,
    endSeconds: number | null,
    height: number | null,
  ) => {
    if (!videoId) {
      return;
    }
    setDialogOpen(false);
    beginDownload(videoDownloadUrl(videoId, startSeconds, endSeconds, height));
  };

  return (
    <div className="@container/toolbar flex w-full min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {videoId ? (
          <button
            type="button"
            className={preparingVideo ? BUTTON_PENDING : BUTTON}
            aria-busy={preparingVideo || undefined}
            onClick={handleVideoClick}
          >
            {preparingVideo ? (
              <span aria-hidden="true" className={SPINNER} />
            ) : (
              <IconVideo size={16} />
            )}
            {preparingVideo ? t('results.cancelDownload') : t('results.downloadVideo')}
          </button>
        ) : null}
        {transcriptUrl && transcriptReady ? (
          <a className={BUTTON} href={transcriptUrl} download>
            <IconFileText />
            {t('results.downloadTranscript')}
          </a>
        ) : null}
        {transcriptUrl && !transcriptReady ? (
          <button
            type="button"
            className={preparingTranscript ? BUTTON_PENDING : BUTTON}
            aria-busy={preparingTranscript || undefined}
            onClick={handleTranscriptClick}
          >
            {preparingTranscript ? (
              <span aria-hidden="true" className={SPINNER} />
            ) : (
              <IconFileText />
            )}
            {preparingTranscript ? t('results.cancelTranscript') : t('results.prepareTranscript')}
          </button>
        ) : null}
        {videoId && allowNotes ? (
          <button
            type="button"
            className={preparingNotes ? BUTTON_PENDING : BUTTON}
            aria-busy={preparingNotes || undefined}
            onClick={handleNotesClick}
          >
            {preparingNotes ? (
              <span aria-hidden="true" className={SPINNER} />
            ) : (
              <IconBolt size={16} />
            )}
            {preparingNotes ? t('results.cancelNotes') : t('results.generateNotes')}
          </button>
        ) : null}
      </div>
      {preparingVideo ? (
        <p role="status" className="text-xs font-medium text-slate-500">
          {t('results.preparingVideoHint')}
        </p>
      ) : null}
      {preparingTranscript ? (
        <p role="status" className="text-xs font-medium text-slate-500">
          {t('results.preparingTranscriptHint')}
        </p>
      ) : null}
      {preparingNotes ? (
        <p role="status" className="text-xs font-medium text-slate-500">
          {transcriptReady ? t('results.preparingNotesHint') : t('results.preparingTranscriptHint')}
        </p>
      ) : null}
      {transcriptFailed && !preparingTranscript ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {t('results.transcriptFailed')}
        </p>
      ) : null}
      {notesFailed && !preparingNotes ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {t('results.notesFailed')}
        </p>
      ) : null}
      {notesReady && !preparingNotes ? (
        <p role="status" className="text-xs font-medium text-success">
          {t('results.notesReady')}{' '}
          <button
            type="button"
            className="font-semibold underline underline-offset-2 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
            onClick={regenerateNotes}
          >
            {t('results.regenerateNotes')}
          </button>
        </p>
      ) : null}
      {dialogOpen && videoId ? (
        <VideoDownloadDialog
          key={videoId}
          videoId={videoId}
          showQuality={showQuality}
          onClose={() => setDialogOpen(false)}
          onDownload={handleDownloadSection}
        />
      ) : null}
    </div>
  );
}

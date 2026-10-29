import { useTranslation } from 'react-i18next';
import { transcriptPdfUrl } from '../api/client';
import type { VideoPlayerHandle } from '../hooks/useYouTubePlayer';
import type { ResolvedVideo } from '../types';
import type { VideoRef } from '../utils/videoSources';
import { ResultsToolbar } from './ResultsToolbar';
import { VideoPlayer } from './VideoPlayer';

interface Props {
  video: VideoRef;
  resolved: ResolvedVideo | null;
  loading: boolean;
  loadError?: string;
  allowNotes: boolean;
  transcriptReady: boolean;
  ensureTranscript: (signal: AbortSignal) => Promise<void>;
  playerRef: React.Ref<VideoPlayerHandle>;
  sectionRef?: React.Ref<HTMLElement>;
  onPlaybackChange?: (seconds: number | null) => void;
}

/** The loaded video, its actions, and the transcript preparation affordance. */
export function VideoStage({
  video,
  resolved,
  loading,
  loadError,
  allowNotes,
  transcriptReady,
  ensureTranscript,
  playerRef,
  sectionRef,
  onPlaybackChange,
}: Props) {
  const { t } = useTranslation();

  return (
    <section
      ref={sectionRef}
      className="min-w-0 scroll-mt-6 lg:col-start-1 lg:row-start-1 lg:row-end-3 lg:grid lg:grid-rows-subgrid"
      aria-label={t('workspace.videoLabel')}
    >
      <div className="mb-3">
        {resolved ? (
          <ResultsToolbar
            transcriptUrl={transcriptPdfUrl(video.id)}
            videoId={video.id}
            showQuality={video.source === 'youtube'}
            allowNotes={allowNotes}
            transcriptReady={transcriptReady}
            ensureTranscript={ensureTranscript}
          />
        ) : (
          <p role="status" className="text-sm font-medium text-slate-500">
            {loading ? t('workspace.videoLoading') : t('workspace.actionsUnavailable')}
          </p>
        )}
      </div>
      <div className="min-w-0 lg:sticky lg:top-6 lg:self-start">
        <VideoPlayer ref={playerRef} video={video} onPlaybackChange={onPlaybackChange} />
        {loadError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {loadError}
          </p>
        ) : null}
      </div>
    </section>
  );
}

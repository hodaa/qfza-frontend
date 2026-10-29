import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SeekOptions, VideoPlayerHandle } from '../hooks/useYouTubePlayer';
import { useYouTubePlayer } from '../hooks/useYouTubePlayer';
import { formatYouTubeTime } from '../utils/youtube';
import { buildDrivePreviewUrl, buildDriveStreamUrl } from '../utils/videoSources';
import type { VideoRef } from '../utils/videoSources';
import { IconVideo } from './icons';
import { StatusCard } from './StatusCard';

interface Props {
  video: VideoRef;
  onPlaybackChange?: (seconds: number | null) => void;
}

const FRAME = 'relative aspect-video w-full overflow-hidden rounded-xl';

const PlayerInstance = forwardRef<VideoPlayerHandle, Props>(function PlayerInstance(
  { video, onPlaybackChange },
  ref,
) {
  const { t } = useTranslation();
  const [containerRef, handle, state] = useYouTubePlayer(video.id, onPlaybackChange);
  useImperativeHandle(ref, () => handle, [handle]);
  const { status, requestedTimestamp, playbackBlocked } = state;
  const timestamp = requestedTimestamp === null ? null : formatYouTubeTime(requestedTimestamp);
  const message =
    status === 'loading'
      ? timestamp
        ? t('player.loadingMoment', { timestamp })
        : t('player.loading')
      : status === 'unavailable'
        ? t('player.unavailableHint')
        : playbackBlocked
          ? t('player.playbackBlocked')
          : '';

  useEffect(() => {
    if (status === 'ready') {
      containerRef.current?.querySelector('iframe')?.setAttribute('title', t('player.title'));
    }
  }, [containerRef, status, t]);

  return (
    <div className="min-w-0">
      <div
        className={`${FRAME} ${
          status === 'ready' ? 'bg-black' : 'border border-slate-200 bg-slate-50'
        }`}
        aria-busy={status === 'loading'}
      >
        <div
          ref={containerRef}
          className={`absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full ${
            status === 'ready' ? '' : 'invisible'
          }`}
          aria-hidden={status !== 'ready' ? true : undefined}
        />
        {status === 'loading' ? (
          <div
            className="absolute inset-0 flex items-center justify-center p-4 sm:p-6"
            aria-hidden="true"
          >
            <div className="w-full max-w-sm">
              <StatusCard progress={null} skeleton />
            </div>
          </div>
        ) : status === 'unavailable' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-muted-strong">
            <IconVideo size={28} />
            <p className="text-sm font-semibold">{t('player.unavailable')}</p>
          </div>
        ) : null}
      </div>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={message ? 'mt-3 text-start text-sm text-muted' : 'sr-only'}
      >
        {message}
      </p>
    </div>
  );
});

const HAVE_METADATA = 1;

type DriveStatus = 'loading' | 'ready' | 'preview';

interface PendingSeek {
  seconds: number;
  autoplay: boolean;
}

/**
 * A Google Drive file played through its public media endpoint.
 *
 * The preview iframe has no seek API, so this uses a native video element and
 * Drive's Range-capable download URL. That gives the same handle as YouTube:
 * a result click jumps to the second and starts playback, while a shared
 * moment parks on the frame without playing.
 */
const DrivePlayer = forwardRef<VideoPlayerHandle, Props>(function DrivePlayer(
  { video, onPlaybackChange },
  ref,
) {
  const { t } = useTranslation();
  const mediaRef = useRef<HTMLVideoElement | null>(null);
  const pendingSeekRef = useRef<PendingSeek | null>(null);
  const parkedRef = useRef(false);
  const playbackChangeRef = useRef(onPlaybackChange);
  const [status, setStatus] = useState<DriveStatus>('loading');
  const [requestedTimestamp, setRequestedTimestamp] = useState<number | null>(null);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);

  useEffect(() => {
    playbackChangeRef.current = onPlaybackChange;
  }, [onPlaybackChange]);

  const applySeek = useCallback((seek: PendingSeek) => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = seek.seconds;
    parkedRef.current = !seek.autoplay;
    if (!seek.autoplay) {
      media.pause();
      playbackChangeRef.current?.(seek.seconds);
      return;
    }
    setPlaybackBlocked(false);
    try {
      const playback = media.play();
      if (playback && typeof playback.catch === 'function') {
        playback.catch(() => {
          setPlaybackBlocked(true);
          playbackChangeRef.current?.(null);
        });
      }
    } catch {
      setPlaybackBlocked(true);
      playbackChangeRef.current?.(null);
    }
  }, []);

  const seekTo = useCallback(
    (seconds: number, options?: SeekOptions) => {
      if (status === 'preview' || !Number.isFinite(seconds) || seconds < 0) return;
      const seek = { seconds, autoplay: options?.autoplay ?? true };
      pendingSeekRef.current = seek;
      setRequestedTimestamp(seconds);
      setPlaybackBlocked(false);
      // Selection is not proof of playback; only the playing event activates it.
      playbackChangeRef.current?.(null);
      const media = mediaRef.current;
      if (media && media.readyState >= HAVE_METADATA) applySeek(seek);
    },
    [applySeek, status],
  );

  useImperativeHandle(ref, () => ({ seekTo }), [seekTo]);

  const handleLoadedMetadata = () => {
    setStatus('ready');
    const seek = pendingSeekRef.current;
    if (seek) applySeek(seek);
  };

  const handlePlaying = () => {
    setPlaybackBlocked(false);
    const media = mediaRef.current;
    playbackChangeRef.current?.(media ? Math.floor(media.currentTime) : null);
  };

  const handleSeeked = () => {
    const media = mediaRef.current;
    if (!media || media.paused) return;
    playbackChangeRef.current?.(Math.floor(media.currentTime));
  };

  const handlePause = () => {
    if (parkedRef.current) {
      const seconds = pendingSeekRef.current?.seconds;
      if (seconds !== undefined) playbackChangeRef.current?.(seconds);
      return;
    }
    playbackChangeRef.current?.(null);
  };

  const handleError = () => {
    setStatus('preview');
    setRequestedTimestamp(null);
    setPlaybackBlocked(false);
    playbackChangeRef.current?.(null);
  };

  const timestamp = requestedTimestamp === null ? null : formatYouTubeTime(requestedTimestamp);
  const message =
    status === 'loading'
      ? timestamp
        ? t('player.loadingMoment', { timestamp })
        : t('player.loading')
      : status === 'preview'
        ? t('player.drivePreviewHint')
        : playbackBlocked
          ? t('player.drivePlaybackBlocked')
          : '';

  return (
    <div className="min-w-0">
      <div
        className={`${FRAME} ${
          status === 'loading' ? 'border border-slate-200 bg-slate-50' : 'bg-black'
        }`}
        aria-busy={status === 'loading'}
      >
        {status === 'preview' ? (
          <iframe
            src={buildDrivePreviewUrl(video.id)}
            title={t('player.title')}
            allow="autoplay; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full bg-black"
          />
        ) : (
          <video
            ref={mediaRef}
            src={buildDriveStreamUrl(video.id)}
            title={t('player.title')}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onPlaying={handlePlaying}
            onSeeked={handleSeeked}
            onPause={handlePause}
            onEnded={() => playbackChangeRef.current?.(null)}
            onError={handleError}
            className={`absolute inset-0 h-full w-full bg-black ${
              status === 'ready' ? '' : 'invisible'
            }`}
            aria-hidden={status !== 'ready' ? true : undefined}
          />
        )}
        {status === 'loading' ? (
          <div
            className="absolute inset-0 flex items-center justify-center p-4 sm:p-6"
            aria-hidden="true"
          >
            <div className="w-full max-w-sm">
              <StatusCard progress={null} skeleton />
            </div>
          </div>
        ) : null}
      </div>
      <p
        aria-live="polite"
        aria-atomic="true"
        className={message ? 'mt-3 text-start text-sm text-muted' : 'sr-only'}
      >
        {message}
      </p>
    </div>
  );
});

/** A new video gets a fresh player lifecycle, including loading and queued seeks. */
export const VideoPlayer = forwardRef<VideoPlayerHandle, Props>(function VideoPlayer(props, ref) {
  const key = `${props.video.source}:${props.video.id}`;
  if (props.video.source === 'drive') {
    return <DrivePlayer key={key} {...props} ref={ref} />;
  }
  return <PlayerInstance key={key} {...props} ref={ref} />;
});

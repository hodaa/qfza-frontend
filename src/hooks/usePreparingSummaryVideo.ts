import { saveSummaryVideo } from '../utils/download';
import { usePreparingAction } from './usePreparingAction';

/**
 * Track one in-flight highlight-video render and save the MP4 when ready.
 *
 * The server caches a ready render, so cancelling only stops this wait;
 * clicking again reuses the same MP4 instead of rendering it twice.
 * `ensureTranscript` runs first when the video has not been transcribed yet.
 */
export function usePreparingSummaryVideo(
  key: string | undefined,
  ensureTranscript?: (signal: AbortSignal) => Promise<void>,
) {
  const { preparing, failed, succeeded, begin, cancel } = usePreparingAction(key);

  const beginSummaryVideo = (regenerate = false) => {
    if (key === undefined) {
      return;
    }
    begin(async (signal) => {
      await ensureTranscript?.(signal);
      await saveSummaryVideo(key, signal, regenerate);
    });
  };

  return {
    preparingSummaryVideo: preparing,
    summaryVideoFailed: failed,
    summaryVideoReady: succeeded,
    beginSummaryVideo,
    regenerateSummaryVideo: () => beginSummaryVideo(true),
    cancelSummaryVideo: cancel,
  };
}

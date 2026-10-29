import { saveNotes } from '../utils/download';
import { usePreparingAction } from './usePreparingAction';

/**
 * Track one in-flight lecture-notes generation and save the PDF when ready.
 *
 * The server caches a ready PDF, so cancelling only stops this wait; clicking
 * again reuses the same generated document instead of running the AI twice.
 * `ensureTranscript` runs first when the video has not been transcribed yet.
 */
export function usePreparingNotes(
  key: string | undefined,
  ensureTranscript?: (signal: AbortSignal) => Promise<void>,
) {
  const { preparing, failed, succeeded, begin, cancel } = usePreparingAction(key);

  const beginNotes = (regenerate = false) => {
    if (key === undefined) {
      return;
    }
    begin(async (signal) => {
      await ensureTranscript?.(signal);
      await saveNotes(key, signal, regenerate);
    });
  };

  return {
    preparingNotes: preparing,
    notesFailed: failed,
    notesReady: succeeded,
    beginNotes,
    regenerateNotes: () => beginNotes(true),
    cancelNotes: cancel,
  };
}

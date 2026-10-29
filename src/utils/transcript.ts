import { fetchJobStatus, prepareVideo } from '../api/client';
import { sleep } from './async';

const PREPARE_POLL_MS = 2000;

/**
 * Ensure a video's transcript exists before a transcript-dependent action.
 *
 * Resolving a link only creates the video row; transcription is deliberately
 * deferred so the player and MP4 download work immediately. This queues the
 * job if needed and waits for it, rejecting if the job fails or is aborted.
 */
export async function ensureTranscript(youtubeId: string, signal?: AbortSignal): Promise<void> {
  const prepared = await prepareVideo(youtubeId, signal);
  if (prepared.status === 'ready' || prepared.job_id === null) {
    return;
  }
  await waitForJob(prepared.job_id, signal);
}

async function waitForJob(jobId: string, signal?: AbortSignal): Promise<void> {
  for (;;) {
    const status = await fetchJobStatus(jobId, signal);
    if (status.status === 'completed') {
      return;
    }
    if (status.status !== 'pending' && status.status !== 'processing') {
      throw new Error(status.error ?? 'Transcription failed');
    }
    await sleep(PREPARE_POLL_MS, signal);
  }
}

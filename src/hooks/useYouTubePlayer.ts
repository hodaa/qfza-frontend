import { useCallback, useEffect, useRef, useState } from 'react';

/** How a seek should land: start playing, or park the player on the frame. */
export interface SeekOptions {
  /**
   * `false` cues the video without calling play, so it sits paused on the exact
   * frame. Used when arriving on a saved moment, where the position itself is
   * the point and autoplay would carry the viewer past it.
   */
  autoplay?: boolean;
}

/** Handle to control an embedded YouTube player. */
export interface VideoPlayerHandle {
  /** Queue the latest seek while loading; request playback once ready. */
  seekTo(seconds: number, options?: SeekOptions): void;
}

interface PlayerState {
  status: 'loading' | 'ready' | 'unavailable';
  requestedTimestamp: number | null;
  playbackBlocked: boolean;
  embedRestricted: boolean;
}

const API_SCRIPT_ID = 'youtube-iframe-api';
const API_SCRIPT_URL = 'https://www.youtube.com/iframe_api';
const PLAYER_TIMEOUT_MS = 8000;

/** Share the API script, but give each waiting player cancellable listeners/timers. */
function whenYouTubeReady(signal: AbortSignal): Promise<YTNamespace> {
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  if (typeof window.YT?.Player === 'function') return Promise.resolve(window.YT);

  return new Promise((resolve, reject) => {
    let script = document.getElementById(API_SCRIPT_ID) as HTMLScriptElement | null;
    if (script?.dataset.loadFailed === 'true') {
      script.remove();
      script = null;
    }
    const existing = script !== null;
    script ??= document.createElement('script');
    const tag = script;
    tag.id = API_SCRIPT_ID;
    if (!existing) tag.src = API_SCRIPT_URL;
    let pollTimer: number | undefined;

    const cleanup = () => {
      window.clearTimeout(timeoutTimer);
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      tag.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onError = () => {
      tag.dataset.loadFailed = 'true';
      cleanup();
      reject(new Error('YouTube player API unavailable'));
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timeoutTimer = window.setTimeout(onError, PLAYER_TIMEOUT_MS);
    const poll = () => {
      if (typeof window.YT?.Player === 'function') {
        cleanup();
        resolve(window.YT);
      } else {
        pollTimer = window.setTimeout(poll, 50);
      }
    };
    tag.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    if (!existing) document.head.appendChild(tag);
    poll();
  });
}

export function useYouTubePlayer(
  videoId: string,
  onPlaybackChange?: (seconds: number | null) => void,
): [React.RefObject<HTMLDivElement | null>, VideoPlayerHandle, PlayerState] {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestSeekRef = useRef<(seconds: number, options?: SeekOptions) => void>(() => {});
  const playbackChangeRef = useRef(onPlaybackChange);
  const [state, setState] = useState<PlayerState>({
    status: 'loading',
    requestedTimestamp: null,
    playbackBlocked: false,
    embedRestricted: false,
  });

  useEffect(() => {
    playbackChangeRef.current = onPlaybackChange;
  }, [onPlaybackChange]);

  useEffect(() => {
    const controller = new AbortController();
    const container = containerRef.current;
    let player: YTPlayer | null = null;
    let ready = false;
    let failed = false;
    let requestedTimestamp: number | null = null;
    let requestedAutoplay = true;
    let readyTimer: number | undefined;

    const destroy = () => {
      try {
        player?.destroy();
      } catch {
        // A partially initialized third-party player can also fail to destroy.
      }
      player = null;
      container?.replaceChildren();
    };
    const fail = (embedRestricted = false) => {
      if (controller.signal.aborted || failed) return;
      failed = true;
      ready = false;
      window.clearTimeout(readyTimer);
      setState((current) => ({
        ...current,
        status: 'unavailable',
        playbackBlocked: false,
        embedRestricted,
      }));
      playbackChangeRef.current?.(null);
      destroy();
    };
    const playRequestedMoment = () => {
      if (!ready || !player || requestedTimestamp === null) return;
      try {
        player.seekTo(requestedTimestamp, true);
        if (requestedAutoplay) {
          player.playVideo();
        } else {
          // Parked, not playing: the player is nevertheless sitting on this
          // moment, so report it as the current position. Without this the
          // cue would read as "no position" and nothing would be marked active.
          playbackChangeRef.current?.(requestedTimestamp);
        }
      } catch {
        fail();
      }
    };

    requestSeekRef.current = (seconds, options) => {
      if (controller.signal.aborted) return;
      requestedTimestamp = seconds;
      requestedAutoplay = options?.autoplay ?? true;
      setState((current) => ({ ...current, requestedTimestamp: seconds, playbackBlocked: false }));
      // Selection is not proof of playback. Only the player's PLAYING event
      // activates the match; failures/blocked autoplay leave it unselected.
      playbackChangeRef.current?.(null);
      playRequestedMoment();
    };

    const initialize = async () => {
      const YT = await whenYouTubeReady(controller.signal);
      if (controller.signal.aborted || !container) return;
      // YouTube replaces its target element. Keep the React-owned wrapper intact.
      const mount = document.createElement('div');
      container.replaceChildren(mount);
      readyTimer = window.setTimeout(fail, PLAYER_TIMEOUT_MS);
      player = new YT.Player(mount, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: ({ target }) => {
            if (controller.signal.aborted || failed) return;
            window.clearTimeout(readyTimer);
            player = target;
            ready = true;
            setState((current) => ({ ...current, status: 'ready' }));
            playRequestedMoment();
          },
          onError: ({ data }) => fail(data === 101 || data === 150),
          onStateChange: ({ data }) => {
            if (controller.signal.aborted || failed) return;
            if (data === 1) {
              setState((current) => ({ ...current, playbackBlocked: false }));
              playbackChangeRef.current?.(requestedTimestamp);
            } else {
              playbackChangeRef.current?.(null);
            }
          },
          onAutoplayBlocked: () => {
            if (controller.signal.aborted || failed) return;
            setState((current) => ({ ...current, playbackBlocked: true }));
            playbackChangeRef.current?.(null);
          },
        },
      });
    };
    void initialize().catch(() => fail());

    return () => {
      controller.abort();
      requestSeekRef.current = () => {};
      window.clearTimeout(readyTimer);
      destroy();
    };
  }, [videoId]);

  const seekTo = useCallback((seconds: number, options?: SeekOptions) => {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    requestSeekRef.current(seconds, options);
  }, []);

  return [containerRef, { seekTo }, state];
}

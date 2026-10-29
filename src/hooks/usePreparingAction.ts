import { useEffect, useRef, useState } from 'react';

// A hung request would otherwise lock a button forever, so the pending state
// also expires on its own; the server's own preparation timeout is 10 minutes.
const PREPARE_RESET_MS = 11 * 60 * 1000;

type Action = (signal: AbortSignal) => Promise<void>;

/**
 * Track one in-flight preparation and re-arm its button when it settles.
 *
 * `key` names the action - the video for the toolbar, the moment for a row
 * button - and the pending state never survives a change of key, so switching
 * videos re-arms the button on its own. The button also re-arms as soon as the
 * action succeeds, fails, or is cancelled, so a retry is one click away.
 */
export function usePreparingAction(key: string | undefined) {
  const [preparingFor, setPreparingFor] = useState<string | null>(null);
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [succeededFor, setSucceededFor] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const preparing = preparingFor !== null && preparingFor === key;
  const failed = failedFor !== null && failedFor === key;
  const succeeded = succeededFor !== null && succeededFor === key;

  useEffect(() => {
    if (!preparing) {
      return undefined;
    }
    const timer = setTimeout(() => setPreparingFor(null), PREPARE_RESET_MS);
    return () => clearTimeout(timer);
  }, [preparing]);

  const begin = (action: Action) => {
    if (key === undefined) {
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    setFailedFor(null);
    setSucceededFor(null);
    setPreparingFor(key);
    void action(controller.signal)
      .then(() => {
        if (!controller.signal.aborted) {
          setSucceededFor(key);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailedFor(key);
        }
      })
      .finally(() => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }
        setPreparingFor((current) => (current === key ? null : current));
      });
  };

  /** Stop waiting for the in-flight action and re-arm the button. */
  const cancel = () => {
    controllerRef.current?.abort();
  };

  return { preparing, failed, succeeded, begin, cancel };
}

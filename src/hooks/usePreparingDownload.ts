import { saveDownload } from '../utils/download';
import { usePreparingAction } from './usePreparingAction';

/**
 * Track one in-flight download and save it without leaving the page.
 *
 * `key` names the download - the video for the toolbar, the moment for a row
 * button - and the pending state never survives a change of key, so switching
 * videos re-arms the button on its own.
 */
export function usePreparingDownload(key: string | undefined) {
  const { preparing, begin, cancel } = usePreparingAction(key);

  const beginDownload = (url: string) => {
    begin((signal) => saveDownload(url, signal));
  };

  return { preparing, beginDownload, cancelDownload: cancel };
}

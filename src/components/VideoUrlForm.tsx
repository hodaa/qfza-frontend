import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguage } from '../i18n';
import { fieldStateClass } from '../utils/fieldStyles';
import {
  WORKSPACE_COMPACT_BAR,
  WORKSPACE_COMPACT_ROW,
  WORKSPACE_COMPACT_SUBMIT,
  WORKSPACE_HERO_BAR,
  WORKSPACE_HERO_INPUT,
  WORKSPACE_HERO_RAIL_BUTTON,
  WORKSPACE_HERO_SUBMIT,
  WORKSPACE_INPUT,
  WORKSPACE_RAIL_BUTTON,
  WORKSPACE_ROW,
} from '../utils/workspaceFormStyles';
import { inspectVideoUrl } from '../utils/videoSources';
import type { VideoUrlIssue } from '../utils/videoSources';
import { IconAlert, IconClipboard, IconPlay, IconVideo, IconX } from './icons';

interface Props {
  onSubmit: (url: string) => void;
  disabled?: boolean;
  initialUrl?: string;
  compact?: boolean;
}

type UrlError = 'required' | VideoUrlIssue;

const URL_ERROR_KEY: Record<UrlError, string> = {
  required: 'error.urlRequired',
  invalid: 'error.invalidUrl',
  unsupportedSource: 'error.unsupportedSource',
  unsupportedFormat: 'error.unsupportedFormat',
};

function validateUrl(value: string): UrlError | null {
  const clean = value.trim();
  if (!clean) return 'required';
  return inspectVideoUrl(clean).issue;
}

/** URL-first entry point: paste a link and open its video workspace. */
export function VideoUrlForm({
  onSubmit,
  disabled = false,
  initialUrl = '',
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const isRtl = getLanguage() === 'ar';
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<UrlError | null>(null);
  const [pasteFailed, setPasteFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const barClass = compact ? WORKSPACE_COMPACT_BAR : WORKSPACE_HERO_BAR;
  const inputClass = compact ? WORKSPACE_INPUT : WORKSPACE_HERO_INPUT;
  const submitClass = compact ? WORKSPACE_COMPACT_SUBMIT : WORKSPACE_HERO_SUBMIT;
  const railClass = compact ? WORKSPACE_RAIL_BUTTON : WORKSPACE_HERO_RAIL_BUTTON;
  const pasteClass = `${railClass} bg-accent/10 text-accent-strong hover:bg-accent/20`;
  const iconSize = compact ? 18 : 20;
  const submitIconSize = compact ? 16 : 18;
  const spinnerClass = compact ? 'h-4 w-4' : 'h-5 w-5';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextError = validateUrl(url);
    setError(nextError);
    if (nextError) {
      inputRef.current?.focus();
      return;
    }
    onSubmit(url.trim());
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
      setError(text.trim() ? validateUrl(text) : 'required');
      setPasteFailed(false);
    } catch {
      setPasteFailed(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <>
      <form
        noValidate
        onSubmit={handleSubmit}
        className={`${barClass} ${compact ? '' : 'mx-auto max-w-4xl'}`}
      >
        <div className={compact ? WORKSPACE_COMPACT_ROW : WORKSPACE_ROW}>
          <label
            htmlFor="video-url"
            className={compact ? 'sr-only' : 'shrink-0 text-sm font-bold text-slate-800 sm:sr-only'}
          >
            {t('form.urlLabel')}
          </label>
          <div className="relative min-w-0 flex-1">
            <span
              className={`pointer-events-none absolute inset-y-0 start-3 flex items-center ${
                error ? 'text-danger' : 'text-slate-500'
              }`}
            >
              {error ? <IconAlert size={iconSize} /> : <IconVideo size={iconSize} />}
            </span>
            <input
              ref={inputRef}
              id="video-url"
              type="url"
              inputMode="url"
              dir={isRtl ? 'rtl' : 'ltr'}
              autoComplete="url"
              spellCheck={false}
              value={url}
              disabled={disabled}
              placeholder={t('workspace.urlPlaceholder')}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'video-url-error' : undefined}
              onChange={(event) => {
                setUrl(event.target.value);
                setPasteFailed(false);
                if (error) setError(validateUrl(event.target.value));
              }}
              className={`${inputClass} pe-24 ${
                isRtl ? 'text-right placeholder:text-right' : 'text-left placeholder:text-left'
              } ${fieldStateClass(Boolean(error))}`}
            />
            <div className="absolute inset-y-0 end-1 flex items-center gap-0.5">
              <button
                type="button"
                className={pasteClass}
                onClick={handlePaste}
                disabled={disabled}
                aria-label={t('form.paste')}
                title={t('form.pasteTooltip')}
              >
                <IconClipboard size={iconSize} />
              </button>
              {url ? (
                <button
                  type="button"
                  className={railClass}
                  onClick={() => {
                    setUrl('');
                    setError(null);
                    inputRef.current?.focus();
                  }}
                  disabled={disabled}
                  aria-label={t('form.clearUrl')}
                >
                  <IconX size={iconSize} />
                </button>
              ) : null}
            </div>
          </div>
          <button
            type="submit"
            disabled={disabled}
            className={`${submitClass} disabled:cursor-not-allowed`}
          >
            {disabled ? (
              <span
                aria-hidden="true"
                className={`${spinnerClass} animate-spin rounded-full border-2 border-white/40 border-t-white`}
              />
            ) : (
              <IconPlay size={submitIconSize} />
            )}
            {disabled ? t('workspace.loading') : t('workspace.load')}
          </button>
        </div>
        {error ? (
          <p
            id="video-url-error"
            role="alert"
            className="mt-2 flex items-start gap-1.5 px-1 text-sm font-medium text-danger"
          >
            <span className="mt-0.5 shrink-0" aria-hidden="true">
              <IconAlert size={14} />
            </span>
            {t(URL_ERROR_KEY[error])}
          </p>
        ) : null}
        {pasteFailed ? (
          <p role="alert" className="mt-2 px-1 text-sm font-medium text-warning">
            {t('form.pasteBlocked')}
          </p>
        ) : null}
      </form>
      {!compact ? (
        <div className="mx-auto mt-2.5 w-full max-w-4xl px-1 text-xs leading-relaxed">
          <p className="text-muted">{t('form.landingHelper')}</p>
        </div>
      ) : null}
    </>
  );
}

import { useImperativeHandle, useRef, useState } from 'react';
import type { FormEvent, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguage } from '../i18n';
import { fieldStateClass } from '../utils/fieldStyles';
import {
  WORKSPACE_BAR,
  WORKSPACE_INPUT,
  WORKSPACE_ROW,
  WORKSPACE_SUBMIT,
} from '../utils/workspaceFormStyles';
import { IconAlert, IconSearch, IconX } from './icons';

export interface KeywordSearchFormHandle {
  /** Replace the phrase from outside the form (replay, clear, new video). */
  setKeyword(value: string): void;
  /** Read the phrase currently in the field, before it is submitted. */
  getKeyword(): string;
  /** Return to the phrase field, optionally clearing it. */
  focus(clear?: boolean): void;
  /** Submit the current phrase through the form's validation. */
  submit(): void;
}

interface Props {
  ref?: Ref<KeywordSearchFormHandle>;
  onSubmit: (keyword: string) => void;
  disabled?: boolean;
  disabledHint?: string;
  initialKeyword?: string;
}

/** Always-visible keyword search that sits beside the loaded video. */
export function KeywordSearchForm({
  ref,
  onSubmit,
  disabled = false,
  disabledHint,
  initialKeyword = '',
}: Props) {
  const { t } = useTranslation();
  const isRtl = getLanguage() === 'ar';
  const [keyword, setKeyword] = useState(initialKeyword);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      setKeyword(value: string) {
        setKeyword(value);
        setError(false);
      },
      getKeyword() {
        return keyword;
      },
      focus(clear = false) {
        if (clear) {
          setKeyword('');
          setError(false);
        }
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
      },
      submit() {
        formRef.current?.requestSubmit();
      },
    }),
    [keyword],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = keyword.trim();
    if (!clean) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    setError(false);
    onSubmit(clean);
  };

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className={WORKSPACE_BAR}
    >
      <div className={WORKSPACE_ROW}>
        <label
          htmlFor="video-keyword"
          className="shrink-0 text-sm font-bold text-slate-800 sm:sr-only"
        >
          {t('workspace.searchLabel')}
        </label>
        <div className="relative min-w-0 flex-1">
          <span
            className={`pointer-events-none absolute inset-y-0 start-3 flex items-center ${
              error ? 'text-danger' : 'text-slate-500'
            }`}
          >
            {error ? <IconAlert size={18} /> : <IconSearch size={18} />}
          </span>
          <input
            ref={inputRef}
            id="video-keyword"
            type="search"
            dir={isRtl ? 'rtl' : 'auto'}
            value={keyword}
            disabled={disabled}
            placeholder={t('workspace.searchPlaceholder')}
            aria-invalid={error || undefined}
            aria-describedby={
              error
                ? 'video-keyword-error'
                : disabled && disabledHint
                  ? 'video-keyword-disabled-hint'
                  : undefined
            }
            onChange={(event) => {
              setKeyword(event.target.value);
              if (error) setError(!event.target.value.trim());
            }}
            className={`${WORKSPACE_INPUT} pe-11 ${
              isRtl ? 'text-right placeholder:text-right' : 'placeholder:text-left'
            } ${fieldStateClass(error)}`}
          />
          {keyword ? (
            <button
              type="button"
              onClick={() => {
                setKeyword('');
                setError(false);
                inputRef.current?.focus();
              }}
              disabled={disabled}
              aria-label={t('form.clearKeywordField')}
              className="absolute inset-y-0 end-0.5 my-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-40"
            >
              <IconX size={18} />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={disabled}
          className={`${WORKSPACE_SUBMIT} disabled:cursor-wait`}
        >
          {disabled ? (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          ) : (
            <IconSearch size={16} />
          )}
          {disabled ? t('workspace.searching') : t('workspace.search')}
        </button>
      </div>
      {error ? (
        <p
          id="video-keyword-error"
          role="alert"
          className="mt-2 flex items-start gap-1.5 px-1 text-sm font-medium text-danger"
        >
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            <IconAlert size={14} />
          </span>
          {t('error.keywordRequired')}
        </p>
      ) : null}
      {disabled && !error && disabledHint ? (
        <p id="video-keyword-disabled-hint" className="mt-2 px-1 text-sm text-muted">
          {disabledHint}
        </p>
      ) : null}
    </form>
  );
}

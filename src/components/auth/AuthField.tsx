import { useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { IconAlert, IconEye, IconEyeOff } from '../icons';

/**
 * Shared field plumbing for the auth forms.
 *
 * Errors are untranslated codes resolved with `t()` at render time, so a message
 * already on screen re-renders in the other language when the visitor switches.
 * A code baked into state instead would stay in the language it was created in.
 */
export interface FieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  icon?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  hint?: string;
}

/** A labelled input with a 44px-tall touch target and an attached error. */
export function AuthField({
  id,
  label,
  value,
  onChange,
  error,
  type = 'text',
  autoComplete,
  placeholder,
  required = true,
  icon,
  inputRef,
  hint,
}: FieldProps) {
  const { t } = useTranslation();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-muted-strong">
        {label}
      </label>
      <div className="relative mt-1.5">
        {icon ? (
          <span className="pointer-events-none absolute inset-y-0 start-0 flex w-11 items-center justify-center text-muted">
            {icon}
          </span>
        ) : null}
        <input
          id={id}
          ref={inputRef}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`w-full rounded-lg border px-3.5 py-2.5 text-base text-slate-900 placeholder:text-slate-500 transition-colors duration-200 focus:bg-white focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
            icon ? 'ps-11' : ''
          } ${isPassword ? 'pe-11' : ''} ${
            error
              ? 'border-danger bg-danger-soft focus:border-danger focus:ring-danger'
              : 'border-slate-200 bg-slate-50 focus:border-action focus:ring-action'
          }`}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={t(revealed ? 'auth.fields.hidePassword' : 'auth.fields.showPassword')}
            aria-pressed={revealed}
            className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-lg text-muted transition-colors duration-200 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
          >
            {revealed ? <IconEyeOff size={18} /> : <IconEye size={18} />}
          </button>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-danger"
          role="alert"
        >
          <IconAlert size={16} />
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level failure, e.g. wrong password. Kept out of the field errors. */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger"
    >
      <IconAlert size={18} />
      <span>{message}</span>
    </div>
  );
}

/** Confirmation panel shown after a request succeeds. */
export function AuthNotice({ tone, children }: { tone: 'success' | 'info'; children: ReactNode }) {
  const styles =
    tone === 'success'
      ? 'border-success/40 bg-success-soft text-success'
      : 'border-action/30 bg-action/5 text-muted-strong';
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm ${styles}`}>
      <IconAlert size={18} />
      <span>{children}</span>
    </div>
  );
}

/**
 * Primary submit button with a busy state that keeps its width.
 *
 * Carries the search button's own treatment — bold weight, raised shadow, a
 * press-scale on activation and a wide focus ring — so the form's main action
 * has the same weight as the homepage's main action. `aria-busy` is what
 * announces the state; the label swap alone is invisible to a screen reader.
 */
export function SubmitButton({ pending, children }: { pending: boolean; children: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-lg bg-action px-5 py-3.5 text-base font-bold text-white shadow-lg transition-all duration-200 hover:bg-action-hover hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <>
          <span
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/50 border-t-white"
            aria-hidden="true"
          />
          {t('auth.working')}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/** Divider with "or" between the password form and the Google button. */
export function OrDivider() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{t('auth.or')}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Page header + form card shared by the credential pages.
 *
 * Shaped like the homepage's other sub-pages rather than as a standalone
 * product: an accent icon, the `section-title` heading with its orange bar, a
 * lead line, then the form in a card wearing the search panel's own treatment
 * (same radius, ring, shadow and entrance animation). An auth screen that
 * looked like a different site is exactly what this replaces — a visitor
 * following a "sign in" link from the header should not feel they've left.
 *
 * The card is capped at `max-w-xl` even though the search panel is `max-w-2xl`:
 * two inputs centred in 42rem of whitespace read as broken, not generous.
 */

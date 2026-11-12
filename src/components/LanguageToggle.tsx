import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguage, setLanguage } from '../i18n';
import type { Language } from '../i18n';
import { localizedStaticPath } from '../routes';

const OPTIONS: Array<{ value: Language; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
];

function GlobeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8" />
      <path d="M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

/** Globe dropdown that switches the UI between Arabic and English. */
export function LanguageToggle() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = getLanguage() === 'ar' ? 'ar' : 'en';
  const currentIndex = OPTIONS.findIndex((option) => option.value === current);
  const currentLabel = OPTIONS[currentIndex]?.label ?? 'English';
  const isArabic = current === 'ar';

  const focusOption = (index: number) => {
    optionRefs.current[index]?.focus();
  };

  useEffect(() => {
    if (open) {
      focusOption(currentIndex);
    }
  }, [open, currentIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const select = (value: Language, returnFocus = true) => {
    // On a generated page the two locales are separate documents, so switching
    // language is a real navigation. Flipping it in place would put Arabic chrome
    // around copy that was baked into the HTML at build time, and would leave the
    // page's own metadata (which deliberately ignores in-app language changes)
    // describing a language the visitor is no longer reading.
    const counterpart = localizedStaticPath(window.location.pathname, value);
    if (counterpart && counterpart !== window.location.pathname) {
      window.location.assign(counterpart);
      return;
    }
    setLanguage(value);
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
    }
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      next = (index + 1) % OPTIONS.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      next = (index - 1 + OPTIONS.length) % OPTIONS.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = OPTIONS.length - 1;
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (next !== index) {
      event.preventDefault();
      focusOption(next);
    }
  };

  const optionId = (value: Language) => `lang-option-${value}`;

  return (
    <>
      <div
        role="group"
        aria-label={t('actions.languageSelector')}
        dir="ltr"
        className="inline-flex h-12 items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 p-0.5 sm:hidden"
      >
        {OPTIONS.map((option) => {
          const selected = option.value === current;
          return (
            <button
              key={option.value}
              type="button"
              lang={option.value}
              dir={option.value === 'ar' ? 'rtl' : 'ltr'}
              aria-label={option.label}
              aria-pressed={selected}
              className={`inline-flex min-h-11 min-w-10 items-center justify-center rounded-full px-2.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action max-[360px]:min-w-8 max-[360px]:px-1.5 ${
                selected
                  ? 'bg-action text-white shadow-sm'
                  : 'text-primary hover:bg-white'
              }`}
              onClick={() => {
                if (!selected) select(option.value, false);
              }}
            >
              {option.value === 'en' ? 'EN' : 'عربي'}
            </button>
          );
        })}
      </div>

      <div
        ref={rootRef}
        className="relative hidden sm:inline-block"
        onBlur={(event) => {
          if (
            event.relatedTarget === triggerRef.current ||
            !event.currentTarget.contains(event.relatedTarget)
          ) {
            setOpen(false);
          }
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-action"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('actions.languageSelector')}
          aria-controls={open ? 'language-listbox' : undefined}
          onClick={() => setOpen((value) => !value)}
          onKeyDown={handleTriggerKeyDown}
        >
          {isArabic ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          ) : null}
          <GlobeIcon />
          <span className="text-primary">{currentLabel}</span>
          {!isArabic ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          ) : null}
        </button>

        {open ? (
          <ul
            id="language-listbox"
            role="listbox"
            aria-label={t('actions.languageSelector')}
            className="absolute end-0 z-10 mt-2 min-w-44 rounded-xl border border-slate-200 bg-white shadow-lg"
          >
            {OPTIONS.map((option, index) => {
              const selected = option.value === current;
              return (
                <li key={option.value} role="presentation">
                  <button
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    id={optionId(option.value)}
                    aria-selected={selected}
                    aria-current={selected}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-sm font-semibold transition-colors duration-150 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action ${
                      selected ? 'text-primary' : 'text-slate-700'
                    }`}
                    onClick={() => select(option.value)}
                    onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  >
                    <span
                      lang={option.value}
                      dir={option.value === 'ar' ? 'rtl' : 'ltr'}
                      className={option.value === 'ar' ? 'u-ar-font' : undefined}
                    >
                      {option.label}
                    </span>
                    {selected ? (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="h-4 w-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </>
  );
}

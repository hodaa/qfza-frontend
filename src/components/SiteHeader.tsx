import { memo } from 'react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AccountMenu } from './auth/AccountMenu';
import { LanguageToggle } from './LanguageToggle';
import { RouteLink } from './RouteLink';
import { getLanguage } from '../i18n';

const NAV_LINK =
  'inline-flex min-h-11 items-center rounded-md px-2.5 py-1.5 text-sm font-semibold whitespace-nowrap text-primary transition-colors duration-200 hover:bg-slate-100 hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action sm:min-h-0';

function Logo({ onActivate }: { onActivate?: () => void }) {
  const { t } = useTranslation();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    onActivate?.();
  };

  return (
    <RouteLink
      to="home"
      onClick={handleClick}
      className="order-1 flex shrink-0 items-center rounded-lg transition-transform duration-200 hover:scale-[1.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-action sm:justify-self-start"
      aria-label={t('nav.home')}
    >
      <img
        className="h-10 w-auto object-contain sm:h-12"
        src={getLanguage() === 'ar' ? '/logo.svg' : '/logo-en.svg?v=icon-left'}
        alt={t('app.logoAlt')}
        width="124"
        height="48"
      />
    </RouteLink>
  );
}

/**
 * Site header.
 *
 * Mobile (< sm): logo and language switcher share the first row (the switcher
 * is pushed to the inline end); when the row is too narrow for the account
 * control to sit beside the switcher it wraps onto its own line rather than
 * squeezing the two buttons, and the marketing links take a third row.
 * sm and up: a `1fr auto 1fr` grid — logo track, nav track, switcher track.
 * The two outer tracks are equal, so the nav sits dead centre with the same
 * breathing room on both sides. That replaces the old `ms-auto` +
 * `justify-between` combination, which dumped every leftover pixel into one
 * void between the logo and the links. `1fr` also keeps a min-content floor, so
 * the long Arabic labels can never squeeze the logo or the switcher.
 */
export const SiteHeader = memo(function SiteHeader({
  onLogoClick,
}: {
  onLogoClick?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-slate-200 pb-3 sm:mb-8 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-y-0 sm:pb-4">
      <Logo onActivate={onLogoClick} />
      <nav
        className="order-3 flex w-full items-center justify-center gap-x-8 border-t border-slate-100 pt-3 sm:order-2 sm:w-auto sm:gap-x-6 sm:border-0 sm:pt-0"
        aria-label={t('nav.primary')}
      >
        <a className={NAV_LINK} href="/#how-it-works">
          {t('nav.howItWorks')}
        </a>
        <a className={NAV_LINK} href="/#why-qfza">
          {t('nav.whyQfza')}
        </a>
      </nav>
      <div className="order-2 flex flex-1 flex-wrap items-center justify-end gap-3 sm:order-3 sm:flex-none sm:justify-self-end">
        <LanguageToggle />
        <AccountMenu />
      </div>
    </header>
  );
});

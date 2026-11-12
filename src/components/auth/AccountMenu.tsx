import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { navigate } from '../../hooks/useRoute';
import { displayName } from '../../utils/displayName';
import { IconHistory, IconLock, IconUser } from '../icons';
import { RouteLink } from '../RouteLink';

/**
 * Header account control.
 *
 * Shows one of two things: a Sign in link, or the signed-in address with a
 * menu to reach history and sign out. The Sign in link paints with the rest
 * of the header: the session check runs at the top of the tree and may swap
 * the link for the account menu a moment later, because a signed-in visitor
 * seeing "Sign in" for the milliseconds the check takes is less noticeable
 * than the header arriving with its control missing.
 */
export const AccountMenu = memo(function AccountMenu() {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Signing out from anywhere must not leave the menu latched open on a link
  // that no longer exists.
  useEffect(() => {
    if (!user) setOpen(false);
  }, [user]);

  useEffect(() => {
    if (open) itemRefs.current[0]?.focus();
  }, [open]);

  const handleItemKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const last = itemRefs.current.length - 1;
    let next = index;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      next = index >= last ? 0 : index + 1;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      next = index <= 0 ? last : index - 1;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    } else {
      return;
    }
    event.preventDefault();
    itemRefs.current[next]?.focus();
  };

  if (!user) {
    return (
      <RouteLink
        to="login"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-primary shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-action sm:gap-2 sm:px-4 sm:text-sm max-[360px]:px-2"
      >
        <span className="max-[360px]:hidden">
          <IconLock size={16} />
        </span>
        {t('auth.nav.signIn')}
      </RouteLink>
    );
  }

  // Resolved once here so the trigger, the menu header, and both aria-labels
  // can never disagree about who is signed in.
  const label = displayName(user);

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
    navigate('home');
  };

  const goToHistory = () => {
    setOpen(false);
    navigate('history');
  };

  const goToProfile = () => {
    setOpen(false);
    navigate('profile');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('auth.nav.accountMenu', { name: label })}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-primary shadow-sm transition-all duration-200 hover:border-slate-300 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-action sm:gap-2 sm:px-3 sm:text-sm max-[360px]:px-2"
      >
        <span className="max-[360px]:hidden">
          <IconUser size={16} />
        </span>
        <span className="hidden max-w-[10rem] truncate sm:inline max-[360px]:text-xs">
          {label}
        </span>
        <span className="sm:hidden max-[360px]:text-xs">{t('auth.nav.account')}</span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label={t('auth.nav.accountMenu', { name: label })}
          className="absolute end-0 z-10 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <div className="px-3 py-2" dir="auto">
            <p className="truncate text-sm font-semibold text-slate-700">{label}</p>
            {user.full_name ? (
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            ) : null}
          </div>
          <button
            ref={(node) => {
              itemRefs.current[0] = node;
            }}
            type="button"
            role="menuitem"
            onClick={goToProfile}
            onKeyDown={(event) => handleItemKeyDown(event, 0)}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
          >
            <IconUser size={16} />
            {t('auth.nav.profile')}
          </button>
          <button
            ref={(node) => {
              itemRefs.current[1] = node;
            }}
            type="button"
            role="menuitem"
            onClick={goToHistory}
            onKeyDown={(event) => handleItemKeyDown(event, 1)}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
          >
            <IconHistory size={16} />
            {t('auth.nav.history')}
          </button>
          {/* Deletion lives on the history page rather than here: "clear my
              data" is worth confirming in context, next to the list it wipes. */}
          <div className="my-1 border-t border-slate-100" />
          <button
            ref={(node) => {
              itemRefs.current[2] = node;
            }}
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            onKeyDown={(event) => handleItemKeyDown(event, 2)}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action"
          >
            <IconLock size={16} />
            {t('auth.nav.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
});

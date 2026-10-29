import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { GOOGLE_CLIENT_ID } from '../../config';
import { navigate } from '../../hooks/useRoute';
import { IconLock, IconMail, IconUser } from '../icons';
import { AuthApiError } from '../../api/authClient';
import { AuthError, AuthField, OrDivider, SubmitButton } from './AuthField';
import { AuthCard } from '../AuthCard';
import { useAuthErrorMessage, useCredentialsFields } from './formHooks';
import { GoogleButton, GoogleOnlyHint } from './GoogleButton';
import { RouteLink } from '../RouteLink';

export function LoginPage() {
  const { t } = useTranslation();
  const { signIn, signInWithGoogle } = useAuth();
  const describeError = useAuthErrorMessage();
  const { emailId, passwordId, email, setEmail, password, setPassword, emailRef, passwordRef } =
    useCredentialsFields();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Set on any input after a failure: repeating the same wrong password should
  // not keep the stale message sitting under a field being corrected.
  const [dirty, setDirty] = useState(false);
  // Whether the last failure was the password form being refused. The hint is
  // repeated at the error in that case, because that is where a visitor whose
  // account is Google-only is looking when they hit the failure.
  const [passwordRefused, setPasswordRefused] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const cleanEmail = email.trim();
    const nextEmailError = cleanEmail ? null : t('auth.fields.emailRequired');
    const nextPasswordError = password ? null : t('auth.fields.passwordRequired');
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    if (nextEmailError || nextPasswordError) {
      if (nextEmailError) {
        emailRef.current?.focus();
      } else {
        passwordRef.current?.focus();
      }
      return;
    }
    setError(null);
    setPasswordRefused(false);
    setPending(true);
    try {
      await signIn(cleanEmail, password);
      navigate('home');
    } catch (caught) {
      setError(describeError(caught));
      setPasswordRefused(caught instanceof AuthApiError && caught.code === 'INVALID_CREDENTIALS');
      setDirty(true);
      setPending(false);
    }
  };

  const handleGoogle = async (idToken: string) => {
    setError(null);
    setPasswordRefused(false);
    setPending(true);
    try {
      await signInWithGoogle(idToken);
      navigate('home');
    } catch (caught) {
      setError(describeError(caught));
      setPending(false);
    }
  };

  const onEmail = (value: string) => {
    setEmail(value);
    if (dirty) setError(null);
    if (emailError) setEmailError(null);
  };

  const onPassword = (value: string) => {
    setPassword(value);
    if (dirty) setError(null);
    if (passwordError) setPasswordError(null);
  };

  return (
    <div className="py-10 sm:py-14">
      <AuthCard
        icon={<IconUser size={32} />}
        title={t('auth.login.title')}
        subtitle={t('auth.login.subtitle')}
        footer={
          <p className="text-center text-sm text-muted">
            {t('auth.login.noAccount')}{' '}
            <RouteLink to="register" className="font-semibold text-action hover:underline">
              {t('auth.login.createOne')}
            </RouteLink>
          </p>
        }
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <AuthError message={error} />
          {passwordRefused && GOOGLE_CLIENT_ID ? <GoogleOnlyHint /> : null}
          <AuthField
            id={emailId}
            label={t('auth.fields.email')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={onEmail}
            icon={<IconMail size={18} />}
            inputRef={emailRef}
            error={emailError}
          />
          <AuthField
            id={passwordId}
            label={t('auth.fields.password')}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={onPassword}
            icon={<IconLock size={18} />}
            inputRef={passwordRef}
            error={passwordError}
          />
          <div className="text-end">
            <RouteLink
              to="reset-password"
              className="text-sm font-semibold text-action hover:underline"
            >
              {t('auth.login.forgot')}
            </RouteLink>
          </div>
          <SubmitButton pending={pending}>{t('auth.login.submit')}</SubmitButton>
        </form>

        {GOOGLE_CLIENT_ID ? (
          <>
            <OrDivider />
            <GoogleOnlyHint />
            <GoogleButton onCredential={handleGoogle} disabled={pending} variant="signin" />
            <p className="text-center text-xs text-muted">{t('auth.google.disclaimer')}</p>
          </>
        ) : null}
      </AuthCard>
    </div>
  );
}

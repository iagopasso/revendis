'use client';

import { useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';

type LoginPanelProps = {
  googleEnabled: boolean;
  facebookEnabled: boolean;
};

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12.23 10.2v3.95h5.49c-.24 1.27-.96 2.34-2.05 3.06l3.31 2.57c1.93-1.78 3.04-4.4 3.04-7.53 0-.72-.06-1.41-.18-2.05z"
    />
    <path
      fill="#34A853"
      d="M12 22c2.76 0 5.08-.91 6.78-2.47l-3.31-2.57c-.91.61-2.08.97-3.47.97-2.66 0-4.91-1.79-5.72-4.19H2.86v2.63A10.23 10.23 0 0 0 12 22z"
    />
    <path
      fill="#FBBC05"
      d="M6.28 13.74A6.12 6.12 0 0 1 5.96 12c0-.61.11-1.2.32-1.74V7.63H2.86A10.23 10.23 0 0 0 1.77 12c0 1.64.4 3.2 1.09 4.37z"
    />
    <path
      fill="#4285F4"
      d="M12 6.07c1.5 0 2.86.52 3.91 1.53l2.92-2.92A9.83 9.83 0 0 0 12 2c-4.09 0-7.62 2.34-9.14 5.63l3.42 2.63C7.09 7.86 9.34 6.07 12 6.07z"
    />
  </svg>
);

const FacebookLogo = () => (
  <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true">
    <path
      fill="currentColor"
      d="M13.5 21v-7.18h2.42l.37-2.8H13.5V9.24c0-.81.23-1.36 1.39-1.36h1.49V5.37c-.72-.08-1.45-.12-2.18-.12-2.16 0-3.63 1.33-3.63 3.76v2.01H8.14v2.8h2.43V21z"
    />
  </svg>
);

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path
      d="M2.5 12s3.3-6 9.5-6 9.5 6 9.5 6-3.3 6-9.5 6-9.5-6-9.5-6z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    {!open ? (
      <path
        d="M4 20L20 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : null}
  </svg>
);

export default function LoginPanel({ googleEnabled, facebookEnabled }: LoginPanelProps) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submittingProvider, setSubmittingProvider] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  const hasProvider = googleEnabled || facebookEnabled;
  const credentialsSubmitting = submittingProvider === 'credentials';

  const providerHint = useMemo(() => {
    if (hasProvider) return 'Entre com e-mail/senha de admin ou revenda, ou use Google/Facebook.';
    return 'Entre com e-mail/senha de admin ou revenda. O login social e opcional.';
  }, [hasProvider]);

  const handleProviderSignIn = async (provider: 'google' | 'facebook') => {
    setFeedback('');
    setSubmittingProvider(provider);
    try {
      await signIn(provider, { callbackUrl: '/dashboard' });
    } catch {
      setFeedback('Nao foi possivel iniciar o login social.');
      setSubmittingProvider(null);
    }
  };

  const handleLegacySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const email = identifier.trim().toLowerCase();
    if (!email || !password) {
      setFeedback('Preencha e-mail e senha para entrar.');
      return;
    }

    setFeedback('');
    setSubmittingProvider('credentials');
    try {
      const csrfResponse = await fetch('/api/auth/csrf', {
        cache: 'no-store',
        credentials: 'same-origin'
      });
      if (!csrfResponse.ok) throw new Error('csrf_fetch_failed');

      const csrfPayload = (await csrfResponse.json().catch(() => null)) as { csrfToken?: string } | null;
      const csrfToken = csrfPayload?.csrfToken;
      if (!csrfToken) throw new Error('csrf_missing');

      const body = new URLSearchParams({
        csrfToken,
        email,
        password,
        callbackUrl: '/dashboard'
      });

      const loginResponse = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Auth-Return-Redirect': '1'
        },
        body,
        credentials: 'same-origin'
      });

      const loginPayload = (await loginResponse.json().catch(() => null)) as { url?: string } | null;
      const redirectUrl = loginPayload?.url || '/dashboard';
      const parsedUrl = new URL(redirectUrl, window.location.origin);
      const error = parsedUrl.searchParams.get('error');

      if (error) {
        setFeedback(error === 'CredentialsSignin' ? 'Credenciais invalidas.' : 'Nao foi possivel iniciar a sessao.');
        return;
      }

      if (!loginResponse.ok) {
        setFeedback('Nao foi possivel iniciar a sessao.');
        return;
      }

      window.location.href = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    } catch {
      setFeedback('Nao foi possivel iniciar a sessao.');
    } finally {
      setSubmittingProvider(null);
    }
  };

  return (
    <section className="auth-login-wrap">
      <div className="auth-brand">
        <span className="auth-brand-mark" />
        <strong>revendi</strong>
      </div>

      <form className="auth-card" onSubmit={handleLegacySubmit}>
        <h1>Entrar no Revendi</h1>

        <label className="auth-field">
          <span>Telefone ou e-mail</span>
          <input
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(event) => {
              setIdentifier(event.target.value);
              if (feedback) setFeedback('');
            }}
          />
        </label>

        <label className="auth-field">
          <span>Senha</span>
          <div className="auth-password-field">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (feedback) setFeedback('');
              }}
            />
            <button type="button" aria-label="Mostrar senha" onClick={() => setShowPassword((current) => !current)}>
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </label>

        <button className="auth-submit" type="submit" disabled={submittingProvider !== null}>
          {credentialsSubmitting ? 'Entrando...' : 'Entrar'}
        </button>

        <div className="auth-links-row">
          <button
            type="button"
            className="auth-link-primary"
            onClick={() => {
              if (googleEnabled) {
                void handleProviderSignIn('google');
                return;
              }
              if (facebookEnabled) {
                void handleProviderSignIn('facebook');
              }
            }}
          >
            Criar uma conta
          </button>
          <button
            type="button"
            className="auth-link-muted"
            onClick={() => setFeedback('Recuperacao de senha disponivel pelo provedor social.')}
          >
            Esqueci minha senha
          </button>
        </div>

        <div className="auth-social-row">
          <button
            type="button"
            className="auth-social-button facebook"
            onClick={() => void handleProviderSignIn('facebook')}
            disabled={!facebookEnabled || submittingProvider !== null}
          >
            <FacebookLogo />
            <span>{submittingProvider === 'facebook' ? 'Conectando...' : 'Facebook'}</span>
          </button>
          <button
            type="button"
            className="auth-social-button google"
            onClick={() => void handleProviderSignIn('google')}
            disabled={!googleEnabled || submittingProvider !== null}
          >
            <GoogleLogo />
            <span>{submittingProvider === 'google' ? 'Conectando...' : 'Google'}</span>
          </button>
        </div>

        {feedback ? <p className="auth-feedback">{feedback}</p> : null}
        {!feedback && providerHint ? <p className="auth-feedback">{providerHint}</p> : null}
      </form>
    </section>
  );
}

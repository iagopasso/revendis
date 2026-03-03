'use client';

import { useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';

type LoginPanelProps = {
  googleEnabled: boolean;
  facebookEnabled: boolean;
};

type LoginResult = {
  ok: boolean;
  redirectUrl?: string;
  message?: string;
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

const requestCredentialSession = async (email: string, password: string): Promise<LoginResult> => {
  try {
    const csrfResponse = await fetch('/api/auth/csrf', {
      cache: 'no-store',
      credentials: 'same-origin'
    });
    if (!csrfResponse.ok) {
      return { ok: false, message: 'Nao foi possivel iniciar a sessao.' };
    }

    const csrfPayload = (await csrfResponse.json().catch(() => null)) as { csrfToken?: string } | null;
    const csrfToken = csrfPayload?.csrfToken;
    if (!csrfToken) {
      return { ok: false, message: 'Nao foi possivel iniciar a sessao.' };
    }

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
      return {
        ok: false,
        message: error === 'CredentialsSignin' ? 'Credenciais invalidas.' : 'Nao foi possivel iniciar a sessao.'
      };
    }

    if (!loginResponse.ok) {
      return { ok: false, message: 'Nao foi possivel iniciar a sessao.' };
    }

    return {
      ok: true,
      redirectUrl: `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
    };
  } catch {
    return { ok: false, message: 'Nao foi possivel iniciar a sessao.' };
  }
};

export default function LoginPanel({ googleEnabled, facebookEnabled }: LoginPanelProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [showRegisterPasswordConfirm, setShowRegisterPasswordConfirm] = useState(false);
  const [submittingProvider, setSubmittingProvider] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  const hasProvider = googleEnabled || facebookEnabled;
  const credentialsSubmitting = submittingProvider === 'credentials';
  const registerSubmitting = submittingProvider === 'register';

  const providerHint = useMemo(() => {
    if (mode === 'register') {
      if (googleEnabled) {
        return 'Cadastre por formulario ou use Google para criar acesso rapidamente.';
      }
      return 'Cadastre com nome, email e senha.';
    }

    if (hasProvider) return 'Entre com o e-mail e senha da sua conta, ou use Google/Facebook.';
    return 'Entre com o e-mail e senha da sua conta. O login social e opcional.';
  }, [googleEnabled, hasProvider, mode]);

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
      const result = await requestCredentialSession(email, password);
      if (!result.ok || !result.redirectUrl) {
        setFeedback(result.message || 'Nao foi possivel iniciar a sessao.');
        return;
      }
      window.location.href = result.redirectUrl;
    } finally {
      setSubmittingProvider(null);
    }
  };

  const handleRegisterSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const name = registerName.trim();
    const email = identifier.trim().toLowerCase();
    if (!name || !email || !password || !registerPasswordConfirm) {
      setFeedback('Preencha nome, e-mail, senha e confirmacao para cadastrar.');
      return;
    }

    if (password.length < 6) {
      setFeedback('Use uma senha com pelo menos 6 caracteres.');
      return;
    }

    if (password !== registerPasswordConfirm) {
      setFeedback('A confirmacao de senha nao confere.');
      return;
    }

    setFeedback('');
    setSubmittingProvider('register');

    try {
      const registerResponse = await fetch('/api/backend/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          email,
          password
        })
      });

      if (!registerResponse.ok) {
        const payload = (await registerResponse.json().catch(() => null)) as { message?: string } | null;
        setFeedback(payload?.message || 'Nao foi possivel concluir o cadastro.');
        return;
      }

      const loginResult = await requestCredentialSession(email, password);
      if (!loginResult.ok || !loginResult.redirectUrl) {
        setFeedback(loginResult.message || 'Cadastro concluido, mas o login falhou.');
        return;
      }

      window.location.href = loginResult.redirectUrl;
    } catch {
      setFeedback('Nao foi possivel concluir o cadastro.');
    } finally {
      setSubmittingProvider(null);
    }
  };

  const submitHandler = mode === 'register' ? handleRegisterSubmit : handleLegacySubmit;

  return (
    <section className="auth-login-wrap">
      <div className="auth-brand">
        <span className="auth-brand-mark" />
        <strong>revendis</strong>
      </div>

      <form className="auth-card" onSubmit={submitHandler}>
        <h1>{mode === 'register' ? 'Criar conta no Revendis' : 'Entrar no Revendis'}</h1>

        {mode === 'register' ? (
          <>
            <label className="auth-field">
              <span>Nome completo</span>
              <input
                type="text"
                autoComplete="name"
                value={registerName}
                onChange={(event) => {
                  setRegisterName(event.target.value);
                  if (feedback) setFeedback('');
                }}
              />
            </label>

          </>
        ) : null}

        <label className="auth-field">
          <span>E-mail</span>
          <input
            type="email"
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
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
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

        {mode === 'register' ? (
          <label className="auth-field">
            <span>Confirmar senha</span>
            <div className="auth-password-field">
              <input
                type={showRegisterPasswordConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={registerPasswordConfirm}
                onChange={(event) => {
                  setRegisterPasswordConfirm(event.target.value);
                  if (feedback) setFeedback('');
                }}
              />
              <button
                type="button"
                aria-label="Mostrar confirmacao de senha"
                onClick={() => setShowRegisterPasswordConfirm((current) => !current)}
              >
                <EyeIcon open={showRegisterPasswordConfirm} />
              </button>
            </div>
          </label>
        ) : null}

        <button className="auth-submit" type="submit" disabled={submittingProvider !== null}>
          {mode === 'register'
            ? registerSubmitting
              ? 'Cadastrando...'
              : 'Cadastrar'
            : credentialsSubmitting
              ? 'Entrando...'
              : 'Entrar'}
        </button>

        <div className="auth-links-row">
          <button
            type="button"
            className="auth-link-primary"
            onClick={() => {
              setFeedback('');
              setMode((current) => (current === 'login' ? 'register' : 'login'));
            }}
          >
            {mode === 'login' ? 'Criar uma conta' : 'Ja tenho conta'}
          </button>

          {mode === 'login' ? (
            <button
              type="button"
              className="auth-link-muted"
              onClick={() => setFeedback('Para trocar senha, entre na conta e use Configuracoes > Editar conta.')}
            >
              Esqueci minha senha
            </button>
          ) : (
            <button
              type="button"
              className="auth-link-muted"
              onClick={() => {
                if (googleEnabled) {
                  void handleProviderSignIn('google');
                  return;
                }
                setFeedback('Use o formulario para finalizar seu cadastro.');
              }}
            >
              Cadastrar com Google
            </button>
          )}
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

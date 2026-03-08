'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { API_BASE, buildMutationHeaders } from './lib';
import {
  IconBox,
  IconBell,
  IconCart,
  IconDashboard,
  IconDollar,
  IconGlobe,
  IconLogout,
  IconPieChart,
  IconTag,
  IconTrash,
  IconUser,
  IconUsers
} from './icons';

const primaryNavItems = [
  { href: '/dashboard', label: 'Painel', mobileLabel: 'Painel', icon: IconDashboard },
  { href: '/estoque', label: 'Estoque', mobileLabel: 'Estoque', icon: IconBox },
  { href: '/vendas', label: 'Vendas', mobileLabel: 'Vendas', icon: IconTag },
  { href: '/compras', label: 'Compras', mobileLabel: 'Compras', icon: IconCart },
  { href: '/clientes', label: 'Clientes', mobileLabel: 'Clientes', icon: IconUsers },
  { href: '/financeiro', label: 'Financeiro', mobileLabel: 'Financeiro', icon: IconDollar },
  { href: '/loja', label: 'Loja online', mobileLabel: 'Loja', icon: IconGlobe },
  { href: '/relatorios', label: 'Relatórios', mobileLabel: 'Relatorios', icon: IconPieChart }
] as const;

type SidebarProps = {
  sessionUser: {
    name: string;
    email: string;
    image?: string;
  };
};

export default function Sidebar({ sessionUser }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountFeedback, setAccountFeedback] = useState('');
  const [accountFeedbackError, setAccountFeedbackError] = useState(false);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!profileMenuRef.current?.contains(target)) {
        setProfileMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!accountFeedback) return;
    const timer = window.setTimeout(() => {
      setAccountFeedback('');
      setAccountFeedbackError(false);
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [accountFeedback]);

  useEffect(() => {
    const hrefs = [...primaryNavItems.map((item) => item.href), '/notificacoes', '/configuracoes?section=conta'];
    const prefetchRoutes = () => {
      hrefs.forEach((href) => router.prefetch(href));
    };
    const requestIdle = window.requestIdleCallback?.bind(window);
    const cancelIdle = window.cancelIdleCallback?.bind(window);

    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleId: number | null = null;

    if (requestIdle) {
      idleId = requestIdle(prefetchRoutes, { timeout: 1200 });
    } else {
      timeoutId = globalThis.setTimeout(prefetchRoutes, 180);
    }

    return () => {
      if (idleId !== null && cancelIdle) {
        cancelIdle(idleId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [router]);

  const displayLabel = useMemo(() => {
    const base = (sessionUser.name || sessionUser.email || 'Perfil').trim();
    const initials = base
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((token) => token[0]?.toUpperCase() || '')
      .join('');
    return initials || 'PF';
  }, [sessionUser.email, sessionUser.name]);
  const profileImage = useMemo(() => {
    const value = (sessionUser.image || '').trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;
    return '';
  }, [sessionUser.image]);

  const handleSignOut = async () => {
    setProfileMenuOpen(false);
    await signOut({ callbackUrl: '/login' });
  };

  const handleDeleteOwnAccount = async () => {
    const email = sessionUser.email.trim().toLowerCase();
    if (!email) {
      setAccountFeedback('Nao foi possivel identificar sua conta.');
      setAccountFeedbackError(true);
      return;
    }

    const confirmed = window.confirm(
      'Tem certeza que deseja excluir sua conta? Esta acao remove seu acesso.'
    );
    if (!confirmed) return;

    setAccountActionLoading(true);
    setAccountFeedback('');
    setAccountFeedbackError(false);

    try {
      const response = await fetch(`${API_BASE}/settings/access/self`, {
        method: 'DELETE',
        headers: buildMutationHeaders({
          'x-user-email': email
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || 'Nao foi possivel excluir sua conta.');
      }

      await signOut({ callbackUrl: '/login' });
    } catch (error) {
      setAccountFeedback(error instanceof Error ? error.message : 'Nao foi possivel excluir sua conta.');
      setAccountFeedbackError(true);
    } finally {
      setAccountActionLoading(false);
      setProfileMenuOpen(false);
    }
  };

  return (
    <aside className="sidebar sidebar-expected">
      <Link href="/dashboard" className="logo sidebar-expected-logo" aria-label="Painel inicial">
        <img src="/logo.png" alt="Revendis" />
      </Link>

      <div className="sidebar-divider" />

      <nav className="nav sidebar-main-nav" aria-label="Navegação principal">
        {primaryNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              prefetch
              className={isActive ? 'sidebar-icon-link active' : 'sidebar-icon-link'}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              data-label={item.mobileLabel}
              title={item.label}
            >
              <span className="nav-icon">
                <Icon />
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-main-spacer" />

      <div className="sidebar-footer profile-menu-wrapper" ref={profileMenuRef}>
        <button
          type="button"
          className="sidebar-avatar-btn profile-trigger"
          aria-label="Perfil"
          aria-expanded={profileMenuOpen}
          onClick={() => setProfileMenuOpen((current) => !current)}
        >
          <span>{profileImage ? <img src={profileImage} alt={sessionUser.name || 'Perfil'} loading="lazy" /> : displayLabel}</span>
        </button>

        {profileMenuOpen ? (
          <div className="profile-menu" role="menu" aria-label="Conta">
            <Link href="/notificacoes" prefetch onClick={() => setProfileMenuOpen(false)}>
              <IconBell />
              Alertas
            </Link>
            <Link href="/configuracoes?section=conta" prefetch onClick={() => setProfileMenuOpen(false)}>
              <IconUser />
              Configurações
            </Link>
            <button type="button" onClick={() => void handleSignOut()}>
              <IconLogout />
              Sair
            </button>
            <div className="profile-menu-divider" />
            <button
              type="button"
              className="danger"
              onClick={() => void handleDeleteOwnAccount()}
              disabled={accountActionLoading}
            >
              <IconTrash />
              {accountActionLoading ? 'Excluindo conta...' : 'Excluir conta'}
            </button>
            {accountFeedback ? (
              <p className={`profile-menu-feedback${accountFeedbackError ? ' error' : ''}`}>{accountFeedback}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

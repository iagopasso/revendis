'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { API_BASE, buildMutationHeaders } from './lib';
import {
  formatRelativeTime,
  getNotificationHref,
  isNotificationRead,
  loadReadNotificationIds,
  markNotificationIdsAsRead,
  mergeLegacyReadState,
  type NotificationItem,
  saveReadNotificationIds,
  subscribeReadNotificationIds
} from './notifications-utils';
import {
  IconBox,
  IconBell,
  IconCart,
  IconDashboard,
  IconDollar,
  IconGlobe,
  IconMegaphone,
  IconMessage,
  IconLogout,
  IconPieChart,
  IconTag,
  IconTrash,
  IconUser,
  IconWhatsapp,
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
  { href: '/relatorios', label: 'Relatórios', mobileLabel: 'Relatorios', icon: IconPieChart },
  { href: '/notificacoes', label: 'Notificações', mobileLabel: 'Alertas', icon: IconBell },
  { href: '/configuracoes', label: 'Configurações', mobileLabel: 'Ajustes', icon: IconMessage }
] as const;

const utilityNavItems = [
  { label: 'Avisos', icon: IconMegaphone },
  { label: 'WhatsApp', icon: IconWhatsapp }
];

const NOTIFICATIONS_FETCH_TIMEOUT_MS = 8000;
const DEFAULT_ORG_ID = process.env.NEXT_PUBLIC_ORG_ID || '00000000-0000-0000-0000-000000000001';

type SidebarProps = {
  sessionUser: {
    name: string;
    email: string;
  };
};

export default function Sidebar({ sessionUser }: SidebarProps) {
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [accountActionLoading, setAccountActionLoading] = useState(false);
  const [accountFeedback, setAccountFeedback] = useState('');
  const [accountFeedbackError, setAccountFeedbackError] = useState(false);

  const loadNotifications = useCallback(async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), NOTIFICATIONS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}/notifications?limit=30`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as { data?: NotificationItem[] } | null;
      setNotifications(Array.isArray(body?.data) ? body.data : []);
    } catch {
      // keep previous notifications when network/API fails
    } finally {
      window.clearTimeout(timer);
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    setReadNotificationIds(loadReadNotificationIds());
    return subscribeReadNotificationIds((ids) => {
      setReadNotificationIds(ids);
    });
  }, []);

  useEffect(() => {
    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadNotifications]);

  useEffect(() => {
    if (!notifications.length) return;
    setReadNotificationIds((current) => {
      const merged = mergeLegacyReadState(current, notifications);
      let changed = merged.size !== current.size;
      if (!changed) {
        for (const id of merged) {
          if (!current.has(id)) {
            changed = true;
            break;
          }
        }
      }
      if (!changed) return current;
      saveReadNotificationIds(merged);
      return merged;
    });
  }, [notifications]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!notificationsRef.current?.contains(target)) {
        setNotificationsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [notificationsOpen]);

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

  const markNotificationAsRead = useCallback((notificationId: string) => {
    setReadNotificationIds((current) => {
      if (current.has(notificationId)) return current;
      const next = markNotificationIdsAsRead(current, [notificationId]);
      saveReadNotificationIds(next);
      return next;
    });
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !isNotificationRead(readNotificationIds, item)).length,
    [notifications, readNotificationIds]
  );

  const visibleNotifications = notifications.slice(0, 8);
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

  const toggleNotifications = () => setNotificationsOpen((current) => !current);

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
          'x-org-id': DEFAULT_ORG_ID,
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

      <nav className="sidebar-utility-nav" aria-label="Utilitários">
        {utilityNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.label} type="button" className="sidebar-icon-link" aria-label={item.label}>
              <span className="nav-icon">
                <Icon />
              </span>
            </button>
          );
        })}

        <div className="sidebar-notifications" ref={notificationsRef}>
          <button
            type="button"
            className="sidebar-icon-link sidebar-notifications-trigger"
            aria-label="Notificacoes"
            aria-expanded={notificationsOpen}
            onClick={toggleNotifications}
          >
            <span className="nav-icon">
              <IconBell />
            </span>
            {unreadCount > 0 ? <span className="sidebar-notifications-badge">{Math.min(unreadCount, 99)}</span> : null}
          </button>

          {notificationsOpen ? (
            <div className="sidebar-notifications-popover" role="dialog" aria-label="Notificacoes">
              <div className="sidebar-notifications-header">
                <strong>Notificacoes</strong>
                {unreadCount > 0 ? (
                  <span className="sidebar-notifications-pill">{unreadCount} nao lidas</span>
                ) : (
                  <span className="sidebar-notifications-pill muted">Tudo lido</span>
                )}
              </div>

              <div className="sidebar-notifications-list">
                {notificationsLoading ? <p className="sidebar-notifications-empty">Carregando...</p> : null}
                {!notificationsLoading && visibleNotifications.length === 0 ? (
                  <p className="sidebar-notifications-empty">Nenhuma movimentacao encontrada.</p>
                ) : null}
                {!notificationsLoading
                  ? visibleNotifications.map((item) => {
                      const isUnread = !isNotificationRead(readNotificationIds, item);
                      return (
                        <Link
                          href={getNotificationHref(item)}
                          key={item.id}
                          className={`sidebar-notifications-item${isUnread ? ' unread' : ''}`}
                          title={item.message}
                          onClick={() => {
                            markNotificationAsRead(item.id);
                            setNotificationsOpen(false);
                          }}
                        >
                          <span className={`sidebar-notifications-dot ${item.category}`} />
                          <div className="sidebar-notifications-item-content">
                            <p>{item.message}</p>
                            <span>{formatRelativeTime(item.created_at)}</span>
                          </div>
                        </Link>
                      );
                    })
                  : null}
              </div>

              <Link href="/notificacoes" className="sidebar-notifications-footer-link" onClick={() => setNotificationsOpen(false)}>
                Ver todas as notificacoes
              </Link>
            </div>
          ) : null}
        </div>
      </nav>

      <div className="sidebar-footer profile-menu-wrapper" ref={profileMenuRef}>
        <button
          type="button"
          className="sidebar-avatar-btn profile-trigger"
          aria-label="Perfil"
          aria-expanded={profileMenuOpen}
          onClick={() => setProfileMenuOpen((current) => !current)}
        >
          <span>{displayLabel}</span>
        </button>

        {profileMenuOpen ? (
          <div className="profile-menu" role="menu" aria-label="Conta">
            <Link href="/configuracoes" onClick={() => setProfileMenuOpen(false)}>
              <IconUser />
              Minha conta
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

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { API_BASE } from './lib';
import {
  formatRelativeTime,
  getNotificationHref,
  isNotificationRead,
  loadReadNotificationIds,
  markNotificationIdsAsRead,
  mergeLegacyReadState,
  type NotificationItem,
  saveReadNotificationIds
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
  IconPieChart,
  IconTag,
  IconWhatsapp,
  IconUsers
} from './icons';

const primaryNavItems = [
  { href: '/dashboard', label: 'Painel', icon: IconDashboard },
  { href: '/estoque', label: 'Estoque', icon: IconBox },
  { href: '/vendas', label: 'Vendas', icon: IconTag },
  { href: '/compras', label: 'Compras', icon: IconCart },
  { href: '/clientes', label: 'Clientes', icon: IconUsers },
  { href: '/financeiro', label: 'Financeiro', icon: IconDollar },
  { href: '/', label: 'Loja online', icon: IconGlobe },
  { href: '/relatorios', label: 'Relatórios', icon: IconPieChart },
  { href: '/configuracoes', label: 'Configurações', icon: IconMessage }
];

const utilityNavItems = [
  { label: 'Avisos', icon: IconMegaphone },
  { label: 'WhatsApp', icon: IconWhatsapp }
];

const NOTIFICATIONS_FETCH_TIMEOUT_MS = 8000;

export default function Sidebar() {
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());
  const notificationsRef = useRef<HTMLDivElement | null>(null);

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

  const toggleNotifications = () => setNotificationsOpen((current) => !current);

  return (
    <aside className="sidebar sidebar-expected">
      <Link href="/dashboard" className="logo sidebar-expected-logo" aria-label="Painel inicial">
        <img src="/logo.png" alt="Revendis" />
      </Link>

      <div className="sidebar-divider" />

      <nav className="nav sidebar-main-nav" aria-label="Navegação principal">
        {primaryNavItems.map((item) => {
          const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={isActive ? 'sidebar-icon-link active' : 'sidebar-icon-link'}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
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

      <button type="button" className="sidebar-avatar-btn" aria-label="Perfil">
        <span>IP</span>
      </button>
    </aside>
  );
}

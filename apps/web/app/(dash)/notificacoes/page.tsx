'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { API_BASE } from '../lib';
import {
  IconBell,
  IconBox,
  IconDollar,
  IconMessage,
  IconTag,
  IconUsers
} from '../icons';
import {
  formatDateTime,
  formatRelativeTime,
  getNotificationHref,
  isNotificationRead,
  loadReadNotificationIds,
  markNotificationIdsAsRead,
  mergeLegacyReadState,
  type NotificationCategory,
  type NotificationItem,
  saveReadNotificationIds
} from '../notifications-utils';

const NOTIFICATIONS_FETCH_TIMEOUT_MS = 8000;

const CategoryIcon = ({ category }: { category: NotificationCategory }) => {
  if (category === 'sale') return <IconTag />;
  if (category === 'inventory') return <IconBox />;
  if (category === 'finance') return <IconDollar />;
  if (category === 'customer') return <IconUsers />;
  if (category === 'settings') return <IconMessage />;
  return <IconBell />;
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set());

  const loadNotifications = useCallback(async () => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), NOTIFICATIONS_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE}/notifications?limit=120`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) {
        setError('Nao foi possivel carregar as notificacoes.');
        return;
      }
      const body = (await response.json().catch(() => null)) as { data?: NotificationItem[] } | null;
      setNotifications(Array.isArray(body?.data) ? body.data : []);
      setError(null);
    } catch {
      setError('Nao foi possivel carregar as notificacoes.');
    } finally {
      window.clearTimeout(timer);
      setLoading(false);
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

  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !isNotificationRead(readNotificationIds, item)),
    [notifications, readNotificationIds]
  );

  const readNotifications = useMemo(
    () => notifications.filter((item) => isNotificationRead(readNotificationIds, item)),
    [notifications, readNotificationIds]
  );

  const unreadCount = unreadNotifications.length;

  const markNotificationAsRead = useCallback((notificationId: string) => {
    setReadNotificationIds((current) => {
      if (current.has(notificationId)) return current;
      const next = markNotificationIdsAsRead(current, [notificationId]);
      saveReadNotificationIds(next);
      return next;
    });
  }, []);

  const markAllAsRead = () => {
    setReadNotificationIds((current) => {
      const ids = notifications.map((item) => item.id);
      const next = markNotificationIdsAsRead(current, ids);
      saveReadNotificationIds(next);
      return next;
    });
  };

  return (
    <main className="page-content notifications-page">
      <header className="notifications-page-header">
        <h1>Notificacoes</h1>

        <button
          type="button"
          className="notifications-page-read-all"
          onClick={markAllAsRead}
          disabled={!notifications.length || unreadCount === 0}
        >
          <IconBell />
          <span>Marcar todas como lidas</span>
        </button>
      </header>

      <section className="notifications-page-list" aria-live="polite">
        {loading ? <p className="notifications-page-empty">Carregando notificacoes...</p> : null}
        {!loading && error ? <p className="notifications-page-empty">{error}</p> : null}
        {!loading && !error && notifications.length === 0 ? (
          <p className="notifications-page-empty">Nenhuma notificacao encontrada.</p>
        ) : null}
        {!loading && !error && notifications.length > 0 ? (
          <>
            <section className="notifications-page-group">
              <h2 className="notifications-page-group-title">Nao lidas ({unreadNotifications.length})</h2>
              <div className="notifications-page-group-list">
                {unreadNotifications.map((item) => (
                  <Link
                    key={item.id}
                    href={getNotificationHref(item)}
                    className="notifications-page-item unread"
                    onClick={() => markNotificationAsRead(item.id)}
                  >
                    <div className={`notifications-page-item-avatar ${item.category}`}>
                      <CategoryIcon category={item.category} />
                      <span className="notifications-page-item-unread-dot" />
                    </div>

                    <div className="notifications-page-item-body">
                      <strong>{item.message}</strong>
                      <span>
                        {formatRelativeTime(item.created_at)} <b>·</b> {formatDateTime(item.created_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <div className="notifications-page-divider" />

            <section className="notifications-page-group">
              <h2 className="notifications-page-group-title">Lidas ({readNotifications.length})</h2>
              <div className="notifications-page-group-list">
                {readNotifications.map((item) => (
                  <Link
                    key={item.id}
                    href={getNotificationHref(item)}
                    className="notifications-page-item read"
                    onClick={() => markNotificationAsRead(item.id)}
                  >
                    <div className={`notifications-page-item-avatar ${item.category}`}>
                      <CategoryIcon category={item.category} />
                    </div>

                    <div className="notifications-page-item-body">
                      <strong>{item.message}</strong>
                      <span>
                        {formatRelativeTime(item.created_at)} <b>·</b> {formatDateTime(item.created_at)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

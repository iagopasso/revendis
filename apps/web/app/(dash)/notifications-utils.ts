export type NotificationCategory = 'order' | 'sale' | 'inventory' | 'finance' | 'customer' | 'settings' | 'general';

export type NotificationItem = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
  message: string;
  category: NotificationCategory;
};

export const NOTIFICATIONS_READ_IDS_KEY = 'revendis:notifications:read-ids';
const NOTIFICATIONS_LEGACY_LAST_SEEN_KEY = 'revendis:notifications:last-seen-at';
const MAX_STORED_READ_IDS = 1200;

export const toTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export const formatRelativeTime = (value?: string | null) => {
  const time = toTimestamp(value);
  if (!time) return '';
  const diffMs = Date.now() - time;
  if (diffMs < 60_000) return 'agora mesmo';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `ha ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ha ${hours} hora${hours === 1 ? '' : 's'}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `ha ${days} dia${days === 1 ? '' : 's'}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `ha ${months} mes${months === 1 ? '' : 'es'}`;

  const years = Math.floor(months / 12);
  return `ha ${years} ano${years === 1 ? '' : 's'}`;
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
};

export const getNotificationHref = (item: NotificationItem) => {
  if (item.entity_type === 'storefront_order') {
    return '/?section=orders';
  }

  if (item.entity_type === 'sale' || item.entity_type === 'payment') {
    return '/vendas';
  }

  if (item.entity_type === 'purchase') {
    return '/compras';
  }

  if (item.entity_type === 'receivable' || item.entity_type === 'finance_expense') {
    return '/financeiro';
  }

  if (
    item.entity_type === 'inventory_movement' ||
    item.entity_type === 'inventory_transfer' ||
    item.entity_type === 'return' ||
    item.entity_type === 'product'
  ) {
    return '/estoque';
  }

  if (item.entity_type === 'customer') {
    return '/clientes';
  }

  if (item.entity_type === 'brand' || item.entity_type.startsWith('settings_')) {
    return '/configuracoes';
  }

  return '/dashboard';
};

const readIdsFromStorage = (): Set<string> => {
  if (typeof window === 'undefined') return new Set();
  const raw = window.localStorage.getItem(NOTIFICATIONS_READ_IDS_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    const ids = parsed.filter((value): value is string => typeof value === 'string' && value.length > 0);
    return new Set(ids.slice(-MAX_STORED_READ_IDS));
  } catch {
    return new Set();
  }
};

export const loadReadNotificationIds = () => readIdsFromStorage();

export const saveReadNotificationIds = (ids: Set<string>) => {
  if (typeof window === 'undefined') return;
  const serialized = Array.from(ids).slice(-MAX_STORED_READ_IDS);
  window.localStorage.setItem(NOTIFICATIONS_READ_IDS_KEY, JSON.stringify(serialized));
};

export const markNotificationIdsAsRead = (current: Set<string>, ids: string[]) => {
  const next = new Set(current);
  for (const id of ids) {
    if (!id) continue;
    next.add(id);
  }
  return next;
};

export const isNotificationRead = (readIds: Set<string>, item: NotificationItem) => readIds.has(item.id);

export const mergeLegacyReadState = (current: Set<string>, notifications: NotificationItem[]) => {
  if (typeof window === 'undefined') return current;
  const raw = window.localStorage.getItem(NOTIFICATIONS_LEGACY_LAST_SEEN_KEY);
  const seenAt = toTimestamp(raw);
  if (!seenAt) return current;

  const next = new Set(current);
  for (const item of notifications) {
    if (toTimestamp(item.created_at) <= seenAt) {
      next.add(item.id);
    }
  }
  return next;
};

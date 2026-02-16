export type ListResponse<T> = { data: T[] };
export type ItemResponse<T> = { data: T };

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const API_TIMEOUT_MS = Math.max(2000, Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 10000));

export const fetchList = async <T,>(path: string): Promise<ListResponse<T> | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as ListResponse<T>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const fetchItem = async <T,>(path: string): Promise<ItemResponse<T> | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as ItemResponse<T>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export const toNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
};

export const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const digitsOnly = (value?: string | null) => {
  if (!value) return '';
  return value.replace(/\D/g, '');
};

export const getStringParam = (value?: string | string[]) =>
  (Array.isArray(value) ? value[0] : value) || '';

export type DateRange = {
  from?: Date;
  to?: Date;
  source: 'custom' | 'month' | 'range' | 'default' | 'all';
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const parseDateValue = (value?: string | Date | null) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const normalized = value.includes('T') ? value : `${value}T00:00:00`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseMonthValue = (value: string) => {
  const [year, month] = value.split('-').map((part) => Number(part));
  if (!year || !month) return null;
  const start = new Date(year, month - 1, 1);
  const end = endOfDay(new Date(year, month, 0));
  return { start, end };
};

export const getDateRangeFromSearchParams = (
  searchParams?: Record<string, string | string[] | undefined>,
  defaultPreset: string = '7d'
): DateRange => {
  const range = getStringParam(searchParams?.range);
  const month = getStringParam(searchParams?.month);
  const fromParam = getStringParam(searchParams?.from);
  const toParam = getStringParam(searchParams?.to);

  if (fromParam || toParam) {
    const from = parseDateValue(fromParam);
    const to = parseDateValue(toParam);
    return {
      from: from ? startOfDay(from) : undefined,
      to: to ? endOfDay(to) : undefined,
      source: 'custom'
    };
  }

  if (month) {
    const parsed = parseMonthValue(month);
    if (parsed) {
      return { from: startOfDay(parsed.start), to: parsed.end, source: 'month' };
    }
  }

  const effectiveRange = range || defaultPreset;

  if (effectiveRange === 'all') {
    return { source: range === 'all' ? 'all' : 'default' };
  }

  const daysMap: Record<string, number> = {
    today: 1,
    '7d': 7,
    '28d': 28,
    '90d': 90,
    '365d': 365
  };
  const days = daysMap[effectiveRange] || daysMap[defaultPreset] || 7;
  const today = new Date();
  const to = endOfDay(today);
  const from = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)));
  return { from, to, source: range ? 'range' : 'default' };
};

export const isInDateRange = (value: string | Date | null | undefined, range: DateRange) => {
  if (!range.from && !range.to) return true;
  const date = parseDateValue(value);
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
};

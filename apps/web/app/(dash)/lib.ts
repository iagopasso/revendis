export type ListResponse<T> = { data: T[] };
export type ItemResponse<T> = { data: T };

const withNoTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const resolveApiBase = () => {
  if (typeof window !== 'undefined') return '/api/backend';
  const envBase = withNoTrailingSlash(process.env.NEXT_PUBLIC_API_URL || '');
  if (envBase) return envBase;
  return 'http://localhost:3001/api';
};

export const API_BASE = resolveApiBase();
export const SALES_SYNC_STORAGE_KEY = 'revendis:sales-sync-at';
export const BUSINESS_TIMEZONE = process.env.NEXT_PUBLIC_BUSINESS_TIMEZONE || 'America/Sao_Paulo';
const MUTATION_AUTH_TOKEN = process.env.NEXT_PUBLIC_MUTATION_AUTH_TOKEN || '';
const API_TIMEOUT_MS = Math.max(2000, Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS || 10000));

export const buildMutationHeaders = (extra?: HeadersInit) => {
  const headers = new Headers(extra || {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (MUTATION_AUTH_TOKEN && !headers.has('x-mutation-token')) {
    headers.set('x-mutation-token', MUTATION_AUTH_TOKEN);
  }
  return headers;
};

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

const pad2 = (value: number) => String(value).padStart(2, '0');

const toMonthValue = (value: Date) => `${value.getFullYear()}-${pad2(value.getMonth() + 1)}`;

type TimeZoneDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const getTimeZoneDateParts = (value: Date, timeZone: string): TimeZoneDateParts | null => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(value);

    const readNumber = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
    const year = readNumber('year');
    const month = readNumber('month');
    const day = readNumber('day');
    const hour = readNumber('hour') % 24;
    const minute = readNumber('minute');
    const second = readNumber('second');

    if (!year || !month || !day) return null;
    return { year, month, day, hour, minute, second };
  } catch {
    return null;
  }
};

const getTimeZoneOffsetMs = (value: Date, timeZone: string) => {
  const parts = getTimeZoneDateParts(value, timeZone);
  if (!parts) return 0;
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, 0);
  return asUtc - value.getTime();
};

const dateFromTimeZoneParts = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  millisecond: number,
  timeZone: string
) => {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let result = new Date(utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone));
  const corrected = new Date(utcGuess - getTimeZoneOffsetMs(result, timeZone));
  if (corrected.getTime() !== result.getTime()) {
    result = corrected;
  }
  return result;
};

const shiftDatePartsByDays = (year: number, month: number, day: number, deltaDays: number) => {
  const shifted = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
};

export const toMonthValueInTimeZone = (value: Date = new Date(), timeZone: string = BUSINESS_TIMEZONE) => {
  const parts = getTimeZoneDateParts(value, timeZone);
  if (!parts) return toMonthValue(value);
  return `${parts.year}-${pad2(parts.month)}`;
};

const parseDateValue = (value?: string | Date | null) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = value.trim();
  const dateOnlyMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    if (year && month && day) {
      return dateFromTimeZoneParts(year, month, day, 0, 0, 0, 0, BUSINESS_TIMEZONE);
    }
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseMonthValue = (value: string) => {
  const [year, month] = value.split('-').map((part) => Number(part));
  if (!year || !month) return null;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = dateFromTimeZoneParts(year, month, 1, 0, 0, 0, 0, BUSINESS_TIMEZONE);
  const end = dateFromTimeZoneParts(year, month, lastDay, 23, 59, 59, 999, BUSINESS_TIMEZONE);
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

  if (!range && !month && !fromParam && !toParam) {
    const currentMonth = parseMonthValue(toMonthValueInTimeZone(new Date(), BUSINESS_TIMEZONE));
    if (currentMonth) {
      return { from: startOfDay(currentMonth.start), to: currentMonth.end, source: 'default' };
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
  const todayParts = getTimeZoneDateParts(new Date(), BUSINESS_TIMEZONE);

  if (todayParts) {
    const fromParts = shiftDatePartsByDays(todayParts.year, todayParts.month, todayParts.day, -(days - 1));
    const from = dateFromTimeZoneParts(
      fromParts.year,
      fromParts.month,
      fromParts.day,
      0,
      0,
      0,
      0,
      BUSINESS_TIMEZONE
    );
    const to = dateFromTimeZoneParts(
      todayParts.year,
      todayParts.month,
      todayParts.day,
      23,
      59,
      59,
      999,
      BUSINESS_TIMEZONE
    );
    return { from, to, source: range ? 'range' : 'default' };
  }

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

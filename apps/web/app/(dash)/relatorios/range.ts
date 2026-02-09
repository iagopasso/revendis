import { getDateRangeFromSearchParams, getStringParam, type DateRange } from '../lib';

export type ReportSearchParams = {
  range?: string | string[];
  month?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

type ReportRangeContext = {
  dateRange: DateRange;
  periodLabel: string;
  rangeQuery: string;
};

const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const presetLabels: Record<string, string> = {
  today: 'Hoje',
  '7d': 'Ultimos 7 dias',
  '28d': 'Ultimos 28 dias',
  '90d': 'Ultimos 90 dias',
  '365d': 'Ultimos 365 dias',
  all: 'Todo o periodo'
};

const formatDate = (date?: Date) => {
  if (!date) return '';
  return date.toLocaleDateString('pt-BR');
};

const toIsoDate = (date?: Date) => {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
};

export const buildReportRangeContext = (searchParams?: ReportSearchParams): ReportRangeContext => {
  const resolved = searchParams || {};
  const dateRange = getDateRangeFromSearchParams(resolved, '28d');
  const range = getStringParam(resolved.range);
  const month = getStringParam(resolved.month);
  const from = getStringParam(resolved.from);
  const to = getStringParam(resolved.to);

  let periodLabel = 'Ultimos 28 dias';
  if (month && dateRange.from) {
    periodLabel = `${monthNames[dateRange.from.getMonth()]} ${dateRange.from.getFullYear()}`;
  } else if (from || to) {
    if (dateRange.from && dateRange.to) {
      periodLabel = `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`;
    } else if (dateRange.from) {
      periodLabel = `A partir de ${formatDate(dateRange.from)}`;
    } else if (dateRange.to) {
      periodLabel = `Ate ${formatDate(dateRange.to)}`;
    }
  } else if (range && presetLabels[range]) {
    periodLabel = presetLabels[range];
  }

  const params = new URLSearchParams();
  const fromIso = toIsoDate(dateRange.from);
  const toIso = toIsoDate(dateRange.to);
  if (fromIso) params.set('from', fromIso);
  if (toIso) params.set('to', toIso);

  const query = params.toString();
  return {
    dateRange,
    periodLabel,
    rangeQuery: query ? `?${query}` : ''
  };
};

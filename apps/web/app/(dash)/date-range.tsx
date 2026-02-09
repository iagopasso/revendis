'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type TabKey = 'presets' | 'months' | 'custom';

type Preset = { label: string; value: string };

const presets: Preset[] = [
  { label: 'Hoje', value: 'today' },
  { label: 'Ultimos 7 dias', value: '7d' },
  { label: 'Ultimos 28 dias', value: '28d' },
  { label: 'Ultimos 90 dias', value: '90d' },
  { label: 'Ultimos 365 dias', value: '365d' },
  { label: 'Todo o periodo', value: 'all' }
];

type DateRangePickerProps = {
  defaultPreset?: string;
};

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const pad = (value: number) => value.toString().padStart(2, '0');

const formatDate = (value: string) => {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const getLabelFromParams = (params: URLSearchParams, defaultPreset: string) => {
  const range = params.get('range');
  const monthValue = params.get('month');
  const from = params.get('from');
  const to = params.get('to');

  if (monthValue) {
    const [year, month] = monthValue.split('-').map((part) => Number(part));
    if (year && month) {
      const monthLabel = months[month - 1] || 'Mes';
      return `${monthLabel} ${year}`;
    }
  }

  if (from || to) {
    if (from && to) return `${formatDate(from)} - ${formatDate(to)}`;
    if (from) return `A partir de ${formatDate(from)}`;
    if (to) return `Ate ${formatDate(to)}`;
  }

  const preset = presets.find((item) => item.value === range || (!range && item.value === defaultPreset));
  if (preset) return preset.label;
  return 'Ultimos 7 dias';
};

const getInitialYear = (params: URLSearchParams) => {
  const monthValue = params.get('month');
  if (monthValue) {
    const [year] = monthValue.split('-').map((part) => Number(part));
    if (year) return year;
  }
  return new Date().getFullYear();
};

export default function DateRangePicker({ defaultPreset = '7d' }: DateRangePickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('presets');
  const [year, setYear] = useState(getInitialYear(searchParams));
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');

  useEffect(() => {
    if (!open) {
      setYear(getInitialYear(searchParams));
      setFrom(searchParams.get('from') || '');
      setTo(searchParams.get('to') || '');
    }
  }, [open, searchParams]);

  const label = useMemo(() => getLabelFromParams(searchParams, defaultPreset), [defaultPreset, searchParams]);

  const updateParams = (updater: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    updater(params);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  const handlePreset = (value: string) => {
    updateParams((params) => {
      params.set('range', value);
      params.delete('month');
      params.delete('from');
      params.delete('to');
    });
    setOpen(false);
  };

  const handleMonth = (monthIndex: number) => {
    updateParams((params) => {
      params.set('month', `${year}-${pad(monthIndex + 1)}`);
      params.delete('range');
      params.delete('from');
      params.delete('to');
    });
    setOpen(false);
  };

  const applyCustom = () => {
    updateParams((params) => {
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (!from) params.delete('from');
      if (!to) params.delete('to');
      params.delete('range');
      params.delete('month');
    });
    setOpen(false);
  };

  const clearAll = () => {
    updateParams((params) => {
      params.delete('range');
      params.delete('month');
      params.delete('from');
      params.delete('to');
    });
    setOpen(false);
  };

  return (
    <div className="date-range">
      <button className="chip date-range-trigger" type="button" onClick={() => setOpen(!open)}>
        📅 {label}
      </button>
      {open ? (
        <div className="date-range-popover">
          <div className="date-range-tabs">
            <button
              className={`date-range-tab${tab === 'presets' ? ' active' : ''}`}
              type="button"
              onClick={() => setTab('presets')}
            >
              Predefinido
            </button>
            <button
              className={`date-range-tab${tab === 'months' ? ' active' : ''}`}
              type="button"
              onClick={() => setTab('months')}
            >
              Meses
            </button>
            <button
              className={`date-range-tab${tab === 'custom' ? ' active' : ''}`}
              type="button"
              onClick={() => setTab('custom')}
            >
              Personalizado
            </button>
          </div>

          {tab === 'presets' ? (
            <div className="date-range-body">
              {presets.map((preset) => (
                <button
                  key={preset.value}
                  className="date-range-option"
                  type="button"
                  onClick={() => handlePreset(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}

          {tab === 'months' ? (
            <div className="date-range-body">
              <div className="date-range-year">
                <button type="button" className="button icon" onClick={() => setYear((y) => y - 1)}>
                  ‹
                </button>
                <strong>{year}</strong>
                <button type="button" className="button icon" onClick={() => setYear((y) => y + 1)}>
                  ›
                </button>
              </div>
              <div className="date-range-months">
                {months.map((month, index) => (
                  <button
                    key={month}
                    type="button"
                    className="date-range-month"
                    onClick={() => handleMonth(index)}
                  >
                    {month}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {tab === 'custom' ? (
            <div className="date-range-body">
              <label className="date-range-field">
                <span>De</span>
                <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </label>
              <label className="date-range-field">
                <span>Ate</span>
                <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </label>
              <div className="date-range-footer">
                <button type="button" className="button ghost" onClick={clearAll}>
                  Limpar
                </button>
                <button type="button" className="button primary" onClick={applyCustom}>
                  Aplicar
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { IconCalendar, IconUpload } from '../icons';
import { formatCurrency, toNumber } from '../lib';

type ReportRow = {
  date: string;
  primary: string;
  secondary?: string;
  status: string;
  value: number | string;
};

type ReportDetailPanelProps = {
  breadcrumb: string;
  title: string;
  rows: ReportRow[];
  exportBaseName: string;
  emptyTitle: string;
  emptyMessage: string;
  valueFormat?: 'currency' | 'number';
};

const dateToPt = (value: string) => {
  if (!value) return '--';
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('pt-BR');
};

const now = () => new Date();

const downloadBlob = (filename: string, content: BlobPart, type: string) => {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(href);
};

const statusTone = (value: string) => {
  const normalized = value.toLowerCase();
  if (normalized.includes('cancel')) return 'danger';
  if (normalized.includes('pend')) return 'pending';
  if (normalized.includes('atras')) return 'danger';
  return 'paid';
};

export default function ReportDetailPanel({
  breadcrumb,
  title,
  rows,
  exportBaseName,
  emptyTitle,
  emptyMessage,
  valueFormat = 'currency'
}: ReportDetailPanelProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);

  const formatValue = (value: number | string) => {
    if (valueFormat === 'number') {
      return toNumber(value).toLocaleString('pt-BR');
    }
    return formatCurrency(toNumber(value));
  };

  const recentRows = useMemo(() => {
    const end = now();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 27);
    return rows.filter((row) => {
      const date = new Date(row.date.includes('T') ? row.date : `${row.date}T00:00:00`);
      if (Number.isNaN(date.getTime())) return false;
      return date >= start && date <= end;
    });
  }, [rows]);

  const exportExcel = () => {
    const csvRows = [
      ['Data', 'Descricao', 'Detalhe', 'Situacao', 'Valor'],
      ...recentRows.map((row) => [
        dateToPt(row.date),
        row.primary,
        row.secondary || '--',
        row.status,
        formatValue(row.value)
      ])
    ];
    const csv = csvRows
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    downloadBlob(`${exportBaseName}.csv`, csv, 'text/csv;charset=utf-8;');
    setDownloadOpen(false);
  };

  const exportPdf = () => {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    pdf.setFontSize(16);
    pdf.text(`Relatorio - ${title}`, 40, 50);
    pdf.setFontSize(10);

    let y = 82;
    recentRows.forEach((row, index) => {
      const line = `${index + 1}. ${dateToPt(row.date)} | ${row.primary} | ${row.status} | ${formatValue(row.value)}`;
      pdf.text(line, 40, y);
      y += 16;
      if (y > 770) {
        pdf.addPage();
        y = 50;
      }
    });

    if (!recentRows.length) {
      pdf.text(emptyMessage, 40, y);
    }

    pdf.save(`${exportBaseName}.pdf`);
    setDownloadOpen(false);
  };

  return (
    <section className="panel reports-sales-panel">
      <div className="reports-sales-header">
        <div>
          <div className="reports-breadcrumb">{breadcrumb}</div>
          <h2>{title}</h2>
        </div>

        <div className="reports-download-wrap">
          <button type="button" className="button reports-download-button" onClick={() => setDownloadOpen((open) => !open)}>
            Baixar <IconUpload />
          </button>

          {downloadOpen ? (
            <div className="reports-download-menu">
              <button type="button" onClick={exportExcel}>
                Excel
              </button>
              <button type="button" onClick={exportPdf}>
                PDF
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="reports-sales-toolbar">
        <span className="chip reports-range-chip">
          <IconCalendar /> Ultimos 28 dias
        </span>
      </div>

      {recentRows.length === 0 ? (
        <div className="reports-empty">
          <div className="reports-empty-icon">🗂</div>
          <strong>{emptyTitle}</strong>
          <span>{emptyMessage}</span>
        </div>
      ) : (
        <div className="data-list reports-sales-list">
          <div className="data-row cols-4 header">
            <span>Data</span>
            <span>Descricao</span>
            <span>Situacao</span>
            <span>Valor</span>
          </div>
          {recentRows.map((row, index) => (
            <div key={`${row.primary}-${index}`} className="data-row cols-4">
              <div className="mono">{dateToPt(row.date)}</div>
              <div>
                <strong>{row.primary}</strong>
                <div className="meta">{row.secondary || '--'}</div>
              </div>
              <span className={`finance-status-badge ${statusTone(row.status)}`}>{row.status}</span>
              <div className="mono">{formatValue(row.value)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

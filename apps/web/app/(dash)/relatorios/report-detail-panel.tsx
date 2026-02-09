'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import DateRangePicker from '../date-range';
import { IconDownload } from '../icons';

type ReportColumn = {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
};

type ReportTableRow = {
  id: string;
  values: Record<string, string>;
};

type ReportDetailPanelProps = {
  breadcrumb: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportTableRow[];
  exportBaseName: string;
  emptyTitle: string;
  emptyMessage: string;
  backHref?: string;
  periodLabel?: string;
  dateRangeDefaultPreset?: string;
};

const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

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

export default function ReportDetailPanel({
  breadcrumb,
  title,
  columns,
  rows,
  exportBaseName,
  emptyTitle,
  emptyMessage,
  backHref = '/relatorios',
  periodLabel = 'Ultimos 28 dias',
  dateRangeDefaultPreset = '28d'
}: ReportDetailPanelProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);
  const breadcrumbParts = useMemo(
    () => breadcrumb.split('›').map((part) => part.trim()).filter(Boolean),
    [breadcrumb]
  );
  const breadcrumbRoot = breadcrumbParts[0] || 'Relatorios';
  const breadcrumbCurrent = breadcrumbParts[1] || title;

  useEffect(() => {
    if (!downloadOpen) return;

    const handleOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.reports-download-wrap')) {
        setDownloadOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDownloadOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [downloadOpen]);

  const exportExcel = () => {
    const header = columns.map((column) => csvEscape(column.label)).join(';');
    const body = rows
      .map((row) => columns.map((column) => csvEscape(row.values[column.key] || '')).join(';'))
      .join('\n');
    const csv = `\uFEFF${header}${body ? `\n${body}` : ''}`;
    downloadBlob(`${exportBaseName}.csv`, csv, 'text/csv;charset=utf-8;');
    setDownloadOpen(false);
  };

  const exportPdf = () => {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 40;
    const tableWidth = pageWidth - marginX * 2;
    const colWidth = tableWidth / Math.max(1, columns.length);
    const contentBottom = pageHeight - 52;
    const cellPaddingX = 6;
    const lineHeight = 11;
    const headerHeight = 26;

    const drawPageHeader = () => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(26);
      pdf.setTextColor(31, 41, 55);
      pdf.text(title, pageWidth / 2, 58, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.setTextColor(100, 116, 139);
      pdf.text(periodLabel, pageWidth / 2, 78, { align: 'center' });
    };

    const drawTableHeader = (startY: number) => {
      pdf.setFillColor(100, 116, 139);
      pdf.setDrawColor(181, 192, 209);
      pdf.rect(marginX, startY, tableWidth, headerHeight, 'FD');
      columns.forEach((column, index) => {
        const x = marginX + index * colWidth;
        if (index > 0) {
          pdf.line(x, startY, x, startY + headerHeight);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(11);
        pdf.setTextColor(255, 255, 255);
        pdf.text(column.label, x + cellPaddingX, startY + 17, {
          maxWidth: colWidth - cellPaddingX * 2
        });
      });
      return startY + headerHeight;
    };

    drawPageHeader();
    let y = 104;
    if (!rows.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      pdf.setTextColor(100, 116, 139);
      const emptyLines = pdf.splitTextToSize(emptyMessage, tableWidth) as string[];
      emptyLines.forEach((line) => {
        pdf.text(line, marginX, y);
        y += 16;
      });
    } else {
      y = drawTableHeader(y);
      rows.forEach((row) => {
        const wrappedByCol = columns.map((column) =>
          pdf.splitTextToSize(row.values[column.key] || '--', colWidth - cellPaddingX * 2) as string[]
        );
        const linesCount = Math.max(...wrappedByCol.map((wrapped) => wrapped.length), 1);
        const rowHeight = Math.max(24, linesCount * lineHeight + 10);

        if (y + rowHeight > contentBottom) {
          pdf.addPage();
          drawPageHeader();
          y = 104;
          y = drawTableHeader(y);
        }

        pdf.setDrawColor(181, 192, 209);
        pdf.setFillColor(255, 255, 255);
        pdf.rect(marginX, y, tableWidth, rowHeight, 'FD');

        columns.forEach((column, index) => {
          const x = marginX + index * colWidth;
          if (index > 0) {
            pdf.line(x, y, x, y + rowHeight);
          }

          const lines = wrappedByCol[index];
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(10.5);
          pdf.setTextColor(30, 41, 59);
          lines.forEach((line, lineIndex) => {
            pdf.text(line, x + cellPaddingX, y + 15 + lineIndex * lineHeight, {
              maxWidth: colWidth - cellPaddingX * 2
            });
          });
        });

        y += rowHeight;
      });
    }

    const generatedAt = new Date().toLocaleString('pt-BR');
    const totalPages = pdf.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      pdf.setPage(page);
      pdf.setFontSize(10);
      pdf.setTextColor(107, 114, 128);
      pdf.text(`Gerado em ${generatedAt} no Revendi Web`, pageWidth / 2, pageHeight - 20, { align: 'center' });
    }

    pdf.save(`${exportBaseName}.pdf`);
    setDownloadOpen(false);
  };

  return (
    <section className="report-detail-shell">
      <div className="report-detail-header-row">
        <div>
          <div className="report-detail-breadcrumb">
            <Link href={backHref} className="report-detail-breadcrumb-link">
              {breadcrumbRoot}
            </Link>
            <span aria-hidden="true">›</span>
            <span>{breadcrumbCurrent}</span>
          </div>
          <h2 className="report-detail-title">{title}</h2>
        </div>

        <div className="reports-download-wrap">
          <button
            type="button"
            className="button reports-download-button"
            onClick={() => setDownloadOpen((open) => !open)}
          >
            Baixar <IconDownload />
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

      <div className="report-detail-toolbar">
        <DateRangePicker defaultPreset={dateRangeDefaultPreset} />
      </div>

      {rows.length === 0 ? (
        <div className="reports-empty">
          <div className="reports-empty-icon">📄</div>
          <strong>{emptyTitle}</strong>
          <span>{emptyMessage}</span>
        </div>
      ) : (
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={`align-${column.align || 'left'}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={`${row.id}-${column.key}`} className={`align-${column.align || 'left'}`}>
                      {row.values[column.key] || '--'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

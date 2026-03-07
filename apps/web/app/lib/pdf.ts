import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { downloadBlob, isMobileWeb } from './download';

type PdfFormat = 'a4' | 'thermal-80' | 'thermal-58';

type PdfBaseOptions = {
  element: HTMLElement;
  format: PdfFormat;
};

type PdfOptions = PdfBaseOptions & {
  filename: string;
  iosTargetWindow?: Window | null;
};

const captureElementCanvas = async (element: HTMLElement, format: PdfFormat) => {
  const bounds = element.getBoundingClientRect();
  const renderedWidth = Math.max(Math.ceil(bounds.width), element.clientWidth, 0);
  const contentWidth = Math.max(renderedWidth, element.scrollWidth, 0);
  const isDigitalReceipt = element.classList.contains('receipt-card-group');
  const captureWidth = isDigitalReceipt ? Math.max(renderedWidth, 1) : Math.max(contentWidth, 1);
  const captureHost = document.createElement('div');
  const captureNode = element.cloneNode(true) as HTMLElement;

  captureHost.style.position = 'fixed';
  captureHost.style.left = '-10000px';
  captureHost.style.top = '0';
  captureHost.style.pointerEvents = 'none';
  captureHost.style.opacity = '0';
  captureHost.style.zIndex = '-1';
  captureHost.style.margin = '0';
  captureHost.style.padding = '0';
  captureHost.style.background = '#ffffff';
  captureHost.style.overflow = 'visible';
  captureHost.style.colorScheme = 'light';

  captureNode.style.width = `${captureWidth}px`;
  captureNode.style.maxWidth = `${captureWidth}px`;
  captureNode.style.maxHeight = 'none';
  captureNode.style.height = 'auto';
  captureNode.style.overflow = 'hidden';
  captureNode.style.boxSizing = 'border-box';
  captureNode.style.margin = '0';
  captureNode.style.border = '0';
  captureNode.style.borderRadius = '0';

  if (format === 'a4' && isDigitalReceipt) {
    captureNode.style.setProperty('--ink', '#0f172a');
    captureNode.style.setProperty('--muted', '#475569');
    captureNode.style.setProperty('--panel', '#ffffff');
    captureNode.style.setProperty('--panel-2', '#edf2f7');
    captureNode.style.setProperty('--stroke', 'rgba(100, 116, 139, 0.34)');
    captureNode.style.background = '#ffffff';
    captureNode.style.color = '#0f172a';
    captureNode.style.colorScheme = 'light';
  }

  if (format !== 'a4') {
    captureNode.style.setProperty('--ink', '#0f172a');
    captureNode.style.setProperty('--muted', '#475569');
    captureNode.style.background = '#ffffff';
    captureNode.style.color = '#0f172a';
    captureNode.style.colorScheme = 'light';

    const thermalRoot = captureNode.classList.contains('receipt-thermal')
      ? captureNode
      : captureNode.querySelector<HTMLElement>('.receipt-thermal');
    if (thermalRoot) {
      thermalRoot.style.background = '#ffffff';
      thermalRoot.style.borderColor = '#e2e8f0';
      thermalRoot.style.color = '#0f172a';
      const thermalPre = thermalRoot.querySelector<HTMLElement>('pre');
      if (thermalPre) {
        thermalPre.style.color = '#0f172a';
        thermalPre.style.background = 'transparent';
      }
    }
  }

  captureHost.appendChild(captureNode);
  document.body.appendChild(captureHost);

  let canvas: HTMLCanvasElement;
  try {
    const renderCanvas = async (scale: number, timeoutMs: number) => {
      const renderPromise = html2canvas(captureNode, {
        scale,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: captureWidth,
        windowWidth: captureWidth,
        imageTimeout: 8000,
        logging: false
      });
      let timeoutId: number | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('pdf_capture_timeout')), timeoutMs);
      });
      try {
        return (await Promise.race([renderPromise, timeoutPromise])) as HTMLCanvasElement;
      } finally {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      }
    };

    const preferredScale = isMobileWeb() ? 1 : 2;

    try {
      canvas = await renderCanvas(preferredScale, 8000);
    } catch {
      canvas = await renderCanvas(1, 6000);
    }
  } finally {
    if (captureHost.parentNode) {
      captureHost.parentNode.removeChild(captureHost);
    }
  }

  return canvas;
};

const buildPdfFromCanvas = (canvas: HTMLCanvasElement, format: PdfFormat) => {
  if (format === 'a4') {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 5;
    const usablePageWidth = pageWidth - margin * 2;
    const usablePageHeight = pageHeight - margin * 2;
    const imgData = canvas.toDataURL('image/png');
    const scale = Math.min(usablePageWidth / canvas.width, usablePageHeight / canvas.height);
    const imgWidthMm = canvas.width * scale;
    const imgHeightMm = canvas.height * scale;
    const offsetX = margin + (usablePageWidth - imgWidthMm) / 2;
    const offsetY = margin + (usablePageHeight - imgHeightMm) / 2;
    pdf.addImage(imgData, 'PNG', offsetX, offsetY, imgWidthMm, imgHeightMm);
    return pdf;
  }

  const imgData = canvas.toDataURL('image/png');
  const width = format === 'thermal-58' ? 58 : 80;
  const height = Math.max((canvas.height * width) / canvas.width, 20);
  const pdf = new jsPDF('p', 'mm', [width, height]);
  pdf.addImage(imgData, 'PNG', 0, 0, width, height);
  return pdf;
};

export const buildPdfBlob = async ({ element, format }: PdfBaseOptions) => {
  const canvas = await captureElementCanvas(element, format);
  const pdf = buildPdfFromCanvas(canvas, format);
  return pdf.output('blob');
};
export const buildPdfBlobUrl = async ({ element, format }: PdfBaseOptions) => {
  const canvas = await captureElementCanvas(element, format);
  const pdf = buildPdfFromCanvas(canvas, format);
  return String(pdf.output('bloburl'));
};

export const downloadPdf = async ({ element, filename, format, iosTargetWindow }: PdfOptions) => {
  const canvas = await captureElementCanvas(element, format);
  const pdf = buildPdfFromCanvas(canvas, format);
  const blob = pdf.output('blob');
  downloadBlob({ blob, filename, openInNewTabOnIos: true, iosTargetWindow });
};

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type PdfFormat = 'a4' | 'thermal-80' | 'thermal-58';

type PdfBaseOptions = {
  element: HTMLElement;
  format: PdfFormat;
};

type PdfOptions = PdfBaseOptions & {
  filename: string;
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

  captureHost.appendChild(captureNode);
  document.body.appendChild(captureHost);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(captureNode, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: captureWidth,
      windowWidth: captureWidth
    });
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

export const buildPdfBlobUrl = async ({ element, format }: PdfBaseOptions) => {
  const canvas = await captureElementCanvas(element, format);
  const pdf = buildPdfFromCanvas(canvas, format);
  return String(pdf.output('bloburl'));
};

export const downloadPdf = async ({ element, filename, format }: PdfOptions) => {
  const canvas = await captureElementCanvas(element, format);
  const pdf = buildPdfFromCanvas(canvas, format);
  pdf.save(filename);
};

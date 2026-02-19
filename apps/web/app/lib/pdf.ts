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

const captureElementCanvas = async (element: HTMLElement) => {
  const bounds = element.getBoundingClientRect();
  const captureWidth = Math.max(Math.ceil(bounds.width), element.scrollWidth, 320);
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

  captureNode.style.width = `${captureWidth}px`;
  captureNode.style.maxWidth = `${captureWidth}px`;
  captureNode.style.maxHeight = 'none';
  captureNode.style.height = 'auto';
  captureNode.style.overflow = 'visible';
  captureNode.style.margin = '0';
  captureNode.style.border = '0';
  captureNode.style.borderRadius = '0';

  captureHost.appendChild(captureNode);
  document.body.appendChild(captureHost);

  let canvas: HTMLCanvasElement;
  try {
    canvas = await html2canvas(captureNode, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff'
    });
  } finally {
    if (captureHost.parentNode) {
      captureHost.parentNode.removeChild(captureHost);
    }
  }

  return canvas;
};

const buildPdfFromCanvas = (canvas: HTMLCanvasElement, format: PdfFormat) => {
  const imgData = canvas.toDataURL('image/png');

  if (format === 'a4') {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const safeWidth = pageWidth - 10;
    const safeHeight = pageHeight - 10;
    const scale = Math.min(safeWidth / canvas.width, safeHeight / canvas.height);
    const imgWidth = canvas.width * scale;
    const imgHeight = canvas.height * scale;
    const offsetX = (pageWidth - imgWidth) / 2;
    const offsetY = (pageHeight - imgHeight) / 2;

    pdf.addImage(imgData, 'PNG', offsetX, offsetY, imgWidth, imgHeight);
    return pdf;
  }

  const width = format === 'thermal-58' ? 58 : 80;
  const height = Math.max((canvas.height * width) / canvas.width, 20);
  const pdf = new jsPDF('p', 'mm', [width, height]);
  pdf.addImage(imgData, 'PNG', 0, 0, width, height);
  return pdf;
};

export const buildPdfBlobUrl = async ({ element, format }: PdfBaseOptions) => {
  const canvas = await captureElementCanvas(element);
  const pdf = buildPdfFromCanvas(canvas, format);
  return String(pdf.output('bloburl'));
};

export const downloadPdf = async ({ element, filename, format }: PdfOptions) => {
  const canvas = await captureElementCanvas(element);
  const pdf = buildPdfFromCanvas(canvas, format);
  pdf.save(filename);
};

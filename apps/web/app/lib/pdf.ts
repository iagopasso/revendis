import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

type PdfOptions = {
  element: HTMLElement;
  filename: string;
  format: 'a4' | 'thermal-80' | 'thermal-58';
};

export const downloadPdf = async ({ element, filename, format }: PdfOptions) => {
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff'
  });

  const imgData = canvas.toDataURL('image/png');

  if (format === 'a4') {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    while (position + imgHeight > pageHeight) {
      position -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    }
    pdf.save(filename);
    return;
  }

  const width = format === 'thermal-58' ? 58 : 80;
  const pdf = new jsPDF('p', 'mm', [width, (canvas.height * width) / canvas.width]);
  pdf.addImage(imgData, 'PNG', 0, 0, width, (canvas.height * width) / canvas.width);
  pdf.save(filename);
};

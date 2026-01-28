type PrintOptions = {
  html: string;
  styles?: string;
  pageStyle?: string;
};

const createIframe = () => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);
  return iframe;
};

export const printHtml = async ({ html, styles = '', pageStyle = '' }: PrintOptions) => {
  const iframe = createIframe();
  const doc = iframe.contentDocument;
  if (!doc) return;

  doc.open();
  doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      ${styles}
      @media print {
        ${pageStyle}
      }
    </style>
  </head>
  <body>
    ${html}
  </body>
</html>`);
  doc.close();

  await new Promise((resolve) => setTimeout(resolve, 150));
  iframe.contentWindow?.focus();
  iframe.contentWindow?.print();

  setTimeout(() => {
    iframe.remove();
  }, 1000);
};

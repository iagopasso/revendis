type PrintOptions = {
  html: string;
  styles?: string;
  pageStyle?: string;
  headHtml?: string;
  title?: string;
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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getDocumentHeadHtml = () =>
  Array.from(document.head.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n');

const waitForPrintableFrame = async (iframe: HTMLIFrameElement) => {
  const doc = iframe.contentDocument;
  if (!doc) return;

  const stylesheetLinks = Array.from(doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  await Promise.race([
    Promise.all(
      stylesheetLinks.map(
        (link) =>
          new Promise<void>((resolve) => {
            const finish = () => resolve();
            if (link.sheet) {
              resolve();
              return;
            }
            link.addEventListener('load', finish, { once: true });
            link.addEventListener('error', finish, { once: true });
            window.setTimeout(finish, 700);
          })
      )
    ),
    new Promise<void>((resolve) => window.setTimeout(resolve, 900))
  ]);

  if ('fonts' in doc && doc.fonts?.ready) {
    await Promise.race([
      doc.fonts.ready.then(() => undefined).catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 400))
    ]);
  }

  await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
};

export const printHtml = async ({
  html,
  styles = '',
  pageStyle = '',
  headHtml,
  title = 'Imprimir'
}: PrintOptions) => {
  const iframe = createIframe();
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }

  const resolvedHeadHtml = headHtml ?? getDocumentHeadHtml();

  doc.open();
  doc.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    ${resolvedHeadHtml}
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

  try {
    await waitForPrintableFrame(iframe);
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  } finally {
    setTimeout(() => {
      iframe.remove();
    }, 1000);
  }
};

type DownloadBlobOptions = {
  blob: Blob;
  filename: string;
  openInNewTabOnIos?: boolean;
};

const isIosWeb = () => {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return true;
  }
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
};

export const downloadBlob = ({ blob, filename, openInNewTabOnIos = false }: DownloadBlobOptions) => {
  const href = URL.createObjectURL(blob);

  if (openInNewTabOnIos && isIosWeb()) {
    const popup = window.open(href, '_blank', 'noopener,noreferrer');
    if (!popup) {
      window.location.href = href;
    }
    window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
};

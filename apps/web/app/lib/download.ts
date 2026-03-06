type DownloadBlobOptions = {
  blob: Blob;
  filename: string;
  openInNewTabOnIos?: boolean;
  iosTargetWindow?: Window | null;
};

export const isIosWeb = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) {
    return true;
  }
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
};

export const isMobileWeb = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

export const prepareIosDownloadWindow = () => {
  if (typeof window === 'undefined' || !isIosWeb()) return null;
  const popup = window.open('', '_blank');
  if (!popup) return null;
  try {
    popup.document.title = 'Gerando PDF...';
    popup.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 24px;">Gerando PDF...</p>';
  } catch {
    // Ignore browser restrictions on pre-opened popup document writes.
  }
  return popup;
};

export const closeDownloadWindow = (targetWindow: Window | null | undefined) => {
  if (!targetWindow || targetWindow.closed) return;
  targetWindow.close();
};

export const downloadBlob = ({
  blob,
  filename,
  openInNewTabOnIos = false,
  iosTargetWindow = null
}: DownloadBlobOptions) => {
  const href = URL.createObjectURL(blob);

  if (openInNewTabOnIos && isIosWeb()) {
    const targetWindow = iosTargetWindow && !iosTargetWindow.closed ? iosTargetWindow : window.open('', '_blank');
    if (targetWindow && !targetWindow.closed) {
      targetWindow.location.href = href;
    } else {
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

import { Capacitor, registerPlugin } from '@capacitor/core';

type ReportExportPlugin = {
  printCurrentView(options?: { jobName?: string }): Promise<void>;
  shareTextFile(options: { fileName: string; content: string; mimeType?: string; title?: string }): Promise<{ fileName?: string }>;
};

const NativeReportExport = registerPlugin<ReportExportPlugin>('ReportExport');
const blobRegistry = new Map<string, Blob>();
let installed = false;

export function installNativeExportBridge() {
  if (installed || !Capacitor.isNativePlatform()) return;
  installed = true;

  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  const originalAnchorClick = HTMLAnchorElement.prototype.click;

  URL.createObjectURL = ((object: Blob | MediaSource) => {
    const url = originalCreateObjectURL(object);
    if (object instanceof Blob) blobRegistry.set(url, object);
    return url;
  }) as typeof URL.createObjectURL;

  URL.revokeObjectURL = ((url: string) => {
    blobRegistry.delete(url);
    originalRevokeObjectURL(url);
  }) as typeof URL.revokeObjectURL;

  HTMLAnchorElement.prototype.click = function patchedAnchorClick() {
    const fileName = this.download;
    const blob = fileName ? blobRegistry.get(this.href) : undefined;
    if (!fileName || !blob) {
      return originalAnchorClick.call(this);
    }

    const capturedBlob = blob;
    void capturedBlob.text().then((content) => NativeReportExport.shareTextFile({
      fileName,
      content,
      mimeType: capturedBlob.type || guessMimeType(fileName),
      title: 'حفظ أو مشاركة تقرير المعداوي',
    })).catch(() => originalAnchorClick.call(this));
  };

  window.print = (() => {
    document.documentElement.classList.add('native-printing');
    window.setTimeout(() => {
      void NativeReportExport.printCurrentView({ jobName: document.title || 'Elmadawy Report' })
        .finally(() => document.documentElement.classList.remove('native-printing'));
    }, 120);
  }) as typeof window.print;
}

function guessMimeType(fileName: string) {
  const value = fileName.toLowerCase();
  if (value.endsWith('.csv')) return 'text/csv';
  if (value.endsWith('.txt')) return 'text/plain';
  if (value.endsWith('.html')) return 'text/html';
  return 'application/octet-stream';
}

import {
  EXPORT_IMAGE_EVENT,
  EXPORT_PDF_CANVAS_READY_EVENT,
  EXPORT_PDF_EVENT,
} from './constants';

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
    },
    'image/png'
  );
}

export function captureCanvasAsDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.85);
}

export { EXPORT_IMAGE_EVENT, EXPORT_PDF_EVENT, EXPORT_PDF_CANVAS_READY_EVENT };

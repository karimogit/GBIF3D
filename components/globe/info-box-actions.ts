/**
 * Pure helpers for Cesium InfoBox → app bridge (lightbox + save).
 * Kept free of React/Cesium so they can be unit-tested.
 */
import {
  LIGHTBOX_EVENT,
  LIGHTBOX_PHOTO_CLASS,
  SAVE_BUTTON_CLASS,
  SAVE_OCCURRENCE_EVENT,
} from './constants';

export type LightboxDetail = { url?: string; urls?: string[]; index?: number };
export type SaveOccurrenceDetail = { key: number; action: 'add' | 'remove' };

function readDataAttr(el: Element, name: string): string | null {
  if (!(el instanceof HTMLElement)) return null;
  const fromAttr = el.getAttribute(name);
  if (fromAttr != null && fromAttr !== '') return fromAttr;
  // dataset keys: data-fullurl → fullurl, data-allurls → allurls, data-key → key
  const dataKey = name.startsWith('data-') ? name.slice(5) : name;
  const fromDataset = el.dataset?.[dataKey];
  return fromDataset != null && fromDataset !== '' ? fromDataset : null;
}

/** Resolve the nearest Element from an event target (handles rare text-node targets). */
export function eventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Text && target.parentElement) return target.parentElement;
  return null;
}

export function parseLightboxDetailFromPhoto(photo: Element): LightboxDetail | null {
  const img = photo instanceof HTMLImageElement ? photo : photo.querySelector('img');
  const fullUrl = readDataAttr(photo, 'data-fullurl') ?? img?.getAttribute('src') ?? img?.src ?? '';
  if (!fullUrl) return null;

  try {
    const allurlsRaw = readDataAttr(photo, 'data-allurls');
    const indexRaw = readDataAttr(photo, 'data-index');
    if (allurlsRaw != null && indexRaw != null) {
      const urls = JSON.parse(allurlsRaw) as unknown;
      if (Array.isArray(urls) && urls.every((u) => typeof u === 'string' && u.startsWith('https://'))) {
        const index = Math.max(0, Math.min(parseInt(indexRaw, 10) || 0, urls.length - 1));
        return { urls: urls as string[], index };
      }
    }
  } catch {
    // fall through to single URL
  }

  if (!fullUrl.startsWith('https://') && !fullUrl.startsWith('http://')) {
    // Still allow http thumbnails to attempt open; Lightbox will reject non-https.
  }
  return { url: fullUrl };
}

export function parseSaveDetailFromButton(button: Element): SaveOccurrenceDetail | null {
  const keyRaw = readDataAttr(button, 'data-key');
  const actionRaw = readDataAttr(button, 'data-action');
  const key = parseInt(keyRaw ?? '', 10);
  if (!Number.isInteger(key)) return null;
  if (actionRaw !== 'add' && actionRaw !== 'remove') return null;
  return { key, action: actionRaw };
}

/** Dispatch on this window and, when reachable, on window.top (app may listen on either). */
export function dispatchToAppWindows(eventName: string, detail: unknown): void {
  const event = new CustomEvent(eventName, { detail });
  window.dispatchEvent(event);
  try {
    if (window.top != null && window.top !== window) {
      window.top.dispatchEvent(new CustomEvent(eventName, { detail }));
    }
  } catch {
    // Cross-origin top: ignore; local window dispatch is enough for same-frame apps.
  }
}

export function dispatchLightboxFromPhoto(photo: Element): boolean {
  const detail = parseLightboxDetailFromPhoto(photo);
  if (!detail) return false;
  dispatchToAppWindows(LIGHTBOX_EVENT, detail);
  return true;
}

export function dispatchSaveFromButton(button: Element): boolean {
  const detail = parseSaveDetailFromButton(button);
  if (!detail) return false;
  dispatchToAppWindows(SAVE_OCCURRENCE_EVENT, detail);
  return true;
}

export function findInfoBoxInteractiveTarget(target: Element): {
  photo: Element | null;
  saveBtn: Element | null;
  link: HTMLAnchorElement | null;
} {
  return {
    photo: target.closest(`.${LIGHTBOX_PHOTO_CLASS}`),
    saveBtn: target.closest(`.${SAVE_BUTTON_CLASS}`),
    link: target.closest('a'),
  };
}

/** Map a parent-page pointer/click on the InfoBox iframe to the inner element at that point. */
export function resolveInfoBoxFrameTarget(
  frame: HTMLIFrameElement,
  clientX: number,
  clientY: number
): Element | null {
  let doc: Document | null = null;
  try {
    doc = frame.contentDocument;
  } catch {
    return null;
  }
  if (!doc) return null;

  const rect = frame.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

  const el = doc.elementFromPoint(x, y);
  return el instanceof Element ? el : null;
}

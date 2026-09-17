/** Session-persisted species info box layout (position + collapsed). */
export interface InfoBoxLayoutState {
  left?: number;
  top?: number;
  collapsed?: boolean;
}

export const INFOBOX_STATE_KEY = 'gbif-globe-infobox-state';

export function readInfoBoxLayoutState(): InfoBoxLayoutState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(INFOBOX_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InfoBoxLayoutState;
    if (parsed == null || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeInfoBoxLayoutState(state: InfoBoxLayoutState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(INFOBOX_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clampInfoBoxPosition(
  left: number,
  top: number,
  boxWidth: number,
  boxHeight: number,
  parentWidth: number,
  parentHeight: number,
  margin = 8
): { left: number; top: number } {
  const maxLeft = Math.max(margin, parentWidth - boxWidth - margin);
  const maxTop = Math.max(margin, parentHeight - boxHeight - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop),
  };
}

export function toggleButtonLabel(collapsed: boolean): string {
  return collapsed ? '▸' : '▾';
}

export function toggleButtonAriaLabel(collapsed: boolean): string {
  return collapsed ? 'Expand species info' : 'Collapse species info';
}

export function readPositionedLayout(infoBox: HTMLElement): InfoBoxLayoutState {
  const left = Number.parseFloat(infoBox.style.left);
  const top = Number.parseFloat(infoBox.style.top);
  return {
    ...(Number.isFinite(left) ? { left } : {}),
    ...(Number.isFinite(top) ? { top } : {}),
    collapsed: infoBox.classList.contains('gbif-infoBox-collapsed'),
  };
}

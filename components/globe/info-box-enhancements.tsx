'use client';

import { useEffect } from 'react';
import { useCesium } from 'resium';
import {
  clampInfoBoxPosition,
  readInfoBoxLayoutState,
  readPositionedLayout,
  toggleButtonAriaLabel,
  toggleButtonLabel,
  writeInfoBoxLayoutState,
} from './info-box-layout';

const POSITIONED_CLASS = 'gbif-infoBox-positioned';
const COLLAPSED_CLASS = 'gbif-infoBox-collapsed';
const TOGGLE_CLASS = 'gbif-infoBox-toggle';

function applyPosition(infoBox: HTMLElement, left: number, top: number): void {
  infoBox.classList.add(POSITIONED_CLASS);
  infoBox.style.right = 'auto';
  infoBox.style.left = `${left}px`;
  infoBox.style.top = `${top}px`;
  infoBox.style.transform = 'none';
}

function saveLayout(infoBox: HTMLElement): void {
  writeInfoBoxLayoutState(readPositionedLayout(infoBox));
}

function setupInfoBoxEnhancements(infoBox: HTMLElement): () => void {
  const title = infoBox.querySelector('.cesium-infoBox-title');
  if (!(title instanceof HTMLElement)) return () => {};

  let toggleBtn: HTMLButtonElement;
  const existingToggle = title.querySelector(`.${TOGGLE_CLASS}`);
  if (existingToggle instanceof HTMLButtonElement) {
    toggleBtn = existingToggle;
  } else {
    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = TOGGLE_CLASS;
    const closeBtn = title.querySelector('.cesium-infoBox-close');
    if (closeBtn) title.insertBefore(toggleBtn, closeBtn);
    else title.appendChild(toggleBtn);
  }

  const updateToggle = (collapsed: boolean) => {
    toggleBtn.textContent = toggleButtonLabel(collapsed);
    toggleBtn.setAttribute('aria-label', toggleButtonAriaLabel(collapsed));
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  };

  const onToggleClick = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    const collapsed = infoBox.classList.toggle(COLLAPSED_CLASS);
    updateToggle(collapsed);
    saveLayout(infoBox);
  };
  toggleBtn.addEventListener('click', onToggleClick);

  const saved = readInfoBoxLayoutState();
  if (saved?.left != null && saved?.top != null) {
    applyPosition(infoBox, saved.left, saved.top);
  }
  if (saved?.collapsed) {
    infoBox.classList.add(COLLAPSED_CLASS);
  }
  updateToggle(infoBox.classList.contains(COLLAPSED_CLASS));

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target;
    if (!(target instanceof Element) || target.closest('button')) return;

    dragging = true;
    title.setPointerCapture(e.pointerId);

    const rect = infoBox.getBoundingClientRect();
    const parent = infoBox.offsetParent instanceof HTMLElement ? infoBox.offsetParent : infoBox.parentElement;
    const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    startLeft = rect.left - parentRect.left;
    startTop = rect.top - parentRect.top;
    startX = e.clientX;
    startY = e.clientY;

    applyPosition(infoBox, startLeft, startTop);
    title.style.cursor = 'grabbing';
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const parent = infoBox.offsetParent instanceof HTMLElement ? infoBox.offsetParent : infoBox.parentElement;
    const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const parentWidth = parentRect.width;
    const parentHeight = parentRect.height;

    const nextLeft = startLeft + (e.clientX - startX);
    const nextTop = startTop + (e.clientY - startY);
    const clamped = clampInfoBoxPosition(
      nextLeft,
      nextTop,
      infoBox.offsetWidth,
      infoBox.offsetHeight,
      parentWidth,
      parentHeight
    );
    applyPosition(infoBox, clamped.left, clamped.top);
  };

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    title.style.cursor = '';
    try {
      title.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    saveLayout(infoBox);
  };

  title.addEventListener('pointerdown', onPointerDown);
  title.addEventListener('pointermove', onPointerMove);
  title.addEventListener('pointerup', endDrag);
  title.addEventListener('pointercancel', endDrag);

  return () => {
    toggleBtn.removeEventListener('click', onToggleClick);
    title.removeEventListener('pointerdown', onPointerDown);
    title.removeEventListener('pointermove', onPointerMove);
    title.removeEventListener('pointerup', endDrag);
    title.removeEventListener('pointercancel', endDrag);
  };
}

/** Right-aligned, draggable, foldable species info box chrome for Cesium's InfoBox. */
export function InfoBoxEnhancements() {
  const cesium = useCesium();

  useEffect(() => {
    const viewer = cesium?.viewer;
    const container = viewer?.container;
    if (!container) return;

    let cleanup: (() => void) | undefined;
    let observer: MutationObserver | undefined;

    const attach = () => {
      const infoBox = container.querySelector('.cesium-infoBox');
      if (!(infoBox instanceof HTMLElement)) return false;
      cleanup?.();
      cleanup = setupInfoBoxEnhancements(infoBox);
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect();
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      cleanup?.();
    };
  }, [cesium?.viewer]);

  return null;
}

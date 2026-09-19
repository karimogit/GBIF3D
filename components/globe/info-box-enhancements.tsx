'use client';

import { useEffect } from 'react';
import { useCesium } from 'resium';
import {
  readInfoBoxLayoutState,
  toggleButtonAriaLabel,
  toggleButtonLabel,
  writeInfoBoxLayoutState,
} from './info-box-layout';

const COLLAPSED_CLASS = 'gbif-infoBox-collapsed';
const TOGGLE_CLASS = 'gbif-infoBox-toggle';

function saveCollapsed(infoBox: HTMLElement): void {
  writeInfoBoxLayoutState({
    collapsed: infoBox.classList.contains(COLLAPSED_CLASS),
  });
}

function setupInfoBoxEnhancements(infoBox: HTMLElement): () => void {
  const title = infoBox.querySelector('.cesium-infoBox-title');
  if (!(title instanceof HTMLElement)) return () => {};

  // Keep Cesium's default right-aligned CSS; clear any stale left positioning.
  infoBox.classList.remove('gbif-infoBox-positioned');
  infoBox.style.left = '';
  infoBox.style.right = '';
  infoBox.style.top = '';
  infoBox.style.transform = '';

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
    saveCollapsed(infoBox);
  };
  toggleBtn.addEventListener('click', onToggleClick);

  const saved = readInfoBoxLayoutState();
  if (saved?.collapsed) {
    infoBox.classList.add(COLLAPSED_CLASS);
  }
  updateToggle(infoBox.classList.contains(COLLAPSED_CLASS));

  return () => {
    toggleBtn.removeEventListener('click', onToggleClick);
  };
}

/** Right-aligned, foldable species info box chrome for Cesium's InfoBox. */
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

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

const LIGHTBOX_EVENT = 'gbif-globe-lightbox';

/** Only allow https URLs (e.g. GBIF image cache) to avoid javascript: or data: in img src. */
function isAllowedImageUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('https://');
}

function isAllowedUrlList(urls: unknown): urls is string[] {
  return Array.isArray(urls) && urls.every(isAllowedImageUrl);
}

export default function Lightbox() {
  const [urls, setUrls] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isOpen = urls.length > 0;
  const currentUrl = urls[currentIndex] ?? null;
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ url?: string; urls?: string[]; index?: number }>;
      const d = ev.detail;
      if (!d) return;
      if (d.urls != null && isAllowedUrlList(d.urls) && d.urls.length > 0) {
        const index = Math.max(0, Math.min(d.index ?? 0, d.urls.length - 1));
        setUrls(d.urls);
        setCurrentIndex(index);
      } else if (d.url != null && isAllowedImageUrl(d.url)) {
        setUrls([d.url]);
        setCurrentIndex(0);
      }
    };
    window.addEventListener(LIGHTBOX_EVENT, handler);
    return () => window.removeEventListener(LIGHTBOX_EVENT, handler);
  }, []);

  const close = useCallback(() => {
    setUrls([]);
    setCurrentIndex(0);
  }, []);

  const goPrev = useCallback(() => {
    setCurrentIndex((i) => (i <= 0 ? urls.length - 1 : i - 1));
  }, [urls.length]);

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i >= urls.length - 1 ? 0 : i + 1));
  }, [urls.length]);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      // Move focus into the lightbox so keyboard arrows work even if focus was inside the Cesium infoBox iframe.
      // Use setTimeout to ensure focus happens after any iframe focus is cleared
      const timeoutId = setTimeout(() => {
        containerRef.current?.focus();
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      // Only handle keys if lightbox is open and not typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        goNext();
      }
    };
    // Use capture phase to catch events before they're handled elsewhere
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, close, goPrev, goNext]);

  if (!isOpen || !currentUrl) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo lightbox"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.88)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        boxSizing: 'border-box',
      }}
      ref={containerRef}
      tabIndex={-1}
      onClick={close}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        aria-label="Close"
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10001,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(255,255,255,0.2)',
          color: '#fff',
          fontSize: 24,
          lineHeight: 1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>
      {urls.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label="Previous photo"
            style={{
              position: 'absolute',
              left: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10001,
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label="Next photo"
            style={{
              position: 'absolute',
              right: 24,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10001,
              width: 40,
              height: 40,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.18)',
              color: '#fff',
              fontSize: 22,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ›
          </button>
        </>
      )}
      <img
        src={currentUrl}
        alt="Occurrence photo"
        tabIndex={-1}
        style={{
          maxWidth: 'min(90vw, 1200px)',
          maxHeight: '90vh',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          outline: 'none',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          // Ensure keyboard events on image also work
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();
            goPrev();
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            e.stopPropagation();
            goNext();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      />
    </div>
  );
}

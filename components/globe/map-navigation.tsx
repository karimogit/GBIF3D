'use client';

import { useEffect, useRef } from 'react';
import { useCesium } from 'resium';
import * as Cesium from 'cesium';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // Cesium InfoBox lives in a sandboxed iframe; ignore those key events here.
  return Boolean(target.closest?.('[role="dialog"], [role="menu"], [role="listbox"]'));
}

/**
 * Arrow-key (and optional WASD) map panning relative to camera heading.
 * Disabled while typing in form fields or when fly mode owns WASD.
 */
export function MapKeyboardPan({
  enabled = true,
  /** When true, WASD is reserved for fly mode — only arrows pan. */
  reserveWasd = false,
}: {
  enabled?: boolean;
  reserveWasd?: boolean;
}) {
  const cesium = useCesium();
  const pressedRef = useRef(new Set<string>());
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const viewer = cesium?.viewer;
    if (!viewer?.camera || !viewer.scene) return;

    const keys = pressedRef.current;

    const step = () => {
      rafRef.current = null;
      if (keys.size === 0 || viewer.isDestroyed?.()) return;
      try {
        const camera = viewer.camera;
        // Scale move distance with camera height so far-away views still feel responsive.
        const height = Math.max(camera.positionCartographic?.height ?? 1e6, 100);
        const amount = height * 0.02;
        if (keys.has('ArrowLeft') || (!reserveWasd && keys.has('KeyA'))) camera.moveLeft(amount);
        if (keys.has('ArrowRight') || (!reserveWasd && keys.has('KeyD'))) camera.moveRight(amount);
        if (keys.has('ArrowUp') || (!reserveWasd && keys.has('KeyW'))) camera.moveForward(amount);
        if (keys.has('ArrowDown') || (!reserveWasd && keys.has('KeyS'))) camera.moveBackward(amount);
        if (keys.has('PageUp') || keys.has('Equal') || keys.has('NumpadAdd')) {
          camera.zoomIn(amount * 0.8);
        }
        if (keys.has('PageDown') || keys.has('Minus') || keys.has('NumpadSubtract')) {
          camera.zoomOut(amount * 0.8);
        }
      } catch {
        // viewer may be destroyed mid-frame
      }
      if (keys.size > 0) rafRef.current = requestAnimationFrame(step);
    };

    const ensureLoop = () => {
      if (rafRef.current == null && keys.size > 0) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const code = e.code;
      const panCodes = new Set([
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'PageUp',
        'PageDown',
        'Equal',
        'Minus',
        'NumpadAdd',
        'NumpadSubtract',
      ]);
      if (!reserveWasd) {
        panCodes.add('KeyW');
        panCodes.add('KeyA');
        panCodes.add('KeyS');
        panCodes.add('KeyD');
      }
      if (!panCodes.has(code)) return;
      e.preventDefault();
      if (e.repeat) return;
      keys.add(code);
      ensureLoop();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };

    const onBlur = () => {
      keys.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      keys.clear();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [cesium?.viewer, enabled, reserveWasd]);

  return null;
}

/**
 * First-person style fly mode for exploring terrain / photorealistic 3D tiles.
 * WASD move, Q/E up/down, Shift sprint, mouse-drag look. Esc exits via onRequestExit.
 */
export function FlyModeHandler({
  active,
  onRequestExit,
}: {
  active: boolean;
  onRequestExit?: () => void;
}) {
  const cesium = useCesium();
  const pressedRef = useRef(new Set<string>());
  const rafRef = useRef<number | null>(null);
  const lookingRef = useRef(false);
  const lastMouseRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!active) return;
    const viewer = cesium?.viewer;
    if (!viewer?.camera || !viewer.scene?.canvas) return;

    const controller = viewer.scene.screenSpaceCameraController;
    const prev = {
      enableRotate: controller.enableRotate,
      enableTranslate: controller.enableTranslate,
      enableTilt: controller.enableTilt,
      enableLook: controller.enableLook,
      enableZoom: controller.enableZoom,
      enableInputs: controller.enableInputs,
    };
    // Keep zoom (wheel); disable default drag gestures so fly look/move owns the mouse.
    controller.enableRotate = false;
    controller.enableTranslate = false;
    controller.enableTilt = false;
    controller.enableLook = false;

    // Nudge into a flight-friendly pitch if the camera is nearly top-down.
    try {
      const pitch = viewer.camera.pitch;
      if (pitch < -Cesium.Math.toRadians(75)) {
        viewer.camera.setView({
          orientation: {
            heading: viewer.camera.heading,
            pitch: Cesium.Math.toRadians(-35),
            roll: 0,
          },
        });
      }
    } catch {
      // ignore
    }

    const keys = pressedRef.current;

    const tick = () => {
      rafRef.current = requestAnimationFrame(tick);
      if (viewer.isDestroyed?.()) return;
      try {
        const camera = viewer.camera;
        const height = Math.max(camera.positionCartographic?.height ?? 500, 5);
        const base = Math.min(Math.max(height * 0.015, 2), 2500);
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? base * 3.5 : base;

        if (keys.has('KeyW')) camera.moveForward(speed);
        if (keys.has('KeyS')) camera.moveBackward(speed);
        if (keys.has('KeyA')) camera.moveLeft(speed);
        if (keys.has('KeyD')) camera.moveRight(speed);
        if (keys.has('KeyQ') || keys.has('KeyR')) camera.moveUp(speed);
        if (keys.has('KeyE') || keys.has('KeyF')) camera.moveDown(speed);
      } catch {
        // ignore
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        onRequestExit?.();
        return;
      }
      const flyKeys = new Set([
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'KeyQ',
        'KeyE',
        'KeyR',
        'KeyF',
        'ShiftLeft',
        'ShiftRight',
      ]);
      if (!flyKeys.has(e.code)) return;
      e.preventDefault();
      keys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };

    const canvas = viewer.scene.canvas;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      lookingRef.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      lookingRef.current = false;
      lastMouseRef.current = null;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!lookingRef.current || !lastMouseRef.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      try {
        const lookFactor = 0.003;
        viewer.camera.lookRight(dx * lookFactor);
        viewer.camera.lookUp(-dy * lookFactor);
      } catch {
        // ignore
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onMouseUp);
    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onMouseUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      keys.clear();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try {
        controller.enableRotate = prev.enableRotate;
        controller.enableTranslate = prev.enableTranslate;
        controller.enableTilt = prev.enableTilt;
        controller.enableLook = prev.enableLook;
        controller.enableZoom = prev.enableZoom;
        controller.enableInputs = prev.enableInputs;
      } catch {
        // ignore
      }
    };
  }, [active, cesium?.viewer, onRequestExit]);

  return null;
}

/**
 * Type declaration for resium 1.14.2 (package exports don't expose types to bundler).
 */
declare module 'resium' {
  import type { ComponentType } from 'react';

  export const Viewer: ComponentType<Record<string, unknown>>;
  export const Entity: ComponentType<Record<string, unknown>>;
  export const PointGraphics: ComponentType<Record<string, unknown>>;
  export function useCesium(): { viewer: import('cesium').Viewer | undefined };
}

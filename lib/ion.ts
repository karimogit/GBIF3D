/** Cesium Ion access token from the environment (inlined at build time for the client bundle). */
export const CESIUM_ION_TOKEN = process.env.NEXT_PUBLIC_CESIUM_ION_TOKEN?.trim() || null;

/** Whether Ion-backed features (Bing imagery, world terrain, photorealistic 3D tiles) can be used. */
export const ION_TOKEN_CONFIGURED = CESIUM_ION_TOKEN != null;

/**
 * Ensure public/cesium exists for Next.js/Vercel.
 * On CI/Vercel: copy Cesium build so output has real files (symlinks can break static export).
 * Locally: symlink to save disk and keep install fast.
 */
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'cesium', 'Build', 'Cesium');
const publicDir = path.join(__dirname, '..', 'public');
const dest = path.join(publicDir, 'cesium');

if (!fs.existsSync(src)) {
  console.warn('postinstall-cesium: Cesium build not found at', src);
  process.exit(0);
}

fs.mkdirSync(publicDir, { recursive: true });

const isCI = process.env.CI === 'true' || process.env.VERCEL === '1';

if (isCI) {
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log('postinstall-cesium: copied Cesium to public/cesium (CI)');
} else {
  const target = path.resolve(src);
  try {
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
    // Directory symlinks need elevated privileges on Windows; junctions do not.
    fs.symlinkSync(target, dest, process.platform === 'win32' ? 'junction' : 'dir');
    console.log('postinstall-cesium: symlinked public/cesium');
  } catch (err) {
    console.warn('postinstall-cesium: symlink failed, copying instead', err);
    try {
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
      console.log('postinstall-cesium: copied Cesium to public/cesium');
    } catch (copyErr) {
      console.error('postinstall-cesium: copy failed', copyErr);
      process.exit(1);
    }
  }
}

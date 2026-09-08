/** @type {import('next').NextConfig} */
const path = require('path');
const webpack = require('webpack');

const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://api.gbif.org https://*.basemaps.cartocdn.com https://tile.openstreetmap.org https://*.tile.opentopomap.org https://photon.komoot.io https://api.cesium.com https://*.cesium.com https://*.bing.com https://tiles.arcgis.com https://*.arcgis.com",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "media-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY_REPORT_ONLY },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  webpack: (config) => {
    config.plugins.push(
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('/cesium'),
      })
    );
    // Resium: use ESM build so it shares the app's React instance (CJS build triggers ReactCurrentBatchConfig error with Next 15)
    config.resolve.alias = {
      ...config.resolve.alias,
      resium: path.resolve(__dirname, 'node_modules/resium/dist/resium.js'),
    };
    return config;
  },
};

module.exports = nextConfig;

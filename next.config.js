/** @type {import('next').NextConfig} */
const path = require('path');
const webpack = require('webpack');

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

import type { Metadata, Viewport } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-roboto',
});

export const metadata: Metadata = {
  title: 'GBIF 3D — Explore global biodiversity in 3D',
  description:
    'GBIF 3D: explore where species have been recorded on an interactive 3D globe. Pan, zoom, filter by species, threat level, region, and time.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={roboto.variable}>
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        {/* Cesium widget styles are static assets copied by scripts/postinstall-cesium.js, not a CSS module. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link
          rel="stylesheet"
          href="/cesium/Widgets/widgets.css"
          type="text/css"
        />
      </head>
      <body className={roboto.className}>
        {/* Cesium is bundled from the npm package; this only tells it where to find Workers/Assets (public/cesium). */}
        <script
          dangerouslySetInnerHTML={{ __html: "window.CESIUM_BASE_URL='/cesium';" }}
        />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

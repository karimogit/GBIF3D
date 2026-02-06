import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

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
    <html lang="en">
      <head>
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="/cesium/Widgets/widgets.css"
          type="text/css"
        />
      </head>
      <body>
        {/* Cesium base URL and pre-built bundle — must run before app so window.Cesium is set. Using plain script avoids Next.js preload so the "not used" warning goes away. */}
        <script
          dangerouslySetInnerHTML={{ __html: "window.CESIUM_BASE_URL='/cesium';" }}
        />
        <script src="/cesium/Cesium.js" />
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

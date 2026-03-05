import './globals.css';
import type { Metadata, Viewport } from 'next';
import React from 'react';
import Providers from './providers';
import { DEFAULT_THEME_MODE, THEME_INIT_SCRIPT } from './theme';

export const metadata: Metadata = {
  applicationName: 'Revendis',
  title: 'Revendis Web',
  description: 'Painel web Revendis',
  manifest: '/manifest.webmanifest',
  formatDetection: {
    telephone: false
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Revendis'
  },
  icons: {
    icon: [
      { url: '/logo.png', sizes: '192x192', type: 'image/png' },
      { url: '/logo.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [{ url: '/logo.png', sizes: '180x180', type: 'image/png' }]
  }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#8860db'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-theme={DEFAULT_THEME_MODE} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import './globals.css';
import type { Metadata } from 'next';
import React from 'react';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'Revendis Web',
  description: 'Web console stub for Revendis'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

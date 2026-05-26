import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'PSYCHOBALANCE',
  description: 'Adaptive video sessions driven by real-time heart rate.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uk" className="dark">
      <body className="m-0 bg-black p-0 font-sans text-white antialiased">
        {children}
      </body>
    </html>
  );
}

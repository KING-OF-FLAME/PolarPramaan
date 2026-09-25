import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader, SiteFooter } from '@/components/site';

export const metadata: Metadata = {
  title: { default: 'PolarPramaan — polar evidence to public understanding', template: '%s · PolarPramaan' },
  description:
    'An independent SIH26063 project: a polar science repository that connects every public claim to the exact evidence behind it and tracks what needs correction when that evidence changes.',
  applicationName: 'PolarPramaan',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#07111f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 sm:py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

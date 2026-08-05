import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'ActionBrief',
    template: '%s · ActionBrief',
  },
  description:
    'Turn a Microsoft Teams meeting transcript into a designed, department-branded action brief.',
  robots: { index: false, follow: false },
  icons: {
    icon: [
      {
        url:
          'data:image/svg+xml,' +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0D9488"/><path d="M8 16.5l5 5 11-12" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
          ),
        type: 'image/svg+xml',
      },
    ],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0616',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh bg-canvas text-ink-800 antialiased">{children}</body>
    </html>
  );
}

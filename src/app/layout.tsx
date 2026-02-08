import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Juggernaut',
  description: 'A modular WordPress content management platform',
  icons: {
    icon: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">{children}</body>
    </html>
  );
}

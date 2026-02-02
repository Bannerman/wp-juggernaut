import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PlexKits Resource Manager',
  description: 'Sync, edit, and push WordPress resources',
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

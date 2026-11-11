import '../globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Restricted Access | Hoglet Protocol',
  description: 'Access to this decentralized application interface is restricted in your region.',
  robots: { index: false, follow: false },
};

export default function GeoblockedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-black antialiased">
      <body className="min-h-full bg-black text-white">{children}</body>
    </html>
  );
}

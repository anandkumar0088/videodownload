import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';

const roboto = Roboto({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'MediaVault',
  description: 'An open-source, minimalist video and audio downloader inspired by Material Design 3.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${roboto.variable} h-full dark antialiased`}>
      <body className="min-h-full flex flex-col bg-[#111216] text-[#f0f0f3] font-sans selection:bg-[#344F87] selection:text-white">
        {children}
      </body>
    </html>
  );
}

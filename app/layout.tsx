import type { Metadata } from 'next';
import { Playfair_Display, Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';
import { AuthGuard } from '@/components/AuthGuard';
import { LegalFooter } from '@/components/LegalFooter';
import { CookieConsent } from '@/components/CookieConsent';
import { SessionInvalidatedModal } from '@/components/SessionInvalidatedModal';
import { EventModeBanner } from '@/components/EventModeBanner';

const playfair = Playfair_Display({
  weight: '700',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-playfair',
});

const inter = Inter({
  weight: ['400', '500'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 
    process.env.NEXT_PUBLIC_API_BASE || 
    'http://localhost:3000'
  ),
  title: 'Napalm Sky - 1-1 Video Social Network',
  description: 'Make Friends in SoCal— Live Matches, Zero Waiting, Infinite Possibilites.',
  keywords: ['1-1 video social network', 'video chat', 'matchmaking', 'social networking', 'live video'],
  authors: [{ name: 'Napalm Sky' }],
  icons: {
    icon: '/Love.png',
    apple: '/Love.png',
    shortcut: '/Love.png',
  },
  openGraph: {
    title: 'Napalm Sky - 1-1 Video Social Network',
    description: 'Make Friends in SoCal— Live Matches, Zero Waiting, Infinite Possibilites.',
    url: 'https://napalmsky.com',
    siteName: 'Napalm Sky',
    images: [
      {
        url: '/Love.png',
        width: 1200,
        height: 630,
        alt: 'Napalm Sky',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Napalm Sky - 1-1 Video Social Network',
    description: 'Make Friends in SoCal— Live Matches, Zero Waiting, Infinite Possibilites.',
    images: ['/Love.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
      <head>
        <link rel="icon" href="/Love.png" type="image/png" />
        <link rel="apple-touch-icon" href="/Love.png" />
      </head>
      <body className="font-inter">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <EventModeBanner />
        <Header />
        <AuthGuard>
          {children}
        </AuthGuard>
        <LegalFooter />
        <CookieConsent />
        <SessionInvalidatedModal />
      </body>
    </html>
  );
}


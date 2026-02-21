import type { Metadata, Viewport } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

const _inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const _spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

export const metadata: Metadata = {
  title: 'TriageID NFC - Secure Patient Identification',
  description:
    'NFC-based patient identification system for instant verification in emergencies. Secure, encrypted wristbands for healthcare professionals.',
  // Icons: add icon.svg, icon.png, or apple-icon.png to public/ if you want custom favicons
}

export const viewport: Viewport = {
  themeColor: '#4ade80',
  userScalable: true,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${_inter.variable} ${_spaceGrotesk.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        {children}
        <Analytics />
      </body>
    </html>
  )
}

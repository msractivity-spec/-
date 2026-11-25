import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '太陽光・蓄電池シミュレーター',
  description: 'UA値・C値・地域・家族構成・電力プランから、太陽光発電と蓄電池の導入効果を1時間単位で試算します',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '太陽光試算',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#f97316',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">{children}</body>
    </html>
  )
}

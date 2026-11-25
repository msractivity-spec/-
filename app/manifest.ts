import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '太陽光・蓄電池シミュレーター',
    short_name: '太陽光試算',
    description: '太陽光発電と蓄電池の導入効果シミュレーション',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f4f6',
    theme_color: '#f97316',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}

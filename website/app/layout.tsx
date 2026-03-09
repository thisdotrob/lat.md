import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'lat.md',
  description: 'Anchor source code to high-level concepts defined in markdown',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#000' }}>
        {children}
      </body>
    </html>
  )
}

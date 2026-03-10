import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'lat.md',
  description: 'A knowledge graph for your codebase, written in markdown',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#000' }}>
        <style>{`
          body { line-height: 1.6; }
          a.foot { color: #555; text-decoration: none; border-bottom: 1px dotted #555; transition: color 0.2s, border-bottom-color 0.2s; }
          a.foot:hover { color: #aaa; border-bottom-color: #aaa; }
          ul li + li { margin-top: 1em; }
        `}</style>
        {children}
      </body>
    </html>
  )
}

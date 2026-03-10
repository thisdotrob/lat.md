const logo = `
░██               ░██                               ░██
░██               ░██                               ░██
░██  ░██████   ░████████     ░█████████████   ░████████
░██       ░██     ░██        ░██   ░██   ░██ ░██    ░██
░██  ░███████     ░██        ░██   ░██   ░██ ░██    ░██
░██ ░██   ░██     ░██        ░██   ░██   ░██ ░██   ░███
░██  ░█████░██     ░████ ░██ ░██   ░██   ░██  ░█████░██
`.trimStart()

function Cmd({ children }: { children: React.ReactNode }) {
  return <span style={{ color: '#aaa' }}>{children}</span>
}

const mono =
  'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace'

export default function Home() {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        color: '#fff',
        fontFamily: mono,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4vh 24px',
        gap: '4vh',
      }}
    >
      {/* Logo */}
      <pre
        className="nosel"
        style={{
          fontSize: 'clamp(6px, 1.8vw, 15px)',
          lineHeight: 1.2,
          letterSpacing: '0.05em',
          margin: 0,
        }}
      >
        {logo}
      </pre>

      {/* Tagline */}
      <p
        style={{
          color: '#888',
          fontSize: 18,
          textAlign: 'center',
          margin: 0,
          maxWidth: '44ch',
          lineHeight: 1.5,
          letterSpacing: '0.04em',
        }}
      >
        A knowledge graph for your codebase, written in markdown.
      </p>

      {/* Install + Features */}
      <div style={{ marginTop: '2vh' }}>

      {/* Install */}
      <div>
        <code
          style={{
            display: 'block',
            background: '#111',
            border: '1px solid #222',
            borderRadius: '6px',
            padding: '14px 48px 14px 16px',
            fontSize: 15,
            color: '#aaa',
            boxSizing: 'border-box',
          }}
        >
          <span className="nosel" style={{ color: '#555' }}>$ </span>
          npm i -g lat.md
        </code>
        <div
          style={{
            color: '#444',
            fontSize: 13,
            marginTop: '10px',
          }}
        >
          then run <span style={{ color: '#aaa' }}>lat init</span> in your project, your agent will know what to do
        </div>
      </div>

      {/* Features */}
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: 'none',
          marginTop: '6vh',
          fontSize: 14,
          lineHeight: 1.4,
          color: '#555',
        }}
      >
        <li>* Wiki links connect concepts into a navigable graph</li>
        <li>* <Cmd>// @lat:</Cmd> and <Cmd># @lat:</Cmd> comments tie source code to specs</li>
        <li>* <Cmd>lat check</Cmd> ensures nothing drifts out of sync</li>
        <li>* Semantic vector search across all sections</li>
        <li>* Plain markdown: readable by humans, parseable by agents</li>
        <li style={{ marginTop: '1em' }}>
          <span style={{ color: '#555' }}>Read the </span>
          <a
            className="foot"
            href="https://github.com/1st1/lat.md#readme"
          >
            README →
          </a>
        </li>
      </ul>
      </div>

      {/* Links */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '3vh',
          fontSize: 13,
        }}
      >
        <span style={{ color: '#444' }}>Made by</span>
        <a className="foot" href="https://x.com/1st1">@1st1</a>
        <span style={{ color: '#333' }}>|</span>
        <a className="foot" href="https://github.com/1st1/lat.md">GitHub</a>
        <span style={{ color: '#333' }}>|</span>
        <a className="foot" href="https://www.npmjs.com/package/lat.md">npm</a>
      </div>
    </div>
  )
}

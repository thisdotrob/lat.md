const logo = `
░██               ░██                               ░██
░██               ░██                               ░██
░██  ░██████   ░████████     ░█████████████   ░████████
░██       ░██     ░██        ░██   ░██   ░██ ░██    ░██
░██  ░███████     ░██        ░██   ░██   ░██ ░██    ░██
░██ ░██   ░██     ░██        ░██   ░██   ░██ ░██   ░███
░██  ░█████░██     ░████ ░██ ░██   ░██   ░██  ░█████░██
`.trimStart()

export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#000',
      }}
    >
      <pre
        style={{
          color: '#fff',
          fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, "DejaVu Sans Mono", monospace',
          fontSize: 'clamp(6px, 1.8vw, 18px)',
          lineHeight: 1.2,
          letterSpacing: '0.05em',
          userSelect: 'none',
        }}
      >
        {logo}
      </pre>
    </div>
  )
}

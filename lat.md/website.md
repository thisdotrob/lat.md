# Website

Standalone Next.js app in `website/`. Deployed to Vercel at `lat.md`.

Completely separate from the npm package — has its own `package.json`, `tsconfig.json`, and `.gitignore`. Never included in `dist`.

## Current State

Black page with centered monospace ASCII art logo (inlined — Vercel deployments don't have access to the monorepo's `templates/` directory).

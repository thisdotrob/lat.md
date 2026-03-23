# Website

Standalone Next.js app in `website/`. Deployed to Vercel at `lat.md`.

Completely separate from the npm package — has its own `package.json`, `tsconfig.json`, and `.gitignore`. Never included in `dist`.

## Current State

Black page with centered vector logo (`website/public/logo.svg`) generated from Menlo font glyphs. Scales to match content width.

Includes a "What's New" changelog showing only the 7 most recent versions. Text-brightness gradient fades older entries darker. When adding a new version, drop the oldest entry to keep the count at 7.

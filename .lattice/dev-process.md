# Dev Process

## Tooling

TypeScript ESM project. Strict types enforced — `tsc --noEmit` runs as a test.

## Package Manager

pnpm is the only supported package manager. Never use npm or yarn.

## Testing

Vitest is the test runner. Tests live in the top-level `tests/` directory.

### Running Tests

- `pnpm test` — run all tests once
- `pnpm test:watch` — run in watch mode

### Typecheck Test

Every test run includes a full `tsc --noEmit` pass over the entire codebase. If it doesn't typecheck, it doesn't pass.

## Formatting

Prettier with no semicolons, single quotes, trailing commas. Run `pnpm format` before committing.

# Parser

Markdown parsing built on unified/remark v11. Entry point: `src/parser.ts`.

## Wiki Links

Custom micromark + mdast extension implementing [[markdown#Wiki Links]]. Located in `src/extensions/wiki-link/`.

Built in-house because third-party packages (`mdast-util-wiki-link`, `@portaljs/remark-wiki-link`) are broken with remark v11 / mdast-util-from-markdown v2.

### Wiki Link Node

A `wikiLink` node has `value` (the target string) and `data.alias` (string or null). Registered into mdast's `RootContentMap`, `PhrasingContentMap`, micromark's `TokenTypeMap`, and mdast-util-to-markdown's `ConstructNameMap` via module augmentation.

## Sections

A section is a heading plus everything under it until the next same-or-higher-depth heading. Parsed by `parseSections()` in `src/lattice.ts`.

Each section has:
- `id` — hierarchical path where the first segment is the vault-relative file path (without `.md`): `dev-process#Testing#Running Tests`, `tests/search#RAG Replay Tests`
- `heading` — the heading text
- `depth` — markdown heading level (1–6)
- `file` — vault-relative file path without `.md` (e.g. `dev-process`, `tests/search`)
- `children` — nested subsections forming a tree
- `startLine` / `endLine` — source positions
- `body` — first paragraph text (used by [[cli#Section Preview]])

[[markdown#Frontmatter]] is stripped before parsing.

## Short Ref Resolution

References can use just the file name (without directory path) when the name is unique across the vault. For example, `[[search#Provider Detection]]` resolves to `tests/search#Provider Detection` if there's only one `search.md` in the vault. If multiple files share the same name, the full path is required — `lat check` reports ambiguous refs as errors.

Resolution is handled by `resolveRef()` in `src/lattice.ts` for strict contexts (`lat check`, `lat refs`) where authored links must resolve unambiguously. Lenient contexts (`lat locate`, `lat prompt`) use `findSections()` directly, which has its own file stem expansion built in — it does not call `resolveRef`.

## Refs Extraction

`extractRefs()` in `src/lattice.ts` walks the AST for [[parser#Wiki Links#Wiki Link Node]] nodes and returns the target, enclosing section id, file, and line number.

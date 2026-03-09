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
- `id` — hierarchical path like `Dev Process#Testing#Running Tests`
- `startLine` / `endLine` — source positions
- `body` — first paragraph text (used by [[cli#Section Preview]])
- `file` — the file stem (without `.md`)

[[markdown#Frontmatter]] is stripped before parsing.

## Refs Extraction

`extractRefs()` in `src/lattice.ts` walks the AST for [[parser#Wiki Links#Wiki Link Node]] nodes and returns the target, enclosing section id, file, and line number.

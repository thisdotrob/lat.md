# Markdown

Extensions to standard markdown used in `lat.md` files.

## Wiki Links

Obsidian-style links: `[[target]]` or `[[target|alias]]`. Uses `|` as the alias divider.

Targets are section ids — hierarchical paths like `dev-process#Testing#Running Tests`. Used to cross-reference between `lat.md` files and validated by [[cli#check#md]].

### Resolution Rules

Aligned with Obsidian conventions:

- **`[[foo]]`** — link to the **file** `foo.md`. Resolves to the root section of that file. Does not search section headings.
- **`[[foo#Bar]]`** — heading `Bar` in file `foo.md`. The path after `#` must be an exact heading chain — no intermediate headings can be omitted.
- **`[[path/foo#Bar]]`** — fully qualified: file `path/foo.md`, heading `Bar`.

### Short Path Disambiguation

When a file stem is unique across the vault, it can be used without its directory prefix. For example, `[[setup#Install]]` resolves to `guides/setup#Install` if `setup.md` only exists under `guides/`.

When multiple files share the same stem (e.g. `alpha/notes.md` and `beta/notes.md`), the short form is ambiguous — [[cli#check#md]] reports an error listing all candidates. If the referenced section exists in only one file, the error suggests the specific fix.

Resolution is handled by `resolveRef()` in `src/lattice.ts`. See [[parser#Short Ref Resolution]] for implementation details.

### Strict vs Lenient Contexts

**Strict** — `lat check` and `lat refs` use `resolveRef()` directly. Links must resolve unambiguously to a known section. Ambiguous or broken links are errors.

**Lenient** — `lat locate` and `lat prompt` use `findSections()`, which applies tiered matching (exact → file stem → subsection tail → fuzzy). These commands are for interactive exploration and accept approximate queries.

## Frontmatter

`lat.md` files support YAML frontmatter for per-file configuration:

```yaml
---
lat:
  require-code-mention: true
---
```

### require-code-mention

When set to `true`, [[cli#check#code-refs]] ensures every leaf section (sections with no children) in the file has a corresponding `// @lat: [[...]]` reference in source code. Useful for test specs and requirements that must be traceable to implementation.

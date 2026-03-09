# Markdown

Extensions to standard markdown used in `.lat` files.

## Wiki Links

Obsidian-style links: `[[target]]` or `[[target|alias]]`. Uses `|` as the alias divider.

Targets are section ids — hierarchical paths like `dev-process#Testing#Running Tests`. Used to cross-reference between `.lat` files and validated by [[cli#check#md]].

## Frontmatter

`.lat` files support YAML frontmatter for per-file configuration:

```yaml
---
lat:
  require-code-mention: true
---
```

### require-code-mention

When set to `true`, [[cli#check#code-refs]] ensures every leaf section (sections with no children) in the file has a corresponding `// @lat: [[...]]` reference in source code. Useful for test specs and requirements that must be traceable to implementation.

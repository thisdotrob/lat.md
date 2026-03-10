# Before starting work

- Run `lat search` to find sections relevant to your task. Read them to understand the design intent before writing code.
- Run `lat prompt` on user prompts to expand any `[[refs]]` — this resolves section names to file locations and provides context.

# Post-task checklist (REQUIRED — do not skip)

After EVERY task, before responding to the user:

- [ ] Update `lat.md/` if you added or changed any functionality, architecture, tests, or behavior
- [ ] Run `lat check` — all wiki links and code refs must pass
- [ ] Do not skip these steps. Do not consider your task done until both are complete.

---

# What is lat.md?

This project uses [lat.md](https://www.npmjs.com/package/lat.md) to maintain a structured knowledge graph of its architecture, design decisions, and test specs in the `lat.md/` directory. It is a set of cross-linked markdown files that describe **what** this project does and **why** — the domain concepts, key design decisions, business logic, and test specifications. Use it to ground your work in the actual architecture rather than guessing.

# Commands

```bash
lat locate "Section Name"      # find a section by name (exact, fuzzy)
lat refs "file#Section"        # find what references a section
lat search "natural language"  # semantic search across all sections
lat prompt "user prompt text"  # expand [[refs]] to resolved locations
lat check                      # validate all links and code refs
```

Run `lat --help` when in doubt about available commands or options.

If `lat search` fails because `LAT_LLM_KEY` is not set, explain to the user that semantic search requires an API key (`export LAT_LLM_KEY=sk-...` for OpenAI or `export LAT_LLM_KEY=vck_...` for Vercel). If the user doesn't want to set it up, use `lat locate` for direct lookups instead.

# Syntax primer

- **Section ids**: `file-stem#Heading#SubHeading` (e.g. `cli#search#Indexing`)
- **Wiki links**: `[[target]]` or `[[target|alias]]` — cross-references between sections
- **Code refs**: `// @lat: [[section-id]]` (JS/TS) or `# @lat: [[section-id]]` (Python) — ties source code to concepts

# Test specs

Key tests can be described as sections in `lat.md/` files (e.g. `tests.md`). Add frontmatter to require that every leaf section is referenced by a `// @lat:` or `# @lat:` comment in test code:

```markdown
---
lat:
  require-code-mention: true
---
# Tests

## User login
### Rejects expired tokens
### Handles missing password
```

Each test in code should reference its spec: `// @lat: [[tests#User login#Rejects expired tokens]]`. Running `lat check` will flag any spec section not covered by a code reference, and any code reference pointing to a nonexistent section.

# CLI

The `lat` command line tool. Entry point: [[src/cli/index.ts]].

**Design principle: shared core, thin wrappers.** Every CLI command and its corresponding [[cli#mcp]] tool share the same command function (e.g. `locateCommand`, `sectionCommand`, `refsCommand`). Each command function accepts a `CmdContext` (with a `Styler` abstraction for chalk vs plain formatting) and returns a `CmdResult` (`{ output, isError? }`). CLI and MCP are thin wrappers that construct the appropriate context and handle the result — CLI calls `handleResult` (print + exit code), MCP calls `toMcp` (wrap in MCP response). Some commands have a separate business-logic layer (e.g. `getSection`, `findRefs`, `runSearch`) that returns structured data, called by the command function. Shared types live in [[src/context.ts]]. Never duplicate business logic between CLI and MCP.

## locate

Find sections by query. Strips `[[brackets]]` and leading `#` from the query before searching. Results are returned in priority order:

1. **Exact match** — full section path matches (case-insensitive). If the query contains `#` (a full path) and matches exactly, returns immediately.
2. **File stem match** — for bare names (no `#`), the query is matched against file stems via `buildFileIndex`. e.g. `locate` matches the root section of `tests/locate.md`. For queries with `#`, the file part is expanded: `setup#Install` → `guides/setup#Install`. Results sorted by depth (shallower first) then path depth.
3. **Subsection match** — the query matches a trailing segment of a section id. e.g. `Frontmatter` matches `markdown#Frontmatter`. Skipped when the query contains `#`.
4. **Subsequence match** — query `#`-segments are a subsequence of the section id segments. e.g. `Markdown#Resolution Rules` matches `markdown#Wiki Links#Resolution Rules` (1 intermediate section skipped). Requires at least 2 query segments.
5. **Fuzzy match** — sections whose id or trailing segments are within edit distance (Levenshtein, max 40% of string length). e.g. `Frontmattar` matches `markdown#Frontmatter`. For queries with `#`, when the file part matches exactly, only the heading portion is compared — prevents the shared file prefix from inflating similarity (e.g. `cli#locat` matches `cli#locate` but not `cli#prompt`).

Outputs a [[cli#Section Preview]] for each match.

Usage: `lat locate <query>`

Implementation: [[src/cli/locate.ts]], matching logic in [[src/lattice.ts#findSections]]

## section

Show a section's full content along with its outgoing and incoming wiki link references. Designed as a companion to [[cli#search]] — search gives RAG results, `section` facilitates browsing them by showing the full context of each result.

Accepts any valid section id (short-form, full-path, with or without `[[brackets]]`). Uses the same resolution logic as [[cli#refs]].

Output:
1. Section header with id and file location
2. Raw markdown content between `startLine` and `endLine`
3. **This section references** — all wiki link targets found within the section, with body descriptions
4. **Referenced by** — other sections in `lat.md/` that contain wiki links pointing to this section

Usage: `lat section <query>`

Core logic in [[src/cli/section.ts#getSection]] (returns structured result), used by both the CLI command and [[cli#mcp]] `lat_section` tool.

## refs

Find sections that reference a given section via [[parser#Wiki Links]]. Accepts any valid section id — short-form refs (e.g. `section-parsing#Heading`) are resolved via `findSections` when `resolveRef` doesn't produce an exact match, as long as the result is unambiguous (exact, stem-expanded, or section-name match). If no confident match exists, shows "Did you mean:" suggestions and exits. Outputs a [[cli#Section Preview]] for each referring section.

Usage: `lat refs <query> [--scope=md|code|md+code]`

### Scope

- `md` (default) — search `lat.md` markdown files for wiki links targeting the query
- `code` — scan source files for `@lat: [[...]]` comments matching the query
- `md+code` — both

Core logic in [[src/cli/refs.ts#findRefs]] (returns structured result), used by both the CLI command and [[cli#mcp]] `lat_refs` tool.

## check

Validation command group. Runs all checks when invoked without a subcommand.

Usage: `lat check [md|code-refs|index]`

Implementation: [[src/cli/check.ts]]

### md

Validate that all [[parser#Wiki Links]] in `lat.md` markdown files point to existing sections.

### code-refs

Two validations:
1. Every `// @lat: [[...]]` or `# @lat: [[...]]` comment in source code must point to a real section in `lat.md/`
2. For files with [[markdown#Frontmatter#require-code-mention]], every leaf section must be referenced by at least one `// @lat:` comment in the codebase

### index

Validate directory index files. Every directory inside `lat.md/` (including the root) must have an index file named after the directory (e.g. `lat.md/lat.md` for the root, `lat.md/api/api.md` for a subdirectory). Each index file must contain a bullet list covering every visible file and subdirectory with a one-sentence description, using wiki links: `- [[name]] — description`. File entries omit the `.md` extension (e.g. `[[cli]]` not `[[cli.md]]`).

Three checks:
1. **Missing index file** — errors with a ready-to-copy bullet list snippet
2. **Missing entries** — index file exists but doesn't list all visible entries
3. **Stale entries** — index file lists an entry that doesn't exist on disk

Directory walking uses [[dev-process#File Walking]] to respect `.gitignore` rules — hidden/ignored entries (`.cache`, `.obsidian`, etc.) are automatically excluded.

## prompt

Expand `[[refs]]` in a prompt text to resolved `lat.md` section paths with location context. Designed for coding agents to pipe user prompts through before processing.

Usage: `lat prompt <text>` or `echo "text" | lat prompt`

For each `[[ref]]` in the input, uses `findSections()` directly (no `resolveRef`):
1. **Best match** — resolves to the top result from `findSections` (exact > file stem > subsection > subsequence > fuzzy)
2. **No match** — errors out, tells the agent to ask the user to correct the reference

Output replaces `[[ref]]` with `[[resolved-id]]` inline and appends a `<lat-context>` block as a nested outliner. For exact matches: `is referring to:`. For non-exact: `might be referring to either of the following:` with all candidates, match reasons, locations, and body text.

Implementation: [[src/cli/prompt.ts]]

## gen

Generate a file to stdout from a built-in template.

Usage: `lat gen <target>`

Supported targets:
- `agents.md` — generate an `AGENTS.md` with instructions for coding agents on how to use `lat.md` in the project
- `claude.md` — alias for `agents.md`

Both targets output the same template from `templates/AGENTS.md`. The output is written to stdout so it can be redirected: `lat gen agents.md > AGENTS.md`.

Implementation: [[src/cli/gen.ts]]

## init

Interactive setup wizard. Walks the user through initializing lat.md in a project, with per-agent configuration for multiple coding tools.

Usage: `lat init [dir]`

Steps:
1. **lat.md/ directory** — if not present, asks whether to create it. Scaffolds from `templates/init/` (`.gitignore` and `README.md`). If it already exists, skips ahead.
2. **Agent selection** — asks which coding agents the user uses (Claude Code, Cursor, VS Code Copilot, Codex/OpenCode). Each gets a Y/n prompt.
3. **AGENTS.md** — created if a non-Claude agent is selected (Cursor, Copilot, Codex). Shared instruction file.
4. **Per-agent setup** — configures each selected agent (see subsections below). Each step prints a brief explanation of *why* it's needed (e.g. why a hook is used instead of CLAUDE.md, why MCP is registered alongside CLI access).
5. **LLM key setup** — checks for an existing key (env var or [[cli#Configuration File]]), and if missing, interactively prompts the user to paste one. Explains what semantic search is and why a key is needed before asking.

### Claude Code

- `CLAUDE.md` — written directly from the template (not a symlink)
- Two hooks registered in `.claude/settings.json`, both calling [[cli#hook]]:
  - `UserPromptSubmit` → `lat hook claude UserPromptSubmit` — injects lat.md workflow reminders, auto-resolves `[[refs]]` in the prompt
  - `Stop` → `lat hook claude Stop` — reminds the agent to update `lat.md/` before finishing
- `.claude` directory added to `.gitignore` (settings contain local absolute paths in hook commands)
- [[cli#mcp]] server registered in `.mcp.json` at the project root (added to `.gitignore` since it contains absolute paths)

### Cursor

- `.cursor/rules/lat.md` — rules file generated from `templates/cursor-rules.md`, references MCP tools instead of CLI commands
- [[cli#mcp]] server registered in `.cursor/mcp.json` (added to `.gitignore` since it contains absolute paths)

### VS Code Copilot

- `.github/copilot-instructions.md` — static instructions file
- [[cli#mcp]] server registered in `.vscode/mcp.json`

### Codex / OpenCode

- Uses AGENTS.md only (no MCP support)

All setup steps are idempotent — existing configuration is detected and skipped.

Implementation: [[src/cli/init.ts]]

## Configuration File

User-level configuration is stored in `~/.config/lat/config.json` (XDG Base Directory on Linux/macOS, `%APPDATA%\lat\config.json` on Windows). The `XDG_CONFIG_HOME` env var is respected if set.

Currently supports one field:
- `llm_key` — embedding API key for semantic search, used when `LAT_LLM_KEY` env var is not set

Key resolution order: `LAT_LLM_KEY` > `LAT_LLM_KEY_FILE` > `LAT_LLM_KEY_HELPER` > config file `llm_key`. This applies everywhere: `lat search`, `lat check`, and the MCP `lat_search` tool.

Implementation: [[src/config.ts]]

## hook

Handle agent hook events. Called by agent hooks configured during `lat init`, not directly by users.

Usage: `lat hook <agent> <event>`

Currently supports `claude` agent with two events:

### UserPromptSubmit

Reads the hook input from stdin (JSON with `user_prompt`). Outputs JSON with `additionalContext` containing:

1. Instructions to use `lat search`, `lat section`, `lat locate`, `lat refs` for navigation
2. If the prompt contains `[[refs]]`, resolves them inline using [[src/cli/prompt.ts#expandPrompt]]
3. Runs [[src/cli/search.ts#runSearch]] on the user prompt, then [[src/cli/section.ts#getSection]] + [[src/cli/section.ts#formatSectionOutput]] on each result — the agent gets full section content with outgoing/incoming refs before it starts work. Gracefully degrades if no LLM key is configured.

### Stop

Blocks the agent from stopping (`decision: "block"`) with a `reason` reminding it to update `lat.md/` and run `lat check` before finishing. Only fires when a `lat.md/` directory exists in the project. Reads `stop_hook_active` from the hook input to avoid blocking twice — if the agent was already continued by a previous block, the hook exits silently to prevent an infinite loop.

Implementation: [[src/cli/hook.ts]]

## mcp

Start the MCP (Model Context Protocol) server over stdio. Exposes lat.md tools to any MCP-capable coding agent (Claude Code, Cursor, VS Code Copilot).

Usage: `lat mcp`

Clients invoke this as `lat mcp`. The `lat init` wizard registers the MCP server using the absolute path to the current `lat` binary, so it works regardless of how `lat` was installed. The server exposes 6 tools:

- **lat_locate** — find sections by name (wraps [[cli#locate]])
- **lat_section** — show section content with outgoing/incoming refs (wraps [[cli#section]])
- **lat_search** — semantic search across sections (wraps [[cli#search]])
- **lat_prompt** — expand `[[refs]]` in text (wraps [[cli#prompt]])
- **lat_check** — validate links and code refs (wraps [[cli#check]])
- **lat_refs** — find references to a section (wraps [[cli#refs]])

Each MCP tool calls the same command function as the CLI (e.g. `locateCommand`, `refsCommand`, `searchCommand`), passing a `CmdContext` with `plainStyler` and `mode: 'mcp'`. The `toMcp()` helper converts `CmdResult` to MCP response format. Uses `@modelcontextprotocol/sdk` with stdio transport. Resolves `lat.md/` from cwd.

Implementation: [[src/mcp/server.ts]]

## search

Semantic search across `lat.md` sections using vector embeddings.

Usage: `lat search [query] [--limit=5] [--reindex]`

Query is optional — `lat search --reindex` re-indexes without searching. Results include a navigation hint footer suggesting `lat locate`, `lat refs`, and `lat search` for further exploration — this makes the tools self-documenting so agents discover them organically.

Core search logic in [[src/cli/search.ts#runSearch]] (returns matched sections), used by both the CLI command and [[cli#mcp]] `lat_search` tool. Indexing and embedding internals in `src/search/`.

### Provider Detection

Requires an LLM key resolved by [[src/config.ts#getLlmKey]] in priority order:

1. `LAT_LLM_KEY` env var — direct value
2. `LAT_LLM_KEY_FILE` env var — path to a file containing the key (read and trimmed)
3. `LAT_LLM_KEY_HELPER` env var — shell command that prints the key to stdout (10 s timeout)
4. `llm_key` from config file (see [[cli#Configuration File]])

Provider is auto-detected from the resolved key prefix:
- `sk-...` — OpenAI (uses `text-embedding-3-small`, 1536 dims)
- `vck_...` — Vercel AI Gateway (uses `openai/text-embedding-3-small`, 1536 dims)
- `sk-ant-...` — Anthropic (not supported, errors with guidance)
- `REPLAY_LAT_LLM_KEY::<url>` — test-only replay server for offline testing

Implementation: [[src/search/provider.ts]], [[src/config.ts]]

### Embeddings

Direct `fetch()` calls to the provider's OpenAI-compatible `/v1/embeddings` endpoint. No LangChain or other framework — keeps the dependency tree minimal. Batches up to 2048 texts per request.

Implementation: [[src/search/embeddings.ts]]

### Storage

Uses `@libsql/client` (Turso's libsql) in local file mode — pure JS/WASM, no native addons. Vector search is built into libsql via `F32_BLOB` column type, `libsql_vector_idx` for indexing, and `vector_top_k()` for KNN queries.

Single `sections` table holds metadata, content, content hash, and the embedding vector. No separate vector table needed.

The database is stored at `lat.md/.cache/vectors.db` and should not be committed (included in `.gitignore` template).

Implementation: [[src/search/db.ts]]

### Indexing

Sections are extracted via `loadAllSections()` + `flattenSections()`. For each section, the raw markdown between `startLine` and `endLine` is read (not just the `body` first-paragraph) for richer semantic signal.

Content freshness is tracked via SHA-256 hashes. On each run:
1. Parse all sections, compute hashes
2. Compare against stored hashes in the DB
3. Only re-embed new or changed sections (saves API cost)
4. Delete DB rows for sections that no longer exist

On first run, automatically indexes all sections. The `--reindex` flag forces a full rebuild.

Implementation: [[src/search/index.ts]]

### Vector Search

Embeds the user's query via the same provider, then runs a `vector_top_k()` KNN query joined back to the sections table.

Implementation: [[src/search/search.ts]]

## Section Preview

Shared output format used by [[cli#locate]], [[cli#refs]], and [[cli#search]]. Each section is rendered as a bullet (`*`) with:

1. Kind label (`File:` or `Section:`) — file root sections vs subsections
2. Section id in `[[wiki link]]` syntax (path segments dimmed, final segment bold)
3. Match reason in parentheses (e.g. `(exact match)`, `(section name match)`, `(fuzzy match, distance 2)`)
4. "Defined in" label with file path (cyan) and line range
5. Body text quoted with `>` (first paragraph, truncated at 200 chars)

Commands that return multiple results use `formatResultList()` which adds a bold header and consistent spacing.

Implementation: [[src/format.ts]] — exports [[src/format.ts#formatSectionId]], [[src/format.ts#formatSectionPreview]], and [[src/format.ts#formatResultList]]

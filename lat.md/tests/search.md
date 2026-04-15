---
lat:
  require-code-mention: true
---
# Search

Tests in `tests/search.test.ts`.

## Provider Detection

Unit tests (always run). Verify `detectProvider` defaults to the local GGUF provider, respects env overrides for model/cache settings, accepts replay keys, and rejects stale non-replay `LAT_LLM_KEY` values.

## Embedding Formatting

Unit tests verify the qmd-style prompt formatting used before embedding so query and document vectors stay consistent.

## Local Embedding Runtime

Unit tests mock `node-llama-cpp` and verify local embeddings resolve the configured GGUF model and pass formatted text into the embedding context.

## RAG Replay Tests

Functional tests that exercise the full RAG pipeline using a replay server instead of the live local embedding runtime.

The test covers indexing, hashing, vector insert, and KNN search via `tests/rag-replay-server.ts`. Test fixture lives in `tests/cases/rag/lat.md/` with pre-recorded vectors in `tests/cases/rag/replay-data/`.

The replay server has two modes:
- **Replay** (default `pnpm test`): serves cached vectors from binary replay data. Matches requests by SHA-256 of input text.
- **Capture** (`pnpm cook-test-rag`): proxies to the local GGUF model, records all text→vector mappings, flushes binary data to `replay-data/` on teardown. Re-run this after changing how sections are chunked or which texts are embedded.

The test sets `LAT_LLM_KEY` to `REPLAY_LAT_LLM_KEY::<dimensions>::<server-url>`, which `detectProvider` routes to the local replay server with the correct vector dimensions. This way the entire codebase runs unmodified — same embedding calls, same provider logic.

### Indexes all sections

Index the RAG fixture (9 sections across 2 files), verify counts.

### Finds auth section for login query

Search for "how do we handle user login and security?" and verify the Authentication section ranks first.

### Finds performance section for latency query

Search for "what tools do we use to measure response times?" and verify the Performance Tests section ranks first.

### Incremental index skips unchanged sections

Re-index unchanged content, verify all sections reported as unchanged with zero re-embedding.

### Detects deleted sections when file is removed

Remove `testing.md`, re-index, verify 4 sections removed and 5 architecture sections remain.

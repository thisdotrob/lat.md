/**
 * Cook replay data for the RAG test case.
 *
 * Runs the search test in capture mode — proxies to the local GGUF embedding
 * model and records all vectors to tests/cases/rag/replay-data/.
 *
 * Usage: pnpm cook-test-rag
 */

import { execSync } from 'node:child_process';

execSync('pnpm test -- tests/search.test.ts', {
  stdio: 'inherit',
  env: { ...process.env, _LAT_TEST_CAPTURE_EMBEDDINGS: '1' },
});

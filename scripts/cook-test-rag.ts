/**
 * Cook replay data for the RAG test case.
 *
 * Runs the search test in capture mode — proxies to the real Bedrock embedding API
 * (fixed application inference profile in src/config.ts, BEDROCK_EMBEDDING_MODEL_ARN)
 * and records all vectors to tests/cases/rag/replay-data/.
 *
 * Usage: pnpm cook-test-rag  (requires AWS credentials for Bedrock in us-east-1)
 */

import { execSync } from 'node:child_process';

execSync('pnpm test -- tests/search.test.ts', {
  stdio: 'inherit',
  env: { ...process.env, _LAT_TEST_CAPTURE_EMBEDDINGS: '1' },
});

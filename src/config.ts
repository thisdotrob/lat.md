import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import xdg from '@folder/xdg';

// ── XDG config directory ────────────────────────────────────────────

export function getConfigDir(): string {
  return join(xdg().config, 'lat');
}

export function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

// ── Config read/write ───────────────────────────────────────────────

/** Reserved for future user-level settings; currently unused. */
export type LatConfig = Record<string, unknown>;

export function readConfig(): LatConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch (err) {
    process.stderr.write(
      `Error: failed to parse config ${configPath}: ${(err as Error).message}\n`,
    );
    process.exit(1);
  }
}

export function writeConfig(config: LatConfig): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2) + '\n');
}

// ── Embedding model (Bedrock) ─────────────────────────────────────────

/**
 * Application inference profile used for all semantic search embeddings.
 * Not configurable — every installation uses this ARN; auth is via the AWS credential chain.
 */
export const BEDROCK_EMBEDDING_MODEL_ARN =
  'arn:aws:bedrock:us-east-1:878877078763:application-inference-profile/nl8ntqwtw5x0';

const REPLAY_PREFIX = 'REPLAY_LAT_LLM_KEY::';

/**
 * Test-only env: when set to `REPLAY_LAT_LLM_KEY::<dimensions>::<url>`, embeddings go to the
 * replay server instead of Bedrock. Ignored in normal use.
 */
export const TEST_EMBEDDING_REPLAY_ENV = 'LAT_TEST_EMBEDDING_REPLAY';

/** Resolved embedding routing key: hardcoded Bedrock ARN, or replay string in tests. */
// @lat: [[cli#search#Provider Detection]]
export function getEmbeddingKey(): string {
  const replay = process.env[TEST_EMBEDDING_REPLAY_ENV];
  if (replay?.startsWith(REPLAY_PREFIX)) {
    return replay;
  }
  return BEDROCK_EMBEDDING_MODEL_ARN;
}

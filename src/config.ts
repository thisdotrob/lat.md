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

export type LatConfig = {
  embedding_model?: string;
  embedding_cache_dir?: string;
};

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
 * AWS Bedrock application inference profile for embeddings.
 * Used when LAT_EMBEDDING_ARN is set to this ARN; auth is via the AWS credential chain.
 */
export const BEDROCK_EMBEDDING_MODEL_ARN =
  'arn:aws:bedrock:us-east-1:878877078763:application-inference-profile/nl8ntqwtw5x0';

/**
 * Width of each `embeddings.float` vector for the Bedrock embedding model.
 * Must match the model; there is no runtime probe.
 */
export const BEDROCK_EMBEDDING_DIMENSIONS = 1536;

// ── Embedding model (local GGUF) ──────────────────────────────────────

/** Default local GGUF embedding model (downloaded on first use). */
export const DEFAULT_EMBED_MODEL =
  'hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf';

/** Vector width for the default local embedding model. */
export const DEFAULT_EMBED_DIMENSIONS = 768;

export function getDefaultEmbeddingCacheDir(): string {
  return join(xdg().cache, 'lat', 'models');
}

export type EmbeddingConfig = {
  model: string;
  cacheDir: string;
};

export function getEmbeddingConfig(): EmbeddingConfig {
  const config = readConfig();
  return {
    model:
      process.env.LAT_EMBEDDING_MODEL ||
      config.embedding_model ||
      DEFAULT_EMBED_MODEL,
    cacheDir:
      process.env.LAT_EMBEDDING_CACHE_DIR ||
      config.embedding_cache_dir ||
      getDefaultEmbeddingCacheDir(),
  };
}

// ── Embedding routing key ─────────────────────────────────────────────

/**
 * Returns the embedding routing key from LAT_EMBEDDING_ARN, or undefined (→ local GGUF).
 *
 * Key formats:
 * - `arn:aws:bedrock:...`      — AWS Bedrock embeddings
 * - `REPLAY_EMBEDDING::<dim>::<url>` — test-only replay server
 * - undefined                  — local GGUF model (default)
 */
// @lat: [[cli#search#Provider Detection]]
export function getEmbeddingKey(): string | undefined {
  const key = process.env.LAT_EMBEDDING_ARN?.trim();
  return key || undefined;
}

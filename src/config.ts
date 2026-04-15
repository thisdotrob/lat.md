import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import xdg from '@folder/xdg';

export const DEFAULT_EMBED_MODEL =
  'hf:ggml-org/embeddinggemma-300M-GGUF/embeddinggemma-300M-Q8_0.gguf';
export const DEFAULT_EMBED_DIMENSIONS = 768;

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

// ── Embedding config resolution ────────────────────────────────────

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

export function getReplayKey(): string | undefined {
  const key = process.env.LAT_LLM_KEY?.trim();
  return key ? key : undefined;
}

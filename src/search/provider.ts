import { DEFAULT_EMBED_DIMENSIONS, getEmbeddingConfig } from '../config.js';

export type EmbedPurpose = 'document' | 'query';

export type EmbeddingProvider =
  | {
      name: 'local';
      model: string;
      dimensions: number;
      cacheDir: string;
    }
  | {
      name: 'replay';
      model: 'replay';
      dimensions: number;
    };

// @lat: [[cli#search#Provider Detection]]
export function detectProvider(key?: string): EmbeddingProvider {
  if (key?.startsWith('REPLAY_EMBEDDING::')) {
    // Format: REPLAY_EMBEDDING::<dimensions>::<url>
    const rest = key.slice('REPLAY_EMBEDDING::'.length);
    const sep = rest.indexOf('::');
    const dimensions = sep !== -1 ? Number(rest.slice(0, sep)) : 1024;
    return {
      name: 'replay',
      model: 'replay',
      dimensions,
    };
  }
  if (key) {
    throw new Error(
      `Unrecognized LAT_EMBEDDING_REPLAY_KEY format. Expected a replay test key (REPLAY_EMBEDDING::...).`,
    );
  }
  const { model, cacheDir } = getEmbeddingConfig();
  return {
    name: 'local',
    model,
    cacheDir,
    dimensions: DEFAULT_EMBED_DIMENSIONS,
  };
}

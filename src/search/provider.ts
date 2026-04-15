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

export function detectProvider(key?: string): EmbeddingProvider {
  if (key?.startsWith('REPLAY_LAT_LLM_KEY::')) {
    // Format: REPLAY_LAT_LLM_KEY::<dimensions>::<url>
    const rest = key.slice('REPLAY_LAT_LLM_KEY::'.length);
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
      'LAT_LLM_KEY no longer configures production embeddings. Remove it, or use REPLAY_LAT_LLM_KEY::<dimensions>::<url> for replay tests.',
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

import {
  BEDROCK_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBED_DIMENSIONS,
  getEmbeddingConfig,
} from '../config.js';

export type EmbedPurpose = 'document' | 'query';

export type EmbeddingProvider =
  | {
      name: 'local';
      model: string;
      dimensions: number;
      cacheDir: string;
    }
  | {
      name: 'bedrock';
      model: string;
      dimensions: number;
      region: string;
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
  if (key?.startsWith('arn:aws:bedrock:')) {
    const parts = key.split(':');
    if (parts.length < 4 || !parts[3]) {
      throw new Error(`Cannot parse AWS region from ARN: ${key}`);
    }
    return {
      name: 'bedrock',
      model: key,
      dimensions: BEDROCK_EMBEDDING_DIMENSIONS,
      region: parts[3],
    };
  }
  if (key) {
    throw new Error(
      `Unrecognized LAT_EMBEDDING_ARN format. Expected an AWS Bedrock ARN (arn:aws:bedrock:...) ` +
        `or a replay test key (REPLAY_EMBEDDING::...).`,
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

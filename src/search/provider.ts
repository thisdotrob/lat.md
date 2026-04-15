import { BEDROCK_EMBEDDING_DIMENSIONS } from '../config.js';

export type EmbedPurpose = 'document' | 'query';

export type EmbeddingProvider = {
  name: string;
  model: string;
  dimensions: number;
  region: string;
};

export function detectProvider(key: string): EmbeddingProvider {
  if (key.startsWith('REPLAY_LAT_LLM_KEY::')) {
    // Format: REPLAY_LAT_LLM_KEY::<dimensions>::<url>
    const rest = key.slice('REPLAY_LAT_LLM_KEY::'.length);
    const sep = rest.indexOf('::');
    const dimensions = sep !== -1 ? Number(rest.slice(0, sep)) : 1024;
    return {
      name: 'replay',
      model: 'replay',
      dimensions,
      region: '',
    };
  }
  if (key.startsWith('arn:aws:bedrock:')) {
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
  throw new Error(
    `Unrecognized embedding key format. Expected an AWS Bedrock ARN (arn:aws:bedrock:...).`,
  );
}

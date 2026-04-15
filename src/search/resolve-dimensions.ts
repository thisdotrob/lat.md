import { embed } from './embeddings.js';
import type { EmbeddingProvider } from './provider.js';

// @lat: [[cli#search#Bedrock vector dimensions]]

/** One probe per model ARN per process — avoids a Bedrock call on every search. */
const bedrockDimCache = new Map<string, number>();

/**
 * For Bedrock, `detectProvider` only supplies a placeholder dimension; this probes
 * the live model once (cached) so the vector schema matches `embeddings.float` length.
 */
export async function resolveEmbeddingProvider(
  provider: EmbeddingProvider,
  key: string,
): Promise<EmbeddingProvider> {
  if (provider.name !== 'bedrock') {
    return provider;
  }
  let dimensions = bedrockDimCache.get(provider.model);
  if (dimensions === undefined) {
    const [v] = await embed(['.'], provider, key, 'document');
    dimensions = v.length;
    bedrockDimCache.set(provider.model, dimensions);
  }
  return { ...provider, dimensions };
}

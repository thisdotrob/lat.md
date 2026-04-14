import type { EmbeddingProvider, EmbedPurpose } from './provider.js';

const REPLAY_MAX_BATCH = 2048;
const BEDROCK_MAX_BATCH = 96;

export async function embed(
  texts: string[],
  provider: EmbeddingProvider,
  key: string,
  purpose: EmbedPurpose = 'document',
): Promise<number[][]> {
  if (provider.name === 'replay') {
    return replayEmbed(texts, key);
  }
  return bedrockEmbed(texts, provider, purpose);
}

async function replayEmbed(texts: string[], key: string): Promise<number[][]> {
  // Format: REPLAY_LAT_LLM_KEY::<dimensions>::<url> or REPLAY_LAT_LLM_KEY::<url>
  const rest = key.slice('REPLAY_LAT_LLM_KEY::'.length);
  const sep = rest.indexOf('::');
  const replayUrl = sep !== -1 ? rest.slice(sep + 2) : rest;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += REPLAY_MAX_BATCH) {
    const batch = texts.slice(i, i + REPLAY_MAX_BATCH);
    const resp = await fetch(`${replayUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'replay', input: batch }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(
        `Replay server error (${resp.status}): ${body.slice(0, 200)}`,
      );
    }

    const json = (await resp.json()) as {
      data: { embedding: number[]; index: number }[];
    };
    const sorted = json.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      results.push(item.embedding);
    }
  }

  return results;
}

async function bedrockEmbed(
  texts: string[],
  provider: EmbeddingProvider,
  purpose: EmbedPurpose,
): Promise<number[][]> {
  const { BedrockRuntimeClient, InvokeModelCommand } =
    await import('@aws-sdk/client-bedrock-runtime');

  const client = new BedrockRuntimeClient({ region: provider.region });
  const inputType = purpose === 'query' ? 'search_query' : 'search_document';
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BEDROCK_MAX_BATCH) {
    const batch = texts.slice(i, i + BEDROCK_MAX_BATCH);

    const command = new InvokeModelCommand({
      modelId: provider.model,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        texts: batch,
        input_type: inputType,
        embedding_types: ['float'],
      }),
    });

    let response;
    try {
      response = await client.send(command);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      if (
        msg.includes('Could not resolve credentials') ||
        msg.includes('Missing credentials')
      ) {
        throw new Error(
          `AWS credentials not found. Bedrock requires credentials via ` +
            `environment variables (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY), ` +
            `~/.aws/credentials, or an IAM role.`,
        );
      }
      throw new Error(`Bedrock InvokeModel error: ${msg}`);
    }

    const body = JSON.parse(new TextDecoder().decode(response.body));
    if (!body.embeddings?.float) {
      throw new Error(
        `Unexpected Bedrock response format. Expected embeddings.float array. ` +
          `Got keys: ${Object.keys(body).join(', ')}`,
      );
    }

    results.push(...(body.embeddings.float as number[][]));
  }

  return results;
}

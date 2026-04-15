import { closeSync, existsSync, mkdirSync, openSync, readSync } from 'node:fs';
import type { EmbeddingProvider, EmbedPurpose } from './provider.js';

const REPLAY_MAX_BATCH = 2048;
const GGUF_MAGIC = Buffer.from('GGUF');

export type EmbedOptions = {
  purpose?: EmbedPurpose;
  titles?: string[];
};

export function formatQueryForEmbedding(query: string): string {
  return `task: search result | query: ${query}`;
}

export function formatDocumentForEmbedding(
  text: string,
  title?: string,
): string {
  return `title: ${title || 'none'} | text: ${text}`;
}

export async function embed(
  texts: string[],
  provider: EmbeddingProvider,
  options: EmbedOptions = {},
  key?: string,
): Promise<number[][]> {
  if (provider.name === 'replay') {
    return replayEmbed(texts, key, options);
  }
  return localEmbed(texts, provider, options);
}

async function replayEmbed(
  texts: string[],
  key: string | undefined,
  options: EmbedOptions,
): Promise<number[][]> {
  if (!key) {
    throw new Error('Replay embeddings require a REPLAY_LAT_LLM_KEY.');
  }

  const rest = key.slice('REPLAY_LAT_LLM_KEY::'.length);
  const sep = rest.indexOf('::');
  const replayUrl = sep !== -1 ? rest.slice(sep + 2) : rest;
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += REPLAY_MAX_BATCH) {
    const batch = texts.slice(i, i + REPLAY_MAX_BATCH);
    const resp = await fetch(`${replayUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'replay',
        input: batch,
        purpose: options.purpose ?? 'document',
        titles: options.titles?.slice(i, i + REPLAY_MAX_BATCH),
      }),
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

type LocalEmbeddingProvider = Extract<EmbeddingProvider, { name: 'local' }>;

type LocalEmbeddingContext = {
  getEmbeddingFor(text: string): Promise<{ vector: ArrayLike<number> }>;
};

type LocalRuntime = {
  cacheKey: string;
  context: LocalEmbeddingContext;
};

let localRuntimePromise: Promise<LocalRuntime> | null = null;
let localRuntimeKey: string | null = null;

async function localEmbed(
  texts: string[],
  provider: LocalEmbeddingProvider,
  options: EmbedOptions,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const runtime = await getLocalRuntime(provider);
  const formatted = texts.map((text, index) =>
    options.purpose === 'query'
      ? formatQueryForEmbedding(text)
      : formatDocumentForEmbedding(text, options.titles?.[index]),
  );
  const results: number[][] = [];

  for (const text of formatted) {
    const embedding = await runtime.context.getEmbeddingFor(text);
    results.push(Array.from(embedding.vector));
  }

  return results;
}

async function getLocalRuntime(
  provider: LocalEmbeddingProvider,
): Promise<LocalRuntime> {
  const cacheKey = `${provider.model}::${provider.cacheDir}`;
  if (localRuntimePromise && localRuntimeKey === cacheKey) {
    return localRuntimePromise;
  }

  localRuntimeKey = cacheKey;
  localRuntimePromise = createLocalRuntime(provider, cacheKey);
  return localRuntimePromise;
}

async function createLocalRuntime(
  provider: LocalEmbeddingProvider,
  cacheKey: string,
): Promise<LocalRuntime> {
  const { getLlama, resolveModelFile, LlamaLogLevel } =
    await import('node-llama-cpp');

  mkdirSync(provider.cacheDir, { recursive: true });
  const modelPath = await resolveModelFile(provider.model, provider.cacheDir);
  validateGgufFile(modelPath, provider.model);

  const loadLlama = async (gpu: 'auto' | false) =>
    getLlama({
      build: 'autoAttempt',
      gpu,
      logLevel: LlamaLogLevel.error,
    });

  let llama;
  try {
    llama = await loadLlama('auto');
  } catch (err) {
    process.stderr.write(
      `lat: GPU init failed (${(err as Error).message}), falling back to CPU.\n`,
    );
    llama = await loadLlama(false);
  }

  const model = await llama.loadModel({ modelPath });
  const context = await model.createEmbeddingContext();
  return { cacheKey, context };
}

function validateGgufFile(filePath: string, modelUri: string): void {
  if (!existsSync(filePath)) return;

  const fd = openSync(filePath, 'r');
  const header = Buffer.alloc(512);
  try {
    readSync(fd, header, 0, header.length, 0);
  } finally {
    closeSync(fd);
  }

  if (header.subarray(0, 4).equals(GGUF_MAGIC)) {
    return;
  }

  const preview = header.toString('utf-8').toLowerCase();
  if (preview.includes('<!doctype') || preview.includes('<html')) {
    throw new Error(
      `Downloaded model for ${modelUri} is HTML, not GGUF. ` +
        `Set LAT_EMBEDDING_MODEL to a local .gguf path or check Hugging Face access.`,
    );
  }

  throw new Error(
    `Model file ${filePath} is not valid GGUF. ` +
      `Set LAT_EMBEDDING_MODEL to a valid local .gguf path or re-download the default model.`,
  );
}

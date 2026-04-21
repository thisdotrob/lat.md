import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, cpSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectProvider,
  type EmbeddingProvider,
} from '../src/search/provider.js';
import {
  BEDROCK_EMBEDDING_DIMENSIONS,
  DEFAULT_EMBED_DIMENSIONS,
} from '../src/config.js';
import { openDb, ensureSchema, closeDb } from '../src/search/db.js';
import { indexSections } from '../src/search/index.js';
import { searchSections } from '../src/search/search.js';
import { startReplayServer, hasReplayData } from './rag-replay-server.js';
import {
  formatDocumentForEmbedding,
  formatQueryForEmbedding,
} from '../src/search/embeddings.js';
import type { Client } from '@libsql/client';
import type { Server } from 'node:http';

// --- Unit tests (always run) ---

// @lat: [[search#Provider Detection]]
describe('detectProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to the local embedding model', () => {
    const p = detectProvider();
    expect(p.name).toBe('local');
    expect(p.dimensions).toBe(DEFAULT_EMBED_DIMENSIONS);
    expect(p.model).toContain('embeddinggemma-300M-Q8_0.gguf');
  });

  it('uses env overrides for the local model', () => {
    vi.stubEnv('LAT_EMBEDDING_MODEL', '/tmp/custom.gguf');
    vi.stubEnv('LAT_EMBEDDING_CACHE_DIR', '/tmp/lat-models');

    const p = detectProvider();
    expect(p.name).toBe('local');
    expect(p.model).toBe('/tmp/custom.gguf');
    expect(p.name === 'local' ? p.cacheDir : '').toBe('/tmp/lat-models');
  });

  it('detects Bedrock ARN', () => {
    const p = detectProvider(
      'arn:aws:bedrock:us-east-1:878877078763:application-inference-profile/nl8ntqwtw5x0',
    );
    expect(p.name).toBe('bedrock');
    expect(p.dimensions).toBe(BEDROCK_EMBEDDING_DIMENSIONS);
    expect(p.model).toBe(
      'arn:aws:bedrock:us-east-1:878877078763:application-inference-profile/nl8ntqwtw5x0',
    );
    expect(p.name === 'bedrock' ? p.region : '').toBe('us-east-1');
  });

  it('extracts region from Bedrock ARN', () => {
    const p = detectProvider(
      'arn:aws:bedrock:eu-west-1:123456789:application-inference-profile/abc',
    );
    expect(p.name === 'bedrock' ? p.region : '').toBe('eu-west-1');
  });

  it('rejects malformed Bedrock ARN', () => {
    expect(() => detectProvider('arn:aws:bedrock:')).toThrow(
      /Cannot parse AWS region/,
    );
  });

  it('detects replay keys', () => {
    const p = detectProvider('REPLAY_EMBEDDING::1024::http://127.0.0.1:1');
    expect(p.name).toBe('replay');
    expect(p.dimensions).toBe(1024);
  });

  it('rejects unknown key format', () => {
    expect(() => detectProvider('sk-abc123')).toThrow(/Unrecognized/);
  });
});

// @lat: [[search#Embedding Formatting]]
describe('embedding formatting', () => {
  it('formats query inputs with the qmd-style task prefix', () => {
    expect(formatQueryForEmbedding('find auth docs')).toBe(
      'task: search result | query: find auth docs',
    );
  });

  it('formats document inputs with title and text fields', () => {
    expect(formatDocumentForEmbedding('Body text', 'Overview')).toBe(
      'title: Overview | text: Body text',
    );
  });
});

// @lat: [[search#Local Embedding Runtime]]
describe('local embeddings', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('formats texts before passing them to node-llama-cpp', async () => {
    vi.resetModules();
    const modelDir = mkdtempSync(join(tmpdir(), 'lat-gguf-'));
    const modelPath = join(modelDir, 'embedding.gguf');
    writeFileSync(modelPath, Buffer.from('GGUFtest'));

    const getEmbeddingFor = vi.fn(async (text: string) => ({
      vector: [text.length, 1],
    }));
    const createEmbeddingContext = vi.fn(async () => ({ getEmbeddingFor }));
    const loadModel = vi.fn(async () => ({ createEmbeddingContext }));
    const getLlama = vi.fn(async () => ({ loadModel }));
    const resolveModelFile = vi.fn(async () => modelPath);

    vi.doMock('node-llama-cpp', () => ({
      getLlama,
      resolveModelFile,
      LlamaLogLevel: { error: 0 },
    }));

    const { embed } = await import('../src/search/embeddings.js');
    const provider: EmbeddingProvider = {
      name: 'local',
      model: 'hf:test/model.gguf',
      cacheDir: modelDir,
      dimensions: 768,
    };

    await embed(
      ['Body text', 'find auth docs'],
      provider,
      { purpose: 'document', titles: ['Overview', 'Query'] },
    );

    expect(resolveModelFile).toHaveBeenCalledWith('hf:test/model.gguf', modelDir);
    expect(getEmbeddingFor).toHaveBeenNthCalledWith(
      1,
      'title: Overview | text: Body text',
    );
    expect(getEmbeddingFor).toHaveBeenNthCalledWith(
      2,
      'title: Query | text: find auth docs',
    );

    rmSync(modelDir, { recursive: true, force: true });
  });
});

// --- RAG functional tests ---
//
// Two modes:
// - Normal (default): replays cached vectors from tests/cases/rag/replay-data/
// - Capture (_LAT_TEST_CAPTURE_EMBEDDINGS=1): proxies to the local GGUF model,
//   records vectors to replay-data/, then runs assertions
//
// To re-cook: pnpm cook-test-rag

const capturing = !!process.env._LAT_TEST_CAPTURE_EMBEDDINGS;
const replayDir = join(import.meta.dirname, 'cases', 'rag', 'replay-data');
const canRun = capturing || hasReplayData(replayDir);

describe.skipIf(!canRun)('search (rag)', () => {
  let tmp: string;
  let latDir: string;
  let db: Client;
  let server: Server;
  let provider: EmbeddingProvider;
  let replayKey: string;
  let flushCapture: () => void;

  beforeAll(async () => {
    if (capturing) {
      // Capture mode: proxy to the local GGUF model, record vectors
      const realProvider = detectProvider();

      const replay = await startReplayServer(replayDir, {
        capture: true,
        provider: realProvider,
      });
      server = replay.server;
      flushCapture = replay.flush;
      replayKey = `REPLAY_EMBEDDING::${replay.dimensions}::${replay.url}`;
      provider = detectProvider(replayKey);
    } else {
      // Replay mode: serve cached vectors
      const replay = await startReplayServer(replayDir);
      server = replay.server;
      flushCapture = replay.flush;
      replayKey = `REPLAY_EMBEDDING::${replay.dimensions}::${replay.url}`;
      provider = detectProvider(replayKey);
    }

    // Copy fixture to tmp so .cache doesn't pollute the repo
    tmp = mkdtempSync(join(tmpdir(), 'lat-rag-'));
    latDir = join(tmp, 'lat.md');
    cpSync(join(import.meta.dirname, 'cases', 'rag', 'lat.md'), latDir, {
      recursive: true,
    });

    db = openDb(latDir);
    await ensureSchema(db, provider.dimensions);
  });

  afterAll(async () => {
    if (capturing) flushCapture();
    if (db) await closeDb(db);
    if (server) server.close();
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  // @lat: [[search#RAG Replay Tests#Indexes all sections]]
  it('indexes all sections', async () => {
    const stats = await indexSections(latDir, db, provider, replayKey);
    expect(stats.added).toBe(9);
    expect(stats.updated).toBe(0);
    expect(stats.removed).toBe(0);
    expect(stats.unchanged).toBe(0);
  });

  // @lat: [[search#RAG Replay Tests#Finds auth section for login query]]
  it('finds auth section for login query', async () => {
    const results = await searchSections(
      db,
      'how do we handle user login and security?',
      provider,
      replayKey,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toContain('Authentication');
  });

  // @lat: [[search#RAG Replay Tests#Finds performance section for latency query]]
  it('finds performance section for latency query', async () => {
    const results = await searchSections(
      db,
      'what tools do we use to measure response times?',
      provider,
      replayKey,
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toContain('Performance');
  });

  // @lat: [[search#RAG Replay Tests#Incremental index skips unchanged sections]]
  it('incremental index skips unchanged sections', async () => {
    const stats = await indexSections(latDir, db, provider, replayKey);
    expect(stats.unchanged).toBe(9);
    expect(stats.added).toBe(0);
    expect(stats.updated).toBe(0);
    expect(stats.removed).toBe(0);
  });

  // @lat: [[search#RAG Replay Tests#Detects deleted sections when file is removed]]
  it('detects deleted sections when file is removed', async () => {
    rmSync(join(latDir, 'testing.md'));

    const stats = await indexSections(latDir, db, provider, replayKey);
    expect(stats.removed).toBe(4); // testing + unit + integration + performance
    expect(stats.unchanged).toBe(5); // architecture sections remain
  });
});

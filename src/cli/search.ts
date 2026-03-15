import chalk from 'chalk';
import type { CliContext } from './context.js';
import { openDb, ensureSchema, closeDb } from '../search/db.js';
import { detectProvider } from '../search/provider.js';
import { indexSections, type IndexStats } from '../search/index.js';
import { searchSections } from '../search/search.js';
import {
  loadAllSections,
  flattenSections,
  type SectionMatch,
} from '../lattice.js';
import { formatResultList } from '../format.js';
import { getLlmKey, getConfigPath } from '../config.js';

export type SearchResult = {
  query: string;
  matches: SectionMatch[];
};

export type IndexProgress = {
  /** Called before indexing starts. `isEmpty` is true on first run. */
  beforeIndex?: (isEmpty: boolean) => void;
  /** Called after indexing completes with stats. */
  afterIndex?: (stats: IndexStats, isEmpty: boolean) => void;
};

async function withDb<T>(
  latDir: string,
  key: string,
  progress: IndexProgress | undefined,
  fn: (
    db: Awaited<ReturnType<typeof openDb>>,
    provider: ReturnType<typeof detectProvider>,
  ) => Promise<T>,
): Promise<T> {
  const provider = detectProvider(key);
  const db = openDb(latDir);

  try {
    await ensureSchema(db, provider.dimensions);

    const countResult = await db.execute('SELECT COUNT(*) as n FROM sections');
    const isEmpty = (countResult.rows[0].n as number) === 0;

    progress?.beforeIndex?.(isEmpty);
    const stats = await indexSections(latDir, db, provider, key);
    progress?.afterIndex?.(stats, isEmpty);

    return await fn(db, provider);
  } finally {
    await closeDb(db);
  }
}

/**
 * Run a semantic search across lat.md sections.
 * Handles indexing (with optional progress callback). Returns matched sections.
 */
export async function runSearch(
  latDir: string,
  query: string,
  key: string,
  limit: number,
  progress?: IndexProgress,
): Promise<SearchResult> {
  return withDb(latDir, key, progress, async (db, provider) => {
    const results = await searchSections(db, query, provider, key, limit);
    if (results.length === 0) {
      return { query, matches: [] };
    }

    const allSections = await loadAllSections(latDir);
    const flat = flattenSections(allSections);
    const byId = new Map(flat.map((s) => [s.id, s]));

    const matches = results
      .map((r) => byId.get(r.id))
      .filter((s): s is NonNullable<typeof s> => !!s)
      .map((s) => ({ section: s, reason: 'semantic match' }));

    return { query, matches };
  });
}

/**
 * Index-only mode (no query). Used by `lat search --reindex`.
 */
export async function runIndex(
  latDir: string,
  key: string,
  progress?: IndexProgress,
): Promise<void> {
  await withDb(latDir, key, progress, async () => {});
}

function resolveKey(): string {
  let key: string | undefined;
  try {
    key = getLlmKey();
  } catch (err) {
    console.error(chalk.red((err as Error).message));
    process.exit(1);
  }
  if (!key) {
    console.error(
      chalk.red('No API key configured.') +
        ' Provide a key via LAT_LLM_KEY, LAT_LLM_KEY_FILE, LAT_LLM_KEY_HELPER, or run ' +
        chalk.cyan('lat init') +
        ' to save one in ' +
        chalk.dim(getConfigPath()) +
        '.',
    );
    process.exit(1);
  }
  return key;
}

const cliProgress = (reindex: boolean): IndexProgress => ({
  beforeIndex(isEmpty) {
    if (isEmpty || reindex) {
      const label = reindex ? 'Re-indexing' : 'Building index';
      process.stderr.write(chalk.dim(`${label}...`));
    }
  },
  afterIndex(stats, isEmpty) {
    if (isEmpty || reindex) {
      process.stderr.write(
        chalk.dim(
          ` done (${stats.added} added, ${stats.updated} updated, ${stats.removed} removed)\n`,
        ),
      );
    } else if (stats.added + stats.updated + stats.removed > 0) {
      process.stderr.write(
        chalk.dim(
          `Index updated: ${stats.added} added, ${stats.updated} updated, ${stats.removed} removed\n`,
        ),
      );
    }
  },
});

export async function searchCmd(
  ctx: CliContext,
  query: string | undefined,
  opts: { limit: number; reindex?: boolean },
): Promise<void> {
  const key = resolveKey();
  const progress = cliProgress(!!opts.reindex);

  if (!query) {
    await runIndex(ctx.latDir, key, progress);
    return;
  }

  const result = await runSearch(ctx.latDir, query, key, opts.limit, progress);

  if (result.matches.length === 0) {
    console.log(chalk.dim('No results found.'));
    return;
  }

  console.log(
    formatResultList(
      `Search results for "${query}":`,
      result.matches,
      ctx.projectRoot,
    ),
  );
  console.log(
    '\nTo navigate further:\n' +
      '- `lat section "section#id"` — show full content with outgoing/incoming refs\n' +
      '- `lat search "new query"` — search for something else',
  );
}

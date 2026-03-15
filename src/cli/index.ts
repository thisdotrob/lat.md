#!/usr/bin/env node

// Suppress deprecation warnings from transitive dependencies unless --verbose
if (!process.argv.includes('--verbose')) {
  process.noDeprecation = true;
}

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { resolveContext } from './context.js';
import { locateCmd } from './locate.js';
import { refsCmd } from './refs.js';

function findPackageJson(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const candidate = join(dir, 'package.json');
    try {
      return JSON.parse(readFileSync(candidate, 'utf-8')).version;
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) return '0.0.0';
    dir = parent;
  }
}

const version = findPackageJson();

const program = new Command();

program
  .name('lat')
  .description('Anchor source code to high-level concepts defined in markdown')
  .version(version)
  .option('--dir <path>', 'project root to look for lat.md in (default: cwd)')
  .option('--no-color', 'disable color output')
  .option('--verbose', 'show deprecation warnings and extra diagnostics');

program
  .command('locate')
  .description('Find sections by id')
  .argument('<query>', 'section id to search for')
  .action(async (query: string) => {
    const ctx = resolveContext(program.opts());
    await locateCmd(ctx, query);
  });

program
  .command('section')
  .description(
    'Show a section with its content, outgoing refs, and incoming refs',
  )
  .argument('<query>', 'section id to look up')
  .action(async (query: string) => {
    const ctx = resolveContext(program.opts());
    const { sectionCmd } = await import('./section.js');
    await sectionCmd(ctx, query);
  });

program
  .command('refs')
  .description('Find references to a section')
  .argument('<query>', 'section id to find references for')
  .option('--scope <scope>', 'where to search: md, code, or md+code', 'md')
  .action(async (query: string, opts: { scope: string }) => {
    const scope = opts.scope;
    if (scope !== 'md' && scope !== 'code' && scope !== 'md+code') {
      console.error(`Unknown scope: ${scope}. Use md, code, or md+code.`);
      process.exit(1);
    }
    const ctx = resolveContext(program.opts());
    await refsCmd(ctx, query, scope);
  });

const check = program
  .command('check')
  .description('Validate links and code references')
  .action(async () => {
    const ctx = resolveContext(program.opts());
    const { checkAllCmd } = await import('./check.js');
    await checkAllCmd(ctx);
  });

check
  .command('md')
  .description('Validate wiki links in lat.md markdown files')
  .action(async () => {
    const ctx = resolveContext(program.opts());
    const { checkMdCmd } = await import('./check.js');
    await checkMdCmd(ctx);
  });

check
  .command('code-refs')
  .description('Validate @lat code references and coverage')
  .action(async () => {
    const ctx = resolveContext(program.opts());
    const { checkCodeRefsCmd } = await import('./check.js');
    await checkCodeRefsCmd(ctx);
  });

check
  .command('index')
  .description('Validate directory index files in lat.md')
  .action(async () => {
    const ctx = resolveContext(program.opts());
    const { checkIndexCmd } = await import('./check.js');
    await checkIndexCmd(ctx);
  });

program
  .command('prompt')
  .description('Expand [[refs]] in a prompt to lat.md section locations')
  .argument('[text]', 'prompt text')
  .option('--stdin', 'read prompt from stdin')
  .action(async (text: string | undefined, opts: { stdin?: boolean }) => {
    if (opts.stdin) {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      text = Buffer.concat(chunks).toString('utf-8');
    }
    if (!text) {
      console.error('Provide prompt text as an argument or use --stdin');
      process.exit(1);
    }
    const ctx = resolveContext(program.opts());
    const { promptCmd } = await import('./prompt.js');
    await promptCmd(ctx, text);
  });

program
  .command('search')
  .description('Semantic search across lat.md sections')
  .argument('[query]', 'search query in plain English')
  .option('--limit <n>', 'max results', '5')
  .option('--reindex', 'force full re-indexing')
  .action(
    async (
      query: string | undefined,
      opts: { limit: string; reindex?: boolean },
    ) => {
      const ctx = resolveContext(program.opts());
      const { searchCmd } = await import('./search.js');
      await searchCmd(ctx, query, {
        limit: parseInt(opts.limit),
        reindex: opts.reindex,
      });
    },
  );

program
  .command('gen')
  .description('Generate a file to stdout (agents.md, claude.md)')
  .argument('<target>', 'file to generate: agents.md or claude.md')
  .action(async (target: string) => {
    const { genCmd } = await import('./gen.js');
    await genCmd(target);
  });

program
  .command('init')
  .description('Initialize a lat.md directory')
  .argument('[dir]', 'target directory (default: cwd)')
  .action(async (dir?: string) => {
    const { initCmd } = await import('./init.js');
    await initCmd(dir);
  });

program
  .command('hook')
  .description('Handle agent hook events (called by agent hooks, not directly)')
  .argument('<agent>', 'agent name (claude)')
  .argument('<event>', 'hook event (UserPromptSubmit, Stop)')
  .action(async (agent: string, event: string) => {
    const { hookCmd } = await import('./hook.js');
    await hookCmd(agent, event);
  });

program
  .command('mcp')
  .description('Start the MCP server (stdio transport)')
  .action(async () => {
    const { startMcpServer } = await import('../mcp/server.js');
    await startMcpServer();
  });

program
  .command('config')
  .description('Show configuration file path')
  .action(async () => {
    const { getConfigPath } = await import('../config.js');
    const configPath = getConfigPath();
    const exists = existsSync(configPath);
    console.log(`Config file: ${configPath}${exists ? '' : ' (not found)'}`);
  });

await program.parseAsync();

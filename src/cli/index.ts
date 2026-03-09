#!/usr/bin/env node

import { readFileSync } from 'node:fs';
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
  .option('--dir <path>', 'path to lat files (default: .lat in your project)')
  .option('--no-color', 'disable color output');

program
  .command('locate')
  .description('Find sections by id')
  .argument('<query>', 'section id to search for')
  .action(async (query: string) => {
    const ctx = resolveContext(program.opts());
    await locateCmd(ctx, query);
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
  .description('Validate wiki links in .lat markdown files')
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

await program.parseAsync();

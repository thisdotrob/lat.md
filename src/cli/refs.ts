import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listLatticeFiles,
  loadAllSections,
  findSections,
  parseSections,
  extractRefs,
  flattenSections,
  type Section,
} from '../lattice.js';
import { formatSectionPreview } from '../format.js';
import { scanCodeRefs } from '../code-refs.js';
import type { CliContext } from './context.js';

type Scope = 'md' | 'code' | 'md+code';

export async function refsCmd(
  ctx: CliContext,
  query: string,
  scope: Scope,
): Promise<void> {
  const allSections = await loadAllSections(ctx.latDir);
  const matches = findSections(allSections, query);

  if (matches.length === 0) {
    console.error(ctx.chalk.red(`No section matching "${query}"`));
    process.exit(1);
  }

  // Require exact full-path match
  const q = query.toLowerCase();
  const flat = flattenSections(allSections);
  const exactMatch = flat.find((s) => s.id.toLowerCase() === q);
  if (!exactMatch) {
    console.error(ctx.chalk.red(`No section "${query}" found.`));
    if (matches.length > 0) {
      console.error(ctx.chalk.dim('\nDid you mean:\n'));
      for (const m of matches) {
        console.error('  ' + ctx.chalk.white(m.id));
      }
    }
    process.exit(1);
  }

  const targetId = exactMatch.id.toLowerCase();
  let hasOutput = false;

  if (scope === 'md' || scope === 'md+code') {
    const files = await listLatticeFiles(ctx.latDir);
    const matchingFromSections = new Set<string>();
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const fileRefs = extractRefs(file, content);
      for (const ref of fileRefs) {
        if (ref.target.toLowerCase() === targetId) {
          matchingFromSections.add(ref.fromSection.toLowerCase());
        }
      }
    }

    if (matchingFromSections.size > 0) {
      const referrers = flat.filter((s) =>
        matchingFromSections.has(s.id.toLowerCase()),
      );

      for (const section of referrers) {
        if (hasOutput) console.log('');
        console.log(formatSectionPreview(section, ctx.latDir));
        hasOutput = true;
      }
    }
  }

  if (scope === 'code' || scope === 'md+code') {
    const projectRoot = join(ctx.latDir, '..');
    const codeRefs = await scanCodeRefs(projectRoot);
    for (const ref of codeRefs) {
      if (ref.target.toLowerCase() === targetId) {
        if (hasOutput) console.log('');
        console.log(`  ${ref.file}:${ref.line}`);
        hasOutput = true;
      }
    }
  }

  if (!hasOutput) {
    console.error(ctx.chalk.red(`No references to "${exactMatch.id}" found`));
    process.exit(1);
  }
}

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listLatticeFiles,
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
  const q = query.toLowerCase();
  let hasOutput = false;

  if (scope === 'md' || scope === 'md+code') {
    const files = await listLatticeFiles(ctx.latDir);
    const allSections: Section[] = [];
    const allContents: string[] = [];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      allContents.push(content);
      allSections.push(...parseSections(file, content));
    }

    const matchingFromSections = new Set<string>();
    for (let i = 0; i < files.length; i++) {
      const fileRefs = extractRefs(files[i], allContents[i]);
      for (const ref of fileRefs) {
        if (ref.target.toLowerCase() === q) {
          matchingFromSections.add(ref.fromSection.toLowerCase());
        }
      }
    }

    if (matchingFromSections.size > 0) {
      const flat = flattenSections(allSections);
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
      if (ref.target.toLowerCase() === q) {
        if (hasOutput) console.log('');
        console.log(`  ${ref.file}:${ref.line}`);
        hasOutput = true;
      }
    }
  }

  if (!hasOutput) {
    console.error(ctx.chalk.red(`No references to "${query}" found`));
    process.exit(1);
  }
}

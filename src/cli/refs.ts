import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listLatticeFiles,
  loadAllSections,
  findSections,
  parseSections,
  extractRefs,
  flattenSections,
  buildFileIndex,
  resolveRef,
  type Section,
  type SectionMatch,
} from '../lattice.js';
import { formatResultList } from '../format.js';
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
    console.error(
      ctx.chalk.red(
        `No section matching "${query}" (no exact, substring, or fuzzy matches)`,
      ),
    );
    process.exit(1);
  }

  // Resolve short refs and require exact match
  const flat = flattenSections(allSections);
  const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));
  const fileIndex = buildFileIndex(allSections);
  const { resolved } = resolveRef(query, sectionIds, fileIndex);
  const q = resolved.toLowerCase();
  const exactMatch = flat.find((s) => s.id.toLowerCase() === q);
  if (!exactMatch) {
    console.error(ctx.chalk.red(`No section "${query}" found.`));
    if (matches.length > 0) {
      console.error(ctx.chalk.dim('\nDid you mean:\n'));
      for (const m of matches) {
        console.error(
          ctx.chalk.dim('*') +
            ' ' +
            ctx.chalk.white(m.section.id) +
            ' ' +
            ctx.chalk.dim(`(${m.reason})`),
        );
      }
    }
    process.exit(1);
  }

  const targetId = exactMatch.id.toLowerCase();
  const mdMatches: SectionMatch[] = [];
  const codeLines: string[] = [];

  if (scope === 'md' || scope === 'md+code') {
    const files = await listLatticeFiles(ctx.latDir);
    const matchingFromSections = new Set<string>();
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const fileRefs = extractRefs(file, content, ctx.latDir);
      for (const ref of fileRefs) {
        const { resolved: refResolved } = resolveRef(
          ref.target,
          sectionIds,
          fileIndex,
        );
        if (refResolved.toLowerCase() === targetId) {
          matchingFromSections.add(ref.fromSection.toLowerCase());
        }
      }
    }

    if (matchingFromSections.size > 0) {
      const referrers = flat.filter((s) =>
        matchingFromSections.has(s.id.toLowerCase()),
      );
      for (const s of referrers) {
        mdMatches.push({ section: s, reason: 'wiki link' });
      }
    }
  }

  if (scope === 'code' || scope === 'md+code') {
    const projectRoot = join(ctx.latDir, '..');
    const { refs: codeRefs } = await scanCodeRefs(projectRoot);
    for (const ref of codeRefs) {
      const { resolved: codeResolved } = resolveRef(
        ref.target,
        sectionIds,
        fileIndex,
      );
      if (codeResolved.toLowerCase() === targetId) {
        codeLines.push(`${ref.file}:${ref.line}`);
      }
    }
  }

  if (mdMatches.length === 0 && codeLines.length === 0) {
    console.error(ctx.chalk.red(`No references to "${exactMatch.id}" found`));
    process.exit(1);
  }

  if (mdMatches.length > 0) {
    console.log(
      formatResultList(
        `References to "${exactMatch.id}":`,
        mdMatches,
        ctx.latDir,
      ),
    );
  }

  if (codeLines.length > 0) {
    if (mdMatches.length > 0) console.log('');
    console.log(ctx.chalk.bold('Code references:'));
    console.log('');
    for (const line of codeLines) {
      console.log(`${ctx.chalk.dim('*')} ${line}`);
    }
  }
}

import { readFile } from 'node:fs/promises';
import {
  listLatticeFiles,
  loadAllSections,
  findSections,
  extractRefs,
  flattenSections,
  buildFileIndex,
  resolveRef,
  type Section,
  type SectionMatch,
} from '../lattice.js';
import { formatResultList } from '../format.js';
import { scanCodeRefs } from '../code-refs.js';
import type { CmdContext, CmdResult } from '../context.js';

export type Scope = 'md' | 'code' | 'md+code';

export type RefsFound = {
  kind: 'found';
  target: Section;
  mdRefs: SectionMatch[];
  codeRefs: string[];
};

export type RefsError = {
  kind: 'no-match';
  suggestions: SectionMatch[];
};

export type RefsResult = RefsFound | RefsError;

/**
 * Find all sections and code locations that reference a given section.
 * Accepts any valid section id (full-path, short-form, with or without brackets).
 */
export async function findRefs(
  ctx: CmdContext,
  query: string,
  scope: Scope,
): Promise<RefsResult> {
  query = query.replace(/^\[\[|\]\]$/g, '');

  const allSections = await loadAllSections(ctx.latDir);
  const flat = flattenSections(allSections);
  const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));
  const fileIndex = buildFileIndex(allSections);
  const { resolved } = resolveRef(query, sectionIds, fileIndex);
  const q = resolved.toLowerCase();
  let exactMatch = flat.find((s) => s.id.toLowerCase() === q);

  // If resolveRef didn't land on an exact id, use findSections as fallback
  const matches = !exactMatch ? findSections(allSections, query) : [];
  if (!exactMatch && matches.length >= 1) {
    const top = matches[0];
    const isConfident =
      top.reason === 'exact match' ||
      top.reason.startsWith('file stem expanded') ||
      top.reason === 'section name match';
    if (isConfident) {
      exactMatch = top.section;
    }
  }

  if (!exactMatch) {
    const suggestions =
      matches.length > 0 ? matches : findSections(allSections, query);
    return { kind: 'no-match', suggestions };
  }

  const targetId = exactMatch.id.toLowerCase();
  const mdRefs: SectionMatch[] = [];
  const codeRefs: string[] = [];

  if (scope === 'md' || scope === 'md+code') {
    const files = await listLatticeFiles(ctx.latDir);
    const matchingFromSections = new Set<string>();
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      const fileRefs = extractRefs(file, content, ctx.projectRoot);
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
        mdRefs.push({ section: s, reason: 'wiki link' });
      }
    }
  }

  if (scope === 'code' || scope === 'md+code') {
    const { refs: scannedRefs } = await scanCodeRefs(ctx.projectRoot);
    for (const ref of scannedRefs) {
      const { resolved: codeResolved } = resolveRef(
        ref.target,
        sectionIds,
        fileIndex,
      );
      if (codeResolved.toLowerCase() === targetId) {
        codeRefs.push(`${ref.file}:${ref.line}`);
      }
    }
  }

  return { kind: 'found', target: exactMatch, mdRefs, codeRefs };
}

export async function refsCommand(
  ctx: CmdContext,
  query: string,
  scope: Scope,
): Promise<CmdResult> {
  const result = await findRefs(ctx, query, scope);

  if (result.kind === 'no-match') {
    const s = ctx.styler;
    if (result.suggestions.length > 0) {
      const suggestions = result.suggestions
        .map(
          (m) =>
            `  ${s.dim('*')} ${s.white(m.section.id)} ${s.dim(`(${m.reason})`)}`,
        )
        .join('\n');
      return {
        output:
          s.red(`No section "${query}" found.`) +
          ' Did you mean:\n' +
          suggestions,
        isError: true,
      };
    }
    return {
      output: s.red(`No section matching "${query}"`),
      isError: true,
    };
  }

  const { target, mdRefs, codeRefs } = result;

  if (mdRefs.length === 0 && codeRefs.length === 0) {
    return {
      output: ctx.styler.yellow(`No references to "${target.id}" found`),
      isError: true,
    };
  }

  const s = ctx.styler;
  const parts: string[] = [];
  if (mdRefs.length > 0) {
    parts.push(formatResultList(ctx, `References to "${target.id}":`, mdRefs));
  }

  if (codeRefs.length > 0) {
    parts.push(
      '## Code references:' +
        '\n\n' +
        codeRefs.map((l) => `${s.dim('*')} ${l}`).join('\n'),
    );
  }

  return { output: parts.join('\n') };
}

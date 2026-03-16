import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  loadAllSections,
  findSections,
  flattenSections,
  extractRefs,
  buildFileIndex,
  resolveRef,
  listLatticeFiles,
  type Section,
  type SectionMatch,
} from '../lattice.js';
import type { CmdContext, CmdResult } from '../context.js';
import { formatSectionId, formatNavHints } from '../format.js';

export type SectionFound = {
  kind: 'found';
  section: Section;
  content: string;
  outgoingRefs: { target: string; resolved: Section }[];
  incomingRefs: SectionMatch[];
};

export type SectionResult =
  | SectionFound
  | { kind: 'no-match'; suggestions: SectionMatch[] };

/**
 * Look up a section by id, return its content, outgoing wiki link targets,
 * and incoming references from other sections.
 */
export async function getSection(
  ctx: CmdContext,
  query: string,
): Promise<SectionResult> {
  query = query.replace(/^\[\[|\]\]$/g, '');

  const allSections = await loadAllSections(ctx.latDir);
  const matches = findSections(allSections, query);

  if (matches.length === 0) {
    return { kind: 'no-match', suggestions: [] };
  }

  // Accept the top match if confident
  const top = matches[0];
  const isConfident =
    top.reason === 'exact match' ||
    top.reason.startsWith('file stem expanded') ||
    top.reason === 'section name match';

  if (!isConfident) {
    return { kind: 'no-match', suggestions: matches };
  }

  const section = top.section;

  // Read raw content between startLine and endLine
  const absPath = join(ctx.projectRoot, section.filePath);
  const fileContent = await readFile(absPath, 'utf-8');
  const lines = fileContent.split('\n');
  const content = lines
    .slice(section.startLine - 1, section.endLine)
    .join('\n');

  // Find outgoing wiki link targets within this section's content
  const flat = flattenSections(allSections);
  const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));
  const fileIndex = buildFileIndex(allSections);
  const sectionRefs = extractRefs(absPath, fileContent, ctx.projectRoot);
  const sectionId = section.id.toLowerCase();

  const outgoingRefs: { target: string; resolved: Section }[] = [];
  const seen = new Set<string>();
  for (const ref of sectionRefs) {
    if (ref.fromSection.toLowerCase() !== sectionId) continue;
    const { resolved } = resolveRef(ref.target, sectionIds, fileIndex);
    const resolvedLower = resolved.toLowerCase();
    if (seen.has(resolvedLower)) continue;
    seen.add(resolvedLower);
    const targetSection = flat.find(
      (s) => s.id.toLowerCase() === resolvedLower,
    );
    if (targetSection) {
      outgoingRefs.push({ target: ref.target, resolved: targetSection });
    }
  }

  // Find incoming references: other sections that link to this one
  const incomingRefs: SectionMatch[] = [];
  const files = await listLatticeFiles(ctx.latDir);
  const incomingSections = new Set<string>();

  for (const file of files) {
    const fc = await readFile(file, 'utf-8');
    const fileRefs = extractRefs(file, fc, ctx.projectRoot);
    for (const ref of fileRefs) {
      const { resolved } = resolveRef(ref.target, sectionIds, fileIndex);
      if (
        resolved.toLowerCase() === sectionId &&
        ref.fromSection.toLowerCase() !== sectionId
      ) {
        if (!incomingSections.has(ref.fromSection.toLowerCase())) {
          incomingSections.add(ref.fromSection.toLowerCase());
          const fromSection = flat.find(
            (s) => s.id.toLowerCase() === ref.fromSection.toLowerCase(),
          );
          if (fromSection) {
            incomingRefs.push({ section: fromSection, reason: 'wiki link' });
          }
        }
      }
    }
  }

  return { kind: 'found', section, content, outgoingRefs, incomingRefs };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}

/**
 * Format a successful section result with styling.
 */
export function formatSectionOutput(
  ctx: CmdContext,
  result: SectionFound,
): string {
  const s = ctx.styler;
  const { section, content, outgoingRefs, incomingRefs } = result;
  const relPath = relative(
    process.cwd(),
    join(ctx.projectRoot, section.filePath),
  );
  const loc = `${s.cyan(relPath)}${s.dim(`:${section.startLine}-${section.endLine}`)}`;

  const quoted = content
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');

  const parts: string[] = [
    `${s.bold('[[' + formatSectionId(section.id, s) + ']]')} (${loc})`,
    '',
    quoted,
  ];

  if (outgoingRefs.length > 0) {
    parts.push('', '## This section references:', '');
    for (const ref of outgoingRefs) {
      const body = ref.resolved.firstParagraph
        ? ` ${s.dim('—')} ${truncate(ref.resolved.firstParagraph, 120)}`
        : '';
      parts.push(
        `${s.dim('*')} [[${formatSectionId(ref.resolved.id, s)}]]${body}`,
      );
    }
  }

  if (incomingRefs.length > 0) {
    parts.push('', '## Referenced by:', '');
    for (const ref of incomingRefs) {
      const body = ref.section.firstParagraph
        ? ` ${s.dim('—')} ${truncate(ref.section.firstParagraph, 120)}`
        : '';
      parts.push(
        `${s.dim('*')} [[${formatSectionId(ref.section.id, s)}]]${body}`,
      );
    }
  }

  parts.push(formatNavHints(ctx));

  return parts.join('\n');
}

export async function sectionCommand(
  ctx: CmdContext,
  query: string,
): Promise<CmdResult> {
  const result = await getSection(ctx, query);

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
      output: s.red(`No sections matching "${query}"`),
      isError: true,
    };
  }

  return { output: formatSectionOutput(ctx, result) };
}

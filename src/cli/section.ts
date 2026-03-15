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
import type { CliContext } from './context.js';

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
  latDir: string,
  projectRoot: string,
  query: string,
): Promise<SectionResult> {
  query = query.replace(/^\[\[|\]\]$/g, '');

  const allSections = await loadAllSections(latDir);
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
  const absPath = join(projectRoot, section.filePath);
  const fileContent = await readFile(absPath, 'utf-8');
  const lines = fileContent.split('\n');
  const content = lines
    .slice(section.startLine - 1, section.endLine)
    .join('\n');

  // Find outgoing wiki link targets within this section's content
  const flat = flattenSections(allSections);
  const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));
  const fileIndex = buildFileIndex(allSections);
  const sectionRefs = extractRefs(absPath, fileContent, projectRoot);
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
  const files = await listLatticeFiles(latDir);
  const incomingSections = new Set<string>();

  for (const file of files) {
    const fc = await readFile(file, 'utf-8');
    const fileRefs = extractRefs(file, fc, projectRoot);
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
 * Format a successful section result as plain text (markdown).
 * Shared by CLI and MCP — CLI adds chalk on top.
 */
export function formatSectionOutput(
  result: SectionFound,
  projectRoot: string,
): string {
  const { section, content, outgoingRefs, incomingRefs } = result;
  const relPath = relative(process.cwd(), join(projectRoot, section.filePath));
  const loc = `${relPath}:${section.startLine}-${section.endLine}`;

  const parts: string[] = [`**[[${section.id}]]** (${loc})`, '', content];

  if (outgoingRefs.length > 0) {
    parts.push('', '**This section references:**', '');
    for (const ref of outgoingRefs) {
      const body = ref.resolved.body
        ? ` — ${truncate(ref.resolved.body, 120)}`
        : '';
      parts.push(`* [[${ref.resolved.id}]]${body}`);
    }
  }

  if (incomingRefs.length > 0) {
    parts.push('', '**Referenced by:**', '');
    for (const ref of incomingRefs) {
      const body = ref.section.body
        ? ` — ${truncate(ref.section.body, 120)}`
        : '';
      parts.push(`* [[${ref.section.id}]]${body}`);
    }
  }

  return parts.join('\n');
}

export async function sectionCmd(
  ctx: CliContext,
  query: string,
): Promise<void> {
  const result = await getSection(ctx.latDir, ctx.projectRoot, query);

  if (result.kind === 'no-match') {
    if (result.suggestions.length > 0) {
      console.error(ctx.chalk.red(`No section "${query}" found.`));
      console.error(ctx.chalk.dim('\nDid you mean:\n'));
      for (const m of result.suggestions) {
        console.error(
          ctx.chalk.dim('*') +
            ' ' +
            ctx.chalk.white(m.section.id) +
            ' ' +
            ctx.chalk.dim(`(${m.reason})`),
        );
      }
    } else {
      console.error(ctx.chalk.red(`No sections matching "${query}"`));
    }
    process.exit(1);
  }

  console.log(formatSectionOutput(result, ctx.projectRoot));
}

import { join, relative } from 'node:path';
import type { Section, SectionMatch } from './lattice.js';
import type { CmdContext, Styler } from './context.js';

export function formatSectionId(id: string, s: Styler): string {
  const parts = id.split('#');
  return parts.length === 1
    ? s.boldWhite(parts[0])
    : s.dim(parts.slice(0, -1).join('#') + '#') +
        s.boldWhite(parts[parts.length - 1]);
}

export function formatSectionPreview(
  ctx: CmdContext,
  section: Section,
  opts?: { reason?: string },
): string {
  const s = ctx.styler;
  const relPath = relative(
    process.cwd(),
    join(ctx.projectRoot, section.filePath),
  );

  const kind = section.id.includes('#') ? 'Section' : 'File';
  const reasonSuffix = opts?.reason ? ' ' + s.dim(`(${opts.reason})`) : '';
  const lines: string[] = [
    `${s.dim('*')} ${s.dim(kind + ':')} [[${formatSectionId(section.id, s)}]]${reasonSuffix}`,
    `  ${s.dim('Defined in')} ${s.cyan(relPath)}${s.dim(`:${section.startLine}-${section.endLine}`)}`,
  ];

  if (section.body) {
    const truncated =
      section.body.length > 200
        ? section.body.slice(0, 200) + '...'
        : section.body;
    lines.push('', `  ${s.dim('>')} ${truncated}`);
  }

  return lines.join('\n');
}

export function formatResultList(
  ctx: CmdContext,
  header: string,
  matches: SectionMatch[],
): string {
  const lines: string[] = ['', ctx.styler.bold(header), ''];

  for (let i = 0; i < matches.length; i++) {
    if (i > 0) lines.push('');
    lines.push(
      formatSectionPreview(ctx, matches[i].section, {
        reason: matches[i].reason,
      }),
    );
  }

  lines.push('');
  return lines.join('\n');
}

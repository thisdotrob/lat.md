import { relative } from 'node:path';
import chalk from 'chalk';
import type { Section, SectionMatch } from './lattice.js';

export function formatSectionId(id: string): string {
  const parts = id.split('#');
  return parts.length === 1
    ? chalk.bold.white(parts[0])
    : chalk.dim(parts.slice(0, -1).join('#') + '#') +
        chalk.bold.white(parts[parts.length - 1]);
}

export function formatSectionPreview(
  section: Section,
  latticeDir: string,
  opts?: { reason?: string },
): string {
  const relPath = relative(
    process.cwd(),
    latticeDir + '/' + section.file + '.md',
  );

  const kind = section.id.includes('#') ? 'Section' : 'File';
  const reasonSuffix = opts?.reason ? ' ' + chalk.dim(`(${opts.reason})`) : '';
  const lines: string[] = [
    `${chalk.dim('*')} ${chalk.dim(kind + ':')} [[${formatSectionId(section.id)}]]${reasonSuffix}`,
    `  ${chalk.dim('Defined in')} ${chalk.cyan(relPath)}${chalk.dim(`:${section.startLine}-${section.endLine}`)}`,
  ];

  if (section.body) {
    const truncated =
      section.body.length > 200
        ? section.body.slice(0, 200) + '...'
        : section.body;
    lines.push('');
    lines.push(`  ${chalk.dim('>')} ${truncated}`);
  }

  return lines.join('\n');
}

export function formatResultList(
  header: string,
  matches: SectionMatch[],
  latticeDir: string,
): string {
  const lines: string[] = ['', chalk.bold(header), ''];

  for (let i = 0; i < matches.length; i++) {
    if (i > 0) lines.push('');
    lines.push(
      formatSectionPreview(matches[i].section, latticeDir, {
        reason: matches[i].reason,
      }),
    );
  }

  lines.push('');
  return lines.join('\n');
}

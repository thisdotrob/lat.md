import { loadAllSections, findSections } from '../lattice.js';
import { formatSectionPreview } from '../format.js';
import type { CliContext } from './context.js';

export async function locateCmd(
  ctx: CliContext,
  query: string,
): Promise<void> {
  const sections = await loadAllSections(ctx.latDir);
  const matches = findSections(sections, query);

  if (matches.length === 0) {
    console.error(ctx.chalk.red(`No sections matching "${query}"`));
    process.exit(1);
  }

  for (let i = 0; i < matches.length; i++) {
    if (i > 0) console.log('');
    console.log(formatSectionPreview(matches[i], ctx.latDir));
  }
}

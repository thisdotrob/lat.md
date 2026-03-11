import { loadAllSections, findSections } from '../lattice.js';
import { formatResultList } from '../format.js';
import type { CliContext } from './context.js';

export async function locateCmd(ctx: CliContext, query: string): Promise<void> {
  const stripped = query.replace(/^\[\[|\]\]$/g, '');
  const sections = await loadAllSections(ctx.latDir);
  const matches = findSections(sections, stripped);

  if (matches.length === 0) {
    console.error(
      ctx.chalk.red(
        `No sections matching "${stripped}" (no exact, substring, or fuzzy matches)`,
      ),
    );
    process.exit(1);
  }

  console.log(
    formatResultList(`Sections matching "${stripped}":`, matches, ctx.latDir),
  );
}

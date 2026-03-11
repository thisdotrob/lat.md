import { relative } from 'node:path';
import {
  loadAllSections,
  findSections,
  type Section,
  type SectionMatch,
} from '../lattice.js';
import type { CliContext } from './context.js';

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

function formatLocation(section: Section, latDir: string): string {
  const relPath = relative(process.cwd(), latDir + '/' + section.file + '.md');
  return `${relPath}:${section.startLine}-${section.endLine}`;
}

type ResolvedRef = {
  target: string;
  best: SectionMatch;
  alternatives: SectionMatch[];
};

export async function promptCmd(ctx: CliContext, text: string): Promise<void> {
  const allSections = await loadAllSections(ctx.latDir);

  const refs = [...text.matchAll(WIKI_LINK_RE)];
  if (refs.length === 0) {
    process.stdout.write(text);
    return;
  }

  const resolved = new Map<string, ResolvedRef>();

  for (const match of refs) {
    const target = match[1];
    if (resolved.has(target)) continue;

    const matches = findSections(allSections, target);
    if (matches.length >= 1) {
      resolved.set(target, {
        target,
        best: matches[0],
        alternatives: matches.slice(1),
      });
      continue;
    }

    console.error(
      ctx.chalk.red(
        `No section found for [[${target}]] (no exact, substring, or fuzzy matches).`,
      ),
    );
    console.error(ctx.chalk.dim('Ask the user to correct the reference.'));
    process.exit(1);
  }

  // Replace [[refs]] inline
  let output = text.replace(WIKI_LINK_RE, (_match, target: string) => {
    const ref = resolved.get(target)!;
    return `[[${ref.best.section.id}]]`;
  });

  // Append context block as nested outliner
  output += '\n\n<lat-context>\n';
  for (const ref of resolved.values()) {
    const isExact = ref.best.reason === 'exact match';
    const all = isExact ? [ref.best] : [ref.best, ...ref.alternatives];

    if (isExact) {
      output += `* \`[[${ref.target}]]\` is referring to:\n`;
    } else {
      output += `* \`[[${ref.target}]]\` might be referring to either of the following:\n`;
    }

    for (const m of all) {
      const reason = isExact ? '' : ` (${m.reason})`;
      output += `  * [[${m.section.id}]]${reason}\n`;
      output += `    * ${formatLocation(m.section, ctx.latDir)}\n`;
      if (m.section.body) {
        output += `    * ${m.section.body}\n`;
      }
    }
  }
  output += '</lat-context>\n';

  process.stdout.write(output);
}

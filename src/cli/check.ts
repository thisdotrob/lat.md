import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  listLatticeFiles,
  loadAllSections,
  extractRefs,
  flattenSections,
  parseFrontmatter,
  parseSections,
  type Section,
} from '../lattice.js';
import { scanCodeRefs } from '../code-refs.js';
import type { CliContext } from './context.js';

export type CheckError = {
  file: string;
  line: number;
  target: string;
  message: string;
};

export async function checkMd(latticeDir: string): Promise<CheckError[]> {
  const files = await listLatticeFiles(latticeDir);
  const allSections = await loadAllSections(latticeDir);
  const flat = flattenSections(allSections);
  const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));

  const errors: CheckError[] = [];

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const refs = extractRefs(file, content);
    const relPath = relative(process.cwd(), file);

    for (const ref of refs) {
      const target = ref.target.toLowerCase();
      if (!sectionIds.has(target)) {
        errors.push({
          file: relPath,
          line: ref.line,
          target: ref.target,
          message: `broken link [[${ref.target}]] — no matching section found`,
        });
      }
    }
  }

  return errors;
}

export async function checkCodeRefs(
  latticeDir: string,
): Promise<CheckError[]> {
  const projectRoot = join(latticeDir, '..');
  const allSections = await loadAllSections(latticeDir);
  const flat = flattenSections(allSections);
  const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));

  const codeRefs = await scanCodeRefs(projectRoot);
  const errors: CheckError[] = [];

  const mentionedSections = new Set<string>();
  for (const ref of codeRefs) {
    const target = ref.target.toLowerCase();
    mentionedSections.add(target);
    if (!sectionIds.has(target)) {
      errors.push({
        file: ref.file,
        line: ref.line,
        target: ref.target,
        message: `@lat: [[${ref.target}]] — no matching section found`,
      });
    }
  }

  const files = await listLatticeFiles(latticeDir);
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const fm = parseFrontmatter(content);
    if (!fm.requireCodeMention) continue;

    const sections = parseSections(file, content);
    const fileSections = flattenSections(sections);
    const leafSections = fileSections.filter((s) => s.children.length === 0);
    const relPath = relative(process.cwd(), file);

    for (const leaf of leafSections) {
      if (!mentionedSections.has(leaf.id.toLowerCase())) {
        errors.push({
          file: relPath,
          line: leaf.startLine,
          target: leaf.id,
          message: `section "${leaf.id}" requires a code mention but none found`,
        });
      }
    }
  }

  return errors;
}

function formatErrors(ctx: CliContext, errors: CheckError[]): void {
  for (const err of errors) {
    console.error(
      `${ctx.chalk.cyan(err.file + ':' + err.line)}: ${ctx.chalk.red(err.message)}`,
    );
  }
  if (errors.length > 0) {
    console.error(
      ctx.chalk.red(
        `\n${errors.length} error${errors.length === 1 ? '' : 's'} found`,
      ),
    );
  }
}

export async function checkMdCmd(ctx: CliContext): Promise<void> {
  const errors = await checkMd(ctx.latDir);
  formatErrors(ctx, errors);
  if (errors.length > 0) process.exit(1);
  console.log(ctx.chalk.green('md: All links OK'));
}

export async function checkCodeRefsCmd(ctx: CliContext): Promise<void> {
  const errors = await checkCodeRefs(ctx.latDir);
  formatErrors(ctx, errors);
  if (errors.length > 0) process.exit(1);
  console.log(ctx.chalk.green('code-refs: All references OK'));
}

export async function checkAllCmd(ctx: CliContext): Promise<void> {
  const mdErrors = await checkMd(ctx.latDir);
  const codeErrors = await checkCodeRefs(ctx.latDir);
  const allErrors = [...mdErrors, ...codeErrors];

  formatErrors(ctx, allErrors);
  if (allErrors.length > 0) process.exit(1);
  console.log(ctx.chalk.green('All checks passed'));
}

import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { walkEntries } from './walk.js';

/** Walk project files for code-ref scanning. Uses walkEntries for .gitignore
 *  support, then additionally skips .md files, lat.md/, .claude/, and sub-projects. */
export async function walkFiles(dir: string): Promise<string[]> {
  const entries = await walkEntries(dir);

  // Collect directories that contain their own lat.md/ (sub-projects)
  const subProjects = new Set<string>();
  for (const e of entries) {
    const i = e.indexOf('/lat.md/');
    if (i !== -1) subProjects.add(e.slice(0, i + 1));
  }

  return entries
    .filter(
      (e) =>
        !e.endsWith('.md') &&
        !e.startsWith('lat.md/') &&
        !e.startsWith('.claude/') &&
        ![...subProjects].some((prefix) => e.startsWith(prefix)),
    )
    .map((e) => join(dir, e));
}

/** Build a RegExp from a verbose template — whitespace is insignificant. */
function re(flags: string) {
  return (strings: TemplateStringsArray) =>
    new RegExp(strings.raw[0].replace(/\s+/g, ''), flags);
}

// Line comment (// or #), then @lat: marker, then [[target]]
export const LAT_REF_RE = re('gv')`
  (?: // | # )
  \s* @lat: \s*
  \[\[
    ( [^\]]+ )
  \]\]
`;

export type CodeRef = {
  target: string;
  file: string;
  line: number;
};

export type ScanResult = {
  refs: CodeRef[];
  files: string[];
};

export async function scanCodeRefs(projectRoot: string): Promise<ScanResult> {
  const files = await walkFiles(projectRoot);
  const refs: CodeRef[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, 'utf-8');
    } catch (err) {
      process.stderr.write(
        `Error: failed to read ${file}: ${(err as Error).message}\n`,
      );
      continue;
    }
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let match;
      LAT_REF_RE.lastIndex = 0;
      while ((match = LAT_REF_RE.exec(lines[i])) !== null) {
        refs.push({
          target: match[1],
          file: relative(process.cwd(), file),
          line: i + 1,
        });
      }
    }
  }

  return { refs, files };
}

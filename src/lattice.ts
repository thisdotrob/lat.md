import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, basename, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { parse } from './parser.js';
import { visit } from 'unist-util-visit';
import type { Heading, Paragraph, Text } from 'mdast';
import type { WikiLink } from './extensions/wiki-link/types.js';

export type Section = {
  id: string;
  heading: string;
  depth: number;
  file: string;
  children: Section[];
  startLine: number;
  endLine: number;
  body: string;
};

export type Ref = {
  target: string;
  fromSection: string;
  file: string;
  line: number;
};

export type LatFrontmatter = {
  requireCodeMention?: boolean;
};

export function parseFrontmatter(content: string): LatFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result: LatFrontmatter = {};
  if (/require-code-mention:\s*true/i.test(yaml)) {
    result.requireCodeMention = true;
  }
  return result;
}

export function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

export function findLatticeDir(from?: string): string | null {
  let dir = resolve(from ?? process.cwd());
  while (true) {
    const candidate = join(dir, '.lat');
    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export async function listLatticeFiles(latticeDir: string): Promise<string[]> {
  const entries = await readdir(latticeDir);
  return entries
    .filter((e) => e.endsWith('.md'))
    .sort()
    .map((e) => join(latticeDir, e));
}

function headingText(node: Heading): string {
  return node.children
    .filter((c): c is Text => c.type === 'text')
    .map((c) => c.value)
    .join('');
}

function paragraphText(node: Paragraph): string {
  return node.children
    .filter((c): c is Text => c.type === 'text')
    .map((c) => c.value)
    .join('');
}

function lastLine(content: string): number {
  const lines = content.split('\n');
  // If trailing newline, count doesn't include empty last line
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
}

export function parseSections(filePath: string, content: string): Section[] {
  const tree = parse(stripFrontmatter(content));
  const file = basename(filePath, '.md');
  const roots: Section[] = [];
  const stack: Section[] = [];
  const flat: Section[] = [];

  visit(tree, 'heading', (node: Heading) => {
    const heading = headingText(node);
    const depth = node.depth;
    const startLine = node.position!.start.line;

    // Pop stack until we find a parent with smaller depth
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    const parent = stack.length > 0 ? stack[stack.length - 1] : null;
    const id = parent ? `${parent.id}#${heading}` : file;

    const section: Section = {
      id,
      heading,
      depth,
      file,
      children: [],
      startLine,
      endLine: 0,
      body: '',
    };

    if (parent) {
      parent.children.push(section);
    } else {
      roots.push(section);
    }

    stack.push(section);
    flat.push(section);
  });

  // Compute endLine: line before next heading or last line of file
  const fileLastLine = lastLine(content);
  for (let i = 0; i < flat.length; i++) {
    if (i + 1 < flat.length) {
      flat[i].endLine = flat[i + 1].startLine - 1;
    } else {
      flat[i].endLine = fileLastLine;
    }
  }

  // Extract body: first paragraph after each heading
  const children = tree.children;
  let headingIdx = 0;
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.type === 'heading') {
      // Find the first paragraph after this heading, before the next heading
      for (let j = i + 1; j < children.length; j++) {
        if (children[j].type === 'heading') break;
        if (children[j].type === 'paragraph') {
          flat[headingIdx].body = paragraphText(children[j] as Paragraph);
          break;
        }
      }
      headingIdx++;
    }
  }

  return roots;
}

export async function loadAllSections(latticeDir: string): Promise<Section[]> {
  const files = await listLatticeFiles(latticeDir);
  const all: Section[] = [];
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    all.push(...parseSections(file, content));
  }
  return all;
}

export function flattenSections(sections: Section[]): Section[] {
  const result: Section[] = [];
  for (const s of sections) {
    result.push(s);
    result.push(...flattenSections(s.children));
  }
  return result;
}

export function findSections(sections: Section[], query: string): Section[] {
  const flat = flattenSections(sections);
  const q = query.toLowerCase();
  return flat.filter((s) => s.id.toLowerCase() === q);
}

export function extractRefs(filePath: string, content: string): Ref[] {
  const tree = parse(stripFrontmatter(content));
  const file = basename(filePath, '.md');
  const refs: Ref[] = [];

  // Build a flat list of sections to determine enclosing section for each wiki link
  const flat: { id: string; startLine: number }[] = [];
  visit(tree, 'heading', (node: Heading) => {
    flat.push({
      id: '', // filled below
      startLine: node.position!.start.line,
    });
  });

  // Re-derive ids using the same logic as parseSections
  const stack: { id: string; depth: number }[] = [];
  let idx = 0;
  visit(tree, 'heading', (node: Heading) => {
    const heading = headingText(node);
    const depth = node.depth;
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    const parent = stack.length > 0 ? stack[stack.length - 1] : null;
    const id = parent ? `${parent.id}#${heading}` : file;
    flat[idx].id = id;
    stack.push({ id, depth });
    idx++;
  });

  visit(tree, 'wikiLink', (node: WikiLink) => {
    const line = node.position!.start.line;

    // Find enclosing section: last heading with startLine <= link line
    let fromSection = '';
    for (const s of flat) {
      if (s.startLine <= line) {
        fromSection = s.id;
      } else {
        break;
      }
    }

    refs.push({
      target: node.value,
      fromSection,
      file,
      line,
    });
  });

  return refs;
}

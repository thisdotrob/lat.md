import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findLatticeDir,
  listLatticeFiles,
  parseSections,
  loadAllSections,
  findSections,
  extractRefs,
} from '../src/lattice.js';
import { formatSectionPreview } from '../src/format.js';
import { checkMd, checkCodeRefs } from '../src/cli/check.js';

const fixtureDir = join(import.meta.dirname, '.lat');

describe('findLatticeDir', () => {
  it('finds .lat in the given directory', () => {
    expect(findLatticeDir(import.meta.dirname)).toBe(fixtureDir);
  });

  it('finds .lat in a parent directory', () => {
    // tests/.lat exists, so searching from a child should find it
    // Create a synthetic deep path under tests/
    expect(findLatticeDir(fixtureDir)).toBe(fixtureDir);
  });

  it('returns null when no .lat exists', () => {
    expect(findLatticeDir('/')).toBeNull();
  });
});

describe('listLatticeFiles', () => {
  it('lists .md files sorted alphabetically', async () => {
    const files = await listLatticeFiles(fixtureDir);
    expect(files).toEqual([
      join(fixtureDir, 'dev-process.md'),
      join(fixtureDir, 'notes.md'),
    ]);
  });
});

describe('parseSections', () => {
  // @lat: [[tests#Section Parsing#Builds a section tree from nested headings]]
  it('builds a section tree from nested headings', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);

    expect(sections).toHaveLength(1);
    const top = sections[0];
    expect(top.id).toBe('dev-process');
    expect(top.heading).toBe('Dev Process');
    expect(top.depth).toBe(1);
    expect(top.file).toBe('dev-process');
    expect(top.children).toHaveLength(2);

    const testing = top.children[0];
    expect(testing.id).toBe('dev-process#Testing');
    expect(testing.children).toHaveLength(1);
    expect(testing.children[0].id).toBe('dev-process#Testing#Running Tests');

    const formatting = top.children[1];
    expect(formatting.id).toBe('dev-process#Formatting');
    expect(formatting.children).toHaveLength(0);
  });

  // @lat: [[tests#Section Parsing#Populates position and body fields]]
  it('populates startLine, endLine, and body', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);

    const top = sections[0];
    expect(top.startLine).toBe(1);
    expect(top.body).toBe('');

    const testing = top.children[0];
    expect(testing.startLine).toBe(3);
    expect(testing.body).toBe('');

    const running = testing.children[0];
    expect(running.startLine).toBe(5);
    expect(running.endLine).toBe(8);
    expect(running.body).toBe('Run tests with vitest.');

    const formatting = top.children[1];
    expect(formatting.startLine).toBe(9);
    expect(formatting.endLine).toBe(11);
    expect(formatting.body).toBe('Prettier all the things.');
  });

  it('handles multiple top-level headings', () => {
    const sections = parseSections('multi.md', '# First\n\n# Second\n');
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe('multi');
    expect(sections[1].id).toBe('multi');
  });

  it('uses file stem without .md extension', () => {
    const sections = parseSections('/path/to/notes.md', '# Hello');
    expect(sections[0].file).toBe('notes');
  });
});

describe('extractRefs', () => {
  // @lat: [[tests#Ref Extraction#Extracts wiki link references]]
  it('extracts wiki link references from a file', () => {
    const filePath = join(fixtureDir, 'notes.md');
    const content = readFileSync(filePath, 'utf-8');
    const refs = extractRefs(filePath, content);

    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe('dev-process#Testing');
    expect(refs[0].fromSection).toBe('notes#Second Topic');
    expect(refs[0].file).toBe('notes');
    expect(refs[0].line).toBe(9);
  });

  // @lat: [[tests#Ref Extraction#Returns empty for files without links]]
  it('returns empty array for file with no wiki links', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const refs = extractRefs(filePath, content);

    expect(refs).toHaveLength(0);
  });
});

describe('formatSectionPreview', () => {
  // @lat: [[tests#Section Preview Formatting#Formats section with body]]
  it('formats a section with body text', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);
    const running = sections[0].children[0].children[0];

    const output = formatSectionPreview(running, fixtureDir);
    const lines = output.split('\n');

    expect(lines[0]).toBe('  dev-process#Testing#Running Tests');
    expect(lines[1]).toContain('dev-process.md:5-8');
    expect(lines[2]).toBe('');
    expect(lines[3]).toBe('    Run tests with vitest.');
  });

  // @lat: [[tests#Section Preview Formatting#Formats section without body]]
  it('formats a section without body text', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);
    const testing = sections[0].children[0];

    const output = formatSectionPreview(testing, fixtureDir);
    const lines = output.split('\n');

    expect(lines[0]).toBe('  dev-process#Testing');
    expect(lines[1]).toContain('dev-process.md:3-4');
    expect(lines).toHaveLength(2);
  });
});

describe('check md', () => {
  // @lat: [[tests#Check MD#Detects broken links]]
  it('detects broken wiki links', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'lat-check-'));
    const latDir = join(dir, '.lat');
    mkdirSync(latDir);
    writeFileSync(
      join(latDir, 'a.md'),
      '# Alpha\n\nSee [[Nonexistent#Thing]] for details.\n',
    );

    const errors = await checkMd(latDir);
    expect(errors).toHaveLength(1);
    expect(errors[0].target).toBe('Nonexistent#Thing');
    expect(errors[0].line).toBe(3);
  });

  // @lat: [[tests#Check MD#Passes with valid links]]
  it('passes when all links are valid', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'lat-check-'));
    const latDir = join(dir, '.lat');
    mkdirSync(latDir);
    writeFileSync(
      join(latDir, 'a.md'),
      '# Alpha\n\n## Beta\n\nSee [[a#Beta]] here.\n',
    );

    const errors = await checkMd(latDir);
    expect(errors).toHaveLength(0);
  });
});

describe('check code-refs', () => {
  // @lat: [[tests#Check Code Refs#Detects dangling code ref]]
  it('detects @lat comments pointing to nonexistent sections', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'lat-coderef-'));
    const latDir = join(dir, '.lat');
    mkdirSync(latDir);
    writeFileSync(join(latDir, 'a.md'), '# Alpha\n\n## Beta\n\nSome text.\n');
    const latComment = ['/', '/ @lat: [[Alpha#Nonexistent]]'].join('');
    writeFileSync(join(dir, 'app.ts'), latComment + '\nconst x = 1;\n');

    const errors = await checkCodeRefs(latDir);
    const dangling = errors.filter((e) => e.target === 'Alpha#Nonexistent');
    expect(dangling).toHaveLength(1);
    expect(dangling[0].message).toContain('no matching section found');
  });

  // @lat: [[tests#Check Code Refs#Detects missing code mention for required file]]
  it('detects uncovered leaf sections in require-code-mention files', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'lat-coderef-'));
    const latDir = join(dir, '.lat');
    mkdirSync(latDir);
    writeFileSync(
      join(latDir, 'specs.md'),
      '---\nlat:\n  require-code-mention: true\n---\n# Specs\n\n## Must Do X\n\nDescription.\n\n## Must Do Y\n\nDescription.\n',
    );
    // Only cover one of the two leaf sections
    const latComment = ['/', '/ @lat: [[specs#Must Do X]]'].join('');
    writeFileSync(join(dir, 'app.ts'), latComment + '\nconst x = 1;\n');

    const errors = await checkCodeRefs(latDir);
    const uncovered = errors.filter((e) =>
      e.message.includes('requires a code mention'),
    );
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].target).toBe('specs#Must Do Y');
  });
});

describe('end-to-end locate', () => {
  // @lat: [[tests#Locate#Finds sections by exact id]]
  it('finds sections by exact id match (case-insensitive)', async () => {
    const sections = await loadAllSections(fixtureDir);
    const matches = findSections(
      sections,
      'dev-process#Testing#Running Tests',
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('dev-process#Testing#Running Tests');
    expect(matches[0].file).toBe('dev-process');
  });

  it('returns empty for non-matching query', async () => {
    const sections = await loadAllSections(fixtureDir);
    const matches = findSections(sections, 'Nonexistent');

    expect(matches).toHaveLength(0);
  });
});

describe('end-to-end refs', () => {
  // @lat: [[tests#Refs End-to-End#Finds referring sections via wiki links]]
  it('finds sections that reference a given section via wiki links', async () => {
    const { readFile } = await import('node:fs/promises');
    const files = [
      join(fixtureDir, 'dev-process.md'),
      join(fixtureDir, 'notes.md'),
    ];

    const allSections = [];
    const allRefs = [];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      allSections.push(...parseSections(file, content));
      allRefs.push(...extractRefs(file, content));
    }

    // Find refs targeting "dev-process#Testing"
    const q = 'dev-process#testing';
    const matchingFromSections = new Set(
      allRefs
        .filter((r) => r.target.toLowerCase() === q)
        .map((r) => r.fromSection.toLowerCase()),
    );

    expect(matchingFromSections.size).toBe(1);
    expect(matchingFromSections.has('notes#second topic')).toBe(true);
  });
});

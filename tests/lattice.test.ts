import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  findLatticeDir,
  listLatticeFiles,
  parseSections,
  loadAllSections,
  findSections,
} from '../src/lattice.js';

const fixtureDir = join(import.meta.dirname, '.lattice');

describe('findLatticeDir', () => {
  it('finds .lattice in the given directory', () => {
    expect(findLatticeDir(import.meta.dirname)).toBe(fixtureDir);
  });

  it('finds .lattice in a parent directory', () => {
    // tests/.lattice exists, so searching from a child should find it
    // Create a synthetic deep path under tests/
    expect(findLatticeDir(fixtureDir)).toBe(fixtureDir);
  });

  it('returns null when no .lattice exists', () => {
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
  it('builds a section tree from nested headings', () => {
    const filePath = join(fixtureDir, 'dev-process.md');
    const content = readFileSync(filePath, 'utf-8');
    const sections = parseSections(filePath, content);

    expect(sections).toHaveLength(1);
    const top = sections[0];
    expect(top.id).toBe('Dev Process');
    expect(top.heading).toBe('Dev Process');
    expect(top.depth).toBe(1);
    expect(top.file).toBe('dev-process');
    expect(top.children).toHaveLength(2);

    const testing = top.children[0];
    expect(testing.id).toBe('Dev Process#Testing');
    expect(testing.children).toHaveLength(1);
    expect(testing.children[0].id).toBe('Dev Process#Testing#Running Tests');

    const formatting = top.children[1];
    expect(formatting.id).toBe('Dev Process#Formatting');
    expect(formatting.children).toHaveLength(0);
  });

  it('handles multiple top-level headings', () => {
    const sections = parseSections('multi.md', '# First\n\n# Second\n');
    expect(sections).toHaveLength(2);
    expect(sections[0].id).toBe('First');
    expect(sections[1].id).toBe('Second');
  });

  it('uses file stem without .md extension', () => {
    const sections = parseSections('/path/to/notes.md', '# Hello');
    expect(sections[0].file).toBe('notes');
  });
});

describe('end-to-end locate', () => {
  it('finds sections by exact id match (case-insensitive)', async () => {
    const sections = await loadAllSections(fixtureDir);
    const matches = findSections(
      sections,
      'Dev Process#Testing#Running Tests',
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].id).toBe('Dev Process#Testing#Running Tests');
    expect(matches[0].file).toBe('dev-process');
  });

  it('returns empty for non-matching query', async () => {
    const sections = await loadAllSections(fixtureDir);
    const matches = findSections(sections, 'Nonexistent');

    expect(matches).toHaveLength(0);
  });
});

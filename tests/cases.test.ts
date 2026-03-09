import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import {
  findLatticeDir,
  listLatticeFiles,
  loadAllSections,
  findSections,
  flattenSections,
  parseSections,
  extractRefs,
} from '../src/lattice.js';
import { formatSectionPreview } from '../src/format.js';
import { checkMd, checkCodeRefs } from '../src/cli/check.js';

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const casesDir = join(import.meta.dirname, 'cases');

function caseDir(name: string): string {
  return join(casesDir, name);
}

function latDir(name: string): string {
  return join(casesDir, name, '.lat');
}

// --- basic-project ---

describe('basic-project', () => {
  const lat = latDir('basic-project');

  // @lat: [[tests#Section Parsing#Builds a section tree from nested headings]]
  it('parses section tree from nested headings', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const ids = flat.map((s) => s.id);

    expect(ids).toContain('dev-process');
    expect(ids).toContain('dev-process#Testing');
    expect(ids).toContain('dev-process#Testing#Running Tests');
    expect(ids).toContain('dev-process#Formatting');
    expect(ids).toContain('notes');
    expect(ids).toContain('notes#First Topic');
    expect(ids).toContain('notes#Second Topic');
  });

  // @lat: [[tests#Section Parsing#Populates position and body fields]]
  it('populates startLine, endLine, and body', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);

    const running = flat.find((s) => s.id === 'dev-process#Testing#Running Tests')!;
    expect(running.startLine).toBe(5);
    expect(running.endLine).toBe(8);
    expect(running.body).toBe('Run tests with vitest.');

    const formatting = flat.find((s) => s.id === 'dev-process#Formatting')!;
    expect(formatting.startLine).toBe(9);
    expect(formatting.body).toBe('Prettier all the things.');
  });

  // @lat: [[tests#Section Parsing#Renders inline code in body]]
  it('renders inline code in body text', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const first = flat.find((s) => s.id === 'notes#First Topic')!;
    expect(first.body).toBe('Run `vitest` to test.');
  });

  // @lat: [[tests#Section Parsing#Renders wiki links in body]]
  it('renders wiki links in body text', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const second = flat.find((s) => s.id === 'notes#Second Topic')!;
    expect(second.body).toBe('See [[dev-process#Testing]] for more.');
  });

  // @lat: [[tests#Ref Extraction#Extracts wiki link references]]
  it('extracts wiki link references', async () => {
    const files = await listLatticeFiles(lat);
    const notesFile = files.find((f) => f.endsWith('notes.md'))!;
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(notesFile, 'utf-8');
    const refs = extractRefs(notesFile, content);

    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe('dev-process#Testing');
    expect(refs[0].fromSection).toBe('notes#Second Topic');
  });

  // @lat: [[tests#Ref Extraction#Returns empty for files without links]]
  it('returns no refs for files without wiki links', async () => {
    const files = await listLatticeFiles(lat);
    const devFile = files.find((f) => f.endsWith('dev-process.md'))!;
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(devFile, 'utf-8');
    const refs = extractRefs(devFile, content);

    expect(refs).toHaveLength(0);
  });

  // @lat: [[tests#Section Preview Formatting#Formats section with body]]
  it('formats section preview with body', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const running = flat.find((s) => s.id === 'dev-process#Testing#Running Tests')!;

    const output = stripAnsi(formatSectionPreview(running, lat));
    const lines = output.split('\n');
    expect(lines[0]).toBe('  dev-process#Testing#Running Tests');
    expect(lines[1]).toContain('dev-process.md:5-8');
    expect(lines[3]).toBe('    Run tests with vitest.');
  });

  // @lat: [[tests#Section Preview Formatting#Formats section without body]]
  it('formats section preview without body', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const testing = flat.find((s) => s.id === 'dev-process#Testing')!;

    const output = stripAnsi(formatSectionPreview(testing, lat));
    const lines = output.split('\n');
    expect(lines[0]).toBe('  dev-process#Testing');
    expect(lines[1]).toContain('dev-process.md:3-4');
    expect(lines).toHaveLength(2);
  });

  // @lat: [[tests#Locate#Finds sections by exact id]]
  it('locate finds sections by exact id', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'dev-process#Testing#Running Tests');
    expect(matches).toHaveLength(1);
    expect(matches[0].file).toBe('dev-process');
  });

  // @lat: [[tests#Locate#Matches subsection by trailing segment]]
  it('locate matches subsection by trailing segment name', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'Running Tests');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].id).toBe('dev-process#Testing#Running Tests');
  });

  // @lat: [[tests#Locate#Fuzzy matches with typos]]
  it('locate fuzzy matches with typos', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'Runing Tests');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].id).toBe('dev-process#Testing#Running Tests');
  });

  it('locate returns empty for non-matching query', async () => {
    const sections = await loadAllSections(lat);
    expect(findSections(sections, 'Nonexistent')).toHaveLength(0);
  });

  // @lat: [[tests#Refs End-to-End#Finds referring sections via wiki links]]
  it('refs finds sections referencing a target', async () => {
    const files = await listLatticeFiles(lat);
    const { readFile } = await import('node:fs/promises');

    const allRefs = [];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      allRefs.push(...extractRefs(file, content));
    }

    const matching = allRefs
      .filter((r) => r.target.toLowerCase() === 'dev-process#testing')
      .map((r) => r.fromSection.toLowerCase());

    expect(matching).toContain('notes#second topic');
  });

  // @lat: [[tests#Check MD#Passes with valid links]]
  it('check md passes with valid links', async () => {
    const errors = await checkMd(lat);
    expect(errors).toHaveLength(0);
  });
});

// --- broken-links ---

describe('broken-links', () => {
  // @lat: [[tests#Check MD#Detects broken links]]
  it('check md detects broken wiki links', async () => {
    const errors = await checkMd(latDir('broken-links'));
    expect(errors).toHaveLength(1);
    expect(errors[0].target).toBe('Nonexistent#Thing');
    expect(errors[0].line).toBe(3);
  });
});

// --- valid-links ---

describe('valid-links', () => {
  it('check md passes when all links resolve', async () => {
    const errors = await checkMd(latDir('valid-links'));
    expect(errors).toHaveLength(0);
  });
});

// --- dangling-code-ref ---

describe('dangling-code-ref', () => {
  // @lat: [[tests#Check Code Refs#Detects dangling code ref]]
  it('check code-refs detects @lat pointing to nonexistent section', async () => {
    const errors = await checkCodeRefs(latDir('dangling-code-ref'));
    const dangling = errors.filter((e) => e.target === 'Alpha#Nonexistent');
    expect(dangling).toHaveLength(1);
    expect(dangling[0].message).toContain('no matching section found');
  });
});

// --- require-code-mention ---

describe('require-code-mention', () => {
  // @lat: [[tests#Check Code Refs#Detects missing code mention for required file]]
  it('check code-refs detects uncovered leaf sections', async () => {
    const errors = await checkCodeRefs(latDir('require-code-mention'));
    const uncovered = errors.filter((e) =>
      e.message.includes('requires a code mention'),
    );
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].target).toBe('specs#Must Do Y');
  });
});

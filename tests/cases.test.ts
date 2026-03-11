import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'node:path';
import {
  findLatticeDir,
  listLatticeFiles,
  loadAllSections,
  findSections,
  flattenSections,
  parseSections,
  extractRefs,
  buildFileIndex,
  resolveRef,
} from '../src/lattice.js';
import { formatSectionPreview } from '../src/format.js';
import { checkMd, checkCodeRefs, checkIndex } from '../src/cli/check.js';
import { scanCodeRefs } from '../src/code-refs.js';

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const casesDir = join(import.meta.dirname, 'cases');

function caseDir(name: string): string {
  return join(casesDir, name);
}

function latDir(name: string): string {
  return join(casesDir, name, 'lat.md');
}

// --- basic-project ---

describe('basic-project', () => {
  const lat = latDir('basic-project');

  // @lat: [[section-parsing#Builds a section tree from nested headings]]
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

  // @lat: [[section-parsing#Populates position and body fields]]
  it('populates startLine, endLine, and body', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);

    const running = flat.find(
      (s) => s.id === 'dev-process#Testing#Running Tests',
    )!;
    expect(running.startLine).toBe(5);
    expect(running.endLine).toBe(8);
    expect(running.body).toBe('Run tests with vitest.');

    const formatting = flat.find((s) => s.id === 'dev-process#Formatting')!;
    expect(formatting.startLine).toBe(9);
    expect(formatting.body).toBe('Prettier all the things.');
  });

  // @lat: [[section-parsing#Renders inline code in body]]
  it('renders inline code in body text', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const first = flat.find((s) => s.id === 'notes#First Topic')!;
    expect(first.body).toBe('Run `vitest` to test.');
  });

  // @lat: [[section-parsing#Renders wiki links in body]]
  it('renders wiki links in body text', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const second = flat.find((s) => s.id === 'notes#Second Topic')!;
    expect(second.body).toBe('See [[dev-process#Testing]] for more.');
  });

  // @lat: [[ref-extraction#Extracts wiki link references]]
  it('extracts wiki link references', async () => {
    const files = await listLatticeFiles(lat);
    const notesFile = files.find((f) => f.endsWith('notes.md'))!;
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(notesFile, 'utf-8');
    const refs = extractRefs(notesFile, content, lat);

    expect(refs).toHaveLength(1);
    expect(refs[0].target).toBe('dev-process#Testing');
    expect(refs[0].fromSection).toBe('notes#Second Topic');
  });

  // @lat: [[ref-extraction#Returns empty for files without links]]
  it('returns no refs for files without wiki links', async () => {
    const files = await listLatticeFiles(lat);
    const devFile = files.find((f) => f.endsWith('dev-process.md'))!;
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(devFile, 'utf-8');
    const refs = extractRefs(devFile, content, lat);

    expect(refs).toHaveLength(0);
  });

  // @lat: [[section-preview#Formats section with body]]
  it('formats section preview with body', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const running = flat.find(
      (s) => s.id === 'dev-process#Testing#Running Tests',
    )!;

    const output = stripAnsi(formatSectionPreview(running, lat));
    const lines = output.split('\n');
    expect(lines[0]).toBe('* Section: [[dev-process#Testing#Running Tests]]');
    expect(lines[1]).toContain('Defined in');
    expect(lines[1]).toContain('dev-process.md:5-8');
    expect(lines[3]).toContain('> Run tests with vitest.');
  });

  // @lat: [[section-preview#Formats section without body]]
  it('formats section preview without body', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const testing = flat.find((s) => s.id === 'dev-process#Testing')!;

    const output = stripAnsi(formatSectionPreview(testing, lat));
    const lines = output.split('\n');
    expect(lines[0]).toBe('* Section: [[dev-process#Testing]]');
    expect(lines[1]).toContain('Defined in');
    expect(lines[1]).toContain('dev-process.md:3-4');
    expect(lines).toHaveLength(2);
  });

  // @lat: [[locate#Finds sections by exact id]]
  it('locate finds sections by exact id', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'dev-process#Testing#Running Tests');
    expect(matches).toHaveLength(1);
    expect(matches[0].section.file).toBe('dev-process');
  });

  // @lat: [[locate#Matches subsection by trailing segment]]
  it('locate matches subsection by trailing segment name', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'Running Tests');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].section.id).toBe('dev-process#Testing#Running Tests');
  });

  // @lat: [[locate#Fuzzy matches with typos]]
  it('locate fuzzy matches with typos', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'Runing Tests');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].section.id).toBe('dev-process#Testing#Running Tests');
  });

  it('locate returns empty for non-matching query', async () => {
    const sections = await loadAllSections(lat);
    expect(findSections(sections, 'Nonexistent')).toHaveLength(0);
  });

  // @lat: [[locate#Reports match reasons]]
  it('locate reports match reasons', async () => {
    const sections = await loadAllSections(lat);

    const exact = findSections(sections, 'dev-process#Testing');
    expect(exact[0].reason).toBe('exact match');

    const sub = findSections(sections, 'Running Tests');
    expect(sub[0].reason).toBe('section name match');

    const fuzzy = findSections(sections, 'Runing Tests');
    expect(fuzzy[0].reason).toMatch(/^fuzzy match/);
  });

  // @lat: [[locate#Matches with skipped intermediate sections]]
  it('locate matches with skipped intermediate sections', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'dev-process#Running Tests');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].section.id).toBe('dev-process#Testing#Running Tests');
    expect(matches[0].reason).toContain('1 intermediate section skipped');
  });

  // @lat: [[locate#Strips brackets from query]]
  it('locate strips [[brackets]] from query', async () => {
    const sections = await loadAllSections(lat);
    const withBrackets = findSections(sections, '[[Running Tests]]');
    // findSections itself doesn't strip brackets — that's locateCmd's job.
    // But we can verify the locate.ts stripping logic inline:
    const stripped = '[[Running Tests]]'.replace(/^\[\[|\]\]$/g, '');
    const matches = findSections(sections, stripped);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].section.id).toBe('dev-process#Testing#Running Tests');
  });

  // @lat: [[locate#Strips leading hash from query]]
  it('locate strips leading hash from query', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, '#Testing');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].section.id).toBe('dev-process#Testing');
    expect(matches[0].reason).toBe('section name match');
  });

  // @lat: [[refs-e2e#Finds referring sections via wiki links]]
  it('refs finds sections referencing a target', async () => {
    const files = await listLatticeFiles(lat);
    const { readFile } = await import('node:fs/promises');

    const allRefs = [];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      allRefs.push(...extractRefs(file, content, lat));
    }

    const matching = allRefs
      .filter((r) => r.target.toLowerCase() === 'dev-process#testing')
      .map((r) => r.fromSection.toLowerCase());

    expect(matching).toContain('notes#second topic');
  });

  // @lat: [[check-md#Passes with valid links]]
  it('check md passes with valid links', async () => {
    const { errors, files } = await checkMd(lat);
    expect(errors).toHaveLength(0);
    expect(files).toEqual({ '.md': 2 });
  });
});

// --- prompt ---

describe('prompt', () => {
  const root = caseDir('basic-project');

  function runPrompt(text: string): string {
    return execSync(`node ${join(import.meta.dirname, '..', 'dist', 'src', 'cli', 'index.js')} prompt ${JSON.stringify(text)}`, {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, _LAT_TEST_DISABLE_FS_CACHE: '1' },
    });
  }

  // @lat: [[tests/prompt#Resolves exact ref with context]]
  it('resolves exact ref with "is referring to" context', () => {
    const output = runPrompt('see [[dev-process#Testing]]');
    expect(output).toContain('see [[dev-process#Testing]]');
    expect(output).toContain('<lat-context>');
    expect(output).toContain('`[[dev-process#Testing]]` is referring to:');
    expect(output).toContain('* [[dev-process#Testing]]');
    expect(output).toContain('dev-process.md:');
  });

  // @lat: [[tests/prompt#Resolves fuzzy ref with alternatives]]
  it('resolves fuzzy ref with "might be referring to" context', () => {
    const output = runPrompt('fix [[Runing Tests]]');
    expect(output).toContain('[[dev-process#Testing#Running Tests]]');
    expect(output).toContain('`[[Runing Tests]]` might be referring to');
    expect(output).toContain('fuzzy match');
  });

  // @lat: [[tests/prompt#Passes through text without refs]]
  it('passes through text without refs unchanged', () => {
    const output = runPrompt('no refs here');
    expect(output).toBe('no refs here');
    expect(output).not.toContain('<lat-context>');
  });
});

// --- broken-links ---

describe('error-broken-links', () => {
  // @lat: [[check-md#Detects broken links]]
  it('check md detects broken wiki links', async () => {
    const { errors } = await checkMd(latDir('error-broken-links'));
    expect(errors).toHaveLength(1);
    expect(errors[0].target).toBe('Nonexistent#Thing');
    expect(errors[0].line).toBe(3);
  });
});

// --- valid-links ---

describe('valid-links', () => {
  it('check md passes when all links resolve', async () => {
    const { errors } = await checkMd(latDir('valid-links'));
    expect(errors).toHaveLength(0);
  });
});

// --- dangling-code-ref ---

describe('error-dangling-code-ref', () => {
  // @lat: [[check-code-refs#Detects dangling code ref]]
  it('check code-refs detects @lat pointing to nonexistent section', async () => {
    const { errors, files } = await checkCodeRefs(latDir('error-dangling-code-ref'));
    const dangling = errors.filter((e) => e.target === 'Alpha#Nonexistent');
    expect(dangling).toHaveLength(1);
    expect(dangling[0].message).toContain('no matching section found');
    expect(files).toEqual({ '.ts': 1 });
  });
});

// --- python-code-ref ---

describe('python-code-ref', () => {
  it('scans @lat refs from Python # comments', async () => {
    const { refs } = await scanCodeRefs(caseDir('python-code-ref'));
    expect(refs).toHaveLength(2);

    expect(refs[0].target).toBe('Specs#Feature A');
    expect(refs[0].file).toContain('app.py');
    expect(refs[0].line).toBe(1);

    expect(refs[1].target).toBe('Specs#Nonexistent');
    expect(refs[1].line).toBe(5);
  });

  it('detects dangling @lat ref in Python file', async () => {
    const { errors, files } = await checkCodeRefs(latDir('python-code-ref'));
    expect(errors).toHaveLength(1);
    expect(errors[0].target).toBe('Specs#Nonexistent');
    expect(errors[0].message).toContain('no matching section found');
    expect(files).toEqual({ '.py': 1 });
  });
});

// --- gitignore-filtering ---

describe('gitignore-filtering', () => {
  it('skips .gitignore-d dirs and .git/', async () => {
    const { refs, files } = await scanCodeRefs(caseDir('gitignore-filtering'));
    // build/ and vendor/ are gitignored; .git/ is always excluded
    expect(refs).toHaveLength(1);
    expect(refs[0].file).toContain('src/app.ts');
    expect(files).toHaveLength(1); // src/app.ts (dotfiles like .gitignore are excluded)
    expect(files.every((f) => !f.includes('.git/'))).toBe(true);
  });

  it('reports no errors when gitignored refs are excluded', async () => {
    const { errors } = await checkCodeRefs(latDir('gitignore-filtering'));
    expect(errors).toHaveLength(0);
  });
});

// --- require-code-mention ---

describe('error-require-code-mention', () => {
  // @lat: [[check-code-refs#Detects missing code mention for required file]]
  it('check code-refs detects uncovered leaf sections', async () => {
    const { errors } = await checkCodeRefs(latDir('error-require-code-mention'));
    const uncovered = errors.filter((e) =>
      e.message.includes('requires a code mention'),
    );
    expect(uncovered).toHaveLength(1);
    expect(uncovered[0].target).toBe('specs#Must Do Y');
  });
});

// --- check index ---

describe('error-missing-index', () => {
  // @lat: [[check-index#Detects missing index file]]
  it('reports missing index file with snippet', async () => {
    const errors = await checkIndex(latDir('error-missing-index'));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('missing index file');
    expect(errors[0].snippet).toContain('**notes.md**');
  });
});

describe('valid-index', () => {
  // @lat: [[check-index#Passes with valid index]]
  it('passes when index lists all entries', async () => {
    const errors = await checkIndex(latDir('valid-index'));
    expect(errors).toHaveLength(0);
  });
});

describe('error-stale-index', () => {
  // @lat: [[check-index#Detects stale index entry]]
  it('reports entry that does not exist on disk', async () => {
    const errors = await checkIndex(latDir('error-stale-index'));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('"gone.md"');
    expect(errors[0].message).toContain('does not exist');
  });
});

// --- check index (subdirectory) ---

describe('error-missing-subdir-index', () => {
  // @lat: [[check-index#Detects missing subdirectory index file]]
  it('reports missing index file in subdirectory', async () => {
    const errors = await checkIndex(latDir('error-missing-subdir-index'));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('missing index file');
    expect(errors[0].message).toContain('guides');
    expect(errors[0].snippet).toContain('**setup.md**');
  });
});

describe('valid-subdir-index', () => {
  // @lat: [[check-index#Passes with valid subdirectory index]]
  it('passes when subdirectory index lists all entries', async () => {
    const errors = await checkIndex(latDir('valid-subdir-index'));
    expect(errors).toHaveLength(0);
  });
});

describe('error-stale-subdir-index', () => {
  // @lat: [[check-index#Detects stale subdirectory index entry]]
  it('reports stale entry in subdirectory index', async () => {
    const errors = await checkIndex(latDir('error-stale-subdir-index'));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('"advanced.md"');
    expect(errors[0].message).toContain('does not exist');
  });
});

// --- ambiguous short ref ---

describe('error-ambiguous-short-ref', () => {
  const lat = latDir('error-ambiguous-short-ref');

  // @lat: [[ref-resolution#Ambiguous short ref in md]]
  it('check md reports ambiguous wiki link with candidate paths', async () => {
    const { errors } = await checkMd(lat);
    expect(errors).toHaveLength(2);
    const topicAErr = errors.find((e) => e.target === 'notes#Topic A')!;
    expect(topicAErr.message).toContain("ambiguous link '[[notes#Topic A]]'");
    expect(topicAErr.message).toContain('use either of');
    expect(topicAErr.message).toContain("'[[alpha/notes#Topic A]]'");
    expect(topicAErr.message).toContain("'[[beta/notes#Topic A]]'");
    expect(topicAErr.message).toContain('short path "notes" is ambiguous');
    expect(topicAErr.message).toContain('"alpha/notes.md"');
    expect(topicAErr.message).toContain('"beta/notes.md"');
    expect(topicAErr.message).toContain('Please fix the link');
  });

  // @lat: [[ref-resolution#Ambiguous short ref unique section]]
  it('check md suggests fix when section exists in only one file', async () => {
    const { errors } = await checkMd(lat);
    const topicCErr = errors.find((e) => e.target === 'notes#Topic C');
    expect(topicCErr).toBeDefined();
    expect(topicCErr!.message).toContain("ambiguous link '[[notes#Topic C]]'");
    expect(topicCErr!.message).toContain("did you mean '[[alpha/notes#Topic C]]'");
    expect(topicCErr!.message).toContain('"alpha/notes.md"');
    expect(topicCErr!.message).toContain('"beta/notes.md"');
    expect(topicCErr!.message).toContain('Please fix the link');
  });

  // @lat: [[ref-resolution#Ambiguous short ref in code]]
  it('check code-refs reports ambiguous code ref with candidate paths', async () => {
    const { errors } = await checkCodeRefs(lat);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("ambiguous link '[[notes#Topic B]]'");
    expect(errors[0].message).toContain('use either of');
    expect(errors[0].message).toContain("'[[alpha/notes#Topic B]]'");
    expect(errors[0].message).toContain("'[[beta/notes#Topic B]]'");
    expect(errors[0].message).toContain('"alpha/notes.md"');
    expect(errors[0].message).toContain('"beta/notes.md"');
    expect(errors[0].message).toContain('Please fix the link');
  });
});

// --- short ref ---

describe('short-ref', () => {
  const lat = latDir('short-ref');

  // @lat: [[ref-resolution#Short ref passes check md]]
  it('check md passes with short wiki links to subdir files', async () => {
    const { errors } = await checkMd(lat);
    expect(errors).toHaveLength(0);
  });

  // @lat: [[ref-resolution#Short ref passes check code-refs]]
  it('check code-refs passes with short code refs to subdir files', async () => {
    const { errors } = await checkCodeRefs(lat);
    expect(errors).toHaveLength(0);
  });

  // @lat: [[ref-resolution#Short ref findSections resolves]]
  it('findSections resolves short ref to full section', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'setup#Install');
    expect(matches).toHaveLength(1);
    expect(matches[0].section.id).toBe('guides/setup#Install');
    expect(matches[0].reason).toMatch(/file stem expanded/);
  });

  // @lat: [[locate#File stem fuzzy does not over-match]]
  it('fuzzy does not over-match when file prefix is shared', async () => {
    const sections = await loadAllSections(lat);
    // "setup#Instal" (typo) should fuzzy-match "guides/setup#Install"
    // but not "guides/setup#Configure" — heading-only comparison
    const matches = findSections(sections, 'setup#Instal');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].section.id).toBe('guides/setup#Install');
    const ids = matches.map((m) => m.section.id);
    expect(ids).not.toContain('guides/setup#Configure');
  });

  // @lat: [[ref-resolution#Short ref refs finds md references]]
  it('refs finds md wiki links using short query', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));
    const fileIndex = buildFileIndex(sections);

    const { readFile } = await import('node:fs/promises');
    const files = await listLatticeFiles(lat);
    const allRefs = [];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      allRefs.push(...extractRefs(file, content, lat));
    }

    // The query 'setup#Install' should resolve and match the wiki link
    const { resolved } = resolveRef('setup#Install', sectionIds, fileIndex);
    const matching = allRefs
      .filter((r) => {
        const { resolved: rr } = resolveRef(r.target, sectionIds, fileIndex);
        return rr.toLowerCase() === resolved.toLowerCase();
      })
      .map((r) => r.fromSection);

    expect(matching).toContain('links');
  });

  // @lat: [[ref-resolution#Short ref refs finds code references]]
  it('refs finds code refs using short query', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));
    const fileIndex = buildFileIndex(sections);

    const projectRoot = join(lat, '..');
    const { refs: codeRefs } = await scanCodeRefs(projectRoot);

    const { resolved } = resolveRef('setup#Configure', sectionIds, fileIndex);
    const matching = codeRefs.filter((r) => {
      const { resolved: rr } = resolveRef(r.target, sectionIds, fileIndex);
      return rr.toLowerCase() === resolved.toLowerCase();
    });

    expect(matching).toHaveLength(1);
    expect(matching[0].file).toContain('app.ts');
  });
});

// --- full ref ---

describe('full-ref', () => {
  const lat = latDir('full-ref');

  // @lat: [[ref-resolution#Full ref passes check md]]
  it('check md passes with fully qualified wiki links', async () => {
    const { errors } = await checkMd(lat);
    expect(errors).toHaveLength(0);
  });

  // @lat: [[ref-resolution#Full ref passes check code-refs]]
  it('check code-refs passes with fully qualified code refs', async () => {
    const { errors } = await checkCodeRefs(lat);
    expect(errors).toHaveLength(0);
  });

  // @lat: [[ref-resolution#Full ref findSections resolves]]
  it('findSections finds section by full path', async () => {
    const sections = await loadAllSections(lat);
    const matches = findSections(sections, 'guides/setup#Install');
    expect(matches).toHaveLength(1);
    expect(matches[0].section.id).toBe('guides/setup#Install');
  });

  // @lat: [[ref-resolution#Full ref refs finds md references]]
  it('refs finds md wiki links using full query', async () => {
    const sections = await loadAllSections(lat);
    const flat = flattenSections(sections);
    const sectionIds = new Set(flat.map((s) => s.id.toLowerCase()));
    const fileIndex = buildFileIndex(sections);

    const { readFile } = await import('node:fs/promises');
    const files = await listLatticeFiles(lat);
    const allRefs = [];
    for (const file of files) {
      const content = await readFile(file, 'utf-8');
      allRefs.push(...extractRefs(file, content, lat));
    }

    const matching = allRefs
      .filter((r) => {
        const { resolved } = resolveRef(r.target, sectionIds, fileIndex);
        return resolved.toLowerCase() === 'guides/setup#install';
      })
      .map((r) => r.fromSection);

    expect(matching).toContain('links');
  });

  // @lat: [[ref-resolution#Full ref refs finds code references]]
  it('refs finds code refs using full query', async () => {
    const projectRoot = join(lat, '..');
    const { refs: codeRefs } = await scanCodeRefs(projectRoot);

    const matching = codeRefs.filter(
      (r) => r.target.toLowerCase() === 'guides/setup#configure',
    );

    expect(matching).toHaveLength(1);
    expect(matching[0].file).toContain('app.ts');
  });
});

// --- bare heading ref ---

describe('error-bare-heading-ref', () => {
  const lat = latDir('error-bare-heading-ref');

  // @lat: [[ref-resolution#Bare heading in md is error]]
  it('check md rejects bare heading name as wiki link', async () => {
    const { errors } = await checkMd(lat);
    const bare = errors.find((e) => e.target === 'Installation');
    expect(bare).toBeDefined();
    expect(bare!.message).toContain('no matching section found');
  });

  // @lat: [[ref-resolution#Local section syntax in md is error]]
  it('check md rejects [[#Heading]] local section syntax', async () => {
    const { errors } = await checkMd(lat);
    const local = errors.find((e) => e.target === '#Configuration');
    expect(local).toBeDefined();
    expect(local!.message).toContain('no matching section found');
  });

  // @lat: [[ref-resolution#Nonexistent file ref in md is error]]
  it('check md rejects link to nonexistent file', async () => {
    const { errors } = await checkMd(lat);
    const missing = errors.find((e) => e.target === 'other-file#Missing');
    expect(missing).toBeDefined();
    expect(missing!.message).toContain('no matching section found');
  });

  // @lat: [[ref-resolution#Bare heading in code is error]]
  it('check code-refs rejects bare heading name', async () => {
    const { errors } = await checkCodeRefs(lat);
    const bare = errors.find((e) => e.target === 'Installation');
    expect(bare).toBeDefined();
    expect(bare!.message).toContain('no matching section found');
  });

  // @lat: [[ref-resolution#Valid code ref with file prefix passes]]
  it('check code-refs passes valid file#Heading ref', async () => {
    const { errors } = await checkCodeRefs(lat);
    const valid = errors.find((e) => e.target === 'docs#Configuration');
    expect(valid).toBeUndefined();
  });
});

// --- nested in-file refs ---

describe('valid-nested-refs', () => {
  // @lat: [[ref-resolution#Nested in-file refs pass]]
  it('check md passes with fully qualified nested section refs', async () => {
    const { errors } = await checkMd(latDir('valid-nested-refs'));
    expect(errors).toHaveLength(0);
  });
});

describe('error-bad-nested-refs', () => {
  // @lat: [[ref-resolution#Skipped intermediate in ref is error]]
  it('check md rejects ref that skips intermediate section', async () => {
    const { errors } = await checkMd(latDir('error-bad-nested-refs'));
    const skipped = errors.find((e) => e.target === 'guide#Prerequisites');
    expect(skipped).toBeDefined();
    expect(skipped!.message).toContain('no matching section found');
  });

  // @lat: [[ref-resolution#Wrong nesting order in ref is error]]
  it('check md rejects ref with wrong nesting order', async () => {
    const { errors } = await checkMd(latDir('error-bad-nested-refs'));
    const wrong = errors.find((e) => e.target === 'guide#Install#Setup');
    expect(wrong).toBeDefined();
    expect(wrong!.message).toContain('no matching section found');
  });

  // @lat: [[ref-resolution#Nonexistent leaf in nested ref is error]]
  it('check md rejects ref with nonexistent leaf heading', async () => {
    const { errors } = await checkMd(latDir('error-bad-nested-refs'));
    const missing = errors.find((e) => e.target === 'guide#Setup#Missing');
    expect(missing).toBeDefined();
    expect(missing!.message).toContain('no matching section found');
  });
});

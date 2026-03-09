---
lat:
  require-code-mention: true
---
# Tests

High-level test descriptions. Actual test code lives in `tests/`.

## Section Parsing

### Builds a section tree from nested headings

Parse a markdown file with nested headings and verify the resulting tree has correct ids, depths, parent-child relationships, and file stems.

### Populates position and body fields

Verify that `startLine`, `endLine`, and `body` are correctly extracted from heading positions and first-paragraph text.

### Renders inline code in body

Verify that inline code (backtick-wrapped) in a paragraph is preserved in the section `body` field.

### Renders wiki links in body

Verify that wiki links in a paragraph are rendered as `[[target]]` in the section `body` field.

## Ref Extraction

### Extracts wiki link references

Parse a file containing [[parser#Wiki Links]] and verify `extractRefs` returns correct targets, enclosing section ids, file stems, and line numbers.

### Returns empty for files without links

Verify `extractRefs` returns an empty array when a file has no wiki links.

## Section Preview Formatting

### Formats section with body

Verify [[cli#Section Preview]] output includes section id, file path with line range, and indented body text.

### Formats section without body

Verify [[cli#Section Preview]] omits the body lines when a section has no paragraph content.

## Check MD

### Detects broken links

Given a file with a wiki link pointing to a nonexistent section, [[cli#check#md]] should report it as a broken link.

### Passes with valid links

Given files where all wiki links resolve to existing sections, [[cli#check#md]] should report no errors.

## Check Code Refs

### Detects dangling code ref

Given a source file with `@lat: [[Nonexistent]]`, [[cli#check#code-refs]] should report it as pointing to a nonexistent section.

### Detects missing code mention for required file

Given a `.lat` file with [[markdown#Frontmatter#require-code-mention]] and a leaf section not referenced by any `@lat:` comment in the codebase, [[cli#check#code-refs]] should report the uncovered section.

## Locate

### Finds sections by exact id

Given a full section path query (case-insensitive), `findSections` returns the matching section with correct metadata.

### Matches subsection by trailing segment

Given a query matching only a trailing segment (e.g. `Running Tests`), `findSections` returns sections whose id ends with that segment.

### Fuzzy matches with typos

Given a query with a typo (e.g. `Runing Tests`), `findSections` returns the closest match via edit distance.

## Refs End-to-End

### Finds referring sections via wiki links

Load multiple files, extract refs, and verify that sections containing wiki links targeting a given section are correctly identified.

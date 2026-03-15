import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { dirname, join, relative } from 'node:path';
import {
  findLatticeDir,
  loadAllSections,
  findSections,
  type Section,
  type SectionMatch,
} from '../lattice.js';
import { checkMd, checkCodeRefs, checkIndex } from '../cli/check.js';
import { findRefs, type Scope } from '../cli/refs.js';
import { runSearch } from '../cli/search.js';
import { expandPrompt } from '../cli/prompt.js';
import { getSection, formatSectionOutput } from '../cli/section.js';

function formatSection(s: Section, projectRoot: string): string {
  const relPath = relative(process.cwd(), join(projectRoot, s.filePath));
  const kind = s.id.includes('#') ? 'Section' : 'File';
  const lines = [
    `* ${kind}: [[${s.id}]]`,
    `  Defined in ${relPath}:${s.startLine}-${s.endLine}`,
  ];
  if (s.body) {
    const truncated =
      s.body.length > 200 ? s.body.slice(0, 200) + '...' : s.body;
    lines.push('', `  > ${truncated}`);
  }
  return lines.join('\n');
}

function formatMatches(
  header: string,
  matches: SectionMatch[],
  projectRoot: string,
): string {
  const lines = [header, ''];
  for (let i = 0; i < matches.length; i++) {
    if (i > 0) lines.push('');
    lines.push(
      formatSection(matches[i].section, projectRoot) +
        ` (${matches[i].reason})`,
    );
  }
  return lines.join('\n');
}

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }] };
}

function error(t: string) {
  return { content: [{ type: 'text' as const, text: t }], isError: true };
}

export async function startMcpServer(): Promise<void> {
  const latDir = findLatticeDir();
  if (!latDir) {
    process.stderr.write('No lat.md directory found\n');
    process.exit(1);
  }
  const projectRoot = dirname(latDir);

  const server = new McpServer({
    name: 'lat',
    version: '1.0.0',
  });

  server.tool(
    'lat_locate',
    'Find sections by name (exact, fuzzy, subsequence matching)',
    { query: z.string().describe('Section name or id to search for') },
    async ({ query }) => {
      const sections = await loadAllSections(latDir);
      const matches = findSections(sections, query.replace(/^\[\[|\]\]$/g, ''));
      if (matches.length === 0) {
        return text(`No sections matching "${query}"`);
      }
      return text(
        formatMatches(`Sections matching "${query}":`, matches, projectRoot),
      );
    },
  );

  server.tool(
    'lat_section',
    'Show a section with its content, outgoing wiki link targets, and incoming references',
    {
      query: z.string().describe('Section id to look up (short or full form)'),
    },
    async ({ query }) => {
      const result = await getSection(latDir, projectRoot, query);

      if (result.kind === 'no-match') {
        if (result.suggestions.length > 0) {
          const suggestions = result.suggestions
            .map((m) => `  * ${m.section.id} (${m.reason})`)
            .join('\n');
          return text(
            `No section "${query}" found. Did you mean:\n${suggestions}`,
          );
        }
        return text(`No sections matching "${query}"`);
      }

      return text(formatSectionOutput(result, projectRoot));
    },
  );

  server.tool(
    'lat_search',
    'Semantic search across lat.md sections using embeddings',
    {
      query: z.string().describe('Search query in natural language'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Max results (default 5)'),
    },
    async ({ query, limit }) => {
      const { getLlmKey } = await import('../config.js');
      let key: string | undefined;
      try {
        key = getLlmKey();
      } catch (err) {
        return error((err as Error).message);
      }
      if (!key) {
        return error(
          'No LLM key found. Provide a key via LAT_LLM_KEY, LAT_LLM_KEY_FILE, LAT_LLM_KEY_HELPER, or run `lat init`.',
        );
      }

      const result = await runSearch(latDir, query, key, limit);

      if (result.matches.length === 0) {
        return text('No results found.');
      }

      const output =
        formatMatches(
          `Search results for "${query}":`,
          result.matches,
          projectRoot,
        ) +
        '\n\nTo navigate further:\n' +
        '- `lat_section` — show full content with outgoing/incoming refs\n' +
        '- `lat_search` — search for something else';

      return text(output);
    },
  );

  server.tool(
    'lat_prompt',
    'Expand [[refs]] in text to resolved lat.md section paths with context',
    { text: z.string().describe('Text containing [[refs]] to expand') },
    async ({ text: input }) => {
      const result = await expandPrompt(latDir, projectRoot, input);
      if (result === null) {
        // Either no wiki links or resolution failed
        const hasRefs = /\[\[[^\]]+\]\]/.test(input);
        if (!hasRefs) return text(input);
        return error(
          'Some [[refs]] could not be resolved. Check the section names.',
        );
      }
      return text(result);
    },
  );

  server.tool(
    'lat_check',
    'Validate all wiki links, code references, and directory indexes in lat.md',
    {},
    async () => {
      const md = await checkMd(latDir);
      const code = await checkCodeRefs(latDir);
      const indexErrors = await checkIndex(latDir);

      const allErrors = [...md.errors, ...code.errors];
      const lines: string[] = [];

      for (const err of allErrors) {
        lines.push(`${err.file}:${err.line}: ${err.message}`);
      }
      for (const err of indexErrors) {
        lines.push(`${err.dir}: ${err.message}`);
      }

      const totalErrors = allErrors.length + indexErrors.length;
      if (totalErrors === 0) {
        return text('All checks passed');
      }

      lines.push(`\n${totalErrors} error${totalErrors === 1 ? '' : 's'} found`);
      return error(lines.join('\n'));
    },
  );

  server.tool(
    'lat_refs',
    'Find sections that reference a given section via wiki links or @lat code comments',
    {
      query: z.string().describe('Section id to find references for'),
      scope: z
        .enum(['md', 'code', 'md+code'])
        .optional()
        .default('md')
        .describe('Where to search: md, code, or md+code'),
    },
    async ({ query, scope }) => {
      const result = await findRefs(latDir, projectRoot, query, scope as Scope);

      if (result.kind === 'no-match') {
        if (result.suggestions.length > 0) {
          const suggestions = result.suggestions
            .map((m) => `  * ${m.section.id} (${m.reason})`)
            .join('\n');
          return text(
            `No exact section "${query}" found. Did you mean:\n${suggestions}`,
          );
        }
        return text(`No section matching "${query}"`);
      }

      const { target, mdRefs, codeRefs } = result;

      if (mdRefs.length === 0 && codeRefs.length === 0) {
        return text(`No references to "${target.id}" found`);
      }

      const parts: string[] = [];
      if (mdRefs.length > 0) {
        parts.push(
          formatMatches(`References to "${target.id}":`, mdRefs, projectRoot),
        );
      }
      if (codeRefs.length > 0) {
        parts.push(
          'Code references:\n' + codeRefs.map((l) => `* ${l}`).join('\n'),
        );
      }

      return text(parts.join('\n\n'));
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

import { dirname } from 'node:path';
import { findLatticeDir } from '../lattice.js';
import { plainStyler, type CmdContext } from '../context.js';
import { expandPrompt } from './prompt.js';
import { runSearch } from './search.js';
import { getSection, formatSectionOutput } from './section.js';
import { getLlmKey } from '../config.js';

function outputPromptSubmit(context: string): void {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: context,
      },
    }),
  );
}

function outputStop(reason: string): void {
  process.stdout.write(
    JSON.stringify({
      decision: 'block',
      reason,
    }),
  );
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function hasWikiLinks(text: string): boolean {
  return /\[\[[^\]]+\]\]/.test(text);
}

function makeHookCtx(latDir: string): CmdContext {
  return {
    latDir,
    projectRoot: dirname(latDir),
    styler: plainStyler,
    mode: 'cli',
  };
}

async function searchAndExpand(
  ctx: CmdContext,
  userPrompt: string,
): Promise<string | null> {
  let key: string | undefined;
  try {
    key = getLlmKey();
  } catch {
    return null;
  }
  if (!key) return null;

  const result = await runSearch(ctx.latDir, userPrompt, key, 5);
  if (result.matches.length === 0) return null;

  const parts: string[] = [
    `Search results for the user prompt (${result.matches.length} matches):`,
    '',
  ];

  for (const match of result.matches) {
    const sectionResult = await getSection(ctx, match.section.id);
    if (sectionResult.kind === 'found') {
      parts.push(formatSectionOutput(ctx, sectionResult));
      parts.push('');
    }
  }

  return parts.join('\n');
}

async function handleUserPromptSubmit(): Promise<void> {
  let userPrompt = '';
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw);
    userPrompt = input.user_prompt ?? '';
  } catch {
    // If we can't parse stdin, still emit the reminder
  }

  const parts: string[] = [];

  parts.push(
    'Before starting work on this task:',
    '1. Use `lat search` and `lat section` to navigate the knowledge graph as needed.',
    '2. After completing work, run `lat check` to validate all links and code refs.',
    'Do not skip these steps.',
  );

  const latDir = findLatticeDir();
  if (latDir && userPrompt) {
    const ctx = makeHookCtx(latDir);

    // If the user prompt contains [[refs]], resolve them inline
    if (hasWikiLinks(userPrompt)) {
      try {
        const expanded = await expandPrompt(ctx, userPrompt);
        if (expanded) {
          parts.push(
            '',
            'Expanded user prompt with resolved [[refs]]:',
            expanded,
          );
        } else {
          parts.push(
            '',
            'NOTE: The user prompt contains [[refs]] but they could not be resolved. Ask the user to correct them.',
          );
        }
      } catch {
        parts.push(
          '',
          'NOTE: The user prompt contains [[refs]] but resolution failed. Run `lat prompt` on the prompt text manually.',
        );
      }
    }

    // Search for relevant sections and include their full content
    try {
      const searchContext = await searchAndExpand(ctx, userPrompt);
      if (searchContext) {
        parts.push('', searchContext);
      }
    } catch {
      // Search failed (no key, index error, etc.) — agent can search manually
    }
  }

  outputPromptSubmit(parts.join('\n'));
}

async function handleStop(): Promise<void> {
  // Only emit the reminder if we're in a project with lat.md
  const latDir = findLatticeDir();
  if (!latDir) return;

  // Read stdin to check if we already blocked once
  let stopHookActive = false;
  try {
    const raw = await readStdin();
    const input = JSON.parse(raw);
    stopHookActive = input.stop_hook_active ?? false;
  } catch {
    // If we can't parse stdin, treat as first attempt
  }

  // Don't block twice — avoids infinite loop
  if (stopHookActive) return;

  const parts: string[] = [];

  parts.push(
    'Before finishing, verify:',
    '- Did you update `lat.md/`? Run `lat search` with a query describing what you changed to find relevant sections that may need updating.',
    '- Did you run `lat check` and confirm all links and code refs pass?',
    'If you made code changes but did not update lat.md/, do that now.',
  );

  outputStop(parts.join('\n'));
}

export async function hookCmd(agent: string, event: string): Promise<void> {
  if (agent !== 'claude') {
    console.error(`Unknown agent: ${agent}. Supported: claude`);
    process.exit(1);
  }

  switch (event) {
    case 'UserPromptSubmit':
      await handleUserPromptSubmit();
      break;
    case 'Stop':
      await handleStop();
      break;
    default:
      console.error(
        `Unknown hook event: ${event}. Supported: UserPromptSubmit, Stop`,
      );
      process.exit(1);
  }
}

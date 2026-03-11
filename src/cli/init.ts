import {
  existsSync,
  cpSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  chmodSync,
  symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { findTemplatesDir } from './templates.js';
import { readAgentsTemplate } from './gen.js';

async function confirm(
  rl: ReturnType<typeof createInterface>,
  message: string,
): Promise<boolean> {
  try {
    const answer = await rl.question(`${message} ${chalk.dim('[Y/n]')} `);
    return answer.trim().toLowerCase() !== 'n';
  } catch {
    return true;
  }
}

const HOOK_COMMAND = '.claude/hooks/lat-prompt-hook.sh';

/**
 * Check if .claude/settings.json already has the lat-prompt hook configured.
 */
function hasLatHook(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const entries = settings?.hooks?.UserPromptSubmit;
    if (!Array.isArray(entries)) return false;
    return entries.some((entry: { hooks?: { command?: string }[] }) =>
      entry.hooks?.some((h) => h.command === HOOK_COMMAND),
    );
  } catch {
    return false;
  }
}

/**
 * Add the lat-prompt hook to .claude/settings.json, preserving existing config.
 */
function addLatHook(settingsPath: string): void {
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      // Corrupted file — start fresh
    }
  }

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown>;

  if (!Array.isArray(hooks.UserPromptSubmit)) {
    hooks.UserPromptSubmit = [];
  }

  (hooks.UserPromptSubmit as unknown[]).push({
    hooks: [{ type: 'command', command: HOOK_COMMAND }],
  });

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

export async function initCmd(targetDir?: string): Promise<void> {
  const root = resolve(targetDir ?? process.cwd());
  const latDir = join(root, 'lat.md');

  const interactive = process.stdin.isTTY ?? false;
  const rl = interactive
    ? createInterface({ input: process.stdin, output: process.stdout })
    : null;

  const ask = async (message: string): Promise<boolean> => {
    if (!rl) return true;
    return confirm(rl, message);
  };

  try {
    // Step 1: lat.md/ directory
    if (existsSync(latDir)) {
      console.log(chalk.green('lat.md/') + ' already exists');
    } else {
      if (!(await ask('Create lat.md/ directory?'))) {
        console.log('Aborted.');
        return;
      }
      const templateDir = join(findTemplatesDir(), 'init');
      mkdirSync(latDir, { recursive: true });
      cpSync(templateDir, latDir, { recursive: true });
      console.log(chalk.green('Created lat.md/'));
    }

    // Step 2: AGENTS.md / CLAUDE.md
    const agentsPath = join(root, 'AGENTS.md');
    const claudePath = join(root, 'CLAUDE.md');
    const hasAgents = existsSync(agentsPath);
    const hasClaude = existsSync(claudePath);

    if (!hasAgents && !hasClaude) {
      if (
        await ask(
          'Generate AGENTS.md and CLAUDE.md with lat.md instructions for coding agents?',
        )
      ) {
        const template = readAgentsTemplate();
        writeFileSync(agentsPath, template);
        symlinkSync('AGENTS.md', claudePath);
        console.log(chalk.green('Created AGENTS.md and CLAUDE.md → AGENTS.md'));
      }
    } else {
      const existing = [hasAgents && 'AGENTS.md', hasClaude && 'CLAUDE.md']
        .filter(Boolean)
        .join(' and ');
      console.log(
        `\n${existing} already exists. Run ${chalk.cyan('lat gen agents.md')} to preview the template,` +
          ` then incorporate its content or overwrite as needed.`,
      );
    }

    // Step 3: Claude Code prompt hook
    const claudeDir = join(root, '.claude');
    const hooksDir = join(claudeDir, 'hooks');
    const hookPath = join(hooksDir, 'lat-prompt-hook.sh');
    const settingsPath = join(claudeDir, 'settings.json');

    if (hasLatHook(settingsPath)) {
      console.log(chalk.green('Claude Code hook') + ' already configured');
    } else {
      console.log('');
      console.log(
        chalk.bold('Claude Code hook') +
          ' — adds a per-prompt reminder for the agent to consult lat.md',
      );
      console.log(
        chalk.dim(
          '  Creates .claude/hooks/lat-prompt-hook.sh and registers it in .claude/settings.json',
        ),
      );
      console.log(
        chalk.dim(
          '  On every prompt, the agent is instructed to run `lat search` and `lat prompt` before working.',
        ),
      );

      if (await ask('Set up Claude Code prompt hook?')) {
        mkdirSync(hooksDir, { recursive: true });
        const templateHook = join(findTemplatesDir(), 'lat-prompt-hook.sh');
        copyFileSync(templateHook, hookPath);
        chmodSync(hookPath, 0o755);
        addLatHook(settingsPath);
        console.log(chalk.green('Created .claude/hooks/lat-prompt-hook.sh'));
        console.log(
          chalk.green('Updated .claude/settings.json') +
            ' with UserPromptSubmit hook',
        );
      }
    }
  } finally {
    rl?.close();
  }
}

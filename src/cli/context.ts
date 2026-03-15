import { dirname } from 'node:path';
import chalk from 'chalk';
import { findLatticeDir } from '../lattice.js';
import type { CmdContext, Styler } from '../context.js';

export type { CmdContext };

function makeChalkStyler(): Styler {
  return {
    bold: (s) => chalk.bold(s),
    dim: (s) => chalk.dim(s),
    red: (s) => chalk.red(s),
    cyan: (s) => chalk.cyan(s),
    white: (s) => chalk.white(s),
    green: (s) => chalk.green(s),
    yellow: (s) => chalk.yellow(s),
    boldWhite: (s) => chalk.bold.white(s),
  };
}

export function resolveContext(opts: {
  dir?: string;
  color?: boolean;
}): CmdContext {
  const color = opts.color !== false;
  if (!color) {
    chalk.level = 0;
  }

  const latDir = findLatticeDir(opts.dir) ?? '';
  if (!latDir) {
    console.error(chalk.red('No lat.md directory found'));
    console.error(chalk.dim('Run `lat init` to create one.'));
    process.exit(1);
  }

  const projectRoot = dirname(latDir);
  return { latDir, projectRoot, styler: makeChalkStyler(), mode: 'cli' };
}

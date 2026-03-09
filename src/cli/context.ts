import chalk, { type ChalkInstance } from 'chalk';
import { findLatticeDir } from '../lattice.js';

export type CliContext = {
  latDir: string;
  color: boolean;
  chalk: ChalkInstance;
};

export function resolveContext(opts: {
  dir?: string;
  color?: boolean;
}): CliContext {
  const color = opts.color !== false;
  if (!color) {
    chalk.level = 0;
  }

  const latDir = opts.dir ?? findLatticeDir() ?? '';
  if (!latDir) {
    console.error(chalk.red('No .lat directory found'));
    process.exit(1);
  }

  return { latDir, color, chalk };
}

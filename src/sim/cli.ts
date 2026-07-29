/**
 * `npm run sim -- --runs 2000 --seed 0`
 *
 * Spreads the requested runs evenly across the 11 Act 1 fights, plays each with the
 * heuristic policy, and prints the tables. Every trial's seed is derived from the base
 * seed and the trial index, so `--runs 2000 --seed 0` is the same 2000 combats every time
 * on every machine. Balance arguments are only worth having if the numbers hold still.
 */
import { ENCOUNTERS } from '../content/enemies';
import { buildReport, buildRunReport, formatOutliers, formatReport, formatRunReport } from './report';
import { runTrial } from './trial';
import type { TrialResult } from './trial';
import { runWhole } from './run';

type Options = {
  readonly runs: number;
  readonly seed: number;
  readonly only: string | null;
  readonly cards: boolean;
  readonly combats: boolean;
};

function parseArgs(argv: readonly string[]): Options {
  let runs = 200;
  let seed = 0;
  let only: string | null = null;
  let cards = true;
  let combats = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case '--runs':
        runs = Number.parseInt(value ?? '', 10);
        i += 1;
        break;
      case '--seed':
        seed = Number.parseInt(value ?? '', 10);
        i += 1;
        break;
      case '--only':
        only = value ?? null;
        i += 1;
        break;
      case '--no-cards':
        cards = false;
        break;
      case '--combats':
        combats = true;
        break;
      case '--help':
        console.log('sim  --runs N  --seed N  [--no-cards]\n     --combats [--only <encounter id>]  (legacy per-encounter diagnostics)');
        process.exit(0);
    }
  }

  if (!Number.isFinite(runs) || runs < 1) throw new Error('--runs needs a positive integer');
  if (!Number.isFinite(seed)) throw new Error('--seed needs an integer');
  if (only !== null && !combats) throw new Error('--only is only available with --combats');
  if (only !== null && !ENCOUNTERS.some((e) => e.id === only)) {
    throw new Error(`--only got "${only}", which is not one of: ${ENCOUNTERS.map((e) => e.id).join(', ')}`);
  }
  return { runs, seed, only, cards, combats };
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  if (!options.combats) {
    const runs = Array.from({ length: options.runs }, (_, index) => runWhole(options.seed + index * 100_003));
    console.log(formatRunReport(buildRunReport(runs, options.seed)));
    return;
  }

  const fights = options.only === null ? ENCOUNTERS : ENCOUNTERS.filter((e) => e.id === options.only);
  // Spread the remainder over the first few fights, so `--runs N` means exactly N combats.
  const base = Math.floor(options.runs / fights.length);
  const remainder = options.runs % fights.length;

  const trials: TrialResult[] = [];
  for (const [fightIndex, fight] of fights.entries()) {
    const perFight = base + (fightIndex < remainder ? 1 : 0);
    for (let trial = 0; trial < perFight; trial += 1) {
      // Distinct per fight and per trial, derived from the base seed. Two fights never
      // share a deck by accident, and nothing depends on iteration order.
      trials.push(runTrial(fight.id, options.seed + fightIndex * 100_003 + trial));
    }
  }

  const report = buildReport(trials, options.seed);
  console.log(formatReport(report));
  if (options.cards) {
    console.log('');
    console.log(formatOutliers(report));
  }
}

main();

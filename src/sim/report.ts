/**
 * The tables.
 *
 * Balance decisions come from these, not from vibes, so the format matters: one row per
 * thing you might change, and every column a number you could act on. No prose, no
 * verdicts. The sim reports, a person decides.
 */
import { CARDS } from '../content/cards';
import { ENCOUNTERS } from '../content/enemies';
import { compoundsPerLap } from '../content/run';
import { baseIdOf } from '../engine/variants';
import type { EnemyTier } from '../content/types';
import type { TrialResult } from './trial';
import type { RunResult } from './run';

export type EncounterRow = {
  readonly id: string;
  readonly name: string;
  readonly tier: EnemyTier;
  readonly trials: number;
  readonly winRate: number;
  readonly avgBeats: number;
  readonly avgLaps: number;
  readonly avgDamage: number;
  readonly avgHpLeft: number;
  readonly timeouts: number;
};

export type CardRow = {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  readonly inDecks: number;
  readonly drawn: number;
  readonly played: number;
  /** Plays per draw. Low means the policy keeps finding it and keeps declining. */
  readonly playRate: number;
  /** Win rate of the combats it was played in. */
  readonly winRate: number;
};

export type Report = {
  readonly runs: number;
  readonly seed: number;
  readonly encounters: readonly EncounterRow[];
  readonly cards: readonly CardRow[];
  readonly overallWinRate: number;
  readonly timeouts: number;
};

export type RunEncounterRow = {
  readonly id: string;
  readonly name: string;
  readonly trials: number;
  readonly wins: number;
  readonly deaths: number;
  readonly timeouts: number;
  readonly winRate: number;
  readonly avgBeats: number;
  readonly avgDamage: number;
  readonly avgHpAfter: number;
  readonly interestEvents: number;
  readonly interestCompounds: number;
  readonly avgLoad: number;
};

export type RunCardRow = {
  readonly id: string;
  readonly name: string;
  /** Times it was on a reward screen or a shop shelf. */
  readonly offered: number;
  readonly picked: number;
  /** Picks per offer. The number that says whether a card is worth owning. */
  readonly pickRate: number;
  readonly pickAppearances: number;
  readonly pickWins: number;
  readonly played: number;
  readonly playAppearances: number;
  readonly playWins: number;
  readonly winRate: number;
};

export type RunDepthRow = {
  /** 1-based node depth, so it reads like the map. */
  readonly depth: number;
  readonly reached: number;
  /** Average HP on arrival, of the runs that got here. */
  readonly avgHp: number;
  readonly minHp: number;
  /** Runs that got this far and no further. */
  readonly endedHere: number;
};

export type RunReport = {
  readonly runs: number;
  readonly seed: number;
  readonly wins: number;
  readonly losses: number;
  readonly timeouts: number;
  readonly overallWinRate: number;
  readonly avgDepth: number;
  readonly avgCompletionDepth: number;
  readonly avgLossDepth: number;
  readonly avgCombatBeats: number;
  readonly avgDamage: number;
  readonly avgFinalHp: number;
  readonly avgDeckLoad: number;
  readonly avgDeckSize: number;
  readonly interestEvents: number;
  readonly interestCompounds: number;
  readonly avgInterestCompounds: number;
  readonly maxInterestLoad: number;
  /** Runs where Interest generated at least one Compound. The "does it bite" number. */
  readonly runsWithCompounds: number;
  readonly combats: number;
  /** Combats entered with a deck heavy enough for Interest to bill anything at all. */
  readonly billableCombats: number;
  readonly avgCombatLoad: number;
  readonly depths: readonly RunDepthRow[];
  readonly encounters: readonly RunEncounterRow[];
  readonly cards: readonly RunCardRow[];
};

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function buildReport(trials: readonly TrialResult[], seed: number): Report {
  const byEncounter = new Map<string, TrialResult[]>();
  for (const trial of trials) {
    byEncounter.set(trial.encounterId, [...(byEncounter.get(trial.encounterId) ?? []), trial]);
  }

  const encounters: EncounterRow[] = [];
  for (const encounter of ENCOUNTERS) {
    const rows = byEncounter.get(encounter.id) ?? [];
    if (rows.length === 0) continue;
    encounters.push({
      id: encounter.id,
      name: encounter.name,
      tier: encounter.tier,
      trials: rows.length,
      winRate: rows.filter((r) => r.outcome === 'won').length / rows.length,
      avgBeats: mean(rows.map((r) => r.beats)),
      avgLaps: mean(rows.map((r) => r.laps)),
      avgDamage: mean(rows.map((r) => r.damageTaken)),
      avgHpLeft: mean(rows.filter((r) => r.outcome === 'won').map((r) => r.hpLeft)),
      timeouts: rows.filter((r) => r.outcome === 'timeout').length,
    });
  }

  // Card stats. `inDecks` matters as much as `played`: a card with a low play rate that
  // was only ever in four decks is noise, and one that was in four hundred is a problem.
  const inDecks = new Map<string, number>();
  const drawn = new Map<string, number>();
  const played = new Map<string, number>();
  const playedWins = new Map<string, number>();
  const playedTotal = new Map<string, number>();

  for (const trial of trials) {
    for (const id of new Set(trial.deck)) inDecks.set(id, (inDecks.get(id) ?? 0) + 1);
    for (const [id, n] of Object.entries(trial.drawn)) drawn.set(id, (drawn.get(id) ?? 0) + n);
    for (const [id, n] of Object.entries(trial.played)) {
      played.set(id, (played.get(id) ?? 0) + n);
      playedTotal.set(id, (playedTotal.get(id) ?? 0) + 1);
      if (trial.outcome === 'won') playedWins.set(id, (playedWins.get(id) ?? 0) + 1);
    }
  }

  const cards: CardRow[] = Object.values(CARDS)
    .map((card) => {
      const drawnCount = drawn.get(card.id) ?? 0;
      const playedCount = played.get(card.id) ?? 0;
      const appearances = playedTotal.get(card.id) ?? 0;
      return {
        id: card.id,
        name: card.name,
        weight: card.weight,
        inDecks: inDecks.get(card.id) ?? 0,
        drawn: drawnCount,
        played: playedCount,
        playRate: drawnCount === 0 ? 0 : playedCount / drawnCount,
        winRate: appearances === 0 ? 0 : (playedWins.get(card.id) ?? 0) / appearances,
      };
    })
    .sort((a, b) => b.playRate - a.playRate || a.id.localeCompare(b.id));

  return {
    runs: trials.length,
    seed,
    encounters,
    cards,
    overallWinRate: trials.filter((t) => t.outcome === 'won').length / Math.max(1, trials.length),
    timeouts: trials.filter((t) => t.outcome === 'timeout').length,
  };
}

function averageRun(values: readonly RunResult[]): number {
  return values.length === 0 ? 0 : values.reduce((total, run) => total + run.depth, 0) / values.length;
}

function runName(id: string): string {
  return ENCOUNTERS.find((encounter) => encounter.id === id)?.name ?? id;
}

function cardName(id: string): string {
  const base = baseIdOf(id);
  return CARDS[base]?.name ?? id;
}

/** Aggregate one row per encounter from complete-run combat observations. */
export function buildRunReport(runs: readonly RunResult[], seed: number): RunReport {
  const wins = runs.filter((run) => run.outcome === 'won').length;
  const losses = runs.filter((run) => run.outcome === 'lost').length;
  const timeouts = runs.filter((run) => run.outcome === 'timeout').length;
  const completed = runs.filter((run) => run.outcome === 'won');
  const lost = runs.filter((run) => run.outcome === 'lost');
  const combats = runs.flatMap((run) => run.combats);
  const encounterIds = [...new Set(combats.map((combat) => combat.encounterId))];
  const encounters: RunEncounterRow[] = encounterIds.map((id) => {
    const rows = combats.filter((combat) => combat.encounterId === id);
    const rowMean = (values: readonly number[]) => mean(values);
    const won = rows.filter((combat) => combat.outcome === 'won').length;
    return {
      id,
      name: runName(id),
      trials: rows.length,
      wins: won,
      deaths: rows.filter((combat) => combat.outcome === 'lost').length,
      timeouts: rows.filter((combat) => combat.outcome === 'timeout').length,
      winRate: won / Math.max(1, rows.length),
      avgBeats: rowMean(rows.map((combat) => combat.beats)),
      avgDamage: rowMean(rows.map((combat) => combat.damageTaken)),
      avgHpAfter: rowMean(rows.map((combat) => combat.hpAfter)),
      interestEvents: rows.reduce((total, combat) => total + combat.interestEvents, 0),
      interestCompounds: rows.reduce((total, combat) => total + combat.interestCompounds, 0),
      avgLoad: rowMean(rows.map((combat) => combat.deckLoad)),
    };
  });

  // The HP curve by node depth. Where a run's HP goes is the balance question the per-fight
  // rows cannot answer, because half the HP economy is the Wake and the Hollows between them.
  const deepest = runs.reduce((max, run) => Math.max(max, run.hpAtDepth.length), 0);
  const depths: RunDepthRow[] = Array.from({ length: deepest }, (_, index) => {
    const arrivals = runs.flatMap((run) => {
      const hp = run.hpAtDepth[index];
      return hp === undefined ? [] : [hp];
    });
    return {
      depth: index + 1,
      reached: arrivals.length,
      avgHp: mean(arrivals),
      minHp: arrivals.reduce((min, hp) => Math.min(min, hp), Number.POSITIVE_INFINITY),
      endedHere: runs.filter((run) => run.hpAtDepth.length === index + 1).length,
    };
  });

  const ids = new Set<string>();
  for (const run of runs) {
    for (const id of Object.keys(run.offered)) ids.add(id);
    for (const id of Object.keys(run.picked)) ids.add(id);
    for (const id of Object.keys(run.played)) ids.add(id);
  }
  for (const card of Object.values(CARDS)) ids.add(card.id);
  const cards: RunCardRow[] = [...ids]
    .map((id) => {
      const offered = runs.reduce((total, run) => total + (run.offered[id] ?? 0), 0);
      const picked = runs.reduce((total, run) => total + (run.picked[id] ?? 0), 0);
      const pickAppearances = runs.reduce((total, run) => total + (run.pickAppearances[id] ?? 0), 0);
      const pickWins = runs.reduce((total, run) => total + (run.pickWins[id] ?? 0), 0);
      const played = runs.reduce((total, run) => total + (run.played[id] ?? 0), 0);
      const playAppearances = runs.reduce((total, run) => total + (run.playAppearances[id] ?? 0), 0);
      const playWins = runs.reduce((total, run) => total + (run.playWins[id] ?? 0), 0);
      return {
        id,
        name: cardName(id),
        offered,
        picked,
        pickRate: offered === 0 ? 0 : picked / offered,
        pickAppearances,
        pickWins,
        played,
        playAppearances,
        playWins,
        // Explicitly denominated by combat appearances, not raw card plays.
        winRate: playAppearances === 0 ? 0 : playWins / playAppearances,
      };
    })
    .sort((a, b) => b.played - a.played || b.picked - a.picked || a.id.localeCompare(b.id));

  return {
    runs: runs.length,
    seed,
    wins,
    losses,
    timeouts,
    overallWinRate: wins / Math.max(1, runs.length),
    avgDepth: averageRun(runs),
    avgCompletionDepth: averageRun(completed),
    avgLossDepth: averageRun(lost),
    avgCombatBeats: mean(runs.map((run) => run.totalCombatBeats)),
    avgDamage: mean(runs.map((run) => run.totalDamageTaken)),
    avgFinalHp: mean(runs.map((run) => run.hpCurve[run.hpCurve.length - 1] ?? 0)),
    avgDeckLoad: mean(runs.map((run) => run.finalDeckLoad)),
    avgDeckSize: mean(runs.map((run) => run.finalDeckSize)),
    interestEvents: runs.reduce((total, run) => total + run.interestEvents, 0),
    interestCompounds: runs.reduce((total, run) => total + run.interestCompounds, 0),
    avgInterestCompounds: mean(runs.map((run) => run.interestCompounds)),
    maxInterestLoad: combats.reduce((max, combat) => Math.max(max, combat.deckLoad), 0),
    runsWithCompounds: runs.filter((run) => run.interestCompounds > 0).length,
    combats: combats.length,
    // Read off the Interest table rather than a literal, so moving a threshold moves this.
    billableCombats: combats.filter((combat) => compoundsPerLap(combat.deckLoad) > 0).length,
    avgCombatLoad: mean(combats.map((combat) => combat.deckLoad)),
    depths,
    encounters,
    cards,
  };
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const num = (n: number, places = 1) => n.toFixed(places);

function rule(width: number): string {
  return `  ${'-'.repeat(width)}`;
}

export function formatReport(report: Report): string {
  const out: string[] = [];

  out.push(`sim  ${String(report.runs)} combats, seed ${String(report.seed)}`);
  out.push('');
  out.push(
    `  ${'fight'.padEnd(24)}${'tier'.padEnd(11)}${'n'.padStart(6)}${'win'.padStart(8)}${'beats'.padStart(8)}${'laps'.padStart(7)}${'dmg taken'.padStart(11)}${'hp left'.padStart(9)}`,
  );
  out.push(rule(84));
  for (const row of report.encounters) {
    out.push(
      `  ${row.name.padEnd(24)}${row.tier.padEnd(11)}${String(row.trials).padStart(6)}${pct(row.winRate).padStart(8)}${num(row.avgBeats, 0).padStart(8)}${num(row.avgLaps).padStart(7)}${num(row.avgDamage, 0).padStart(11)}${num(row.avgHpLeft, 0).padStart(9)}`,
    );
  }
  out.push(rule(84));
  out.push(`  overall win rate ${pct(report.overallWinRate)}`);
  if (report.timeouts > 0) {
    // Named, not just counted. A timeout is a finding about that fight, and burying it in a
    // total is how "the policy loops forever against the Wraith" hides inside a win rate.
    const where = report.encounters
      .filter((e) => e.timeouts > 0)
      .map((e) => `${e.name} x${String(e.timeouts)}`)
      .join(', ');
    out.push(`  ${String(report.timeouts)} combat(s) hit the action cap, counted as neither: ${where}`);
  }

  out.push('');
  out.push(`  ${'card'.padEnd(26)}${'W'.padStart(3)}${'decks'.padStart(8)}${'drawn'.padStart(8)}${'played'.padStart(8)}${'play%'.padStart(8)}${'win%'.padStart(8)}`);
  out.push(rule(69));
  for (const row of report.cards) {
    out.push(
      `  ${row.name.padEnd(26)}${String(row.weight).padStart(3)}${String(row.inDecks).padStart(8)}${String(row.drawn).padStart(8)}${String(row.played).padStart(8)}${pct(row.playRate).padStart(8)}${pct(row.winRate).padStart(8)}`,
    );
  }
  out.push(rule(69));

  return out.join('\n');
}

/** Human-readable whole-run report. Keep columns numeric so it can be diffed in CI. */
export function formatRunReport(report: RunReport): string {
  const out: string[] = [];
  out.push(`sim  ${String(report.runs)} runs, seed ${String(report.seed)}`);
  out.push('');
  out.push(`  overall run win rate ${pct(report.overallWinRate)}  won ${report.wins}  lost ${report.losses}  timeouts ${report.timeouts}`);
  out.push(`  depth avg ${num(report.avgDepth, 1)}  completion ${num(report.avgCompletionDepth, 1)}  loss ${num(report.avgLossDepth, 1)}`);
  out.push(`  combat beats avg ${num(report.avgCombatBeats, 1)}  damage taken avg ${num(report.avgDamage, 1)}  final HP avg ${num(report.avgFinalHp, 1)}`);
  out.push(`  final deck Load avg ${num(report.avgDeckLoad, 1)}  size avg ${num(report.avgDeckSize, 1)}`);
  out.push(`  Interest events ${report.interestEvents}  Compounds ${report.interestCompounds}  avg/run ${num(report.avgInterestCompounds, 2)}  peak Load ${num(report.maxInterestLoad, 1)}`);
  out.push(
    `  Interest bit ${pct(report.runsWithCompounds / Math.max(1, report.runs))} of runs  billable fights ${pct(report.billableCombats / Math.max(1, report.combats))}  avg Load at fight start ${num(report.avgCombatLoad, 1)}`,
  );
  out.push('');
  out.push(`  ${'depth'.padStart(7)}${'reached'.padStart(9)}${'hp on arrival'.padStart(15)}${'worst'.padStart(7)}${'ended here'.padStart(12)}`);
  out.push(rule(50));
  for (const row of report.depths) {
    out.push(
      `  ${String(row.depth).padStart(7)}${String(row.reached).padStart(9)}${num(row.avgHp, 1).padStart(15)}${String(row.minHp).padStart(7)}${String(row.endedHere).padStart(12)}`,
    );
  }
  out.push(rule(50));
  out.push('');
  out.push(`  ${'encounter'.padEnd(24)}${'n'.padStart(5)}${'win'.padStart(7)}${'deaths'.padStart(8)}${'timeout'.padStart(9)}${'beats'.padStart(8)}${'dmg'.padStart(8)}${'hp'.padStart(8)}${'Interest'.padStart(10)}`);
  out.push(rule(90));
  for (const row of report.encounters) {
    out.push(`  ${row.name.padEnd(24)}${String(row.trials).padStart(5)}${pct(row.winRate).padStart(7)}${String(row.deaths).padStart(8)}${String(row.timeouts).padStart(9)}${num(row.avgBeats, 0).padStart(8)}${num(row.avgDamage, 0).padStart(8)}${num(row.avgHpAfter, 0).padStart(8)}${String(row.interestCompounds).padStart(10)}`);
  }
  out.push(rule(90));
  out.push('');
  out.push(
    `  ${'card'.padEnd(28)}${'offered'.padStart(9)}${'picked'.padStart(8)}${'pick%'.padStart(8)}${'plays'.padStart(8)}${'play fights'.padStart(12)}${'play wins'.padStart(11)}${'win% fights'.padStart(12)}`,
  );
  out.push(rule(96));
  for (const row of report.cards) {
    // Keep the all-card table useful without making an empty 45-row report noisy at large N.
    if (row.offered === 0 && row.picked === 0 && row.played === 0) continue;
    out.push(
      `  ${row.name.padEnd(28)}${String(row.offered).padStart(9)}${String(row.picked).padStart(8)}${pct(row.pickRate).padStart(8)}${String(row.played).padStart(8)}${String(row.playAppearances).padStart(12)}${String(row.playWins).padStart(11)}${pct(row.winRate).padStart(12)}`,
    );
  }
  out.push(rule(96));
  return out.join('\n');
}

/**
 * The run-level outliers, which is the list phase 6 actually acts on.
 *
 * Deliberately separate from the table above: the table is every number, this is the six
 * questions worth asking of it. A card offered forty times and never taken is a card nobody
 * would miss; an enemy that has never killed anybody is a node that may as well not be there.
 */
export function formatRunOutliers(report: RunReport): string {
  const out: string[] = [];
  // Only cards the draft actually put in front of somebody. A zero pick count on a card that
  // was never offered is a map-generation finding, not a card finding, and it is listed apart.
  const seen = report.cards.filter((card) => card.offered >= 10);
  const never = seen.filter((card) => card.picked === 0);
  const rarely = seen.filter((card) => card.picked > 0 && card.pickRate < 0.15);
  const always = seen.filter((card) => card.pickRate > 0.85);
  const owned = report.cards.filter((card) => card.picked >= 10 && card.played === 0);
  // Compounds are never drafted by design, so their zero belongs to the design, not the table.
  const unoffered = report.cards.filter(
    (card) => card.offered === 0 && card.picked === 0 && card.played === 0 && CARDS[card.id]?.rarity !== 'compound',
  );

  const names = (rows: readonly RunCardRow[]) => (rows.length === 0 ? 'none' : rows.map((row) => row.name).join(', '));

  out.push('outliers');
  out.push('');
  out.push(`  never picked (offered 10+):       ${names(never)}`);
  out.push(`  picked under 15% of offers:       ${names(rarely)}`);
  out.push(`  picked over 85% of offers:        ${names(always)}`);
  out.push(`  owned but never played:           ${names(owned)}`);
  if (unoffered.length > 0) out.push(`  never offered at all:             ${names(unoffered)}`);

  const harmless = report.encounters.filter((row) => row.deaths === 0);
  const lethal = report.encounters.filter((row) => row.winRate <= 0.5);
  out.push('');
  out.push(`  kills nobody:                     ${harmless.length === 0 ? 'none' : harmless.map((e) => e.name).join(', ')}`);
  out.push(
    `  wins half the time or worse:      ${lethal.length === 0 ? 'none' : lethal.map((e) => `${e.name} ${pct(e.winRate)}`).join(', ')}`,
  );

  const bite = report.runsWithCompounds / Math.max(1, report.runs);
  out.push('');
  out.push(
    `  Interest:                         ${bite === 0 ? 'never bites' : `bites in ${pct(bite)} of runs`}, ${num(report.avgInterestCompounds, 2)} Compounds per run, ${pct(report.billableCombats / Math.max(1, report.combats))} of fights entered above the first threshold`,
  );

  return out.join('\n');
}

/**
 * The outliers, called out rather than left in a 45-row table.
 *
 * Phase 6 is where these get acted on. Printing them now means phase 6 is an afternoon of
 * reading rather than six weeks of guessing, which is the entire reason the harness exists.
 */
export function formatOutliers(report: Report): string {
  const out: string[] = [];
  const seen = report.cards.filter((c) => c.drawn >= 20);

  const never = seen.filter((c) => c.played === 0);
  const rarely = seen.filter((c) => c.played > 0 && c.playRate < 0.1);
  const always = seen.filter((c) => c.playRate > 0.95);

  out.push('outliers');
  out.push('');
  out.push(`  never played (drawn 20+ times):  ${never.length === 0 ? 'none' : never.map((c) => c.name).join(', ')}`);
  out.push(`  played under 10% of draws:       ${rarely.length === 0 ? 'none' : rarely.map((c) => c.name).join(', ')}`);
  out.push(`  played over 95% of draws:        ${always.length === 0 ? 'none' : always.map((c) => c.name).join(', ')}`);

  const harmless = report.encounters.filter((e) => e.winRate >= 0.99);
  const lethal = report.encounters.filter((e) => e.winRate <= 0.5);
  out.push('');
  out.push(`  kills nobody:                    ${harmless.length === 0 ? 'none' : harmless.map((e) => e.name).join(', ')}`);
  out.push(`  wins half the time or better:    ${lethal.length === 0 ? 'none' : lethal.map((e) => e.name).join(', ')}`);

  return out.join('\n');
}

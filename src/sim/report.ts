/**
 * The tables.
 *
 * Balance decisions come from these, not from vibes, so the format matters: one row per
 * thing you might change, and every column a number you could act on. No prose, no
 * verdicts. The sim reports, a person decides.
 */
import { CARDS } from '../content/cards';
import { ENCOUNTERS } from '../content/enemies';
import type { EnemyTier } from '../content/types';
import type { TrialResult } from './trial';

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

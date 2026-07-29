/**
 * Every user-facing string in the game, in one place, from day one.
 *
 * Not an i18n library, just the single file that makes one possible later. No bare
 * text in components. Ever.
 *
 * Voice rules from §13 of the design doc apply here more than anywhere: bureaucratic not
 * gothic, short, second person, no fantasy nouns. The words this game owns are salt,
 * chalk, ledger, owed, interest, tally, seam, escrow, arrears.
 */
export const strings = {
  brand: {
    title: 'ROUGE',
    tagline: 'You are in the red.',
  },
  pipeline: {
    heading: 'Art pipeline',
    blurb:
      'Placeholders are procedural and keyed to content ID. Drop a PNG at the path under each one, run the manifest, and it appears here with no code change.',
    manifestEmpty: 'Manifest loaded. No art files yet, so everything below is a placeholder.',
    manifestCount: (files: number, kinds: number) =>
      `Manifest loaded: ${String(files)} file${files === 1 ? '' : 's'} across ${String(kinds)} kind${kinds === 1 ? '' : 's'}.`,
    manifestMissing: 'No manifest found. Run `npm run art:manifest`.',
  },
  select: {
    heading: 'The Chalk Wards',
    blurb: 'Phase 3 has combat and nothing above it. Pick a body. The map arrives in phase 4.',
    seed: 'Seed',
    reroll: 'New seed',
    tier: { normal: 'Debtor', collector: 'Collector', boss: 'Stratum Boss' },
    enter: 'Descend',
  },
  combat: {
    tally: 'The Tally',
    beat: 'Beat',
    lap: (n: number) => `Lap ${String(n)}`,
    you: 'You',
    hand: 'Hand',
    log: 'The record',
    empty: 'Nothing in hand.',
    waiting: 'Resolving.',
    yourMove: 'Your move.',
    weight: 'Weight',
    guard: 'Guard',
    strain: 'Strain',
    salt: 'Salt',
    hp: 'HP',
    bleed: 'Bleed',
    draw: 'Draw',
    discard: 'Discard',
    spent: 'Spent',
    marker: (name: string) => `${name}'s marker`,
    guardThrough: (n: number, beat: number) => `Guard ${String(n)}, gone after beat ${String(beat)}`,
    unplayable: 'Unplayable. It just sits there.',
    reink: 'Re-inking',
    phase: (n: number) => `Phase ${String(n)}`,
    dead: 'Settled',
  },
  preview: {
    heading: 'If you play this',
    cost: (weight: number) => `Weight ${String(weight)}`,
    lands: (beat: number) => `lands on beat ${String(beat)}`,
    handsOver: (beats: number) => `${String(beats)} beat${beats === 1 ? '' : 's'} to them`,
    actions: (n: number) => `${String(n)} enemy action${n === 1 ? '' : 's'} first`,
    noActions: 'nothing acts before you do',
    takes: (n: number) => `you take ${String(n)}`,
    takesNothing: 'you take nothing',
    guardLeft: (n: number) => `Guard ${String(n)} left`,
    lapCrossed: 'Interest falls due on the way past',
    kills: (names: readonly string[]) => `kills ${names.join(' and ')}`,
    fatal: 'This kills you.',
    wins: 'This ends it.',
    target: 'Pick a body',
  },
  outcome: {
    won: 'Discharged',
    lost: 'In the red',
    wonBlurb: 'The debt is settled. Nothing is owed on it now.',
    lostBlurb: 'It was carried further than it could be carried.',
    beats: (n: number) => `${String(n)} beats`,
    cards: (n: number) => `${String(n)} cards played`,
    again: 'Again',
    back: 'Back to the Wards',
  },
  keys: {
    heading: 'Keys',
    close: 'Close',
    help: '? for keys',
    fastForward: 'Fast-forward',
    fastForwardHint: 'hold F',
    lines: [
      ['← →', 'move along the hand'],
      ['1 … 0', 'jump to a card'],
      ['Enter / ↑', 'play it'],
      ['← →', 'pick a body, while targeting'],
      ['Esc', 'back out'],
      ['W', 'wait a beat, draw a card'],
      ['F', 'hold to fast-forward'],
      ['R', 'again, once the fight is decided'],
      ['?', 'this list'],
    ],
  },
} as const;

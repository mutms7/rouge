/**
 * Test scaffolding: the minimum content the Tally needs to be exercised.
 *
 * These are not the real cards. They are one card per effect atom with round numbers,
 * so a failing test points at the engine rather than at balance. Phase 2 encodes the
 * actual 45 cards and 11 enemies in `content/`, and the engine tests keep using these,
 * because a keyword test should not break when a card gets renumbered.
 */
import { createCombat, reduce } from './combat';
import type { CardDef, CombatEvent, CombatState, Combatant, EnemySetup, IntentDef } from './types';

function card(def: CardDef): CardDef {
  return def;
}

export const DUMMY_CARDS: Readonly<Record<string, CardDef>> = {
  /** Weight 1, plain damage. The control. */
  jab: card({
    id: 'jab',
    name: 'Jab',
    weight: 1,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage', n: 5 }],
  }),
  /** Weight 5, the slow nuke the design doc keeps using as its example. */
  heavy: card({
    id: 'heavy',
    name: 'Heavy',
    weight: 5,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage', n: 12 }],
  }),
  brace: card({
    id: 'brace',
    name: 'Brace',
    weight: 1,
    type: 'skill',
    targeting: 'self',
    effects: [{ k: 'guard', n: 5 }],
  }),
  /** Enough Guard to watch it melt over several beats. */
  wall: card({
    id: 'wall',
    name: 'Wall',
    weight: 1,
    type: 'skill',
    targeting: 'self',
    effects: [{ k: 'guard', n: 12 }],
  }),
  /** Guard that holds for three beats before it starts decaying. */
  chalk: card({
    id: 'chalk',
    name: 'Chalk Line',
    weight: 1,
    type: 'skill',
    targeting: 'self',
    effects: [{ k: 'guard', n: 4, frozenFor: 3 }],
  }),
  /** Weight 0. Free in beats, paid for in Strain. */
  free: card({
    id: 'free',
    name: 'Free',
    weight: 0,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'strain', n: 3 }],
  }),
  shove: card({
    id: 'shove',
    name: 'Shove',
    weight: 1,
    type: 'skill',
    targeting: 'opponent',
    effects: [{ k: 'slip', n: 3 }],
  }),
  sweep: card({
    id: 'sweep',
    name: 'Sweep',
    weight: 2,
    type: 'skill',
    targeting: 'all_opponents',
    effects: [{ k: 'slip', n: 2 }],
  }),
  /** Weight 2 and Haste 4, so playing it should leave you two beats better off. */
  dart: card({
    id: 'dart',
    name: 'Dart',
    weight: 2,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'haste', n: 4 }],
  }),
  nick: card({
    id: 'nick',
    name: 'Nick',
    weight: 1,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'bleed', n: 4 }],
  }),
  /** Say it now, it lands four beats later, if nothing catches you first. */
  whisper: card({
    id: 'whisper',
    name: 'Whisper',
    weight: 1,
    type: 'skill',
    targeting: 'opponent',
    effects: [{ k: 'perjury', in: 4, effects: [{ k: 'damage', n: 8 }] }],
  }),
  echo_jab: card({
    id: 'echo_jab',
    name: 'Echo Jab',
    weight: 2,
    type: 'attack',
    targeting: 'opponent',
    effects: [{ k: 'damage', n: 4 }, { k: 'echo' }],
  }),
  /** Draws first, echoes second, so a tight hand cap can eat the copy. */
  echo_study: card({
    id: 'echo_study',
    name: 'Echo Study',
    weight: 2,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'draw', n: 2 }, { k: 'echo' }],
  }),
  burn: card({
    id: 'burn',
    name: 'Burn',
    weight: 1,
    type: 'skill',
    targeting: 'self',
    effects: [{ k: 'guard', n: 3 }, { k: 'exhaust' }],
  }),
  study: card({
    id: 'study',
    name: 'Study',
    weight: 1,
    type: 'skill',
    targeting: 'none',
    effects: [{ k: 'draw', n: 2 }],
  }),
};

/** An enemy that keeps a cadence and does nothing, for isolating track arithmetic. */
export function tickEnemy(cadence: number, overrides: Partial<EnemySetup> = {}): EnemySetup {
  const intents: IntentDef[] = [{ id: 'tick', weight: cadence, targeting: 'none', effects: [] }];
  return { id: 'tick', name: 'Tick', hp: 500, intents, ...overrides };
}

/** An enemy that hits on a cadence. The tutorial body, roughly. */
export function biterEnemy(cadence: number, damage: number, overrides: Partial<EnemySetup> = {}): EnemySetup {
  const intents: IntentDef[] = [
    { id: 'bite', weight: cadence, targeting: 'opponent', effects: [{ k: 'damage', n: damage }] },
  ];
  return { id: 'biter', name: 'Biter', hp: 500, intents, ...overrides };
}

/** An enemy that stacks Guard on a rhythm, for proving Bleed goes through it. */
export function turtleEnemy(cadence: number, guard: number, overrides: Partial<EnemySetup> = {}): EnemySetup {
  const intents: IntentDef[] = [{ id: 'shell', weight: cadence, targeting: 'self', effects: [{ k: 'guard', n: guard }] }];
  return { id: 'turtle', name: 'Turtle', hp: 500, intents, ...overrides };
}

export type DummyOptions = {
  readonly seed?: number;
  readonly deck: readonly string[];
  readonly enemies?: readonly EnemySetup[];
  readonly playerHp?: number;
  readonly handCap?: number;
  readonly startingHand?: number;
};

export function dummyCombat(options: DummyOptions): CombatState {
  return createCombat({
    seed: options.seed ?? 1,
    library: DUMMY_CARDS,
    player: { hp: options.playerHp ?? 68 },
    enemies: options.enemies ?? [tickEnemy(3)],
    deck: options.deck,
    handCap: options.handCap ?? 20,
    startingHand: options.startingHand ?? options.deck.length,
  });
}

/** The uid of the first copy of a card sitting in hand. Throws, so tests fail loudly. */
export function handUid(state: CombatState, cardId: string): string {
  const found = state.deck.hand.find((c) => c.cardId === cardId);
  if (!found) throw new Error(`no ${cardId} in hand: ${state.deck.hand.map((c) => c.cardId).join(', ')}`);
  return found.uid;
}

/** Repeat a card id, for decks that only care about one card. */
export function pileOf(cardId: string, n: number): string[] {
  return Array.from({ length: n }, () => cardId);
}

/** Play the first copy of a card in hand. */
export function play(state: CombatState, cardId: string, targetId?: string): CombatState {
  return reduce(state, { k: 'play_card', uid: handUid(state, cardId), targetId });
}

export function wait(state: CombatState, times = 1): CombatState {
  let next = state;
  for (let i = 0; i < times; i += 1) next = reduce(next, { k: 'wait' });
  return next;
}

export function combatantOf(state: CombatState, id: string): Combatant {
  const found = state.combatants.find((c) => c.id === id);
  if (!found) throw new Error(`no combatant ${id}`);
  return found;
}

export function playerOf(state: CombatState): Combatant {
  const found = state.combatants.find((c) => c.team === 'player');
  if (!found) throw new Error('no player in this combat');
  return found;
}

/** Every log entry of one kind, narrowed. */
export function eventsOf<K extends CombatEvent['k']>(
  state: CombatState,
  kind: K,
): { beat: number; event: Extract<CombatEvent, { k: K }> }[] {
  const out: { beat: number; event: Extract<CombatEvent, { k: K }> }[] = [];
  for (const entry of state.log) {
    if (entry.event.k === kind) out.push({ beat: entry.beat, event: entry.event as Extract<CombatEvent, { k: K }> });
  }
  return out;
}

/** Everything a combatant did, as `{ beat, what }`. The spine of the ordering tests. */
export function actsBy(state: CombatState, who: string): { beat: number; what: string; weight: number }[] {
  return eventsOf(state, 'act')
    .filter((entry) => entry.event.who === who)
    .map((entry) => ({ beat: entry.beat, what: entry.event.what, weight: entry.event.weight }));
}

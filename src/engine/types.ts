/**
 * The shapes. No logic in here.
 *
 * The engine defines these and content fills them in, never the other way round:
 * phase 2 writes `satisfies CardDef` against this file. So `CardDef` is deliberately
 * thin, holding only what the Tally actually reads. Suit, rules text, the Mark, and
 * the rest of the card face arrive with the real content.
 */
import type { Rng, RngStream } from './rng';

export type Team = 'player' | 'enemy';

export type CardType = 'attack' | 'skill';

export type Outcome = 'ongoing' | 'won' | 'lost';

/**
 * Who an effect lands on.
 *
 * `opponent` means one combatant on the other team, which for an enemy intent is the
 * player. Cards that hit the whole board use `all_opponents`. Guard, Haste, Strain and
 * draw always apply to whoever acted, regardless of what the card is pointed at.
 */
export type Targeting = 'none' | 'self' | 'opponent' | 'all_opponents';

/**
 * Effect atoms. Cards are lists of these, never functions.
 *
 * Phase 1 implements the keywords in §3.6 plus the three atoms combat cannot run
 * without. Phase 2 designs the rest of the vocabulary. The rule from the brief holds:
 * when a card wants something new, it gets a new atom, not a callback.
 */
export type Effect =
  | { readonly k: 'damage'; readonly n: number }
  /** `frozenFor` holds the decay off for N beats, which is what Chalk Line buys. */
  | { readonly k: 'guard'; readonly n: number; readonly frozenFor?: number }
  | { readonly k: 'draw'; readonly n: number }
  | { readonly k: 'slip'; readonly n: number }
  | { readonly k: 'haste'; readonly n: number }
  | { readonly k: 'bleed'; readonly n: number }
  | { readonly k: 'strain'; readonly n: number }
  | { readonly k: 'echo' }
  | { readonly k: 'exhaust' }
  /** Say it now, it becomes true in `in` beats, unless something catches you. */
  | { readonly k: 'perjury'; readonly in: number; readonly effects: readonly Effect[] };

export type EffectKind = Effect['k'];

export type CardDef = {
  readonly id: string;
  readonly name: string;
  /** Beats your marker advances when you play it. The entire cost system. §3.2. */
  readonly weight: number;
  readonly type: CardType;
  readonly targeting: Targeting;
  readonly effects: readonly Effect[];
};

/**
 * What an enemy does, pinned to a beat rather than to a turn. §3.4.
 *
 * An enemy cycles its intent list forever, so the beat every future action fires on is
 * arithmetic, which is what lets the UI show the whole visible window instead of just
 * "the next thing".
 */
export type IntentDef = {
  readonly id: string;
  readonly weight: number;
  readonly targeting: Targeting;
  readonly effects: readonly Effect[];
};

/** A card in a combat, as opposed to its definition. Echo copies carry the +1 here. */
export type CardInstance = {
  readonly uid: string;
  readonly cardId: string;
  readonly weightDelta: number;
};

export type DeckZones = {
  readonly draw: readonly CardInstance[];
  readonly hand: readonly CardInstance[];
  readonly discard: readonly CardInstance[];
  /** Out for the rest of this combat, back in the deck after it. §3.6. */
  readonly exhausted: readonly CardInstance[];
};

export type Combatant = {
  readonly id: string;
  readonly name: string;
  readonly team: Team;
  readonly hp: number;
  readonly maxHp: number;
  /** Block. Decays 1 per beat elapsed, not per turn. §3.3. */
  readonly guard: number;
  /** Absolute beat until which Guard is held off decay. */
  readonly guardFrozenUntil: number;
  /** Absolute beat, monotonically forward. `position % 24` is where it sits on the ring. */
  readonly position: number;
  readonly bleed: number;
  readonly intentIndex: number;
  /** Empty for the player, who is driven by actions instead. */
  readonly intents: readonly IntentDef[];
};

/** A sworn thing waiting to become true. */
export type PendingPerjury = {
  readonly id: string;
  readonly ownerId: string;
  /** Absolute beat it resolves on. */
  readonly at: number;
  readonly targetId: string | null;
  readonly sourceCardId: string;
  readonly effects: readonly Effect[];
};

export type CombatEvent =
  | { readonly k: 'combat_start' }
  | { readonly k: 'combat_end'; readonly outcome: Outcome }
  | { readonly k: 'lap_end'; readonly lap: number }
  | { readonly k: 'act'; readonly who: string; readonly what: string; readonly weight: number }
  | {
      readonly k: 'damage';
      readonly who: string;
      readonly amount: number;
      readonly blocked: number;
      readonly sourceId: string | null;
    }
  | { readonly k: 'guard'; readonly who: string; readonly amount: number; readonly total: number }
  | { readonly k: 'slip'; readonly who: string; readonly n: number }
  | { readonly k: 'haste'; readonly who: string; readonly n: number }
  | { readonly k: 'bleed'; readonly who: string; readonly n: number }
  | { readonly k: 'bleed_tick'; readonly who: string; readonly amount: number }
  | { readonly k: 'strain'; readonly total: number }
  | { readonly k: 'strain_break'; readonly damage: number }
  | { readonly k: 'draw'; readonly uid: string; readonly cardId: string }
  | { readonly k: 'reshuffle'; readonly count: number }
  | { readonly k: 'echo'; readonly uid: string; readonly cardId: string }
  | { readonly k: 'exhaust'; readonly uid: string; readonly cardId: string }
  | { readonly k: 'perjury_sworn'; readonly cardId: string; readonly at: number }
  | { readonly k: 'perjury_resolved'; readonly cardId: string }
  | { readonly k: 'perjury_fizzled'; readonly cardId: string }
  | { readonly k: 'death'; readonly who: string };

/** The combat log. Append-only. Phase 3's animation layer diffs off this. */
export type LogEntry = {
  readonly beat: number;
  readonly event: CombatEvent;
};

/**
 * The run log, per the brief.
 *
 * Nothing reads it in the demo. It exists because retrofitting it once there are three
 * acts is miserable, and because Act 4's Compound is built out of it. Phase 1 only has
 * cause to write `card_exhausted`; the other three shapes are here so phase 4 has
 * somewhere to put them.
 */
export type RunLogEntry =
  | { readonly k: 'card_exhausted'; readonly cardId: string; readonly beat: number }
  | { readonly k: 'card_removed'; readonly cardId: string }
  | { readonly k: 'card_settled'; readonly cardId: string; readonly markId: string }
  | { readonly k: 'option_refused'; readonly eventId: string; readonly optionId: string };

export type CombatState = {
  readonly seed: number;
  /** The clock. Never goes backwards. */
  readonly beat: number;
  /** Index 0 is the player. Ties on the track resolve in their favour. */
  readonly combatants: readonly Combatant[];
  readonly deck: DeckZones;
  readonly strain: number;
  readonly handCap: number;
  readonly pending: readonly PendingPerjury[];
  readonly rng: Readonly<Record<RngStream, Rng>>;
  readonly log: readonly LogEntry[];
  readonly runLog: readonly RunLogEntry[];
  readonly outcome: Outcome;
  /** `player` means the reducer is waiting for an action. Nothing else resolves. */
  readonly awaiting: 'player' | 'none';
  /** The cards this combat can see. Carried in state so the reducer stays pure. */
  readonly library: Readonly<Record<string, CardDef>>;
  readonly uidSeq: number;
};

export type Action =
  | { readonly k: 'play_card'; readonly uid: string; readonly targetId?: string }
  /** Advance your marker without playing anything. Still draws. */
  | { readonly k: 'wait' };

export type PlayerSetup = {
  readonly id?: string;
  readonly name?: string;
  readonly hp: number;
  readonly maxHp?: number;
};

export type EnemySetup = {
  readonly id: string;
  readonly name?: string;
  readonly hp: number;
  readonly maxHp?: number;
  readonly intents: readonly IntentDef[];
  /** Start further up the track. Marginalia flood consecutive beats this way. */
  readonly startBeat?: number;
};

export type CombatSetup = {
  readonly seed: number;
  readonly library: Readonly<Record<string, CardDef>>;
  readonly player: PlayerSetup;
  readonly enemies: readonly EnemySetup[];
  /** Card ids. Shuffled with the `shuffle` stream at combat start. */
  readonly deck: readonly string[];
  readonly handCap?: number;
  readonly startingHand?: number;
};

/** One future enemy action, pinned to the beat it fires on. */
export type ProjectedIntent = {
  readonly enemyId: string;
  readonly beat: number;
  /** Where that lands on the 24-beat ring. */
  readonly trackBeat: number;
  readonly index: number;
  readonly intent: IntentDef;
};

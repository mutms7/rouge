/**
 * The shapes. No logic in here.
 *
 * The engine defines these and content fills them in, never the other way round:
 * `content/` writes `satisfies CardDef` against this file. `CardDef` stays thin, holding
 * only what the Tally actually reads. Suit, rarity, rules text, flavour and the Mark are
 * the card *face*, and they live in `content/types.ts` on top of this.
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
 * Something an effect can count.
 *
 * The scaling cards ("deal 4 per card in your discard pile") all reduce to one of these
 * with a multiplier and an optional divisor, which is why there is one `damage_per` atom
 * instead of one atom per card.
 */
export type Countable =
  | 'discard'
  | 'draw_pile'
  | 'hand'
  | 'exhausted'
  | 'compounds_in_discard'
  | 'compounds_in_hand'
  | 'missing_hp'
  | 'salt';

/** What `empower_next` and the per-lap boons can do to a card before it is played. */
export type CardBoon = {
  /** Flat replacement for the card's Weight. 0 means free. */
  readonly weight?: number;
  /** Reduce the Weight by this, floored at 0. */
  readonly weightMinus?: number;
  /** The card gains Perjury N: everything it does resolves N beats later. */
  readonly perjuryIn?: number;
  readonly echo?: boolean;
};

/**
 * Effect atoms. Cards and intents are lists of these, never functions.
 *
 * Effects as data is what lets the sim reason about a card without playing it, lets the
 * UI generate its own rules text, and gives localization something to hang off. The rule
 * from the brief: when a card wants something new, it gets a new atom, not a callback.
 *
 * `engine/vocabulary.ts` records which of these the Tally resolves today and which ones
 * are encoded now for the run layer to pick up in phases 4 and 5.
 */
export type Effect =
  /** `pierce` goes through Guard entirely. Pry Bar. */
  | { readonly k: 'damage'; readonly n: number; readonly pierce?: boolean }
  /** `n` damage per `per`, divided by `divide` first. Everything I Told You, The Face You Made. */
  | { readonly k: 'damage_per'; readonly n: number; readonly per: Countable; readonly divide?: number }
  /** Hits one living opponent chosen off the `ai` stream. What Faithless does on discard. */
  | { readonly k: 'damage_random'; readonly n: number }
  /** Straight to your own HP, through Guard. Not an attack, so nothing buffs it. */
  | { readonly k: 'self_damage'; readonly n: number }
  /** `frozenFor` holds the decay off for N beats, which is what Chalk Line buys. */
  | { readonly k: 'guard'; readonly n: number; readonly frozenFor?: number }
  | { readonly k: 'heal'; readonly n: number }
  | { readonly k: 'draw'; readonly n: number }
  /** Discard at random. No choice, so the sim and the player see the same card. */
  | { readonly k: 'discard'; readonly n: number }
  | { readonly k: 'slip'; readonly n: number }
  | { readonly k: 'haste'; readonly n: number }
  /** Pulls every enemy back. Foreclosure does this to you once a lap. */
  | { readonly k: 'enemy_haste'; readonly n: number }
  | { readonly k: 'bleed'; readonly n: number }
  | { readonly k: 'strain'; readonly n: number }
  | { readonly k: 'echo' }
  | { readonly k: 'exhaust' }
  /** Say it now, it becomes true in `in` beats, unless something catches you. */
  | { readonly k: 'perjury'; readonly in: number; readonly effects: readonly Effect[] }
  /** Fires at the top of your next action. Two Truths. Does not fizzle. */
  | { readonly k: 'next_action'; readonly effects: readonly Effect[] }
  /** Fires when the current lap ends. Debt of Honour's bill. Does not fizzle. */
  | { readonly k: 'next_lap'; readonly effects: readonly Effect[] }
  /** Nick: if the damage above killed something, do this too. */
  | { readonly k: 'on_kill'; readonly effects: readonly Effect[] }
  /** Salt, mined out of the dead. Currency, tracked per combat and banked by the run. */
  | { readonly k: 'salt'; readonly n: number }
  /** Hush Money. Only resolves the inner effects if the Salt is there to spend. */
  | { readonly k: 'spend_salt'; readonly n: number; readonly effects: readonly Effect[] }
  /** Sixpence Trick: take Guard off the target and keep it. */
  | {
      readonly k: 'steal_guard';
      readonly n: number;
      readonly per: Countable;
      readonly divide: number;
      readonly max: number;
    }
  /** Cold Read. Pushes the intent window out for the rest of the combat. */
  | { readonly k: 'reveal_intents'; readonly n: number }
  /** Perjure, Unwritten: the next `n` cards you play get `boon`. */
  | { readonly k: 'empower_next'; readonly n: number; readonly boon: CardBoon; readonly untilLapEnd?: boolean }
  /** Unwritten: every card for the rest of this lap gets `boon`. */
  | { readonly k: 'lap_boon'; readonly boon: CardBoon }
  /** Recant: the card you just played comes back to hand. */
  | { readonly k: 'return_last'; readonly weight?: number }
  /** Witness: the enemy's next intent, as a card in your hand. */
  | { readonly k: 'copy_intent'; readonly weight: number }
  /** False Ledger. Digs Compounds out of the draw pile. */
  | { readonly k: 'remove_compound'; readonly n: number }
  /** Nothing Owed. Everything, everywhere, and Guard for each one. */
  | { readonly k: 'purge_compounds'; readonly guardPer?: number }
  /** Collector's Interest buys Salt with junk. The Notary's countersign uses this too. */
  | { readonly k: 'add_compound'; readonly n: number; readonly to: 'draw' | 'hand' | 'discard' }
  /** Accounted: start combat with cards already spent. */
  | { readonly k: 'seed_discard'; readonly n: number }
  /** Dead Man's Switch. Arms a ward that eats the killing blow once. */
  | { readonly k: 'survive_lethal'; readonly heal: number }
  /** The Notary's re-ink window: damage to it is multiplied for `beats`. */
  | { readonly k: 'vulnerable'; readonly beats: number; readonly multiplier: number }
  /** Tithe-Wolf. Salt off the player and into a hoard you can cut back out of it. */
  | { readonly k: 'steal_salt'; readonly n: number }
  /** The Owed buff each other. Applies to one ally, not to the caster. */
  | { readonly k: 'ally_damage'; readonly n: number }
  /** Lamp Oil. Run layer, inert inside a combat. */
  | { readonly k: 'reveal_nodes'; readonly n: number };

export type EffectKind = Effect['k'];

/**
 * A passive rule. Marks, Tokens and enemy traits are all lists of these.
 *
 * The split from `Effect` is deliberate and it is about grammar: an Effect is "do this
 * now", a Mod is "from now on, when X". Collapsing them would mean every consumer has to
 * ask which sense it is looking at.
 */
export type Mod =
  // --- flat numbers the Tally reads every time it does the thing ---
  | { readonly k: 'attack_damage'; readonly n: number }
  | {
      readonly k: 'attack_damage_per';
      readonly n: number;
      readonly per: Countable;
      readonly divide: number;
      readonly max?: number;
    }
  | { readonly k: 'first_attack_damage'; readonly n: number }
  | { readonly k: 'second_hit_damage'; readonly n: number }
  | { readonly k: 'guard_gain'; readonly n: number }
  /** Positive slows the melt. Drawn Line is 1. */
  | { readonly k: 'guard_decay'; readonly n: number }
  | { readonly k: 'slip_bonus'; readonly n: number }
  | { readonly k: 'haste_bonus'; readonly n: number }
  | { readonly k: 'bleed_bonus'; readonly n: number }
  | { readonly k: 'pierce'; readonly n: number }
  | { readonly k: 'hand_cap'; readonly n: number }
  | { readonly k: 'max_hp'; readonly n: number }
  | { readonly k: 'combat_start_draw'; readonly n: number }
  | { readonly k: 'lap_draw'; readonly n: number }
  | { readonly k: 'perjury_sooner'; readonly n: number }
  | { readonly k: 'perjury_damage_pct'; readonly n: number }
  /** Threefold. Twice, at half value each. */
  | { readonly k: 'perjury_split' }
  | { readonly k: 'enemies_start_slipped'; readonly n: number }
  | { readonly k: 'guard_no_decay_first_lap' }
  /** Corroborated: the first Guard each lap is frozen for N beats. */
  | { readonly k: 'lap_first_guard_frozen'; readonly n: number }
  /** Fine Print: the first enemy action each lap is Slipped N. */
  | { readonly k: 'lap_first_enemy_slip'; readonly n: number }
  /** Loose Weave: once per lap, the next card costs N less Weight. */
  | { readonly k: 'lap_discount'; readonly n: number }
  /** Chalk Stub is `{ n: 1 }`. Milk Tooth Necklace is `{ n: 3, repeating: true }`. */
  | { readonly k: 'lap_nth_card'; readonly n: number; readonly boon: CardBoon; readonly repeating?: boolean }
  /** Stillness: play nothing for `beats` and the Guard arrives. */
  | { readonly k: 'idle_guard'; readonly beats: number; readonly n: number }
  | { readonly k: 'intent_horizon'; readonly n: number }

  // --- triggers ---
  | { readonly k: 'on_combat_start'; readonly effects: readonly Effect[] }
  | { readonly k: 'on_lap_start'; readonly effects: readonly Effect[] }
  | { readonly k: 'on_lap_end'; readonly effects: readonly Effect[] }
  | { readonly k: 'on_kill'; readonly effects: readonly Effect[] }
  | { readonly k: 'on_discard'; readonly effects: readonly Effect[] }
  | { readonly k: 'on_draw'; readonly effects: readonly Effect[] }
  | { readonly k: 'below_hp_pct'; readonly pct: number; readonly effects: readonly Effect[] }
  | { readonly k: 'once_per_combat'; readonly effects: readonly Effect[] }

  // --- while a card sits in hand. The Compounds that are actively unpleasant. ---
  | { readonly k: 'in_hand_no_guard' }
  | { readonly k: 'in_hand_lap_end'; readonly effects: readonly Effect[] }

  // --- enemy traits ---
  /** Receipt Wraith: its next action is whatever you last played. */
  | { readonly k: 'mirror_last_card' }
  /** Chalk Hound: playing something heavy costs you blood. */
  | { readonly k: 'punish_heavy'; readonly minWeight: number; readonly n: number }
  /** Fined: 70% off everything until its paperwork is gone. */
  | { readonly k: 'shielded_by'; readonly allyId: string; readonly pct: number }
  /** Kesk and Ledger. There is no correct order, only a correct pace. */
  | { readonly k: 'on_ally_death_double' }
  /** Tithe-Wolf: one stack of stolen Salt digests per lap. */
  | { readonly k: 'salt_hoard_decay'; readonly n: number }
  /** The Notary swaps its intent list at `pct` HP. */
  | { readonly k: 'phase_at_hp_pct'; readonly pct: number }
  /** Every card you play is written back into your draw pile as a Compound. */
  | { readonly k: 'countersign' }
  /** Phase 2 of the Notary: one of your Marks goes dark per lap. */
  | { readonly k: 'stamp_marks'; readonly n: number }

  // --- the run above combat. Encoded now, read by phases 4 and 5. ---
  | { readonly k: 'mark_slots'; readonly n: number }
  | { readonly k: 'card_load'; readonly n: number }
  | { readonly k: 'interest_compounds'; readonly n: number }
  | { readonly k: 'interest_period'; readonly n: number }
  | { readonly k: 'assay_discount_pct'; readonly n: number }
  | { readonly k: 'purchase_fails_one_in'; readonly n: number }
  | { readonly k: 'salt_per_win'; readonly n: number }
  | { readonly k: 'salt_per_lap'; readonly n: number }
  | { readonly k: 'on_settle'; readonly effects: readonly Effect[] }
  | { readonly k: 'on_combat_won'; readonly effects: readonly Effect[] }
  | { readonly k: 'on_collector_won'; readonly effects: readonly Effect[] }
  /** The Rope You Kept, Deadman. Once per run, at 1 HP. */
  | { readonly k: 'survive_lethal_run'; readonly hp: number }
  | { readonly k: 'reveal_map_layer' }
  | { readonly k: 'reveal_elite_intents' }
  /** The Notary's Nib. First Compound of the combat arrives as something useful. */
  | { readonly k: 'first_compound_becomes'; readonly cardId: string }
  /** Absolved. Junk becomes a floor rather than a wall. */
  | { readonly k: 'compound_playable_as'; readonly effects: readonly Effect[] }
  | { readonly k: 'compound_discard_free' }
  /** Interest Owed breeds. At the end of combat, another one joins the deck. */
  | { readonly k: 'replicates'; readonly cardId: string }
  /** The Notary's Countersign cannot be taken off you at a Reckoning. */
  | { readonly k: 'irremovable' }
  /** A Door That Has Been Opened Before. Act 4 collects on this. */
  | { readonly k: 'compound_phase'; readonly n: number };

export type ModKind = Mod['k'];

/** A card's Weight scaling off the board. Common Debt gets cheaper as you rot. */
export type WeightScale = {
  readonly per: Countable;
  /** Negative makes the card cheaper. */
  readonly n: number;
};

export type CardDef = {
  readonly id: string;
  /**
   * The card this one was derived from, for upgrades and Ink Well variants.
   *
   * Absent on everything in `content/cards.ts`. Present means "the art, the suit and the
   * Mark are filed under `baseId`, the numbers are mine". See `engine/variants.ts`.
   */
  readonly baseId?: string;
  readonly name: string;
  /** Beats your marker advances when you play it. The entire cost system. §3.2. */
  readonly weight: number;
  readonly type: CardType;
  readonly targeting: Targeting;
  readonly effects: readonly Effect[];
  /** Compounds are junk that sits there. Absent means playable. */
  readonly playable?: false;
  /** Deck Load, which Interest bills you for. Defaults to `weight`. §4.1. */
  readonly load?: number;
  readonly weightScale?: WeightScale;
  /** Passives the card carries while it is in your hand or deck. */
  readonly mods?: readonly Mod[];
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
  /** Passives this body carries. Enemy traits; for the player, Marks and Tokens. */
  readonly mods: readonly Mod[];
  /** Which intent list is live. Phase 2 of a boss swaps this. */
  readonly phase: number;
  /** Later phases, if any. `phases[0]` is phase 2. */
  readonly phases: readonly (readonly IntentDef[])[];
  /** Absolute beat until which damage to this body is multiplied. The re-ink window. */
  readonly vulnerableUntil: number;
  readonly vulnerableMultiplier: number;
  /** Flat damage bonus from an ally's buff. The Owed. */
  readonly damageBonus: number;
  /** Multiplier on everything it deals. Kesk doubles when Ledger dies, and vice versa. */
  readonly damageScale: number;
  /** Salt this body has taken off the player and not yet digested. Tithe-Wolf. */
  readonly saltHoard: number;
};

/**
 * An armed once-only escape. Dead Man's Switch is the only one in the demo.
 *
 * `cardUid` is the instance that armed it, because the card says "Exhaust this instead":
 * the ward has to know which piece of paper to burn when it fires.
 */
export type Ward = {
  readonly id: string;
  readonly kind: 'survive_lethal';
  readonly heal: number;
  readonly cardUid: string | null;
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

/**
 * A timed effect that is not a lie, so nothing can catch it out.
 *
 * Debt of Honour's bill and the lap hooks land through here. Same clock as a perjury,
 * none of the fizzle: separate list because "does this get cancelled by damage" is the
 * only interesting question about a scheduled effect and it should not need asking.
 */
export type ScheduledEffect = {
  readonly id: string;
  readonly ownerId: string;
  readonly at: number;
  readonly targetId: string | null;
  readonly sourceId: string;
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
  | { readonly k: 'heal'; readonly who: string; readonly amount: number }
  | { readonly k: 'guard'; readonly who: string; readonly amount: number; readonly total: number }
  | { readonly k: 'slip'; readonly who: string; readonly n: number }
  | { readonly k: 'haste'; readonly who: string; readonly n: number }
  | { readonly k: 'bleed'; readonly who: string; readonly n: number }
  | { readonly k: 'bleed_tick'; readonly who: string; readonly amount: number }
  | { readonly k: 'strain'; readonly total: number }
  | { readonly k: 'strain_break'; readonly damage: number }
  | { readonly k: 'draw'; readonly uid: string; readonly cardId: string }
  | { readonly k: 'discard'; readonly uid: string; readonly cardId: string }
  | { readonly k: 'reshuffle'; readonly count: number }
  | { readonly k: 'echo'; readonly uid: string; readonly cardId: string }
  | { readonly k: 'exhaust'; readonly uid: string; readonly cardId: string }
  | { readonly k: 'perjury_sworn'; readonly cardId: string; readonly at: number }
  | { readonly k: 'perjury_resolved'; readonly cardId: string }
  | { readonly k: 'perjury_fizzled'; readonly cardId: string }
  | { readonly k: 'scheduled'; readonly sourceId: string; readonly at: number }
  | { readonly k: 'salt'; readonly amount: number; readonly total: number }
  | { readonly k: 'salt_stolen'; readonly who: string; readonly amount: number }
  | { readonly k: 'compound'; readonly uid: string; readonly cardId: string; readonly to: string }
  /** Interest's bill came due. `count` is after Cooked Books/Usury modifiers. */
  | {
      readonly k: 'interest';
      readonly load: number;
      readonly count: number;
      readonly period: number;
      readonly beat: number;
    }
  | { readonly k: 'compound_removed'; readonly cardId: string }
  | { readonly k: 'boon'; readonly cards: number }
  | { readonly k: 'returned'; readonly uid: string; readonly cardId: string }
  | { readonly k: 'vulnerable'; readonly who: string; readonly until: number; readonly multiplier: number }
  | { readonly k: 'countersign_cancelled'; readonly who: string; readonly lap: number }
  | { readonly k: 'mark_stamped'; readonly who: string; readonly markId: string; readonly lap: number }
  | { readonly k: 'phase'; readonly who: string; readonly phase: number }
  /**
   * A once-only escape fired. `fromCard` separates Dead Man's Switch from the sheet.
   *
   * The run needs to know which, because the once-per-*run* ward is armed as an ordinary
   * combat ward and the run has to find out whether it went off. A card burning its own
   * ward must not spend the one printed on your character sheet.
   */
  | { readonly k: 'ward_spent'; readonly who: string; readonly healed: number; readonly fromCard: boolean }
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
 * acts is miserable, and because Act 4's Compound is built out of it. Combat only has
 * cause to write `card_exhausted`; the other three shapes are here so phase 4 has
 * somewhere to put them.
 */
export type RunLogEntry =
  | { readonly k: 'card_exhausted'; readonly cardId: string; readonly beat: number }
  | { readonly k: 'card_removed'; readonly cardId: string }
  | { readonly k: 'card_settled'; readonly cardId: string; readonly markId: string }
  | { readonly k: 'option_refused'; readonly eventId: string; readonly optionId: string };

/**
 * Cards under a temporary boon, waiting to be played.
 *
 * `remaining` counts down per card played. `untilLapEnd` and `lap` together are how
 * "your next card *this lap*" expires when the lap does.
 */
export type ActiveBoon = {
  readonly id: string;
  readonly boon: CardBoon;
  /** null means "every card", which is what Unwritten buys for one lap. */
  readonly remaining: number | null;
  readonly untilLapEnd: boolean;
  readonly lap: number;
};

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
  readonly scheduled: readonly ScheduledEffect[];
  /** Waiting for the top of the player's next action rather than for a beat. Two Truths. */
  readonly nextAction: readonly ScheduledEffect[];
  readonly rng: Readonly<Record<RngStream, Rng>>;
  readonly log: readonly LogEntry[];
  readonly runLog: readonly RunLogEntry[];
  readonly outcome: Outcome;
  /** `player` means the reducer is waiting for an action. Nothing else resolves. */
  readonly awaiting: 'player' | 'none';
  /** The cards this combat can see. Carried in state so the reducer stays pure. */
  readonly library: Readonly<Record<string, CardDef>>;
  readonly uidSeq: number;
  /** Salt earned this combat. The run layer banks it on the way out. */
  readonly salt: number;
  /** How far ahead intents are readable, in beats. Tell and the Spectacles push this out. */
  readonly intentHorizon: number;
  /** Extra intents readable regardless of the beat horizon. Cold Read buys these. */
  readonly intentsRevealed: number;
  readonly boons: readonly ActiveBoon[];
  /** The last card the player played. Recant returns it, the Receipt Wraith copies it. */
  readonly lastPlayed: CardInstance | null;
  /** Cards played this lap, for Chalk Stub and Milk Tooth Necklace. */
  readonly cardsThisLap: number;
  /** Total cards played, for the Chalk Tallyman and for the sim. */
  readonly cardsPlayed: number;
  /** Beat the player last played a card on. Stillness reads the gap. */
  readonly lastPlayBeat: number;
  readonly wards: readonly Ward[];
  /** Mods that have fired their once-per-combat or once-per-lap allowance. */
  readonly spent: readonly string[];
  /**
   * Deck Load and the independent Interest clock, exposed for the combat UI. Generated
   * combat-local Compounds add their printed Load; purging one removes it again. Exhausting
   * or discarding leaves Load unchanged because the card remains in the combat deck.
   */
  readonly deckLoad: number;
  readonly interestPeriod: number;
  readonly interestNextBeat: number;
  readonly interestLoad: number;
  /** Current lap whose countersign has been cancelled by a re-ink hit, if any. */
  readonly countersignCancelledLap: number | null;
  /** Marks disabled by the Notary during this combat. */
  readonly activeMarkIds: readonly string[];
  readonly stampedMarks: readonly string[];
  readonly markMods: Readonly<Record<string, readonly Mod[]>>;
  readonly basePlayerMods: readonly Mod[];
  readonly compoundIds: readonly string[];
};

export type Action =
  | { readonly k: 'play_card'; readonly uid: string; readonly targetId?: string }
  /** Familiar: discard a held Compound without spending Weight or a beat. */
  | { readonly k: 'discard_compound'; readonly uid: string }
  /** Advance your marker without playing anything. Still draws. */
  | { readonly k: 'wait' };

export type PlayerSetup = {
  readonly id?: string;
  readonly name?: string;
  readonly hp: number;
  readonly maxHp?: number;
  /** Marks and Tokens, flattened. Empty in a combat with no run around it. */
  readonly mods?: readonly Mod[];
  readonly salt?: number;
  /** Optional Mark identity/mod data, used by the Notary's phase-two stamping. */
  readonly markIds?: readonly string[];
  readonly markMods?: Readonly<Record<string, readonly Mod[]>>;
};

export type EnemySetup = {
  readonly id: string;
  readonly name?: string;
  readonly hp: number;
  readonly maxHp?: number;
  readonly intents: readonly IntentDef[];
  /** Later phases. `phases[0]` is phase 2. */
  readonly phases?: readonly (readonly IntentDef[])[];
  readonly mods?: readonly Mod[];
  /** Start further up the track. Marginalia flood consecutive beats this way. */
  readonly startBeat?: number;
  /** Start partway through the intent cycle. Two of The Owed alternate this way. */
  readonly intentOffset?: number;
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
  /** Optional phase-five economy inputs; omitted callers retain the phase-one defaults. */
  readonly deckLoad?: number;
  readonly interestPeriod?: number;
  readonly interestCompounds?: number;
  /** Explicit Compound pool for generated cards; defaults to all unplayable cards. */
  readonly compoundIds?: readonly string[];
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

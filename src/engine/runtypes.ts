/**
 * The shapes for the layer above combat. No logic in here.
 *
 * Same split as `types.ts`: the engine owns the vocabulary, `content/` fills it in. Which
 * is why `RunEffect` lives here rather than next to the Hollows that use it, and why
 * `RunContent` is a bag of lookup tables rather than an import. The engine may not reach
 * into `content/`, so a run is handed its content the same way a combat is handed its card
 * library: as a value, at construction.
 *
 * `RunState` carries its content and its RNG streams, so it is a value like `CombatState`
 * is a value. Nothing about it is serialized: a save is a seed plus the action log, and
 * `replayRun` folds one back into the other.
 */
import type { Rng, RngStream } from './rng';
import type { Action, CardDef, CombatState, Effect, EnemySetup, Mod, RunLogEntry } from './types';

/**
 * What a Hollow, a Wake or a shop can do to you between fights.
 *
 * Deliberately a separate union from `Effect`. An `Effect` happens inside a combat and
 * knows about beats; these know about decks, Salt and the map. Collapsing them would mean
 * every consumer carrying cases the other one can never resolve.
 */
export type RunEffect =
  | { readonly k: 'gain_card'; readonly n: number; readonly pool: 'any' | 'rare' }
  | { readonly k: 'remove_card'; readonly n: number; readonly destroysMark?: boolean }
  /** The Ink Well upgrades *and* weighs down the same card, which is what `load` is for. */
  | { readonly k: 'upgrade_card'; readonly n: number; readonly load?: number }
  | { readonly k: 'add_card_load'; readonly n: number }
  | { readonly k: 'gain_token'; readonly n: number }
  | { readonly k: 'gain_salt'; readonly n: number }
  | { readonly k: 'spend_salt'; readonly n: number }
  | { readonly k: 'gain_mark_slot'; readonly n: number }
  | { readonly k: 'lose_hp'; readonly n: number }
  | { readonly k: 'lose_max_hp'; readonly n: number }
  | { readonly k: 'heal'; readonly n: number }
  | { readonly k: 'add_compound'; readonly n: number }
  | { readonly k: 'reveal_nodes'; readonly n: number }
  | { readonly k: 'reveal_boss_intent' }
  /** A Door That Has Been Opened Before. Act 4 collects on this. */
  | { readonly k: 'compound_phase'; readonly n: number }
  | { readonly k: 'nothing' };

export type RunEffectKind = RunEffect['k'];

/** §5.1. */
export type NodeKind = 'debtor' | 'collector' | 'assay' | 'reckoning' | 'wake' | 'hollow' | 'vault' | 'boss';

/**
 * One layer of the map, as data.
 *
 * `kinds` is a bag rather than a set: repeating an entry weights it, so a layer that is
 * "mostly a fight, sometimes an event" is `['debtor', 'debtor', 'hollow']` and needs no
 * weight field. A layer with one entry is that kind on every branch, which is how the run
 * guarantees you always get exactly one Reckoning and one Assay however you walk it.
 */
export type LayerSpec = {
  /** Inclusive range. The generator picks inside it off the map stream. */
  readonly width: readonly [number, number];
  readonly kinds: readonly NodeKind[];
};

export type RunNode = {
  readonly id: string;
  readonly layer: number;
  /** Position within the layer, left to right. */
  readonly index: number;
  readonly kind: NodeKind;
  /** Fight nodes only. */
  readonly encounterId: string | null;
  /** Hollow nodes only. */
  readonly hollowId: string | null;
  /** Node ids in the next layer this one leads to. Never empty except at the boss. */
  readonly next: readonly string[];
};

export type RunMap = {
  readonly nodes: Readonly<Record<string, RunNode>>;
  /** Node ids by layer, left to right. `layers[0]` is where a run starts. */
  readonly layers: readonly (readonly string[])[];
};

/** One card in a run's deck. `cardId` may be a variant id; `uid` is stable for the run. */
export type RunCard = {
  readonly uid: string;
  readonly cardId: string;
};

/** Prices, payouts and stock sizes. Content data, because balance is content. */
export type RunEconomy = {
  readonly saltPerDebtor: number;
  readonly saltPerCollector: number;
  readonly saltPerVault: number;
  /** Wake heals this percentage of max HP. §5.1 says 30. */
  readonly wakeHealPct: number;
  readonly wakeSlotSalt: number;
  readonly assayCardSalt: Readonly<Record<string, number>>;
  readonly assayTokenSalt: number;
  readonly assaySlotSalt: number;
  readonly assayRemoveSalt: number;
  readonly assayCards: number;
  readonly assayTokens: number;
  readonly rewardCards: number;
  /** Draft weighting by rarity. Keys are rarities; missing means never offered. */
  readonly draftWeights: Readonly<Record<string, number>>;
  /** Below this many cards, nothing may voluntarily leave the deck. */
  readonly minDeckSize: number;
  /** One Salt buys this much of an item when you pay in paper instead. */
  readonly saltPerCardPaid: number;
};

/**
 * A Hollow, as the run reducer sees it.
 *
 * `content/types.ts` has the full `HollowDef` with its name, its prose and its option
 * labels. This is the half the reducer resolves, and `HollowDef` satisfies it structurally,
 * so content passes its own table straight in.
 */
export type RunOption = {
  readonly id: string;
  readonly outcomes: readonly RunEffect[];
  readonly requires?: { readonly salt?: number; readonly cards?: number };
  readonly refusal?: true;
};

export type RunEventDef = {
  readonly id: string;
  readonly options: readonly RunOption[];
};

export type RunContent = {
  readonly library: Readonly<Record<string, CardDef>>;
  /** cardId -> the Mark it Settles into. Absent means it Settles into nothing. */
  readonly cardMarks: Readonly<Record<string, string>>;
  /** cardId -> rarity, for draft pools and shop prices. */
  readonly cardRarity: Readonly<Record<string, string>>;
  readonly markMods: Readonly<Record<string, readonly Mod[]>>;
  readonly tokenMods: Readonly<Record<string, readonly Mod[]>>;
  readonly tokenIds: readonly string[];
  /** Everything a reward, shop or Hollow may offer. Compounds are not in here. */
  readonly draftableIds: readonly string[];
  readonly hollows: Readonly<Record<string, RunEventDef>>;
  readonly hollowIds: readonly string[];
  readonly compoundIds: readonly string[];
  readonly encounters: {
    readonly normal: readonly string[];
    readonly collector: readonly string[];
    readonly boss: string;
    /** Fight one, always. The tutorial body, so the beat grid can explain itself. */
    readonly tutorial: string;
  };
  /**
   * Encounter id -> the bodies on the floor, positioned and phased.
   *
   * The engine has no idea what an `EncounterDef` is: a body is not a fight, and the
   * translation is `content/library.ts`'s job. This is the result of it.
   */
  readonly encounterSetups: Readonly<Record<string, readonly EnemySetup[]>>;
  readonly layers: readonly LayerSpec[];
  readonly economy: RunEconomy;
  readonly character: {
    readonly id: string;
    readonly name: string;
    readonly hp: number;
    readonly markSlots: number;
    readonly deck: readonly string[];
  };
  /** Mark slots run 3 to 8. §4.3. */
  readonly maxMarkSlots: number;
};

/** One thing on the Assay's shelf. Ids are `card:<id>`, `token:<id>`, `slot`, `remove`. */
export type ShopItem = {
  readonly id: string;
  readonly kind: 'card' | 'token' | 'slot' | 'remove';
  /** Card or Token id. Null for services. */
  readonly refId: string | null;
  readonly salt: number;
  /** Cards you may surrender instead of Salt, or null when paper is not accepted. */
  readonly cards: number | null;
  readonly sold: boolean;
};

/**
 * The one thing the run is asking the player right now.
 *
 * Everything between fights reduces to a prompt and an answer, which is what keeps the
 * action set to four cases and makes the whole layer replayable. Follow-ups queue: a Hollow
 * that grants a card and takes one pushes two prompts and the player answers them in order.
 */
export type RunPrompt =
  | { readonly k: 'shop'; readonly items: readonly ShopItem[] }
  | { readonly k: 'wake'; readonly canUpgrade: boolean }
  | { readonly k: 'hollow'; readonly hollowId: string }
  | { readonly k: 'gain_card'; readonly ids: readonly string[]; readonly skippable: boolean }
  | { readonly k: 'gain_token'; readonly ids: readonly string[]; readonly skippable: boolean }
  | {
      readonly k: 'pick_deck_card';
      /** `dip` is the Ink Well: upgrade and weigh down in one pick. */
      readonly op: DeckOp;
      readonly uids: readonly string[];
      readonly skippable: boolean;
      /** The Weighing Room burns the Mark along with the card. The UI has to say so. */
      readonly destroysMark: boolean;
    };

export type DeckOp = 'settle' | 'remove' | 'upgrade' | 'add_load' | 'dip';

export type RunPromptKind = RunPrompt['k'];

export type RunOutcome = 'ongoing' | 'won' | 'lost';

/** A purchase waiting on the cards that pay for it. */
export type OwedPurchase = {
  readonly item: ShopItem;
  readonly cardsLeft: number;
};

export type RunState = {
  readonly seed: number;
  /** Every action, in order. A save is this plus the seed, and nothing else. */
  readonly actions: readonly RunAction[];
  readonly content: RunContent;
  /** Base cards plus every variant this run has made. What a combat is handed. */
  readonly library: Readonly<Record<string, CardDef>>;
  readonly map: RunMap;
  /** Current node, or null before the first step. */
  readonly at: string | null;
  readonly visited: readonly string[];
  readonly hp: number;
  readonly maxHp: number;
  readonly salt: number;
  readonly deck: readonly RunCard[];
  readonly marks: readonly string[];
  readonly markSlots: number;
  /** Marks the Weighing Room burned. They can never be Settled this run. */
  readonly blockedMarks: readonly string[];
  readonly tokens: readonly string[];
  readonly combat: CombatState | null;
  /**
   * The fight that just finished, kept until the next step.
   *
   * A finished combat is settled the instant it ends, so `combat` goes null on the same
   * action that decides it. The view needs the final board for a beat and phase 5's run
   * summary wants the last one, so it is remembered here rather than reconstructed.
   */
  readonly lastCombat: CombatState | null;
  /** Head of the queue is what the player is answering. */
  readonly prompts: readonly RunPrompt[];
  readonly owed: OwedPurchase | null;
  readonly rng: Readonly<Record<RngStream, Rng>>;
  readonly runLog: readonly RunLogEntry[];
  readonly outcome: RunOutcome;
  /** Map layers readable past the next one. Lantern and the handwriting on the wall. */
  readonly revealedLayers: number;
  readonly bossIntentKnown: boolean;
  /** Act 4 collects on this. Nothing in the demo reads it. */
  readonly compoundPhases: number;
  /** The once-per-run escape, once it has been used. */
  readonly lethalWardSpent: boolean;
  readonly uidSeq: number;
};

export type RunAction =
  /** Step to a node in the next layer. */
  | { readonly k: 'travel'; readonly nodeId: string }
  /** One combat action, forwarded to the Tally. */
  | { readonly k: 'combat'; readonly action: Action }
  /**
   * Answer the head prompt. `id` is an option id, a card id, a Token id, a deck uid or a
   * shop item id, depending on the prompt.
   */
  | { readonly k: 'answer'; readonly id: string; readonly pay?: 'salt' | 'cards' }
  /** Skip a skippable prompt, or leave the shop. */
  | { readonly k: 'decline' };

export type RunActionKind = RunAction['k'];

/** A save file. Tiny on purpose: determinism is what makes this enough. */
export type RunSave = {
  readonly v: 1;
  readonly seed: number;
  readonly actions: readonly RunAction[];
};

/** Run-level triggers, which take `Effect` lists rather than `RunEffect` lists. */
export type RunTrigger = {
  readonly key: string;
  readonly effects: readonly Effect[];
};
